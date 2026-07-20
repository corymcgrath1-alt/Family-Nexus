import { Router, type IRouter } from "express";
import { db, reflectionsTable } from "@workspace/db";

const router: IRouter = Router();

function formatReflection(r: typeof reflectionsTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/reflections", async (_req, res): Promise<void> => {
  const rows = await db.select().from(reflectionsTable).orderBy(reflectionsTable.createdAt);
  res.json(rows.map(formatReflection));
});

router.post("/reflections", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const [reflection] = await db
    .insert(reflectionsTable)
    .values({
      memberId: String(body.memberId ?? "alex"),
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
    })
    .returning();

  res.status(201).json(formatReflection(reflection));
});

export default router;
