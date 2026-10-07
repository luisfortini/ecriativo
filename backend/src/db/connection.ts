import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config.js";
import { getDatabaseRequestContext, runWithDatabaseRequestContext } from "./requestContext.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10)
});

export interface RunResult {
  lastInsertRowid?: number;
  rowCount: number;
}

type QueryParams = unknown[] | Record<string, unknown>;

export function toPostgresBoolean(value: unknown) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: QueryParams, client?: PoolClient) {
  const prepared = prepareSql(sql, params);
  const context = getDatabaseRequestContext();
  const executor = client ?? context?.client;
  if (executor) return executor.query(prepared.sql, prepared.values) as Promise<QueryResult<T>>;
  if (context) {
    return withOrganizationContext(context.organizationId, async () => {
      const scopedClient = getDatabaseRequestContext()?.client;
      if (!scopedClient) throw new Error("Contexto de banco nao disponivel.");
      return scopedClient.query(prepared.sql, prepared.values) as Promise<QueryResult<T>>;
    }, context.userId);
  }
  return pool.query(prepared.sql, prepared.values) as Promise<QueryResult<T>>;
}

export async function all<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: QueryParams, client?: PoolClient) {
  return (await query<T>(sql, params, client)).rows;
}

export async function get<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: QueryParams, client?: PoolClient) {
  return (await query<T>(sql, params, client)).rows[0] as T | undefined;
}

export async function run(sql: string, params?: QueryParams, client?: PoolClient): Promise<RunResult> {
  const normalized = shouldReturnId(sql) ? `${sql.trim().replace(/;$/, "")} RETURNING id` : sql;
  const result = await query<{ id?: number }>(normalized, params, client);
  return {
    lastInsertRowid: result.rows[0]?.id,
    rowCount: result.rowCount ?? 0
  };
}

export async function exec(sql: string, client?: PoolClient) {
  // Seeds and bulk operations must keep the same tenant and transaction as regular queries.
  await query(sql, undefined, client);
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const context = getDatabaseRequestContext();
  const contextualClient = context?.client;
  if (contextualClient) {
    const savepoint = `nested_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await contextualClient.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await callback(contextualClient);
      await contextualClient.query(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await contextualClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      throw error;
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (context) {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [String(context.organizationId)]);
      await assumeTenantRole(client);
    }
    const result = context
      ? await runWithDatabaseRequestContext({ ...context, client }, () => callback(client))
      : await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withOrganizationContext<T>(organizationId: number, callback: () => Promise<T>, userId?: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [String(organizationId)]);
    await assumeTenantRole(client);
    const result = await runWithDatabaseRequestContext({ client, organizationId, userId }, callback);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function runWithOrganizationContext<T>(organizationId: number, callback: () => T, userId?: number) {
  return runWithDatabaseRequestContext({ organizationId, userId }, callback);
}

export async function assumeTenantRole(client: PoolClient) {
  const result = await client.query<{ elevated: boolean }>(
    `SELECT (r.rolsuper OR r.rolbypassrls) elevated
       FROM pg_roles r WHERE r.rolname = current_user`
  );
  if (result.rows[0]?.elevated) {
    await client.query('SET LOCAL ROLE "ecriativo_tenant"');
  }
}

export async function validateTenantRole() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assumeTenantRole(client);
    const result = await client.query<{ elevated: boolean }>(
      `SELECT (r.rolsuper OR r.rolbypassrls) elevated
         FROM pg_roles r WHERE r.rolname = current_user`
    );
    if (result.rows[0]?.elevated) {
      throw new Error("A conexao da aplicacao nao pode operar com SUPERUSER ou BYPASSRLS. Configure o papel ecriativo_tenant ou uma credencial sem esses privilegios.");
    }
    await client.query("SELECT 1 FROM clients LIMIT 0");
  } finally {
    await client.query("ROLLBACK").finally(() => client.release());
  }
}

export async function databaseHealth() {
  const started = Date.now();
  await query("SELECT 1");
  return {
    status: "ok",
    database: "postgres",
    latency: Date.now() - started
  };
}

function shouldReturnId(sql: string) {
  const match = sql.match(/^\s*INSERT\s+INTO\s+("?[\w]+"?)/i);
  if (!match || /\bRETURNING\b/i.test(sql)) return false;
  const table = match[1].replace(/"/g, "").toLowerCase();
  return !["app_settings", "schema_migrations"].includes(table);
}

function prepareSql(sql: string, params?: QueryParams) {
  const translatedSql = translateSql(sql);
  if (!params) return { sql: translatedSql, values: [] as unknown[] };
  if (Array.isArray(params)) return positionalParams(translatedSql, params);
  return namedParams(translatedSql, params);
}

function positionalParams(sql: string, params: unknown[]) {
  let index = 0;
  return {
    sql: sql.replace(/\?/g, () => `$${++index}`),
    values: params
  };
}

function namedParams(sql: string, params: Record<string, unknown>) {
  const values: unknown[] = [];
  const indexes = new Map<string, number>();
  return {
    sql: sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key: string) => {
      if (!indexes.has(key)) {
        values.push(params[key] ?? null);
        indexes.set(key, values.length);
      }
      return `$${indexes.get(key)}`;
    }),
    values
  };
}

function translateSql(sql: string) {
  return sql
    .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
    .replace(/datetime\('now',\s*\?\)/gi, "CURRENT_TIMESTAMP + ?::interval")
    .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\|\|/g, "||");
}
