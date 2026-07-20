import { Router, type IRouter } from "express";
import healthRouter from "./health";
import familyMembersRouter from "./family-members";
import experiencesRouter from "./experiences";
import invitationsRouter from "./invitations";
import calendarEventsRouter from "./calendar-events";
import planningTasksRouter from "./planning-tasks";
import memoriesRouter from "./memories";
import reflectionsRouter from "./reflections";
import messagesRouter from "./messages";
import todayRouter from "./today";

const router: IRouter = Router();

router.use(healthRouter);
router.use(familyMembersRouter);
router.use(experiencesRouter);
router.use(invitationsRouter);
router.use(calendarEventsRouter);
router.use(planningTasksRouter);
router.use(memoriesRouter);
router.use(reflectionsRouter);
router.use(messagesRouter);
router.use(todayRouter);

export default router;
