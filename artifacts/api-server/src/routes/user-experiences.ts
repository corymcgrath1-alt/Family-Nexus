import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, userExperiencesTable } from "@workspace/db";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

function fmt(e: typeof userExperiencesTable.$inferSelect) {
  return { ...e, participantIds: e.participantIds as number[], createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(), isUserCreated: true };
}

router.get("/user-experiences", async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;
  const rows = await db.select().from(userExperiencesTable)
    .where(and(
      eq(userExperiencesTable.householdId, hhId),
      or(eq(userExperiencesTable.visibility, "household"), eq(userExperiencesTable.createdByUserId, uid))
    ))
    .orderBy(userExperiencesTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/user-experiences", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [exp] = await db.insert(userExperiencesTable).values({
    householdId: req.session.householdId!,
    createdByUserId: req.session.userId!,
    slug: `ux-${nanoid(8)}`,
    title: String(body.title ?? ""),
    description: body.description ? String(body.description) : null,
    imageUrl: body.imageUrl ? String(body.imageUrl) : null,
    category: String(body.category ?? "custom"),
    setting: String(body.setting ?? "any"),
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    costEstimate: body.costEstimate ? Number(body.costEstimate) : null,
    energyLevel: String(body.energyLevel ?? "medium"),
    participantIds: (body.participantIds as number[]) ?? [],
    visibility: String(body.visibility ?? "household"),
  }).returning();
  res.status(201).json(fmt(exp));
});

router.patch("/user-experiences/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;
  const body = req.body as Record<string, unknown>;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(userExperiencesTable).where(and(eq(userExperiencesTable.id, Number(raw)), eq(userExperiencesTable.householdId, hhId)))
    : await db.select().from(userExperiencesTable).where(and(eq(userExperiencesTable.slug, raw), eq(userExperiencesTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  if (rows[0].createdByUserId !== uid) { res.status(403).json({ error: "Only the creator can edit" }); return; }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["title", "description", "imageUrl", "category", "setting", "durationMinutes", "costEstimate", "energyLevel", "visibility"]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const [updated] = await db.update(userExperiencesTable).set(patch).where(eq(userExperiencesTable.id, rows[0].id)).returning();
  res.json(fmt(updated));
});

router.delete("/user-experiences/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(userExperiencesTable).where(and(eq(userExperiencesTable.id, Number(raw)), eq(userExperiencesTable.householdId, hhId)))
    : await db.select().from(userExperiencesTable).where(and(eq(userExperiencesTable.slug, raw), eq(userExperiencesTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  if (rows[0].createdByUserId !== uid) { res.status(403).json({ error: "Only the creator can delete" }); return; }

  await db.delete(userExperiencesTable).where(eq(userExperiencesTable.id, rows[0].id));
  res.status(204).send();
});

export default router;
