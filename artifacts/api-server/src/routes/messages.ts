import { Router, type IRouter } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import { db, messagesTable, usersTable, memoriesTable } from "@workspace/db";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

const MESSAGE_TYPES = new Set([
  "message", "feeling", "request", "promise", "plan", "decision",
  "appreciation", "boundary", "need-support", "need-space", "please-listen",
]);

async function formatMessage(msg: typeof messagesTable.$inferSelect, users: Map<number, typeof usersTable.$inferSelect>) {
  const sender = users.get(msg.senderId);
  return {
    id: msg.id,
    senderId: msg.senderId,
    senderName: sender?.displayName ?? "Unknown",
    senderInitials: sender?.avatarInitials ?? "??",
    senderColor: sender?.color ?? "#888",
    body: msg.body,
    messageType: msg.messageType,
    hasExperienceMention: msg.hasExperienceMention,
    experienceMentionText: msg.experienceMentionText,
    savedAsMemoryId: msg.savedAsMemoryId,
    createdAt: msg.createdAt.toISOString(),
  };
}

router.get("/messages", async (req, res): Promise<void> => {
  const hhId = req.session.householdId!;
  const userId = req.session.userId!;

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.householdId, hhId))
    .orderBy(asc(messagesTable.createdAt))
    .limit(100);

  // Load senders
  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, hhId));
  const usersMap = new Map(members.map((u) => [u.id, u]));

  // Update last seen for this user
  await db.update(usersTable)
    .set({ messagesLastSeenAt: new Date() })
    .where(eq(usersTable.id, userId));

  const formatted = await Promise.all(messages.map((m) => formatMessage(m, usersMap)));
  res.json(formatted);
});

router.post("/messages", async (req, res): Promise<void> => {
  const { body, messageType = "message" } = req.body as { body?: string; messageType?: string };

  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }

  const type = MESSAGE_TYPES.has(messageType) ? messageType : "message";

  // Simple experience mention detection
  const lowerBody = body.toLowerCase();
  const experienceKeywords = ["pottery", "class", "museum", "picnic", "hiking", "restaurant", "concert", "cinema", "kayak", "trail", "botanical", "orchard"];
  const hasExperienceMention = experienceKeywords.some((kw) => lowerBody.includes(kw));
  const experienceMentionText = hasExperienceMention ? body.slice(0, 80) : null;

  const [msg] = await db.insert(messagesTable).values({
    householdId: req.session.householdId!,
    senderId: req.session.userId!,
    body: body.trim(),
    messageType: type,
    hasExperienceMention,
    experienceMentionText,
  }).returning();

  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, req.session.householdId!));
  const usersMap = new Map(members.map((u) => [u.id, u]));

  res.status(201).json(await formatMessage(msg, usersMap));
});

router.post("/messages/:id/save-memory", async (req, res): Promise<void> => {
  const msgId = Number(req.params.id);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [msg] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.householdId, req.session.householdId!)));
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const { title, description } = req.body as { title?: string; description?: string };

  const [memory] = await db.insert(memoriesTable).values({
    householdId: req.session.householdId!,
    slug: `mem-${nanoid(8)}`,
    title: title ?? msg.body.slice(0, 80),
    description: description ?? null,
    sourceType: "message",
    sourceMessage: msg.body,
    mentionedById: msg.senderId,
    participantIds: [],
    surpriseEligible: false,
    advancePlanningNeeded: false,
    status: "active",
  }).returning();

  await db.update(messagesTable).set({ savedAsMemoryId: memory.id }).where(eq(messagesTable.id, msgId));

  res.status(201).json({ ...memory, budgetEstimate: memory.budgetEstimate ? Number(memory.budgetEstimate) : null, createdAt: memory.createdAt.toISOString(), updatedAt: memory.updatedAt.toISOString() });
});

export default router;
