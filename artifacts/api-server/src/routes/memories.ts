import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, memoriesTable } from "@workspace/db";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

function fmt(m: typeof memoriesTable.$inferSelect) {
  return { ...m, participantIds: m.participantIds as number[], budgetEstimate: m.budgetEstimate ? Number(m.budgetEstimate) : null, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() };
}

router.get("/memories", async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  let rows = await db.select().from(memoriesTable)
    .where(eq(memoriesTable.householdId, req.session.householdId!))
    .orderBy(memoriesTable.createdAt);
  if (status) rows = rows.filter((r) => r.status === status);
  res.json(rows.map(fmt));
});

router.post("/memories", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [mem] = await db.insert(memoriesTable).values({
    householdId: req.session.householdId!,
    slug: `mem-${nanoid(8)}`,
    title: String(body.title ?? ""),
    description: body.description ? String(body.description) : null,
    sourceType: String(body.sourceType ?? "manual"),
    sourceMessage: body.sourceMessage ? String(body.sourceMessage) : null,
    mentionedById: body.mentionedById ? Number(body.mentionedById) : req.session.userId!,
    imageUrl: body.imageUrl ? String(body.imageUrl) : null,
    link: body.link ? String(body.link) : null,
    season: body.season ? String(body.season) : null,
    budgetEstimate: body.budgetEstimate ? String(body.budgetEstimate) : null,
    participantIds: (body.participantIds as number[]) ?? [],
    surpriseEligible: Boolean(body.surpriseEligible ?? false),
    advancePlanningNeeded: Boolean(body.advancePlanningNeeded ?? false),
    status: "active",
  }).returning();
  res.status(201).json(fmt(mem));
});

router.patch("/memories/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;
  const hhId = req.session.householdId!;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(memoriesTable).where(and(eq(memoriesTable.id, Number(raw)), eq(memoriesTable.householdId, hhId)))
    : await db.select().from(memoriesTable).where(and(eq(memoriesTable.slug, raw), eq(memoriesTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) patch.status = body.status;
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.season !== undefined) patch.season = body.season;
  if (body.surpriseEligible !== undefined) patch.surpriseEligible = body.surpriseEligible;

  const [updated] = await db.update(memoriesTable).set(patch).where(eq(memoriesTable.id, rows[0].id)).returning();
  res.json(fmt(updated));
});

export default router;
