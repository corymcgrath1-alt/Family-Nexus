import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db, householdsTable, usersTable, householdInvitesTable } from "@workspace/db";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function newPassportId(): string {
  return `lhp_${randomBytes(16).toString("hex")}`;
}

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _pw, ...rest } = u;
  return { ...rest, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
}

// POST /api/auth/register — create household + first adult
router.post("/auth/register", async (req, res): Promise<void> => {
  const { householdName, displayName, email, password } = req.body as {
    householdName?: string; displayName?: string; email?: string; password?: string;
  };

  if (!displayName || !email || !password) {
    res.status(400).json({ error: "displayName, email, and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const initials = displayName.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["#4A7C59", "#7B5EA7", "#2C6E8A", "#8B5E3C", "#6B7C4A"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const [household] = await db.insert(householdsTable)
    .values({ name: householdName?.trim() || `${displayName}'s Household` })
    .returning();

  const [user] = await db.insert(usersTable).values({
    householdId: household.id,
    lighthousePassportId: newPassportId(),
    email: email.toLowerCase(),
    passwordHash,
    displayName: displayName.trim(),
    role: "adult",
    avatarInitials: initials,
    color,
  }).returning();

  req.session.userId = user.id;
  req.session.householdId = user.householdId;
  req.session.role = user.role as "adult" | "child";

  res.status(201).json(safeUser(user));
});

// POST /api/auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.householdId = user.householdId;
  req.session.role = user.role as "adult" | "child";

  res.json(safeUser(user));
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(safeUser(user));
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("lh_sid");
    res.status(204).send();
  });
});

// POST /api/auth/invite — send an invite link to a partner
router.post("/auth/invite", requireAuth, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  // Check household doesn't already have 2 adults
  const members = await db.select().from(usersTable)
    .where(and(eq(usersTable.householdId, req.session.householdId!), eq(usersTable.role, "adult")));
  if (members.length >= 2) {
    res.status(400).json({ error: "Household already has two adults" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(householdInvitesTable).values({
    householdId: req.session.householdId!,
    inviterUserId: req.session.userId!,
    email: email.toLowerCase(),
    token,
    expiresAt,
  });

  res.status(201).json({ token, email, expiresAt: expiresAt.toISOString() });
});

// GET /api/auth/invite/:token — preview invite before joining
router.get("/auth/invite/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;

  const [invite] = await db.select().from(householdInvitesTable)
    .where(and(
      eq(householdInvitesTable.token, raw),
      isNull(householdInvitesTable.usedAt),
      gt(householdInvitesTable.expiresAt, new Date())
    ));

  if (!invite) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, invite.inviterUserId));

  res.json({
    householdName: household?.name ?? "A household",
    inviterName: inviter?.displayName ?? "Someone",
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
  });
});

// POST /api/auth/join/:token — join a household via invite
router.post("/auth/join/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const { displayName, email, password } = req.body as {
    displayName?: string; email?: string; password?: string;
  };

  if (!displayName || !email || !password) {
    res.status(400).json({ error: "displayName, email, and password are required" });
    return;
  }

  const [invite] = await db.select().from(householdInvitesTable)
    .where(and(
      eq(householdInvitesTable.token, raw),
      isNull(householdInvitesTable.usedAt),
      gt(householdInvitesTable.expiresAt, new Date())
    ));

  if (!invite) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const initials = displayName.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["#7B5EA7", "#2C6E8A", "#8B5E3C", "#6B7C4A"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const [user] = await db.insert(usersTable).values({
    householdId: invite.householdId,
    lighthousePassportId: newPassportId(),
    email: email.toLowerCase(),
    passwordHash,
    displayName: displayName.trim(),
    role: "adult",
    avatarInitials: initials,
    color,
  }).returning();

  // Mark invite used
  await db.update(householdInvitesTable)
    .set({ usedAt: new Date() })
    .where(eq(householdInvitesTable.id, invite.id));

  req.session.userId = user.id;
  req.session.householdId = user.householdId;
  req.session.role = "adult";

  res.status(201).json(safeUser(user));
});

// POST /api/auth/add-child — add a child profile to the household
router.post("/auth/add-child", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "adult") {
    res.status(403).json({ error: "Only adults can add child profiles" });
    return;
  }

  const { displayName, age, color } = req.body as { displayName?: string; age?: number; color?: string };
  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  const initials = displayName.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const childEmail = `child-${Date.now()}@household.internal`;

  const [child] = await db.insert(usersTable).values({
    householdId: req.session.householdId!,
    lighthousePassportId: newPassportId(),
    email: childEmail,
    passwordHash: "",
    displayName: displayName.trim(),
    role: "child",
    avatarInitials: initials,
    color: color ?? "#E08D3C",
    age: age ?? null,
  }).returning();

  res.status(201).json(safeUser(child));
});

export default router;
