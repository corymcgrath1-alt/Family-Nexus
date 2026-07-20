import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod/v4";
import {
  auditEventsTable,
  db,
  libraryItemsTable,
  sharingGrantsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import {
  canExportLibraryItem,
  canReadLibraryItem,
  canRevokeLibraryGrant,
  canShareLibraryItem,
  canUpdateLibraryItem,
  type LibraryActor,
} from "../lib/library-policy";

const router: IRouter = Router();
router.use(requireAuth);

const categories = [
  "note",
  "document-reference",
  "instruction",
  "decision",
  "memory",
  "medical-reference",
  "household-record",
  "vehicle-record",
  "career-record",
  "other",
] as const;

const visibility = ["private", "shared", "household"] as const;
const sensitivity = ["standard", "personal", "sensitive", "restricted"] as const;
const retention = ["keep-until-archived", "review-annually", "delete-after-date", "legal-hold"] as const;
const sourceTypes = ["manual", "message", "document-reference", "web", "import", "other"] as const;

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();

const createLibraryItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(categories).default("note"),
  body: z.string().trim().max(12000).optional().nullable(),
  visibility: z.enum(visibility).default("private"),
  shareWithUserIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
  sourceType: z.enum(sourceTypes).default("manual"),
  sourceLabel: z.string().trim().max(260).optional().nullable(),
  provenanceNote: z.string().trim().max(1000).optional().nullable(),
  effectiveDate: optionalDate,
  sensitivity: z.enum(sensitivity).default("personal"),
  retentionPolicy: z.enum(retention).default("keep-until-archived"),
  retentionDeleteAfter: optionalDate,
});

const updateLibraryItemSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().max(12000).optional().nullable(),
  sourceLabel: z.string().trim().max(260).optional().nullable(),
  provenanceNote: z.string().trim().max(1000).optional().nullable(),
  effectiveDate: optionalDate,
  sensitivity: z.enum(sensitivity).optional(),
  retentionPolicy: z.enum(retention).optional(),
  retentionDeleteAfter: optionalDate,
  status: z.enum(["active", "archived"]).optional(),
});

const shareSchema = z.object({
  granteeUserId: z.coerce.number().int().positive(),
  purpose: z.string().trim().max(160).default("user_share"),
});

const revokeSchema = z.object({
  grantId: z.coerce.number().int().positive().optional(),
  granteeUserId: z.coerce.number().int().positive().optional(),
});

function actorFromRequest(req: Request): LibraryActor {
  return {
    id: req.session.userId!,
    householdId: req.session.householdId!,
    role: req.session.role ?? "adult",
  };
}

function badRequest(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Invalid request",
      details: error.issues.map((issue) => issue.message),
    });
    return;
  }
  res.status(400).json({ error: "Invalid request" });
}

function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function notFound(res: Response): void {
  res.status(404).json({ error: "Not found" });
}

type LibraryItemRow = typeof libraryItemsTable.$inferSelect;
type SharingGrantRow = typeof sharingGrantsTable.$inferSelect;

function grantsForItem(grants: SharingGrantRow[], itemId: number): SharingGrantRow[] {
  return grants.filter((grant) => grant.resourceType === "library_item" && grant.resourceId === itemId);
}

async function selectGrants(itemIds: number[]): Promise<SharingGrantRow[]> {
  if (!itemIds.length) return [];
  return db
    .select()
    .from(sharingGrantsTable)
    .where(and(eq(sharingGrantsTable.resourceType, "library_item"), inArray(sharingGrantsTable.resourceId, itemIds)));
}

async function writeAudit(input: typeof auditEventsTable.$inferInsert): Promise<void> {
  await db.insert(auditEventsTable).values(input);
}

function fmtGrant(grant: SharingGrantRow) {
  return {
    id: grant.id,
    granteeUserId: grant.granteeUserId,
    permission: grant.permission,
    purpose: grant.purpose,
    createdAt: grant.createdAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}

function isActiveGrant(grant: SharingGrantRow, now = new Date()): boolean {
  return !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now);
}

function fmtItemForActor(item: LibraryItemRow, grants: SharingGrantRow[] = [], actor: LibraryActor) {
  const visibleGrants = item.ownerUserId === actor.id ? grants : [];
  return {
    ...item,
    grants: visibleGrants.map(fmtGrant),
    provenance: item.provenance as Record<string, unknown>,
    allowedPurposes: item.allowedPurposes as string[],
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() ?? null,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}

async function selectAuthorizedItem(actor: LibraryActor, id: number): Promise<{
  item: LibraryItemRow;
  grants: SharingGrantRow[];
} | null> {
  const [item] = await db
    .select()
    .from(libraryItemsTable)
    .where(and(eq(libraryItemsTable.id, id), eq(libraryItemsTable.householdId, actor.householdId)));

  if (!item) return null;

  const grants = await selectGrants([item.id]);
  if (!canReadLibraryItem(actor, item, grantsForItem(grants, item.id))) return null;
  return { item, grants: grantsForItem(grants, item.id) };
}

async function selectAdultRecipient(householdId: number, userId: number) {
  const [recipient] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.householdId, householdId), eq(usersTable.role, "adult")));
  return recipient ?? null;
}

router.get("/library/items", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const query = String(req.query.q ?? "").trim().toLowerCase();

  const rows = await db
    .select()
    .from(libraryItemsTable)
    .where(and(eq(libraryItemsTable.householdId, actor.householdId), ne(libraryItemsTable.status, "deleted")))
    .orderBy(desc(libraryItemsTable.updatedAt))
    .limit(100);

  const grants = await selectGrants(rows.map((row) => row.id));
  const authorized = rows.filter((item) => canReadLibraryItem(actor, item, grantsForItem(grants, item.id)));
  const filtered = query
    ? authorized.filter((item) =>
        [item.title, item.body, item.category, item.sourceLabel]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
    : authorized;

  res.json(filtered.map((item) => fmtItemForActor(item, grantsForItem(grants, item.id), actor)));
});

router.get("/library/stats", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const rows = await db
    .select()
    .from(libraryItemsTable)
    .where(and(eq(libraryItemsTable.householdId, actor.householdId), ne(libraryItemsTable.status, "deleted")))
    .limit(500);
  const grants = await selectGrants(rows.map((row) => row.id));
  const authorized = rows.filter((item) => canReadLibraryItem(actor, item, grantsForItem(grants, item.id)));

  const byCategory: Record<string, number> = {};
  const bySensitivity: Record<string, number> = {};
  for (const item of authorized) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    bySensitivity[item.sensitivity] = (bySensitivity[item.sensitivity] ?? 0) + 1;
  }

  res.json({
    visibleItems: authorized.length,
    ownedItems: authorized.filter((item) => item.ownerUserId === actor.id).length,
    sharedWithMe: authorized.filter((item) => item.ownerUserId !== actor.id && item.visibility === "shared").length,
    householdItems: authorized.filter((item) => item.visibility === "household").length,
    byCategory,
    bySensitivity,
  });
});

router.post("/library/items", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  if (actor.role !== "adult") {
    res.status(403).json({ error: "Only adult accounts can create library items" });
    return;
  }

  const parsed = createLibraryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  const input = parsed.data;
  const shareWithUserIds = [...new Set(input.shareWithUserIds)].filter((id) => id !== actor.id);
  if (input.visibility === "shared" && shareWithUserIds.length === 0) {
    res.status(400).json({ error: "Select at least one adult to share with" });
    return;
  }

  const recipients: Array<typeof usersTable.$inferSelect> = [];
  for (const id of shareWithUserIds) {
    const recipient = await selectAdultRecipient(actor.householdId, id);
    if (!recipient) {
      res.status(400).json({ error: "Selected recipient is not available" });
      return;
    }
    recipients.push(recipient);
  }

  const result = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(libraryItemsTable)
      .values({
        householdId: actor.householdId,
        ownerUserId: actor.id,
        subjectUserId: actor.id,
        ownerKind: input.visibility === "household" ? "household" : "person",
        visibility: input.visibility,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        sourceType: input.sourceType,
        sourceLabel: input.sourceLabel ?? null,
        provenance: {
          sourceType: input.sourceType,
          sourceLabel: input.sourceLabel ?? null,
          note: input.provenanceNote ?? null,
          recordedByUserId: actor.id,
        },
        effectiveDate: input.effectiveDate ?? null,
        sensitivity: input.sensitivity,
        retentionPolicy: input.retentionPolicy,
        retentionDeleteAfter: input.retentionDeleteAfter ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      })
      .returning();

    const grantRows: SharingGrantRow[] = [];
    if (input.visibility === "shared") {
      for (const recipient of recipients) {
        const [grant] = await tx
          .insert(sharingGrantsTable)
          .values({
            householdId: actor.householdId,
            resourceType: "library_item",
            resourceId: item.id,
            grantorUserId: actor.id,
            granteeUserId: recipient.id,
            permission: "read",
            purpose: "library_share",
          })
          .returning();
        grantRows.push(grant);
      }
    }

    await tx.insert(auditEventsTable).values({
      householdId: actor.householdId,
      actorUserId: actor.id,
      targetType: "library_item",
      targetId: item.id,
      eventType: "created",
      summary: "Library item created",
      metadata: {
        category: item.category,
        visibility: item.visibility,
        sensitivity: item.sensitivity,
        sharedRecipientCount: grantRows.length,
      },
    });

    if (grantRows.length > 0) {
      await tx.insert(auditEventsTable).values({
        householdId: actor.householdId,
        actorUserId: actor.id,
        targetType: "library_item",
        targetId: item.id,
        eventType: "shared",
        summary: "Library item shared",
        metadata: { grantIds: grantRows.map((grant) => grant.id), sharedRecipientCount: grantRows.length },
      });
    }

    return { item, grants: grantRows };
  });

  res.status(201).json(fmtItemForActor(result.item, result.grants, actor));
});

router.get("/library/items/:id", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result) {
    notFound(res);
    return;
  }

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: result.item.id,
    eventType: "viewed",
    summary: "Library item viewed",
    metadata: { category: result.item.category, sensitivity: result.item.sensitivity },
  });

  res.json(fmtItemForActor(result.item, result.grants, actor));
});

router.patch("/library/items/:id", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || !canUpdateLibraryItem(actor, result.item)) {
    notFound(res);
    return;
  }

  const parsed = updateLibraryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  const input = parsed.data;
  const patch: Partial<typeof libraryItemsTable.$inferInsert> = {
    updatedById: actor.id,
    updatedAt: new Date(),
    version: result.item.version + 1,
  };

  for (const key of ["title", "body", "sourceLabel", "effectiveDate", "sensitivity", "retentionPolicy", "retentionDeleteAfter", "status"] as const) {
    if (input[key] !== undefined) {
      patch[key] = input[key] as never;
    }
  }

  if (input.provenanceNote !== undefined) {
    patch.provenance = {
      ...(result.item.provenance as Record<string, unknown>),
      note: input.provenanceNote,
      correctedByUserId: actor.id,
      correctedAt: new Date().toISOString(),
    };
  }

  if (input.status === "archived") {
    patch.archivedAt = new Date();
  }
  if (input.status === "active") {
    patch.archivedAt = null;
  }

  const [updated] = await db
    .update(libraryItemsTable)
    .set(patch)
    .where(eq(libraryItemsTable.id, result.item.id))
    .returning();

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: updated.id,
    eventType: input.status === "archived" ? "archived" : "corrected",
    summary: input.status === "archived" ? "Library item archived" : "Library item corrected",
    metadata: { changedFields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined) },
  });

  res.json(fmtItemForActor(updated, result.grants, actor));
});

router.delete("/library/items/:id", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || !canUpdateLibraryItem(actor, result.item)) {
    notFound(res);
    return;
  }

  const now = new Date();
  const [deleted] = await db
    .update(libraryItemsTable)
    .set({ status: "deleted", deletedAt: now, updatedAt: now, updatedById: actor.id, version: result.item.version + 1 })
    .where(eq(libraryItemsTable.id, result.item.id))
    .returning();

  await db
    .update(sharingGrantsTable)
    .set({ revokedAt: now, revokedById: actor.id })
    .where(and(eq(sharingGrantsTable.resourceType, "library_item"), eq(sharingGrantsTable.resourceId, result.item.id)));

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: deleted.id,
    eventType: "deleted",
    summary: "Library item deleted",
    metadata: { previousVisibility: result.item.visibility, sensitivity: result.item.sensitivity },
  });

  res.status(204).send();
});

router.post("/library/items/:id/share", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || !canShareLibraryItem(actor, result.item)) {
    notFound(res);
    return;
  }

  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  if (parsed.data.granteeUserId === actor.id) {
    res.status(400).json({ error: "Select another adult to share with" });
    return;
  }

  const recipient = await selectAdultRecipient(actor.householdId, parsed.data.granteeUserId);
  if (!recipient) {
    res.status(400).json({ error: "Selected recipient is not available" });
    return;
  }

  const existing = result.grants.find((grant) => grant.granteeUserId === recipient.id && isActiveGrant(grant));
  let grant = existing;

  if (!grant) {
    [grant] = await db
      .insert(sharingGrantsTable)
      .values({
        householdId: actor.householdId,
        resourceType: "library_item",
        resourceId: result.item.id,
        grantorUserId: actor.id,
        granteeUserId: recipient.id,
        permission: "read",
        purpose: parsed.data.purpose,
      })
      .returning();
  }

  const [updated] = await db
    .update(libraryItemsTable)
    .set({ visibility: "shared", updatedAt: new Date(), updatedById: actor.id, version: result.item.version + 1 })
    .where(eq(libraryItemsTable.id, result.item.id))
    .returning();

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: result.item.id,
    eventType: "shared",
    summary: "Library item shared",
    metadata: { grantId: grant.id, granteeUserId: recipient.id },
  });

  const grants = await selectGrants([result.item.id]);
  res.json(fmtItemForActor(updated, grantsForItem(grants, result.item.id), actor));
});

router.post("/library/items/:id/revoke", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || !canRevokeLibraryGrant(actor, result.item)) {
    notFound(res);
    return;
  }

  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  const grant = result.grants.find((candidate) => {
    if (!isActiveGrant(candidate)) return false;
    if (parsed.data.grantId) return candidate.id === parsed.data.grantId;
    return candidate.granteeUserId === parsed.data.granteeUserId;
  });

  if (!grant) {
    notFound(res);
    return;
  }

  const now = new Date();
  await db
    .update(sharingGrantsTable)
    .set({ revokedAt: now, revokedById: actor.id })
    .where(eq(sharingGrantsTable.id, grant.id));

  const remaining = result.grants.filter((candidate) => candidate.id !== grant.id && isActiveGrant(candidate));
  const [updated] = await db
    .update(libraryItemsTable)
    .set({
      visibility: remaining.length > 0 ? "shared" : "private",
      updatedAt: now,
      updatedById: actor.id,
      version: result.item.version + 1,
    })
    .where(eq(libraryItemsTable.id, result.item.id))
    .returning();

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: result.item.id,
    eventType: "revoked",
    summary: "Library sharing revoked",
    metadata: { grantId: grant.id, granteeUserId: grant.granteeUserId },
  });

  const grants = await selectGrants([result.item.id]);
  res.json(fmtItemForActor(updated, grantsForItem(grants, result.item.id), actor));
});

router.get("/library/items/:id/audit", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || (result.item.ownerUserId !== actor.id && result.item.visibility !== "household")) {
    notFound(res);
    return;
  }

  const events = await db
    .select()
    .from(auditEventsTable)
    .where(and(eq(auditEventsTable.targetType, "library_item"), eq(auditEventsTable.targetId, result.item.id)))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(100);

  res.json(events.map((event) => ({
    id: event.id,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    summary: event.summary,
    metadata: event.metadata as Record<string, unknown>,
    createdAt: event.createdAt.toISOString(),
  })));
});

router.get("/library/items/:id/export", async (req, res): Promise<void> => {
  const actor = actorFromRequest(req);
  const id = parseId(req.params.id);
  if (!id) {
    notFound(res);
    return;
  }

  const result = await selectAuthorizedItem(actor, id);
  if (!result || !canExportLibraryItem(actor, result.item)) {
    notFound(res);
    return;
  }

  await writeAudit({
    householdId: actor.householdId,
    actorUserId: actor.id,
    targetType: "library_item",
    targetId: result.item.id,
    eventType: "exported",
    summary: "Library item exported",
    metadata: { format: "json", sensitivity: result.item.sensitivity },
  });

  res.json({
    exportedAt: new Date().toISOString(),
    formatVersion: "library-item.v1",
    item: fmtItemForActor(result.item, result.grants, actor),
  });
});

export default router;
