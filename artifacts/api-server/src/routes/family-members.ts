import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, experienceProfilesTable } from "@workspace/db";
import { FAMILY_MEMBERS, DEFAULT_PROFILES } from "../lib/mock-family";

const router: IRouter = Router();

router.get("/family-members", async (_req, res): Promise<void> => {
  res.json(FAMILY_MEMBERS);
});

router.get("/family-members/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const member = FAMILY_MEMBERS.find((m) => m.id === raw);
  if (!member) {
    res.status(404).json({ error: "Family member not found" });
    return;
  }
  res.json(member);
});

router.get("/family-members/:id/profile", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const member = FAMILY_MEMBERS.find((m) => m.id === raw);
  if (!member) {
    res.status(404).json({ error: "Family member not found" });
    return;
  }

  const [dbProfile] = await db
    .select()
    .from(experienceProfilesTable)
    .where(eq(experienceProfilesTable.memberId, raw));

  if (dbProfile) {
    res.json({ ...dbProfile, updatedAt: dbProfile.updatedAt.toISOString() });
    return;
  }

  // Return seeded default profile
  const defaultProfile = DEFAULT_PROFILES[raw];
  if (defaultProfile) {
    res.json(defaultProfile);
    return;
  }

  res.status(404).json({ error: "Profile not found" });
});

router.patch("/family-members/:id/profile", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const member = FAMILY_MEMBERS.find((m) => m.id === raw);
  if (!member) {
    res.status(404).json({ error: "Family member not found" });
    return;
  }

  const updates = req.body as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(experienceProfilesTable)
    .where(eq(experienceProfilesTable.memberId, raw));

  if (existing) {
    const [updated] = await db
      .update(experienceProfilesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(experienceProfilesTable.memberId, raw))
      .returning();
    res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
    return;
  }

  // Create from default + updates
  const defaults = DEFAULT_PROFILES[raw] as Record<string, unknown> ?? {};
  const [created] = await db
    .insert(experienceProfilesTable)
    .values({ memberId: raw, ...defaults, ...updates } as Parameters<typeof db.insert>[0]["$inferInsert"])
    .returning();
  res.json({ ...created, updatedAt: created.updatedAt.toISOString() });
});

export default router;
