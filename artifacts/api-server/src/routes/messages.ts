import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DEMO_MESSAGES = [
  {
    id: "msg-001",
    senderId: "morgan",
    content: "Morning! Don't forget Jamie's school thing is next Thursday evening.",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 3600000 * 8).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-002",
    senderId: "alex",
    content: "Got it — already on the calendar. How are you feeling today?",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 3600000 * 7).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-003",
    senderId: "morgan",
    content: "Better. Just need a slow weekend. Maybe we can actually do that thing we keep putting off.",
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 - 3600000 * 4).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-004",
    senderId: "alex",
    content: "Yes. Let's actually plan something this week instead of talking about it.",
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 - 3600000 * 3).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-005",
    senderId: "morgan",
    content: "Jamie's been really into drawing lately — maybe we get him a proper sketchbook.",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 3600000 * 5).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-006",
    senderId: "alex",
    content: "Good idea. He's been asking about taking a drawing class too.",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 3600000 * 4).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
  {
    id: "msg-007",
    senderId: "morgan",
    content: "That pottery class looks fun — we should try it sometime 🎨",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 3600000 * 2).toISOString(),
    hasExperienceMention: true,
    experienceMentionText: "That pottery class looks fun",
    savedAsMemoryId: null,
  },
  {
    id: "msg-008",
    senderId: "alex",
    content: "Agreed — I was looking at that last week. Saturday mornings apparently.",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 3600000 * 1).toISOString(),
    hasExperienceMention: false,
    experienceMentionText: null,
    savedAsMemoryId: null,
  },
];

router.get("/messages", async (_req, res): Promise<void> => {
  res.json(DEMO_MESSAGES);
});

export default router;
