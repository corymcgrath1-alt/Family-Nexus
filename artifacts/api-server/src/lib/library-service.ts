import {
  auditEventsTable,
  db,
  libraryItemsTable,
  sharingGrantsTable,
} from "@workspace/db";
import type { LibraryActor } from "./library-policy";
import type {
  LibraryCategory,
  LibraryRetentionPolicy,
  LibrarySensitivity,
  LibrarySourceType,
  LibraryVisibility,
} from "./library-contracts";

export type LibraryItemRow = typeof libraryItemsTable.$inferSelect;
export type SharingGrantRow = typeof sharingGrantsTable.$inferSelect;

export type CreateLibraryItemInput = {
  title: string;
  category: LibraryCategory;
  body: string | null;
  visibility: LibraryVisibility;
  sourceType: LibrarySourceType;
  sourceLabel: string | null;
  provenance: Record<string, unknown>;
  effectiveDate: string | null;
  sensitivity: LibrarySensitivity;
  retentionPolicy: LibraryRetentionPolicy;
  retentionDeleteAfter: string | null;
  shareWithUserIds?: readonly number[];
  audit: {
    eventType: "created" | "imported";
    summary: string;
    metadata: Record<string, unknown>;
  };
};

export async function createLibraryItemForActor(
  actor: LibraryActor,
  input: CreateLibraryItemInput,
) {
  return db.transaction(async (tx) => {
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
        body: input.body,
        sourceType: input.sourceType,
        sourceLabel: input.sourceLabel,
        provenance: input.provenance,
        effectiveDate: input.effectiveDate,
        sensitivity: input.sensitivity,
        retentionPolicy: input.retentionPolicy,
        retentionDeleteAfter: input.retentionDeleteAfter,
        status: "active",
        createdById: actor.id,
        updatedById: actor.id,
      })
      .returning();

    const grantRows: SharingGrantRow[] = [];
    for (const granteeUserId of input.shareWithUserIds ?? []) {
      const [grant] = await tx
        .insert(sharingGrantsTable)
        .values({
          householdId: actor.householdId,
          resourceType: "library_item",
          resourceId: item.id,
          grantorUserId: actor.id,
          granteeUserId,
          permission: "read",
          purpose: "library_share",
        })
        .returning();
      grantRows.push(grant);
    }

    await tx.insert(auditEventsTable).values({
      householdId: actor.householdId,
      actorUserId: actor.id,
      targetType: "library_item",
      targetId: item.id,
      eventType: input.audit.eventType,
      summary: input.audit.summary,
      metadata: input.audit.metadata,
    });

    if (grantRows.length > 0) {
      await tx.insert(auditEventsTable).values({
        householdId: actor.householdId,
        actorUserId: actor.id,
        targetType: "library_item",
        targetId: item.id,
        eventType: "shared",
        summary: "Library item shared",
        metadata: {
          grantIds: grantRows.map((grant) => grant.id),
          sharedRecipientCount: grantRows.length,
        },
      });
    }

    return { item, grants: grantRows };
  });
}

function formatGrant(grant: SharingGrantRow) {
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

export function formatLibraryItemForActor(
  item: LibraryItemRow,
  grants: SharingGrantRow[] = [],
  actor: LibraryActor,
) {
  const visibleGrants = item.ownerUserId === actor.id ? grants : [];
  return {
    ...item,
    grants: visibleGrants.map(formatGrant),
    provenance: item.provenance as Record<string, unknown>,
    allowedPurposes: item.allowedPurposes as string[],
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() ?? null,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}
