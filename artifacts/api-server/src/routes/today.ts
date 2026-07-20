import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, calendarEventsTable, invitationsTable, planningTasksTable, experienceStatesTable } from "@workspace/db";
import { BASE_EXPERIENCES, applyStates } from "../lib/mock-experiences";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/today", async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  const states = await db.select().from(experienceStatesTable).where(eq(experienceStatesTable.userId, uid));
  const exps = applyStates(BASE_EXPERIENCES, states).filter((e) => !e.isHidden);
  const featured = exps.find((e) => e.timeframes.includes("right-now")) ?? exps[0];

  const today = new Date().toISOString().split("T")[0];

  const calEvents = await db.select().from(calendarEventsTable)
    .where(eq(calendarEventsTable.householdId, hhId))
    .orderBy(calendarEventsTable.date);
  const upcomingEvent = calEvents.find((e) => e.date >= today) ?? null;

  const allInvitations = await db.select().from(invitationsTable).where(eq(invitationsTable.householdId, hhId));
  const pendingInvitation = allInvitations.find((inv) =>
    inv.status === "pending" && (inv.inviteeIds as number[]).includes(uid)
  ) ?? null;

  const tasks = await db.select().from(planningTasksTable)
    .where(eq(planningTasksTable.householdId, hhId))
    .orderBy(planningTasksTable.dueDate);
  const urgentTask = tasks.find((t) => !t.completed) ?? null;

  const fmtEvent = (ev: typeof calendarEventsTable.$inferSelect | null) =>
    ev ? { ...ev, participantIds: ev.participantIds as number[], createdAt: ev.createdAt.toISOString() } : null;

  const fmtInv = (inv: typeof invitationsTable.$inferSelect | null) =>
    inv ? {
      ...inv,
      inviteeIds: inv.inviteeIds as number[],
      surpriseRevealedFields: inv.surpriseRevealedFields as string[],
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      rsvpAt: inv.rsvpAt?.toISOString() ?? null,
    } : null;

  const fmtTask = (t: typeof planningTasksTable.$inferSelect | null) =>
    t ? { ...t, createdAt: t.createdAt.toISOString() } : null;

  res.json({
    date: today,
    featuredExperience: featured,
    upcomingCalendarEvent: fmtEvent(upcomingEvent),
    pendingInvitation: fmtInv(pendingInvitation),
    urgentPlanningTask: fmtTask(urgentTask),
    quickActions: [
      { id: "qa-001", label: "Discover experiences", action: "navigate", icon: "Sparkles", targetId: "/together" },
      { id: "qa-002", label: "View invitations", action: "navigate", icon: "Mail", targetId: "/together/invitations" },
      { id: "qa-003", label: "Check calendar", action: "navigate", icon: "Calendar", targetId: "/together/calendar" },
      { id: "qa-004", label: "View memories", action: "navigate", icon: "BookHeart", targetId: "/together/memories" },
    ],
  });
});

export default router;
