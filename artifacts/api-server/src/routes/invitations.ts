import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, invitationsTable } from "@workspace/db";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function formatInvitation(inv: typeof invitationsTable.$inferSelect) {
  return {
    ...inv,
    inviteeIds: inv.inviteeIds as string[],
    surpriseRevealedFields: inv.surpriseRevealedFields as string[],
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt ? inv.updatedAt.toISOString() : null,
    rsvpAt: inv.rsvpAt ? inv.rsvpAt.toISOString() : null,
  };
}

router.get("/invitations", async (req, res): Promise<void> => {
  const { status, memberId } = req.query as { status?: string; memberId?: string };

  let rows = await db.select().from(invitationsTable).orderBy(invitationsTable.createdAt);

  if (status) {
    rows = rows.filter((r) => r.status === status);
  }

  if (memberId) {
    rows = rows.filter(
      (r) =>
        r.inviterId === memberId ||
        (r.inviteeIds as string[]).includes(memberId)
    );
  }

  res.json(rows.map(formatInvitation));
});

router.post("/invitations", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const slug = `inv-${nanoid(8)}`;
  const [inv] = await db
    .insert(invitationsTable)
    .values({
      slug,
      inviterId: String(body.inviterId ?? "alex"),
      inviteeIds: (body.inviteeIds as string[]) ?? [],
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
    })
    .returning();

  res.status(201).json(formatInvitation(inv));
});

router.get("/invitations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Try numeric id or slug
  const isNumeric = /^\d+$/.test(raw);
  let rows;
  if (isNumeric) {
    rows = await db.select().from(invitationsTable).where(eq(invitationsTable.id, Number(raw)));
  } else {
    rows = await db.select().from(invitationsTable).where(eq(invitationsTable.slug, raw));
  }

  if (!rows.length) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.json(formatInvitation(rows[0]));
});

router.patch("/invitations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;

  const isNumeric = /^\d+$/.test(raw);
  let rows;
  if (isNumeric) {
    rows = await db.select().from(invitationsTable).where(eq(invitationsTable.id, Number(raw)));
  } else {
    rows = await db.select().from(invitationsTable).where(eq(invitationsTable.slug, raw));
  }

  if (!rows.length) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) patch.status = body.status;
  if (body.rsvpResponse !== undefined) {
    patch.rsvpResponse = body.rsvpResponse;
    patch.rsvpAt = new Date();
  }
  if (body.rsvpNote !== undefined) patch.rsvpNote = body.rsvpNote;
  if (body.proposedDate !== undefined) patch.proposedDate = body.proposedDate;
  if (body.message !== undefined) patch.message = body.message;
  if (body.calendarEventId !== undefined) patch.calendarEventId = body.calendarEventId;
  if (body.dressGuidance !== undefined) patch.dressGuidance = body.dressGuidance;
  if (body.whatToBring !== undefined) patch.whatToBring = body.whatToBring;
  if (body.childcareNotes !== undefined) patch.childcareNotes = body.childcareNotes;
  if (body.reservationStatus !== undefined) patch.reservationStatus = body.reservationStatus;

  const [updated] = await db
    .update(invitationsTable)
    .set(patch)
    .where(eq(invitationsTable.id, rows[0].id))
    .returning();

  res.json(formatInvitation(updated));
});

export default router;
