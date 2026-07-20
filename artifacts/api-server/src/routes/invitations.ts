import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, invitationsTable, calendarEventsTable, planningTasksTable, notificationsTable, usersTable } from "@workspace/db";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

// Fields hidden from invitees when isSurprise = true
const SURPRISE_HIDDEN_FIELDS = new Set(["reservationStatus", "planningResponsibility", "transportationNotes"]);

function formatInvitation(
  inv: typeof invitationsTable.$inferSelect,
  viewerIsInvitee: boolean,
  members: Array<typeof usersTable.$inferSelect> = []
) {
  const inviterUser = members.find((u) => u.id === inv.inviterId);
  const inviteeUserNames = (inv.inviteeIds as number[]).map((id) => members.find((u) => u.id === id)?.displayName ?? String(id));

  const base = {
    ...inv,
    inviteeIds: inv.inviteeIds as number[],
    surpriseRevealedFields: inv.surpriseRevealedFields as string[],
    inviterName: inviterUser?.displayName ?? String(inv.inviterId),
    inviterInitials: inviterUser?.avatarInitials ?? "??",
    inviterColor: inviterUser?.color ?? "#888",
    inviteeNames: inviteeUserNames,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    rsvpAt: inv.rsvpAt?.toISOString() ?? null,
  };

  // Enforce surprise mode: hide planning fields from invitees
  if (inv.isSurprise && viewerIsInvitee) {
    for (const field of SURPRISE_HIDDEN_FIELDS) {
      const revealed = base.surpriseRevealedFields ?? [];
      if (!revealed.includes(field)) {
        (base as Record<string, unknown>)[field] = null;
      }
    }
  }

  return base;
}

router.get("/invitations", async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  let rows = await db.select().from(invitationsTable)
    .where(eq(invitationsTable.householdId, hhId))
    .orderBy(invitationsTable.createdAt);

  if (status) rows = rows.filter((r) => r.status === status);

  // Only show invitations where user is inviter or invitee
  rows = rows.filter((r) => r.inviterId === uid || (r.inviteeIds as number[]).includes(uid));

  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, hhId));
  res.json(rows.map((r) => formatInvitation(r, (r.inviteeIds as number[]).includes(uid), members)));
});

router.post("/invitations", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  // Get all household adult members to use as potential invitees
  const members = await db.select().from(usersTable)
    .where(and(eq(usersTable.householdId, hhId), eq(usersTable.role, "adult")));

  // inviteeIds from client: may be user IDs (integers) or inferred from household members
  const rawInvitees = (body.inviteeIds as number[] | undefined) ?? members.filter((m) => m.id !== uid).map((m) => m.id);
  const inviteeIds = rawInvitees.filter((id) => id !== uid);

  const slug = `inv-${nanoid(8)}`;
  const [inv] = await db.insert(invitationsTable).values({
    householdId: hhId,
    slug,
    inviterId: uid,
    inviteeIds,
    experienceId: String(body.experienceId ?? ""),
    experienceTitle: String(body.experienceTitle ?? ""),
    status: "pending",
    purpose: body.purpose ? String(body.purpose) : null,
    proposedDate: body.proposedDate ? String(body.proposedDate) : null,
    proposedDateFlexible: Boolean(body.proposedDateFlexible ?? false),
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    detailLevel: String(body.detailLevel ?? "full"),
    dressGuidance: body.dressGuidance ? String(body.dressGuidance) : null,
    whatToBring: body.whatToBring ? String(body.whatToBring) : null,
    planningResponsibility: body.planningResponsibility ? String(body.planningResponsibility) : null,
    paymentArrangement: body.paymentArrangement ? String(body.paymentArrangement) : null,
    transportationNotes: body.transportationNotes ? String(body.transportationNotes) : null,
    childcareNotes: body.childcareNotes ? String(body.childcareNotes) : null,
    reservationStatus: body.reservationStatus ? String(body.reservationStatus) : null,
    accessibilityNotes: body.accessibilityNotes ? String(body.accessibilityNotes) : null,
    message: body.message ? String(body.message) : null,
    isSurprise: Boolean(body.isSurprise ?? false),
    surpriseRevealedFields: (body.surpriseRevealedFields as string[]) ?? [],
  }).returning();

  // Notify invitees
  for (const inviteeId of inviteeIds) {
    await db.insert(notificationsTable).values({
      householdId: hhId,
      userId: inviteeId,
      type: "invitation",
      title: "New invitation",
      body: `You've been invited to ${inv.experienceTitle}`,
      referenceId: inv.slug,
      referenceType: "invitation",
    });
  }

  res.status(201).json(formatInvitation(inv, false, members));
});

router.get("/invitations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(invitationsTable).where(and(eq(invitationsTable.id, Number(raw)), eq(invitationsTable.householdId, hhId)))
    : await db.select().from(invitationsTable).where(and(eq(invitationsTable.slug, raw), eq(invitationsTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const inv = rows[0];

  // Must be inviter or invitee
  const isInvitee = (inv.inviteeIds as number[]).includes(uid);
  if (inv.inviterId !== uid && !isInvitee) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, hhId));
  res.json(formatInvitation(inv, isInvitee, members));
});

router.patch("/invitations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;
  const body = req.body as Record<string, unknown>;

  const isNumeric = /^\d+$/.test(raw);
  const rows = isNumeric
    ? await db.select().from(invitationsTable).where(and(eq(invitationsTable.id, Number(raw)), eq(invitationsTable.householdId, hhId)))
    : await db.select().from(invitationsTable).where(and(eq(invitationsTable.slug, raw), eq(invitationsTable.householdId, hhId)));

  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const inv = rows[0];
  const isInvitee = (inv.inviteeIds as number[]).includes(uid);
  const isInviter = inv.inviterId === uid;

  if (!isInviter && !isInvitee) { res.status(403).json({ error: "Forbidden" }); return; }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // RSVP fields: only invitee can set
  if (body.rsvpResponse !== undefined) {
    if (!isInvitee) { res.status(403).json({ error: "Only invitees can RSVP" }); return; }
    patch.rsvpResponse = body.rsvpResponse;
    patch.rsvpAt = new Date();
    patch.status = body.rsvpResponse === "accepted" ? "accepted" : body.rsvpResponse === "declined" ? "declined" : "pending";
  }
  if (body.rsvpNote !== undefined && isInvitee) patch.rsvpNote = body.rsvpNote;

  // Inviter-only fields
  if (body.status !== undefined && isInviter) patch.status = body.status;
  if (body.proposedDate !== undefined) patch.proposedDate = body.proposedDate;
  if (body.message !== undefined) patch.message = body.message;
  if (body.childcareNotes !== undefined) patch.childcareNotes = body.childcareNotes;
  if (body.reservationStatus !== undefined && isInviter) patch.reservationStatus = body.reservationStatus;
  if (body.calendarEventId !== undefined) patch.calendarEventId = body.calendarEventId;

  const [updated] = await db.update(invitationsTable)
    .set(patch).where(eq(invitationsTable.id, inv.id)).returning();

  // Notify on RSVP change
  if (patch.rsvpResponse) {
    await db.insert(notificationsTable).values({
      householdId: hhId,
      userId: inv.inviterId,
      type: "rsvp_change",
      title: "RSVP update",
      body: `Your invitation to ${inv.experienceTitle} has been ${String(patch.rsvpResponse)}`,
      referenceId: inv.slug,
      referenceType: "invitation",
    });

    // Auto-generate calendar event + tasks if accepted
    if (patch.rsvpResponse === "accepted") {
      const evSlug = `evt-${nanoid(8)}`;
      const [evt] = await db.insert(calendarEventsTable).values({
        householdId: hhId,
        slug: evSlug,
        title: inv.experienceTitle,
        date: inv.proposedDate ?? "",
        durationMinutes: inv.durationMinutes ?? null,
        participantIds: [inv.inviterId, ...((inv.inviteeIds as number[]))],
        experienceId: inv.experienceId,
        invitationId: inv.slug,
      }).returning();

      // Update invitation with calendar event
      await db.update(invitationsTable).set({ calendarEventId: evt.slug }).where(eq(invitationsTable.id, inv.id));

      // Generate planning tasks
      const tasks = [
        { title: "Arrange childcare for the date", category: "childcare", dueDate: "" },
        { title: `Reserve spots for ${inv.experienceTitle}`, category: "reservation", dueDate: "" },
        { title: "Plan travel and parking", category: "transport", dueDate: "" },
        { title: "Set a reminder 48 hours before", category: "reminder", dueDate: "" },
        { title: "Check weather forecast", category: "weather", dueDate: "" },
        { title: "Identify a backup plan if needed", category: "backup", dueDate: "" },
        { title: "Confirm all arrangements the day before", category: "other", dueDate: "" },
      ];

      for (const task of tasks) {
        await db.insert(planningTasksTable).values({
          householdId: hhId,
          slug: `task-${nanoid(8)}`,
          title: task.title,
          category: task.category,
          calendarEventId: evt.slug,
          invitationId: inv.slug,
          assigneeId: inv.inviterId,
          completed: false,
        });
      }
    }
  }

  res.json(formatInvitation(updated, isInvitee));
});

export default router;
