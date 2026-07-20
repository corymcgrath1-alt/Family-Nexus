import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, invitationsTable, calendarEventsTable, planningTasksTable } from "@workspace/db";
import { BASE_EXPERIENCES, applyStates } from "../lib/mock-experiences";
import { experienceStatesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/today", async (req, res): Promise<void> => {
  const { viewerId = "alex" } = req.query as { viewerId?: string };

  // Get states for viewer
  const states = await db
    .select()
    .from(experienceStatesTable)
    .where(eq(experienceStatesTable.viewerId, viewerId));

  const exps = applyStates(BASE_EXPERIENCES, states).filter((e) => !e.isHidden);

  // Featured: pick a couple date or solo that fits "right-now"
  const featured = exps.find((e) => e.timeframes.includes("right-now")) ?? exps[0];

  // Upcoming calendar event
  const today = new Date().toISOString().split("T")[0];
  const calEvents = await db
    .select()
    .from(calendarEventsTable)
    .orderBy(calendarEventsTable.date);

  const upcomingEvent = calEvents.find((e) => e.date >= today) ?? null;

  // Pending invitation
  const pendingInvitations = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.status, "pending"));

  const pendingInvitation = pendingInvitations[0] ?? null;

  // Urgent planning task
  const tasks = await db
    .select()
    .from(planningTasksTable)
    .orderBy(planningTasksTable.dueDate);

  const urgentTask = tasks.find((t) => !t.completed) ?? null;

  const quickActions = [
    {
      id: "qa-001",
      label: "Discover experiences",
      action: "navigate",
      icon: "Sparkles",
      targetId: "/together",
    },
    {
      id: "qa-002",
      label: "View invitations",
      action: "navigate",
      icon: "Mail",
      targetId: "/together/invitations",
    },
    {
      id: "qa-003",
      label: "Check calendar",
      action: "navigate",
      icon: "Calendar",
      targetId: "/together/calendar",
    },
    {
      id: "qa-004",
      label: "View memories",
      action: "navigate",
      icon: "BookHeart",
      targetId: "/together/memories",
    },
  ];

  const formatEvent = (ev: typeof calendarEventsTable.$inferSelect | null) => {
    if (!ev) return null;
    return {
      ...ev,
      participantIds: ev.participantIds as string[],
      createdAt: ev.createdAt.toISOString(),
    };
  };

  const formatInvitation = (inv: typeof invitationsTable.$inferSelect | null) => {
    if (!inv) return null;
    return {
      ...inv,
      inviteeIds: inv.inviteeIds as string[],
      surpriseRevealedFields: inv.surpriseRevealedFields as string[],
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt ? inv.updatedAt.toISOString() : null,
      rsvpAt: inv.rsvpAt ? inv.rsvpAt.toISOString() : null,
    };
  };

  const formatTask = (t: typeof planningTasksTable.$inferSelect | null) => {
    if (!t) return null;
    return { ...t, createdAt: t.createdAt.toISOString() };
  };

  res.json({
    date: today,
    featuredExperience: featured,
    upcomingCalendarEvent: formatEvent(upcomingEvent),
    pendingInvitation: formatInvitation(pendingInvitation),
    urgentPlanningTask: formatTask(urgentTask),
    quickActions,
  });
});

export default router;
