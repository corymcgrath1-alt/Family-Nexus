import app from "./app";
import { assertRestrictedRuntimeDatabase, pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { checkAndSeed } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await assertRestrictedRuntimeDatabase();

  app.listen(port, async (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");

    // Seed demo data on first start
    try {
      await checkAndSeed();
    } catch (seedErr) {
      logger.error({ err: seedErr }, "Seed failed - continuing without demo data");
    }
  });
}

start().catch((error: unknown) => {
  logger.error({ err: error }, "API startup failed");
  void pool.end();
  process.exitCode = 1;
});
