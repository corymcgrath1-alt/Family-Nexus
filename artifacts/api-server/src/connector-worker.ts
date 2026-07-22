import { logger } from "./lib/logger";

type ClaimedConnection = {
  connection_id: string;
  owner_user_id: number;
  household_id: number;
  lease_id: string;
};

async function runOnce(): Promise<void> {
  const workerDatabaseUrl = process.env.CONNECTOR_WORKER_DATABASE_URL;
  if (!workerDatabaseUrl) throw new Error("CONNECTOR_WORKER_DATABASE_URL is required for the connector worker.");
  process.env.DATABASE_URL = workerDatabaseUrl;
  const [{ assertRestrictedRuntimeDatabase, pool }, { runConnectorSync }] = await Promise.all([
    import("@workspace/db"),
    import("./lib/connectors/connector-sync-service"),
  ]);
  try {
    await assertRestrictedRuntimeDatabase();
    const maintenance = await pool.query<{ oauth_states_deleted: number; sync_runs_deleted: number }>(
      "select * from lighthouse_purge_connector_operational_data(now())",
    );
    const cleanup = maintenance.rows[0];
    logger.info({
      signal: "connector_worker_maintenance",
      oauthStatesDeleted: cleanup?.oauth_states_deleted ?? 0,
      syncRunsDeleted: cleanup?.sync_runs_deleted ?? 0,
    }, "Connector operational retention applied");
    const claim = await pool.query<ClaimedConnection>("select * from lighthouse_claim_due_connector()");
    const connection = claim.rows[0];
    if (!connection) {
      logger.info({ signal: "connector_worker_idle" }, "No connector sync was due");
      return;
    }
    logger.info({ signal: "connector_worker_claimed", connectionId: connection.connection_id }, "Claimed one connector sync");
    await runConnectorSync(
      { userId: connection.owner_user_id, householdId: connection.household_id, role: "adult" },
      connection.connection_id,
      "scheduled",
      { preclaimedLeaseId: connection.lease_id },
    );
  } finally {
    await pool.end();
  }
}

runOnce()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Connector worker failed.");
    process.exitCode = 1;
  });
