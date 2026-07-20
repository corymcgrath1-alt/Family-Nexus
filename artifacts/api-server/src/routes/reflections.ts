import { Router, type IRouter } from "express";
import { eq, or, and } from "drizzle-orm";
import { db, reflectionsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

function fmt(r: typeof reflectionsTable.$inferSelect) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

router.get("/reflections", async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const hhId = req.session.householdId!;
  // Return own reflections + shared reflections from household
  const rows = await db.select().from(reflectionsTable)
    .where(
      and(
        eq(reflectionsTable.householdId, hhId),
        or(eq(reflectionsTable.userId, uid), eq(reflectionsTable.visibility, "shared"))
      )
    )
    .orderBy(reflectionsTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/reflections", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [reflection] = await db.insert(reflectionsTable).values({
    householdId: req.session.householdId!,
    userId: req.session.userId!,
    calendarEventId: String(body.calendarEventId ?? ""),
    visibility: String(body.visibility ?? "private"),
    enjoyment: body.enjoyment ? Number(body.enjoyment) : null,
    wouldRepeat: body.wouldRepeat !== undefined ? Boolean(body.wouldRepeat) : null,
    bestPart: body.bestPart ? String(body.bestPart) : null,
    costComfort: body.costComfort ? String(body.costComfort) : null,
    durationFit: body.durationFit ? String(body.durationFit) : null,
    crowdFit: body.crowdFit ? String(body.crowdFit) : null,
    feltConsidered: body.feltConsidered !== undefined ? Boolean(body.feltConsidered) : null,
    planningEffortFelt: body.planningEffortFelt ? String(body.planningEffortFelt) : null,
    traditionWorthy: body.traditionWorthy !== undefined ? Boolean(body.traditionWorthy) : null,
    rememberFor: body.rememberFor ? String(body.rememberFor) : null,
  }).returning();
  res.status(201).json(fmt(reflection));
});

export default router;
