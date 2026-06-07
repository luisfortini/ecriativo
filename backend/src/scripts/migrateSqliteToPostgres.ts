import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "../db/migrate.js";
import { all, pool, query, run } from "../db/connection.js";

const orderedTables = [
  "clients",
  "brands",
  "campaigns",
  "client_assets",
  "client_brand_analysis",
  "agents",
  "agent_versions",
  "agent_execution_logs",
  "app_settings",
  "campaign_plans",
  "campaign_plan_clients",
  "campaign_generation_queue",
  "campaign_generation_logs",
  "ai_model_prices",
  "ai_usage_logs",
  "notification_settings",
  "notification_logs"
];

interface TableReport {
  table: string;
  source: number;
  migrated: number;
  ignored: number;
  errors: string[];
}

async function main() {
  const sqlitePath = path.resolve(process.env.SQLITE_DATABASE_PATH ?? process.env.DATABASE_PATH ?? "backend/data/criativopro.sqlite");
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite nao encontrado em ${sqlitePath}`);

  await migrate();
  if (process.env.RESET_POSTGRES === "true") {
    await truncateTarget();
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const reports: TableReport[] = [];

  try {
    for (const table of orderedTables) {
      if (!sqliteTableExists(sqlite, table)) continue;
      const report = await migrateTable(sqlite, table);
      reports.push(report);
      await resetSequence(table);
    }
  } finally {
    sqlite.close();
    await pool.end();
  }

  const failed = reports.filter((report) => report.errors.length);
  console.log(JSON.stringify({ sqlite_path: sqlitePath, reports, failed_tables: failed.length }, null, 2));
  if (failed.length) process.exitCode = 1;
}

async function truncateTarget() {
  const tables = [...orderedTables].reverse().join(", ");
  await query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

async function migrateTable(sqlite: Database.Database, table: string): Promise<TableReport> {
  const sqliteColumns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const pgColumns = await all<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?
     ORDER BY ordinal_position`,
    [table]
  );
  const sourceColumns = new Set(sqliteColumns.map((column) => column.name));
  const columns = pgColumns.map((column) => column.column_name).filter((column) => sourceColumns.has(column));
  const types = new Map(pgColumns.map((column) => [column.column_name, column.data_type]));
  const rows = sqlite.prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`).all() as Record<string, unknown>[];
  const report: TableReport = { table, source: rows.length, migrated: 0, ignored: 0, errors: [] };

  if (!columns.length) {
    report.ignored = rows.length;
    report.errors.push("Nenhuma coluna compativel encontrada.");
    return report;
  }

  const placeholders = columns.map(() => "?").join(", ");
  const primaryKey = await primaryKeyFor(table);
  const conflictTarget = primaryKey.length ? `(${primaryKey.map(quoteIdent).join(", ")})` : "";
  const updates = columns
    .filter((column) => !primaryKey.includes(column))
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ");
  const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
               VALUES (${placeholders})
               ${conflictTarget ? `ON CONFLICT ${conflictTarget} DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}` : ""}`;

  for (const row of rows) {
    try {
      await run(sql, columns.map((column) => normalizeValue(row[column], types.get(column))));
      report.migrated += 1;
    } catch (error) {
      report.errors.push(`${table} id=${String(row.id ?? "?")}: ${error instanceof Error ? error.message : String(error)}`);
      report.ignored += 1;
    }
  }

  const targetCount = await all<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteIdent(table)}`);
  if (Number(targetCount[0]?.count ?? 0) < report.source) {
    report.errors.push(`Contagem divergente: origem=${report.source}, destino=${targetCount[0]?.count ?? 0}`);
  }
  return report;
}

function sqliteTableExists(sqlite: Database.Database, table: string) {
  return Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

async function resetSequence(table: string) {
  const hasId = await all<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id'",
    [table]
  );
  if (!hasId.length) return;
  const row = await all<{ id: number }>(`SELECT MAX(id)::bigint AS id FROM ${quoteIdent(table)}`);
  const maxId = Number(row[0]?.id ?? 0);
  if (maxId > 0) {
    await query("SELECT setval(pg_get_serial_sequence($1, 'id'), $2, true)", [table, maxId]);
  }
}

async function primaryKeyFor(table: string) {
  const rows = await all<{ column_name: string }>(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = ?
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

function normalizeValue(value: unknown, pgType?: string) {
  if (value === undefined) return null;
  if (pgType === "boolean") return value === true || value === 1 || value === "1" || value === "true";
  return value;
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

void main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
