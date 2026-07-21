import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  experienceProfilesTable,
  householdInvitesTable,
  householdsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/privacy/summary", async (req, res): Promise<void> => {
  const hhId = req.session.householdId!;
  const uid = req.session.userId!;

  const members = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.householdId, hhId));
  const [household] = await db
    .select()
    .from(householdsTable)
    .where(eq(householdsTable.id, hhId));

  // Get profile visibility summary for the current user (no private data cross-user)
  const [myProfile] = await db
    .select()
    .from(experienceProfilesTable)
    .where(eq(experienceProfilesTable.userId, uid));

  const visibilitySummary = myProfile
    ? {
        privateCount: (
          [
            ...(myProfile.interests as object[]),
            ...(myProfile.dislikes as object[]),
          ] as Array<{ visibility?: string }>
        ).filter((t) => t.visibility === "private").length,
        aiOnlyCount: (
          [
            ...(myProfile.interests as object[]),
            ...(myProfile.dislikes as object[]),
          ] as Array<{ visibility?: string }>
        ).filter((t) => t.visibility === "ai-only").length,
        sharedCount: (
          [
            ...(myProfile.interests as object[]),
            ...(myProfile.dislikes as object[]),
          ] as Array<{ visibility?: string }>
        ).filter((t) =>
          ["share-exact", "share-summary", "surprise-ok"].includes(
            t.visibility ?? "",
          ),
        ).length,
      }
    : null;

  // Active invites (pending joins)
  const activeInvites = await db
    .select()
    .from(householdInvitesTable)
    .where(eq(householdInvitesTable.householdId, hhId));

  res.json({
    household: { id: household?.id, name: household?.name },
    members: members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      role: m.role,
      avatarInitials: m.avatarInitials,
      color: m.color,
      isCurrentUser: m.id === uid,
    })),
    visibilitySummary,
    activeInvites: activeInvites.map((i) => ({
      email: i.email,
      expiresAt: i.expiresAt.toISOString(),
      used: !!i.usedAt,
    })),
    protections: [
      "Your account is access-controlled by your email and password",
      "Private preference data is filtered server-side before reaching other household members",
      "Family Library items use server-side access checks for private, shared, and household records",
      "Family Library share, revoke, archive, delete, export, and direct-view events create redacted audit records",
      "Surprise Mode invitations enforce field-level restrictions on the server",
      "Each adult has an independent account with equal authority — no admin hierarchy",
      "Private reflections are never returned to other household members",
    ],
    limitations: [
      "Data is stored on shared servers and is not end-to-end encrypted",
      "This version is not suitable for banking credentials, identity documents, or unreviewed medical data",
      "Audit logging is not yet implemented across every existing domain",
      "The hosting infrastructure can access stored data as with any hosted web application",
    ],
    principle:
      "This app helps us remember what we chose to share. It does not investigate what either of us chose to keep private.",
  });
});

export default router;
