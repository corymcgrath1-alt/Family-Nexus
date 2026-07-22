import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";

import { requireAuth } from "../middleware/auth";
import { ConnectorError } from "@workspace/knowledge-model";
import {
  ConnectorAccessError,
  beginGoogleAuthorization,
  completeGoogleAuthorization,
  confirmConnectorConsent,
  discoverConnectionResources,
  expireConnectorCredentialForTest,
  getConnection,
  listConnectionResources,
  listConnections,
  listConnectorDefinitions,
  listSyncRuns,
  pauseConnection,
  resumeConnection,
  revokeConnection,
  selectConnectionResources,
  type ConnectorActor,
} from "../lib/connectors/connector-service";
import { runConnectorSync } from "../lib/connectors/connector-sync-service";
import { connectorProviderMode } from "../lib/connectors/provider-factory";
import { fakeGoogleCalendarProvider } from "../lib/connectors/fake-google-calendar-provider";

const router: IRouter = Router();
router.use("/connectors", requireAuth);

const connectionParamsSchema = z.object({ connectionId: z.string().uuid() }).strict();
const selectionSchema = z.object({ resourceIds: z.array(z.string().min(1).max(1024)).min(1).max(100) }).strict();
const consentSchema = z.object({
  confirmed: z.literal(true),
  purpose: z.string().min(1).max(500),
  consentTextVersion: z.string().min(1).max(100),
  consentPolicyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const revokeSchema = z.object({ disposition: z.enum(["retain", "archive", "delete"]) }).strict();
const fakeScenarioSchema = z.object({
  scenario: z.enum(["incremental_change", "provider_update", "cursor_invalidated", "token_expiry", "refresh_failure", "rate_limit", "outage", "permission_loss"]),
}).strict();

function actor(req: Request): ConnectorActor {
  return {
    userId: req.session.userId!,
    householdId: req.session.householdId!,
    role: req.session.role ?? "adult",
  };
}

function origin(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function appRedirect(path: string, query: Record<string, string>): string {
  const configuredOrigin = process.env.CONNECTOR_APP_ORIGIN;
  if (!configuredOrigin && process.env.NODE_ENV === "production") {
    throw new Error("CONNECTOR_APP_ORIGIN is required in production.");
  }
  const target = new URL(path, configuredOrigin ?? "http://127.0.0.1:5173");
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return target.toString();
}

function route(handler: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: error.issues.map((issue) => issue.message) });
        return;
      }
      if (error instanceof ConnectorAccessError) {
        res.status(error.status).json({ error: error.status === 404 ? "Not found" : error.message });
        return;
      }
      if (error instanceof ConnectorError) {
        const status = error.category === "rate_limited" ? 429 : error.disposition === "reconnect_required" ? 409 : 502;
        res.status(status).json({ error: error.message, category: error.category });
        return;
      }
      req.log?.error({ err: error }, "Connector request failed");
      res.status(500).json({ error: "Connector request failed" });
    }
  };
}

router.get("/connectors/definitions", route(async (req, res) => {
  if ((req.session.role ?? "adult") !== "adult") throw new ConnectorAccessError(403, "Only adult accounts can manage connectors.");
  res.json(await listConnectorDefinitions());
}));

router.get("/connectors/connections", route(async (req, res) => {
  res.json(await listConnections(actor(req)));
}));

router.get("/connectors/connections/:connectionId", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await getConnection(actor(req), connectionId));
}));

router.post("/connectors/google-calendar/authorize", route(async (req, res) => {
  const body = z.object({ redirectPath: z.string().optional() }).strict().parse(req.body ?? {});
  res.status(201).json(await beginGoogleAuthorization(actor(req), { redirectPath: body.redirectPath, origin: origin(req) }));
}));

router.get("/connectors/google-calendar/oauth/callback", route(async (req, res) => {
  const query = z.object({
    state: z.string().min(20).max(1000),
    code: z.string().min(1).max(4000).optional(),
    error: z.string().min(1).max(200).optional(),
  }).passthrough().parse(req.query);
  try {
    const completed = await completeGoogleAuthorization(actor(req), { ...query, origin: origin(req) });
    res.redirect(303, appRedirect(completed.redirectPath, { connection: completed.connectionId, oauth: "authorized" }));
  } catch (error) {
    if (error instanceof ConnectorAccessError || error instanceof ConnectorError) {
      res.redirect(303, appRedirect("/connectors", { oauth: "error" }));
      return;
    }
    throw error;
  }
}));

router.get("/connectors/google-calendar/fake/authorize", route(async (req, res) => {
  if (connectorProviderMode() !== "fake" || process.env.NODE_ENV === "production") throw new ConnectorAccessError(404, "Not found");
  const state = z.string().min(20).max(1000).parse(req.query.state);
  const callback = "/api/connectors/google-calendar/oauth/callback";
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fake Google authorization</title></head>
<body><main><h1>Fake Google Calendar authorization</h1><p>Test-only provider. No external account is contacted.</p>
<form method="get" action="${callback}"><input type="hidden" name="state" value="${escapeHtml(state)}"><input type="hidden" name="code" value="fake-approved-code"><button type="submit">Allow read-only calendar access</button></form>
<form method="get" action="${callback}"><input type="hidden" name="state" value="${escapeHtml(state)}"><input type="hidden" name="error" value="access_denied"><button type="submit">Deny</button></form>
</main></body></html>`);
}));

router.post("/connectors/connections/:connectionId/discover", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await discoverConnectionResources(actor(req), connectionId));
}));

router.get("/connectors/connections/:connectionId/resources", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await listConnectionResources(actor(req), connectionId));
}));

router.put("/connectors/connections/:connectionId/resources", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  const input = selectionSchema.parse(req.body);
  res.json(await selectConnectionResources(actor(req), connectionId, [...new Set(input.resourceIds)]));
}));

router.post("/connectors/connections/:connectionId/consent", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.status(201).json(await confirmConnectorConsent(actor(req), connectionId, consentSchema.parse(req.body)));
}));

router.post("/connectors/connections/:connectionId/sync", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.status(202).json(await runConnectorSync(actor(req), connectionId, "manual"));
}));

router.get("/connectors/connections/:connectionId/sync-runs", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await listSyncRuns(actor(req), connectionId));
}));

router.post("/connectors/connections/:connectionId/pause", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await pauseConnection(actor(req), connectionId));
}));

router.post("/connectors/connections/:connectionId/resume", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  res.json(await resumeConnection(actor(req), connectionId));
}));

router.post("/connectors/connections/:connectionId/revoke", route(async (req, res) => {
  const { connectionId } = connectionParamsSchema.parse(req.params);
  const input = revokeSchema.parse(req.body);
  res.json(await revokeConnection(actor(req), connectionId, input.disposition));
}));

router.post("/connectors/connections/:connectionId/fake-scenario", route(async (req, res) => {
  if (connectorProviderMode() !== "fake" || process.env.NODE_ENV !== "test") throw new ConnectorAccessError(404, "Not found");
  const { connectionId } = connectionParamsSchema.parse(req.params);
  await getConnection(actor(req), connectionId);
  const input = fakeScenarioSchema.parse(req.body);
  if (input.scenario === "token_expiry") await expireConnectorCredentialForTest(actor(req), connectionId);
  fakeGoogleCalendarProvider.applyScenario(input.scenario);
  res.status(204).send();
}));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export default router;
