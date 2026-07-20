import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, memoriesTable } from "@workspace/db";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function formatMemory(m: typeof memoriesTable.$inferSelect) {
  return {
    ...m,
    participantIds: m.participantIds as string[],
    budgetEstimate: m.budgetEstimate ? Number(m.budgetEstimate) : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt ? m.updatedAt.toISOString() : null,
  };
}

// Seed demo memories
const DEMO_MEMORIES = [
  {
    slug: "mem-001",
    title: "Pottery class — something we both want to try",
    description: "Morgan mentioned this in chat. The Kiln & Co. Saturday morning session looks perfect.",
    sourceType: "message",
    sourceMessage: "That pottery class looks fun — we should try it sometime 🎨",
    mentionedBy: "Morgan",
    imageUrl: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&q=80",
    link: null as string | null,
    season: "any",
    budgetEstimate: "95",
    participantIds: ["alex", "morgan"],
    surpriseEligible: true,
    advancePlanningNeeded: true,
    status: "active",
  },
  {
    slug: "mem-002",
    title: "Autumn overlook picnic — postponed from last year",
    description: "Wanted to do this last October. Saving again — season comes back in September.",
    sourceType: "manual",
    sourceMessage: null as string | null,
    mentionedBy: "Alex",
    imageUrl: "https://images.unsplash.com/photo-1569975020836-44de93cf20dc?w=400&q=80",
    link: null as string | null,
    season: "autumn",
    budgetEstimate: "20",
    participantIds: ["alex", "morgan"],
    surpriseEligible: true,
    advancePlanningNeeded: false,
    status: "postponed",
  },
  {
    slug: "mem-003",
    title: "Natural history museum dinosaur exhibit",
    description: "Jamie has been asking about dinosaurs constantly. The Deep Time exhibit runs through December.",
    sourceType: "manual",
    sourceMessage: null as string | null,
    mentionedBy: "Alex",
    imageUrl: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=400&q=80",
    link: null as string | null,
    season: "any",
    budgetEstimate: "52",
    participantIds: ["alex", "morgan", "jamie"],
    surpriseEligible: false,
    advancePlanningNeeded: false,
    status: "active",
  },
];

async function ensureDemoMemories() {
  for (const mem of DEMO_MEMORIES) {
    const existing = await db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.slug, mem.slug));
    if (!existing.length) {
      await db.insert(memoriesTable).values(mem);
    }
  }
}

router.get("/memories", async (req, res): Promise<void> => {
  await ensureDemoMemories();
  const { status } = req.query as { status?: string };
  let rows = await db.select().from(memoriesTable).orderBy(memoriesTable.createdAt);
  if (status) {
    rows = rows.filter((r) => r.status === status);
  }
  res.json(rows.map(formatMemory));
});

router.post("/memories", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const slug = `mem-${nanoid(8)}`;

  const [mem] = await db
    .insert(memoriesTable)
    .values({
      slug,
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : null,
      sourceType: String(body.sourceType ?? "manual"),
      sourceMessage: body.sourceMessage ? String(body.sourceMessage) : null,
      mentionedBy: body.mentionedBy ? String(body.mentionedBy) : null,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      link: body.link ? String(body.link) : null,
      season: body.season ? String(body.season) : null,
      budgetEstimate: body.budgetEstimate ? String(body.budgetEstimate) : null,
      participantIds: (body.participantIds as string[]) ?? [],
      surpriseEligible: Boolean(body.surpriseEligible ?? false),
      advancePlanningNeeded: Boolean(body.advancePlanningNeeded ?? false),
      status: "active",
    })
    .returning();

  res.status(201).json(formatMemory(mem));
});

router.patch("/memories/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;

  const isNumeric = /^\d+$/.test(raw);
  let rows;
  if (isNumeric) {
    rows = await db.select().from(memoriesTable).where(eq(memoriesTable.id, Number(raw)));
  } else {
    rows = await db.select().from(memoriesTable).where(eq(memoriesTable.slug, raw));
  }

  if (!rows.length) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) patch.status = body.status;
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.season !== undefined) patch.season = body.season;
  if (body.surpriseEligible !== undefined) patch.surpriseEligible = body.surpriseEligible;

  const [updated] = await db
    .update(memoriesTable)
    .set(patch)
    .where(eq(memoriesTable.id, rows[0].id))
    .returning();

  res.json(formatMemory(updated));
});

export default router;
