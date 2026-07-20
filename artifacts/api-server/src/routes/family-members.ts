import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, experienceProfilesTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { DEFAULT_PROFILES } from "../lib/mock-family";

const router: IRouter = Router();
router.use(requireAuth);

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _pw, ...rest } = u;
  return {
    ...rest,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    messagesLastSeenAt: u.messagesLastSeenAt?.toISOString() ?? null,
  };
}

function applyPrivacyFilter(profile: Record<string, unknown>, isOwner: boolean): Record<string, unknown> {
  if (isOwner) return profile;
  const VISIBLE = new Set(["share-exact", "share-summary", "surprise-ok"]);
  const filterTraits = (arr: unknown): unknown[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter((t: unknown) => {
      const trait = t as { visibility?: string };
      return VISIBLE.has(trait.visibility ?? "");
    });
  };
  return {
    ...profile,
    interests: filterTraits(profile.interests),
    dislikes: filterTraits(profile.dislikes),
    curiosityItems: filterTraits(profile.curiosityItems),
    foodPreferences: filterTraits(profile.foodPreferences),
  };
}

router.get("/family-members", async (req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.householdId, req.session.householdId!));
  res.json(users.map(safeUser));
});

router.get("/family-members/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.householdId, req.session.householdId!)));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(safeUser(user));
});

router.get("/family-members/:id/profile", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Verify member belongs to same household
  const [member] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.householdId, req.session.householdId!)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }

  const isOwner = req.session.userId === id;

  const [dbProfile] = await db.select().from(experienceProfilesTable)
    .where(eq(experienceProfilesTable.userId, id));

  let profile: Record<string, unknown>;
  if (dbProfile) {
    profile = { ...dbProfile, updatedAt: dbProfile.updatedAt.toISOString() };
  } else {
    // Fall back to seeded default profile keyed by display name
    const key = member.displayName.toLowerCase();
    profile = (DEFAULT_PROFILES[key] ?? {}) as Record<string, unknown>;
  }

  res.json(applyPrivacyFilter(profile, isOwner));
});

router.patch("/family-members/:id/profile", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Only the owner can edit their profile
  if (req.session.userId !== id) {
    res.status(403).json({ error: "You can only edit your own profile" });
    return;
  }

  const updates = req.body as Record<string, unknown>;

  const [existing] = await db.select().from(experienceProfilesTable)
    .where(eq(experienceProfilesTable.userId, id));

  if (existing) {
    const [updated] = await db.update(experienceProfilesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(experienceProfilesTable.userId, id))
      .returning();
    res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
    return;
  }

  const insertValues = {
    householdId: req.session.householdId!,
    userId: id,
    ...updates,
  } as typeof experienceProfilesTable.$inferInsert;

  const [created] = await db.insert(experienceProfilesTable).values(insertValues).returning();
  res.status(201).json({ ...created, updatedAt: created.updatedAt.toISOString() });
});

export default router;
