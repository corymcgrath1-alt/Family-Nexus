import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, experienceStatesTable } from "@workspace/db";
import { BASE_EXPERIENCES, applyStates } from "../lib/mock-experiences";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
router.use(requireAuth);

async function getStates(userId: number) {
  return db.select().from(experienceStatesTable).where(eq(experienceStatesTable.userId, userId));
}

async function upsertState(
  experienceId: string,
  userId: number,
  householdId: number,
  patch: Partial<{ isSaved: boolean; isHidden: boolean; isShortlisted: boolean }>
) {
  const [existing] = await db.select().from(experienceStatesTable)
    .where(and(eq(experienceStatesTable.experienceId, experienceId), eq(experienceStatesTable.userId, userId)));

  if (existing) {
    const [updated] = await db.update(experienceStatesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(experienceStatesTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(experienceStatesTable)
    .values({ experienceId, userId, householdId, ...patch })
    .returning();
  return created;
}

router.get("/experiences", async (req, res): Promise<void> => {
  const { timeframe, participants, maxCost, maxDistance, energyLevel, setting, needsChildcare, savedOnly, shortlistedOnly } =
    req.query as Record<string, string | undefined>;

  const states = await getStates(req.session.userId!);
  let exps = applyStates(BASE_EXPERIENCES, states).filter((e) => !e.isHidden);

  if (timeframe) exps = exps.filter((e) => e.timeframes.includes(timeframe));
  if (participants) {
    const ids = participants.split(",").map(Number).filter(Boolean);
    if (ids.length) exps = exps.filter((e) => ids.every((id) => e.participantIds.includes(String(id))));
  }
  if (maxCost) exps = exps.filter((e) => e.costEstimate <= Number(maxCost));
  if (maxDistance) exps = exps.filter((e) => e.distanceMiles !== null && e.distanceMiles <= Number(maxDistance));
  if (energyLevel) exps = exps.filter((e) => e.energyLevel === energyLevel);
  if (setting) exps = exps.filter((e) => e.setting === setting || e.setting === "any");
  if (needsChildcare === "true") exps = exps.filter((e) => e.needsChildcare);
  else if (needsChildcare === "false") exps = exps.filter((e) => !e.needsChildcare);
  if (savedOnly === "true") exps = exps.filter((e) => e.isSaved);
  if (shortlistedOnly === "true") exps = exps.filter((e) => e.isShortlisted);

  res.json(exps);
});

router.get("/experiences/search", async (req, res): Promise<void> => {
  const { q } = req.query as { q?: string };
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const lower = q.toLowerCase();
  const chips: Array<{ key: string; label: string; value: string; editable: boolean }> = [];
  const parsedFilters: Record<string, unknown> = {};

  let energyLevel: string | null = null;
  if (lower.includes("tired") || lower.includes("low energy") || lower.includes("easy")) {
    energyLevel = "low";
    chips.push({ key: "energyLevel", label: "Low energy", value: "low", editable: true });
  }

  let setting: string | null = null;
  if (lower.includes("at home") || lower.includes("home date")) {
    setting = "home";
    chips.push({ key: "setting", label: "At home", value: "home", editable: true });
  } else if (lower.includes("outdoor")) {
    setting = "outdoor";
    chips.push({ key: "setting", label: "Outdoors", value: "outdoor", editable: true });
  }

  let maxCost: number | null = null;
  const costMatch = lower.match(/under \$(\d+)|\$(\d+)\s*(?:or less|max|budget)/i);
  if (costMatch) {
    maxCost = Number(costMatch[1] ?? costMatch[2]);
    chips.push({ key: "maxCost", label: `Under $${maxCost}`, value: String(maxCost), editable: true });
  }

  let surpriseMode = false;
  if (lower.includes("surprise")) {
    surpriseMode = true;
    chips.push({ key: "surpriseMode", label: "Surprise mode", value: "true", editable: true });
  }

  parsedFilters.chips = chips;
  parsedFilters.energyLevel = energyLevel;
  parsedFilters.setting = setting;
  parsedFilters.maxCost = maxCost;
  parsedFilters.surpriseMode = surpriseMode;

  const states = await getStates(req.session.userId!);
  let exps = applyStates(BASE_EXPERIENCES, states).filter((e) => !e.isHidden);

  if (energyLevel) exps = exps.filter((e) => e.energyLevel === energyLevel);
  if (setting) exps = exps.filter((e) => e.setting === setting || e.setting === "any");
  if (maxCost !== null) exps = exps.filter((e) => e.costEstimate <= maxCost!);
  if (surpriseMode) exps = exps.filter((e) => e.surpriseEligible);

  res.json({ query: q, parsedFilters, experiences: exps });
});

router.get("/experiences/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  const states = await getStates(req.session.userId!);
  res.json(applyStates([exp], states)[0]);
});

router.post("/experiences/:id/save", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  const { value = true } = req.body as { value?: boolean };
  await upsertState(raw, req.session.userId!, req.session.householdId!, { isSaved: value });
  const states = await getStates(req.session.userId!);
  res.json(applyStates([exp], states)[0]);
});

router.post("/experiences/:id/hide", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  const { value = true } = req.body as { value?: boolean };
  await upsertState(raw, req.session.userId!, req.session.householdId!, { isHidden: value });
  const states = await getStates(req.session.userId!);
  res.json(applyStates([exp], states)[0]);
});

router.post("/experiences/:id/shortlist", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  const { value = true } = req.body as { value?: boolean };
  await upsertState(raw, req.session.userId!, req.session.householdId!, { isShortlisted: value });
  const states = await getStates(req.session.userId!);
  res.json(applyStates([exp], states)[0]);
});

export default router;
