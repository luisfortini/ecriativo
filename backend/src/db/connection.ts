import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10)
});

export interface RunResult {
  lastInsertRowid?: number;
  rowCount: number;
}

type QueryParams = unknown[] | Record<string, unknown>;

export async function query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: QueryParams, client?: PoolClient) {
  const prepared = prepareSql(sql, params);
  const executor = client ?? pool;
  return executor.query(prepared.sql, prepared.values) as Promise<QueryResult<T>>;
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
  await (client ?? pool).query(sql);
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
