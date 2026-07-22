import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import familyMembersRouter from "./family-members";
import experiencesRouter from "./experiences";
import invitationsRouter from "./invitations";
import calendarEventsRouter from "./calendar-events";
import planningTasksRouter from "./planning-tasks";
import memoriesRouter from "./memories";
import reflectionsRouter from "./reflections";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import privacyRouter from "./privacy";
import userExperiencesRouter from "./user-experiences";
import todayRouter from "./today";
import libraryRouter from "./library";
import connectorsRouter from "./connectors";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Protected routes (each router applies requireAuth internally)
router.use(familyMembersRouter);
router.use(experiencesRouter);
router.use(invitationsRouter);
router.use(calendarEventsRouter);
router.use(planningTasksRouter);
router.use(memoriesRouter);
router.use(reflectionsRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(privacyRouter);
router.use(userExperiencesRouter);
router.use(todayRouter);
router.use(libraryRouter);
router.use(connectorsRouter);

export default router;
