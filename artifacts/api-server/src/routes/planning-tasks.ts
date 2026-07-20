import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, planningTasksTable } from "@workspace/db";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function formatTask(t: typeof planningTasksTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
  };
}

const DEMO_TASKS = [
  {
    slug: "task-demo-001",
    title: "Arrange childcare for the evening",
    description: "Contact a trusted babysitter or family member for the evening of your date.",
    category: "childcare",
    completed: false,
    dueDate: "2026-08-10",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-002",
    title: "Reserve spots at Kiln & Co.",
    description: "Book two seats for the Saturday 10am pottery session. Call or book online.",
    category: "reservation",
    completed: false,
    dueDate: "2026-08-05",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-003",
    title: "Confirm allergy accommodation",
    description: "Contact the studio to note any dietary or material sensitivities if relevant.",
    category: "other",
    completed: false,
    dueDate: "2026-08-05",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-004",
    title: "Plan travel route and parking",
    description: "Riverside Arts District — street parking on Oak Ave usually available Saturday mornings.",
    category: "transport",
    completed: false,
    dueDate: "2026-08-15",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-005",
    title: "Set a reminder for 48 hours before",
    description: "Reminder to confirm childcare and check reservation.",
    category: "reminder",
    completed: false,
    dueDate: "2026-08-13",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-006",
    title: "Check weather forecast",
    description: "Pottery class is indoors — no issue, but good to plan travel clothing.",
    category: "weather",
    completed: false,
    dueDate: "2026-08-14",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
  {
    slug: "task-demo-007",
    title: "Identify backup plan if class is cancelled",
    description: "The studio sometimes closes for private events. Have a backup activity in mind for the morning.",
    category: "backup",
    completed: false,
    dueDate: "2026-08-10",
    calendarEventId: null as string | null,
    invitationId: "inv-001",
    assigneeId: "alex",
  },
];

async function ensureDemoTasks(invitationId: string, calendarEventId?: string) {
  for (const task of DEMO_TASKS) {
    const existing = await db
      .select()
      .from(planningTasksTable)
      .where(eq(planningTasksTable.slug, task.slug));

    if (!existing.length) {
      await db.insert(planningTasksTable).values({
        ...task,
        calendarEventId: calendarEventId ?? task.calendarEventId,
        invitationId,
      });
    } else if (calendarEventId && !existing[0].calendarEventId) {
      await db
        .update(planningTasksTable)
        .set({ calendarEventId })
        .where(eq(planningTasksTable.slug, task.slug));
    }
  }
}

router.get("/planning-tasks", async (req, res): Promise<void> => {
  const { calendarEventId, invitationId } = req.query as {
    calendarEventId?: string;
    invitationId?: string;
  };

  // If requesting inv-001 tasks, ensure demo tasks exist
  if (invitationId === "inv-001" || calendarEventId) {
    await ensureDemoTasks(invitationId ?? "inv-001", calendarEventId);
  }

  let rows = await db
    .select()
    .from(planningTasksTable)
    .orderBy(planningTasksTable.createdAt);

  if (calendarEventId) {
    rows = rows.filter((r) => r.calendarEventId === calendarEventId);
  } else if (invitationId) {
    rows = rows.filter((r) => r.invitationId === invitationId);
  }

  res.json(rows.map(formatTask));
});

router.patch("/planning-tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;

  const isNumeric = /^\d+$/.test(raw);
  let rows;
  if (isNumeric) {
    rows = await db.select().from(planningTasksTable).where(eq(planningTasksTable.id, Number(raw)));
  } else {
    rows = await db.select().from(planningTasksTable).where(eq(planningTasksTable.slug, raw));
  }

  if (!rows.length) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (body.completed !== undefined) patch.completed = Boolean(body.completed);
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.dueDate !== undefined) patch.dueDate = String(body.dueDate);
  if (body.assigneeId !== undefined) patch.assigneeId = String(body.assigneeId);
  if (body.description !== undefined) patch.description = String(body.description);

  const [updated] = await db
    .update(planningTasksTable)
    .set(patch)
    .where(eq(planningTasksTable.id, rows[0].id))
    .returning();

  res.json(formatTask(updated));
});

export default router;
