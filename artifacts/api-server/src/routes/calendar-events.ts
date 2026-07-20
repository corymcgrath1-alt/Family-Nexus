import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, calendarEventsTable } from "@workspace/db";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

function fmt(ev: typeof calendarEventsTable.$inferSelect) {
  return { ...ev, participantIds: ev.participantIds as number[], createdAt: ev.createdAt.toISOString() };
}

router.get("/calendar-events", async (req, res): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  let rows = await db.select().from(calendarEventsTable)
    .where(eq(calendarEventsTable.householdId, req.session.householdId!))
    .orderBy(calendarEventsTable.date);
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  res.json(rows.map(fmt));
});

router.post("/calendar-events", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [ev] = await db.insert(calendarEventsTable).values({
    householdId: req.session.householdId!,
    slug: `evt-${nanoid(8)}`,
    title: String(body.title ?? ""),
    date: String(body.date ?? ""),
    time: body.time ? String(body.time) : null,
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    participantIds: (body.participantIds as number[]) ?? [],
    experienceId: body.experienceId ? String(body.experienceId) : null,
    invitationId: body.invitationId ? String(body.invitationId) : null,
    notes: body.notes ? String(body.notes) : null,
    location: body.location ? String(body.location) : null,
  }).returning();
  res.status(201).json(fmt(ev));
});

export default router;
