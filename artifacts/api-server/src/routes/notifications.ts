import { Router, type IRouter } from "express";
import { eq, and, isNull, gt, ne } from "drizzle-orm";
import { db, notificationsTable, messagesTable, invitationsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/notifications", async (req, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.session.userId!))
    .orderBy(notificationsTable.createdAt)
    .limit(50);
  res.json(rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })));
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;

  // Unread messages: from other senders, after last seen
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  const lastSeen = user?.messagesLastSeenAt ?? new Date(0);

  const allMessages = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.householdId, hhId), ne(messagesTable.senderId, uid)));
  const unreadMessages = allMessages.filter((m) => m.createdAt > lastSeen).length;

  // Pending invitations for this user
  const invitations = await db.select().from(invitationsTable)
    .where(and(eq(invitationsTable.householdId, hhId), eq(invitationsTable.status, "pending")));
  const pendingInvitations = invitations.filter((inv) => (inv.inviteeIds as number[]).includes(uid)).length;

  // Unread notifications
  const unreadNotifications = await db.select().from(notificationsTable)
    .where(and(eq(notificationsTable.userId, uid), isNull(notificationsTable.readAt)));

  res.json({ messages: unreadMessages, invitations: pendingInvitations, notifications: unreadNotifications.length });
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(notificationsTable).set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.session.userId!)));
  res.status(204).send();
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, req.session.userId!), isNull(notificationsTable.readAt)));
  res.status(204).send();
});

export default router;
