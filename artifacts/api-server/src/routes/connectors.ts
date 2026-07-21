import { Router, type IRouter } from "express";
import {
  GetConnectorCatalogParams,
  GetConnectorCatalogResponse,
  ListConnectorCatalogResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";
import {
  CONNECTOR_CATALOG_VERSION,
  ConnectorPolicyError,
  connectorCatalog,
  getConnector,
} from "../lib/connector-catalog";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/connectors/catalog", (_req, res): void => {
  const response = ListConnectorCatalogResponse.parse({
    catalogVersion: CONNECTOR_CATALOG_VERSION,
    connectors: connectorCatalog,
  });
  res.json(response);
});

router.get("/connectors/catalog/:connectorId", (req, res): void => {
  const params = GetConnectorCatalogParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const response = GetConnectorCatalogResponse.parse({
      catalogVersion: CONNECTOR_CATALOG_VERSION,
      connector: getConnector(params.data.connectorId),
    });
    res.json(response);
  } catch (error) {
    if (
      error instanceof ConnectorPolicyError &&
      error.code === "unknown-connector"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw error;
  }
});

export default router;
