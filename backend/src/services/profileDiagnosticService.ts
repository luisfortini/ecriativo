import { createHash } from "node:crypto";
import { isProfileDiagnostic, type ProfileDiagnostic } from "../contracts/index.js";
import { get, run, transaction } from "../db/connection.js";

export interface ProfileDiagnosticRecord {
  id: number;
  client_id: number;
  version: number;
  schema_version: string;
  status: "draft" | "active" | "superseded" | "failed";
  payload: ProfileDiagnostic;
  source_hash: string | null;
  source_snapshot: unknown;
  agent_id: number | null;
  agent_version_id: number | null;
  execution_log_id: number | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveProfileDiagnostic(clientId: number) {
  return get<ProfileDiagnosticRecord>(
    `SELECT *
     FROM client_profile_diagnostics
     WHERE client_id = ? AND status = 'active'
     ORDER BY version DESC
     LIMIT 1`,
    [clientId]
  );
}

export async function saveActiveProfileDiagnostic(input: {
  clientId: number;
  payload: ProfileDiagnostic;
  sourceSnapshot?: unknown;
  agentId?: number | null;
  agentVersionId?: number | null;
  executionLogId?: number | null;
}) {
  if (!isProfileDiagnostic(input.payload)) throw new Error("ProfileDiagnostic invalido.");
  const sourceSnapshot = input.sourceSnapshot ?? {};
  const sourceHash = createHash("sha256").update(stableJson(sourceSnapshot)).digest("hex");

  return transaction(async (client) => {
    const owner = await get("SELECT id FROM clients WHERE id = ? FOR UPDATE", [input.clientId], client);
    if (!owner) throw new Error("Cliente nao encontrado.");

    const current = await get<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) AS version FROM client_profile_diagnostics WHERE client_id = ?",
      [input.clientId],
      client
    );
    const version = Number(current?.version ?? 0) + 1;

    await run(
      `UPDATE client_profile_diagnostics
       SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND status = 'active'`,
      [input.clientId],
      client
    );

    const result = await run(
      `INSERT INTO client_profile_diagnostics (
        client_id, version, schema_version, status, payload, source_hash, source_snapshot,
        agent_id, agent_version_id, execution_log_id
      ) VALUES (?, ?, ?, 'active', ?::jsonb, ?, ?::jsonb, ?, ?, ?)`,
      [
        input.clientId,
        version,
        input.payload.schemaVersion,
        JSON.stringify(input.payload),
        sourceHash,
        JSON.stringify(sourceSnapshot),
        input.agentId ?? null,
        input.agentVersionId ?? null,
        input.executionLogId ?? null
      ],
      client
    );

    return get<ProfileDiagnosticRecord>("SELECT * FROM client_profile_diagnostics WHERE id = ?", [result.lastInsertRowid], client);
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}
