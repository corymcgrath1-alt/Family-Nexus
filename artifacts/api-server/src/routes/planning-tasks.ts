import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, planningTasksTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

function fmt(t: typeof planningTasksTable.$inferSelect) {
  return { ...t, createdAt: t.createdAt.toISOString() };
}

router.get("/planning-tasks", async (req, res): Promise<void> => {
  const { calendarEventId, invitationId } = req.query as { calendarEventId?: string; invitationId?: string };
  const hhId = req.session.householdId!;

  let rows = await db.select().from(planningTasksTable)
    .where(eq(planningTasksTable.householdId, hhId))
    .orderBy(planningTasksTable.createdAt);

  if (calendarEventId) rows = rows.filter((r) => r.calendarEventId === calendarEventId);
  else if (invitationId) rows = rows.filter((r) => r.invitationId === invitationId);

  res.json(rows.map(fmt));
});

router.patch("/planning-tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;
  const hhId = req.session.householdId!;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(planningTasksTable).where(and(eq(planningTasksTable.id, Number(raw)), eq(planningTasksTable.householdId, hhId)))
    : await db.select().from(planningTasksTable).where(and(eq(planningTasksTable.slug, raw), eq(planningTasksTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }

  const patch: Record<string, unknown> = {};
  if (body.completed !== undefined) patch.completed = Boolean(body.completed);
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.dueDate !== undefined) patch.dueDate = String(body.dueDate);
  if (body.assigneeId !== undefined) patch.assigneeId = Number(body.assigneeId);
  if (body.description !== undefined) patch.description = String(body.description);

  const [updated] = await db.update(planningTasksTable).set(patch).where(eq(planningTasksTable.id, rows[0].id)).returning();
  res.json(fmt(updated));
});

export default router;
