import { Router, type IRouter } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, experienceStatesTable } from "@workspace/db";
import { BASE_EXPERIENCES, applyStates } from "../lib/mock-experiences";

const router: IRouter = Router();

async function getStates(viewerId: string) {
  return db
    .select()
    .from(experienceStatesTable)
    .where(eq(experienceStatesTable.viewerId, viewerId));
}

async function upsertState(
  experienceId: string,
  viewerId: string,
  patch: Partial<{ isSaved: boolean; isHidden: boolean; isShortlisted: boolean }>
) {
  const [existing] = await db
    .select()
    .from(experienceStatesTable)
    .where(
      and(
        eq(experienceStatesTable.experienceId, experienceId),
        eq(experienceStatesTable.viewerId, viewerId)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(experienceStatesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(experienceStatesTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(experienceStatesTable)
    .values({ experienceId, viewerId, ...patch })
    .returning();
  return created;
}

router.get("/experiences", async (req, res): Promise<void> => {
  const {
    timeframe,
    participants,
    maxCost,
    maxDistance,
    energyLevel,
    setting,
    needsChildcare,
    surpriseMode,
    savedOnly,
    shortlistedOnly,
  } = req.query as Record<string, string | undefined>;

  const viewerId = "alex";
  const states = await getStates(viewerId);

  let exps = applyStates(BASE_EXPERIENCES, states);

  // Filter hidden
  exps = exps.filter((e) => !e.isHidden);

  if (timeframe) {
    exps = exps.filter((e) => e.timeframes.includes(timeframe));
  }

  if (participants) {
    const ids = participants.split(",");
    exps = exps.filter((e) => ids.every((id) => e.participantIds.includes(id)));
  }

  if (maxCost) {
    exps = exps.filter((e) => e.costEstimate <= Number(maxCost));
  }

  if (maxDistance) {
    exps = exps.filter((e) => e.distanceMiles !== null && e.distanceMiles <= Number(maxDistance));
  }

  if (energyLevel) {
    exps = exps.filter((e) => e.energyLevel === energyLevel);
  }

  if (setting) {
    exps = exps.filter((e) => e.setting === setting || e.setting === "any");
  }

  if (needsChildcare === "true") {
    exps = exps.filter((e) => e.needsChildcare);
  } else if (needsChildcare === "false") {
    exps = exps.filter((e) => !e.needsChildcare);
  }

  if (savedOnly === "true") {
    exps = exps.filter((e) => e.isSaved);
  }

  if (shortlistedOnly === "true") {
    exps = exps.filter((e) => e.isShortlisted);
  }

  res.json(exps);
});

// Natural language search
router.get("/experiences/search", async (req, res): Promise<void> => {
  const { q, viewerId: qViewer } = req.query as { q?: string; viewerId?: string };

  if (!q) {
    res.status(400).json({ error: "Query parameter q is required" });
    return;
  }

  const viewerId = qViewer ?? "alex";
  const lower = q.toLowerCase();

  // Parse filters from natural language
  const parsedFilters: Record<string, unknown> = { chips: [] };
  const chips: Array<{ key: string; label: string; value: string; editable: boolean }> = [];

  // Participants
  let participantIds: string[] = [];
  if (lower.includes("father") && lower.includes("son") || (lower.includes("alex") && lower.includes("jamie") && !lower.includes("morgan"))) {
    participantIds = ["alex", "jamie"];
    chips.push({ key: "participants", label: "Alex + Jamie", value: "alex,jamie", editable: true });
  } else if (lower.includes("morgan") && lower.includes("jamie") && !lower.includes("alex") || lower.includes("mother") && lower.includes("son")) {
    participantIds = ["morgan", "jamie"];
    chips.push({ key: "participants", label: "Morgan + Jamie", value: "morgan,jamie", editable: true });
  } else if (lower.includes("romantic") || lower.includes("couple") || lower.includes("partner") || lower.includes("date night") || (lower.includes("alex") && lower.includes("morgan") && !lower.includes("jamie"))) {
    participantIds = ["alex", "morgan"];
    chips.push({ key: "participants", label: "Alex + Morgan", value: "alex,morgan", editable: true });
  } else if (lower.includes("surprise") && (lower.includes("partner") || lower.includes("morgan"))) {
    participantIds = ["alex", "morgan"];
    chips.push({ key: "participants", label: "Alex + Morgan (Surprise)", value: "alex,morgan", editable: true });
  } else if (lower.includes("family") || lower.includes("everyone") || lower.includes("whole family")) {
    participantIds = ["alex", "morgan", "jamie"];
    chips.push({ key: "participants", label: "Whole family", value: "alex,morgan,jamie", editable: true });
  } else if (lower.includes("solo") || lower.includes("myself") || lower.includes("alone") || lower.includes("recharge")) {
    participantIds = ["alex"];
    chips.push({ key: "participants", label: "Solo (Alex)", value: "alex", editable: true });
  }

  // Day of week
  let dayOfWeek: string | null = null;
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const d of days) {
    if (lower.includes(d)) {
      dayOfWeek = d;
      chips.push({ key: "dayOfWeek", label: d.charAt(0).toUpperCase() + d.slice(1), value: d, editable: true });
      break;
    }
  }

  // Time of day
  let timeOfDay: string | null = null;
  if (lower.includes("morning")) { timeOfDay = "morning"; chips.push({ key: "timeOfDay", label: "Morning", value: "morning", editable: true }); }
  else if (lower.includes("after 7") || lower.includes("evening") || lower.includes("night")) { timeOfDay = "evening"; chips.push({ key: "timeOfDay", label: "Evening", value: "evening", editable: true }); }
  else if (lower.includes("afternoon")) { timeOfDay = "afternoon"; chips.push({ key: "timeOfDay", label: "Afternoon", value: "afternoon", editable: true }); }

  // Cost
  let maxCost: number | null = null;
  const costMatch = lower.match(/under \$(\d+)|\$(\d+)\s*(?:or less|max|budget)/i);
  if (costMatch) {
    maxCost = Number(costMatch[1] ?? costMatch[2]);
    chips.push({ key: "maxCost", label: `Under $${maxCost}`, value: String(maxCost), editable: true });
  }

  // Distance
  let maxDistance: number | null = null;
  const distMatch = lower.match(/within (\d+)\s*(?:minutes?|min|miles?|mi)/i);
  if (distMatch) {
    maxDistance = Number(distMatch[1]);
    chips.push({ key: "maxDistance", label: `Within ${maxDistance} min`, value: String(maxDistance), editable: true });
  }

  // Energy/effort
  let energyLevel: string | null = null;
  if (lower.includes("tired") || lower.includes("low energy") || lower.includes("low-energy") || lower.includes("easy") || lower.includes("low effort")) {
    energyLevel = "low";
    chips.push({ key: "energyLevel", label: "Low energy", value: "low", editable: true });
  } else if (lower.includes("active") || lower.includes("adventurous") || lower.includes("high energy")) {
    energyLevel = "high";
    chips.push({ key: "energyLevel", label: "High energy", value: "high", editable: true });
  }

  // Crowd
  let crowdLevel: string | null = null;
  if (lower.includes("not crowded") || lower.includes("quiet") || lower.includes("without large crowds") || lower.includes("low crowd") || lower.includes("no crowd")) {
    crowdLevel = "low";
    chips.push({ key: "crowdLevel", label: "Low crowd", value: "low", editable: true });
  }

  // Setting
  let setting: string | null = null;
  if (lower.includes("at home") || lower.includes("home date") || lower.includes("home-based")) {
    setting = "home";
    chips.push({ key: "setting", label: "At home", value: "home", editable: true });
  } else if (lower.includes("outdoors") || lower.includes("outside") || lower.includes("outdoor")) {
    setting = "outdoor";
    chips.push({ key: "setting", label: "Outdoors", value: "outdoor", editable: true });
  }

  // Month/season
  let month: string | null = null;
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (const m of months) {
    if (lower.includes(m)) {
      month = m;
      chips.push({ key: "month", label: m.charAt(0).toUpperCase() + m.slice(1), value: m, editable: true });
      break;
    }
  }

  // Surprise mode
  let surpriseMode: boolean | null = null;
  if (lower.includes("surprise")) {
    surpriseMode = true;
    chips.push({ key: "surpriseMode", label: "Surprise mode", value: "true", editable: true });
  }

  // Duration
  let durationHours: number | null = null;
  const durMatch = lower.match(/(\d+)\s*(?:hour|hr)s?/i);
  if (durMatch) {
    durationHours = Number(durMatch[1]);
    chips.push({ key: "durationHours", label: `${durationHours} hours`, value: String(durationHours), editable: true });
  }

  parsedFilters.chips = chips;
  parsedFilters.participants = participantIds.length ? participantIds : null;
  parsedFilters.dayOfWeek = dayOfWeek;
  parsedFilters.timeOfDay = timeOfDay;
  parsedFilters.maxCost = maxCost;
  parsedFilters.maxDistance = maxDistance;
  parsedFilters.energyLevel = energyLevel;
  parsedFilters.crowdLevel = crowdLevel;
  parsedFilters.setting = setting;
  parsedFilters.month = month;
  parsedFilters.surpriseMode = surpriseMode;
  parsedFilters.durationHours = durationHours;

  // Apply filters to experiences
  const states = await getStates(viewerId);
  let exps = applyStates(BASE_EXPERIENCES, states).filter((e) => !e.isHidden);

  if (participantIds.length) {
    exps = exps.filter((e) => participantIds.every((id) => e.participantIds.includes(id)));
  }
  if (energyLevel) exps = exps.filter((e) => e.energyLevel === energyLevel);
  if (setting) exps = exps.filter((e) => e.setting === setting || e.setting === "any");
  if (maxCost !== null) exps = exps.filter((e) => e.costEstimate <= maxCost!);
  if (crowdLevel === "low") exps = exps.filter((e) => e.crowdLevel === "low" || e.crowdLevel === "none");
  if (surpriseMode) exps = exps.filter((e) => e.surpriseEligible);
  if (durationHours !== null) {
    const maxMin = durationHours * 60 + 30;
    exps = exps.filter((e) => e.durationMinutes <= maxMin);
  }

  res.json({ query: q, parsedFilters, experiences: exps });
});

router.get("/experiences/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) {
    res.status(404).json({ error: "Experience not found" });
    return;
  }

  const states = await getStates("alex");
  const withState = applyStates([exp], states);
  res.json(withState[0]);
});

router.post("/experiences/:id/save", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }

  const { value = true, memberId = "alex" } = req.body as { value?: boolean; memberId?: string };
  await upsertState(raw, memberId, { isSaved: value });

  const states = await getStates(memberId);
  res.json(applyStates([exp], states)[0]);
});

router.post("/experiences/:id/hide", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }

  const { value = true, memberId = "alex" } = req.body as { value?: boolean; memberId?: string };
  await upsertState(raw, memberId, { isHidden: value });

  const states = await getStates(memberId);
  res.json(applyStates([exp], states)[0]);
});

router.post("/experiences/:id/shortlist", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const exp = BASE_EXPERIENCES.find((e) => e.id === raw);
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }

  const { value = true, memberId = "alex" } = req.body as { value?: boolean; memberId?: string };
  await upsertState(raw, memberId, { isShortlisted: value });

  const states = await getStates(memberId);
  res.json(applyStates([exp], states)[0]);
});

export default router;
