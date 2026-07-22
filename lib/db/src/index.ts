import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export function createDatabase(connectionString: string) {
  const createdPool = new Pool({ connectionString });
  return {
    pool: createdPool,
    db: drizzle(createdPool, { schema }),
  };
}

const runtimeDatabase = createDatabase(process.env.DATABASE_URL);
const baseDb = runtimeDatabase.db;

type Database = typeof baseDb;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const databaseContext = new AsyncLocalStorage<DatabaseTransaction>();

export const pool = runtimeDatabase.pool;
export const db = new Proxy(baseDb, {
  get(target, property) {
    const activeDatabase = databaseContext.getStore();
    const source = activeDatabase ?? target;
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
}) as Database;

export type DatabaseActor = {
  userId: number;
  householdId: number;
};

export async function withDatabaseActor<T>(
  actor: DatabaseActor,
  operation: () => Promise<T> | T,
): Promise<T> {
  if (!Number.isInteger(actor.userId) || actor.userId <= 0) {
    throw new Error("A positive authenticated actor user ID is required.");
  }
  if (!Number.isInteger(actor.householdId) || actor.householdId <= 0) {
    throw new Error("A positive authenticated actor household ID is required.");
  }

  return baseDb.transaction(async (transaction) => {
    await transaction.execute(sql`
      select
        set_config('lighthouse.actor_user_id', ${String(actor.userId)}, true),
        set_config('lighthouse.actor_household_id', ${String(actor.householdId)}, true)
    `);
    return databaseContext.run(transaction, operation);
  });
}

const protectedTables = [
  "audit_events",
  "connector_audit_events",
  "connector_connections",
  "connector_consents",
  "connector_credentials",
  "connector_oauth_states",
  "connector_resource_selections",
  "connector_source_mappings",
  "connector_source_objects",
  "connector_sync_checkpoints",
  "connector_sync_runs",
  "consent_grants",
  "data_records",
  "data_sources",
  "library_items",
  "knowledge_audit_events",
  "knowledge_entities",
  "knowledge_entity_grants",
  "knowledge_entity_sources",
  "knowledge_entity_versions",
  "knowledge_extension_versions",
  "knowledge_insights",
  "knowledge_memories",
  "knowledge_observations",
  "knowledge_recommendations",
  "knowledge_relationships",
  "knowledge_relationship_versions",
  "knowledge_sources",
  "lighthouse_passports",
  "personal_vaults",
  "shared_spaces",
  "sharing_grants",
  "signal_observations",
];

export async function assertRestrictedRuntimeDatabase(): Promise<void> {
  const result = await pool.query<{
    role_name: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
    is_runtime_member: boolean;
    owns_protected_table: boolean;
    can_assume_protected_owner: boolean;
  }>(
    `select
       current_user as role_name,
       role_row.rolsuper as is_superuser,
       role_row.rolbypassrls as bypasses_rls,
       pg_has_role(current_user, 'lighthouse_runtime', 'member') as is_runtime_member,
       exists (
         select 1
         from pg_class table_row
         join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
         where schema_row.nspname = 'public'
           and table_row.relname = any($1)
           and pg_get_userbyid(table_row.relowner) = current_user
       ) as owns_protected_table,
       exists (
         select 1
         from pg_class table_row
         join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
         where schema_row.nspname = 'public'
           and table_row.relname = any($1)
           and pg_get_userbyid(table_row.relowner) <> current_user
           and pg_has_role(current_user, pg_get_userbyid(table_row.relowner), 'member')
       ) as can_assume_protected_owner
     from pg_roles role_row
     where role_row.rolname = current_user`,
    [protectedTables],
  );

  const authority = result.rows[0];
  if (
    !authority ||
    authority.is_superuser ||
    authority.bypasses_rls ||
    !authority.is_runtime_member ||
    authority.owns_protected_table ||
    authority.can_assume_protected_owner
  ) {
    throw new Error(
      `DATABASE_URL must use a restricted Lighthouse runtime role; received ${authority?.role_name ?? "unknown"}.`,
    );
  }
}

export * from "./schema";
