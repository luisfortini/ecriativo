import { Value } from "@sinclair/typebox/value";
import {
  CreativeBriefSchema,
  CreativeOutputSchema,
  type CreativeBrief,
  type CreativeOutput
} from "../contracts/index.js";
import { all, get, run, transaction } from "../db/connection.js";

export const CAMPAIGN_ARTIFACT_TYPES = {
  creativeBrief: "creative_brief",
  creativeOutput: "creative_output"
} as const;

export type CampaignArtifactType = (typeof CAMPAIGN_ARTIFACT_TYPES)[keyof typeof CAMPAIGN_ARTIFACT_TYPES];
export type CampaignPipelineStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type CampaignArtifactStatus = "draft" | "completed" | "failed" | "superseded";
export type CampaignPipelineEventType =
  | "overlay_applied"
  | "logo_missing"
  | "invalid_position"
  | "composition_failed"
  | "overlay_skipped"
  | string;
export type CampaignPipelineEventSeverity = "info" | "warning" | "error";

export interface CampaignPipelineRunRecord {
  id: number;
  campaign_id: number;
  client_id: number;
  profile_diagnostic_id: number | null;
  status: CampaignPipelineStatus;
  current_step: string | null;
  input_snapshot: unknown;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignArtifactRecord {
  id: number;
  pipeline_run_id: number;
  artifact_type: CampaignArtifactType;
  schema_version: string;
  version: number;
  status: CampaignArtifactStatus;
  payload: unknown;
  agent_id: number | null;
  agent_version_id: number | null;
  execution_log_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPipelineEventRecord {
  id: number;
  campaign_id: number | null;
  pipeline_run_id: number | null;
  step_key: string | null;
  event_type: CampaignPipelineEventType;
  severity: CampaignPipelineEventSeverity;
  message: string;
  metadata: unknown;
  created_at: string;
}

type CampaignArtifactInput =
  | { artifactType: typeof CAMPAIGN_ARTIFACT_TYPES.creativeBrief; payload: CreativeBrief }
  | { artifactType: typeof CAMPAIGN_ARTIFACT_TYPES.creativeOutput; payload: CreativeOutput };

interface ArtifactTrace {
  agentId?: number | null;
  agentVersionId?: number | null;
  executionLogId?: number | null;
  status?: Exclude<CampaignArtifactStatus, "superseded">;
}

const artifactSchemas = {
  [CAMPAIGN_ARTIFACT_TYPES.creativeBrief]: CreativeBriefSchema,
  [CAMPAIGN_ARTIFACT_TYPES.creativeOutput]: CreativeOutputSchema
} as const;

export async function createCampaignPipelineRun(input: {
  campaignId: number;
  clientId: number;
  profileDiagnosticId?: number | null;
  inputSnapshot: unknown;
}) {
  await assertPipelineReferences(input.campaignId, input.clientId, input.profileDiagnosticId ?? null);
  const result = await run(
    `INSERT INTO campaign_pipeline_runs (
      campaign_id, client_id, profile_diagnostic_id, status, input_snapshot
    ) VALUES (?, ?, ?, 'pending', ?::jsonb)`,
    [input.campaignId, input.clientId, input.profileDiagnosticId ?? null, JSON.stringify(input.inputSnapshot ?? {})]
  );
  return getCampaignPipelineRun(Number(result.lastInsertRowid));
}

export async function getCampaignPipelineRun(id: number) {
  const pipelineRun = await get<CampaignPipelineRunRecord>("SELECT * FROM campaign_pipeline_runs WHERE id = ?", [id]);
  if (!pipelineRun) return null;
  return {
    ...pipelineRun,
    artifacts: await all<CampaignArtifactRecord>(
      "SELECT * FROM campaign_artifacts WHERE pipeline_run_id = ? ORDER BY artifact_type, version",
      [id]
    ),
    events: await all<CampaignPipelineEventRecord>(
      "SELECT * FROM campaign_pipeline_events WHERE pipeline_run_id = ? ORDER BY created_at, id",
      [id]
    )
  };
}

export async function recordCampaignPipelineEvent(input: {
  campaignId?: number | null;
  pipelineRunId?: number | null;
  stepKey?: string | null;
  eventType: CampaignPipelineEventType;
  severity: CampaignPipelineEventSeverity;
  message: string;
  metadata?: unknown;
}) {
  if (!input.campaignId && !input.pipelineRunId) {
    throw new Error("Evento de pipeline exige campaignId ou pipelineRunId.");
  }
  const result = await run(
    `INSERT INTO campaign_pipeline_events (
      campaign_id, pipeline_run_id, step_key, event_type, severity, message, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)`,
    [
      input.campaignId ?? null,
      input.pipelineRunId ?? null,
      input.stepKey ?? null,
      input.eventType,
      input.severity,
      input.message,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return get<CampaignPipelineEventRecord>("SELECT * FROM campaign_pipeline_events WHERE id = ?", [result.lastInsertRowid]);
}

export async function getLatestCampaignPipelineRun(campaignId: number) {
  const pipelineRun = await get<CampaignPipelineRunRecord>(
    "SELECT * FROM campaign_pipeline_runs WHERE campaign_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [campaignId]
  );
  return pipelineRun ? getCampaignPipelineRun(Number(pipelineRun.id)) : null;
}

export async function runCampaignPipelineStep<T>(pipelineRunId: number, stepKey: string, operation: () => Promise<T>): Promise<T> {
  const pipelineRun = await get<CampaignPipelineRunRecord>("SELECT * FROM campaign_pipeline_runs WHERE id = ?", [pipelineRunId]);
  if (!pipelineRun) throw new Error("Execucao do pipeline nao encontrada.");
  if (pipelineRun.status === "completed" || pipelineRun.status === "cancelled") {
    throw new Error(`Execucao do pipeline nao pode avancar no status ${pipelineRun.status}.`);
  }

  await run(
    `UPDATE campaign_pipeline_runs
     SET status = 'running',
         current_step = ?,
         error_message = NULL,
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [stepKey, pipelineRunId]
  );

  try {
    return await operation();
  } catch (error) {
    await failCampaignPipelineRun(pipelineRunId, error);
    throw error;
  }
}

export async function saveCampaignArtifact(
  pipelineRunId: number,
  artifact: CampaignArtifactInput,
  trace: ArtifactTrace = {}
) {
  validateArtifact(artifact);

  return transaction(async (client) => {
    const pipelineRun = await get<CampaignPipelineRunRecord>(
      "SELECT * FROM campaign_pipeline_runs WHERE id = ? FOR UPDATE",
      [pipelineRunId],
      client
    );
    if (!pipelineRun) throw new Error("Execucao do pipeline nao encontrada.");
    if (pipelineRun.status === "completed" || pipelineRun.status === "cancelled") {
      throw new Error(`Artefato nao pode ser salvo no pipeline com status ${pipelineRun.status}.`);
    }

    await assertArtifactTrace(pipelineRunId, trace, client);
    const current = await get<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0) AS version
       FROM campaign_artifacts
       WHERE pipeline_run_id = ? AND artifact_type = ?`,
      [pipelineRunId, artifact.artifactType],
      client
    );
    const version = Number(current?.version ?? 0) + 1;

    await run(
      `UPDATE campaign_artifacts
       SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
       WHERE pipeline_run_id = ? AND artifact_type = ? AND status IN ('draft', 'completed')`,
      [pipelineRunId, artifact.artifactType],
      client
    );

    const result = await run(
      `INSERT INTO campaign_artifacts (
        pipeline_run_id, artifact_type, schema_version, version, status, payload,
        agent_id, agent_version_id, execution_log_id
      ) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
      [
        pipelineRunId,
        artifact.artifactType,
        artifact.payload.schemaVersion,
        version,
        trace.status ?? "completed",
        JSON.stringify(artifact.payload),
        trace.agentId ?? null,
        trace.agentVersionId ?? null,
        trace.executionLogId ?? null
      ],
      client
    );

    return get<CampaignArtifactRecord>("SELECT * FROM campaign_artifacts WHERE id = ?", [result.lastInsertRowid], client);
  });
}

export async function completeCampaignPipelineRun(pipelineRunId: number) {
  await run(
    `UPDATE campaign_pipeline_runs
     SET status = 'completed',
         current_step = NULL,
         error_message = NULL,
         finished_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('pending', 'running', 'failed')`,
    [pipelineRunId]
  );
  return getCampaignPipelineRun(pipelineRunId);
}

export async function failCampaignPipelineRun(pipelineRunId: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Falha na execucao do pipeline.";
  await run(
    `UPDATE campaign_pipeline_runs
     SET status = 'failed',
         error_message = ?,
         finished_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status <> 'cancelled'`,
    [message, pipelineRunId]
  );
  return getCampaignPipelineRun(pipelineRunId);
}

async function assertPipelineReferences(campaignId: number, clientId: number, profileDiagnosticId: number | null) {
  const campaign = await get<{ client_id: number | null }>("SELECT client_id FROM campaigns WHERE id = ?", [campaignId]);
  if (!campaign) throw new Error("Campanha nao encontrada.");
  const normalizedClientId = Number(clientId);
  if (!Number.isSafeInteger(normalizedClientId) || normalizedClientId <= 0) {
    throw new Error("Cliente informado para o pipeline e invalido.");
  }
  if (Number(campaign.client_id) !== normalizedClientId) throw new Error("A campanha nao pertence ao cliente informado.");
  if (!profileDiagnosticId) return;

  const diagnostic = await get<{ client_id: number; status: string }>(
    "SELECT client_id, status FROM client_profile_diagnostics WHERE id = ?",
    [profileDiagnosticId]
  );
  if (!diagnostic || Number(diagnostic.client_id) !== normalizedClientId) {
    throw new Error("O diagnostico nao pertence ao cliente informado.");
  }
  if (diagnostic.status !== "active") throw new Error("Somente um diagnostico ativo pode iniciar um pipeline.");
}

function validateArtifact(artifact: CampaignArtifactInput) {
  const schema = artifactSchemas[artifact.artifactType];
  if (Value.Check(schema, artifact.payload)) return;
  const errors = [...Value.Errors(schema, artifact.payload)]
    .slice(0, 5)
    .map((error) => `${error.path || "/"}: ${error.message}`)
    .join("; ");
  throw new Error(`Artefato ${artifact.artifactType} invalido: ${errors}`);
}

async function assertArtifactTrace(
  pipelineRunId: number,
  trace: ArtifactTrace,
  client: Parameters<typeof get>[2]
) {
  if (trace.agentVersionId && !trace.agentId) throw new Error("agentVersionId exige agentId.");

  if (trace.agentVersionId && trace.agentId) {
    const version = await get(
      "SELECT id FROM agent_versions WHERE id = ? AND agent_id = ?",
      [trace.agentVersionId, trace.agentId],
      client
    );
    if (!version) throw new Error("A versao informada nao pertence ao agente.");
  }

  if (trace.executionLogId) {
    const execution = await get<{ pipeline_run_id: number | null; agent_id: number }>(
      "SELECT pipeline_run_id, agent_id FROM agent_execution_logs WHERE id = ?",
      [trace.executionLogId],
      client
    );
    if (!execution || Number(execution.pipeline_run_id) !== pipelineRunId) {
      throw new Error("O log de execucao nao pertence a este pipeline.");
    }
    if (trace.agentId && Number(execution.agent_id) !== Number(trace.agentId)) {
      throw new Error("O log de execucao nao pertence ao agente informado.");
    }
  }
}
