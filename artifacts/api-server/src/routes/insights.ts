import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetLibraryInsightsResponse,
  ListLibraryInsightDefinitionsResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  withAuthenticatedDatabaseActor,
} from "../middleware/auth";
import {
  calculateLibraryInsights,
  getActiveLibraryInsightDefinitions,
} from "../lib/library-insights-service";
import { LIBRARY_INSIGHTS_CATALOG_VERSION } from "../lib/library-insights-contracts";

const router: IRouter = Router();
router.use(requireAuth);

function unavailable(req: Request, res: Response, error: unknown): void {
  req.log.error({ err: error }, "Governed Library insights are unavailable");
  res.status(500).json({ error: "Insights are unavailable" });
}

router.get(
  "/insights/definitions",
  withAuthenticatedDatabaseActor(async (req, res): Promise<void> => {
    try {
      const definitions = await getActiveLibraryInsightDefinitions();
      const response = ListLibraryInsightDefinitionsResponse.parse({
        catalogVersion: LIBRARY_INSIGHTS_CATALOG_VERSION,
        definitions,
      });
      res.json(response);
    } catch (error) {
      unavailable(req, res, error);
    }
  }),
);

router.get(
  "/insights/library",
  withAuthenticatedDatabaseActor(async (req, res): Promise<void> => {
    if (req.session.role !== "adult") {
      res.status(403).json({ error: "Only adult accounts can view insights" });
      return;
    }

    try {
      const insights = await calculateLibraryInsights({
        id: req.session.userId!,
        householdId: req.session.householdId!,
      });
      res.json(GetLibraryInsightsResponse.parse(insights));
    } catch (error) {
      unavailable(req, res, error);
    }
  }),
);

export default router;
