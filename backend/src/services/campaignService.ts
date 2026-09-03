import { all, get, run, transaction } from "../db/connection.js";
import {
  creativeBriefToLegacyStrategy,
  creativeOutputToLegacy,
  type CreativeBrief,
  type CreativeOutput
} from "../contracts/index.js";
import type { CampaignRecord, ClientProfile, NewCampaignInput, NormalizedBriefing } from "../types.js";
import { AppError } from "../utils/errors.js";
import { executeAgentByKey } from "./agentService.js";
import { updateAiUsageCampaign } from "./aiCostService.js";
import { analyzeClientBrand } from "./brandAnalysisService.js";
import { applyBrandOverlay } from "./brandOverlayService.js";
import {
  CAMPAIGN_ARTIFACT_TYPES,
  completeCampaignPipelineRun,
  createCampaignPipelineRun,
  failCampaignPipelineRun,
  getLatestCampaignPipelineRun,
  runCampaignPipelineStep,
  saveCampaignArtifact
} from "./campaignPipelineService.js";
import { sendCampaignCompletedAsync } from "./whatsappNotificationService.js";
import { normalizeBriefing } from "./briefingNormalizerService.js";
import { appendClientLearning, getClient, listClientAssets } from "./clientService.js";
import { generateImage } from "./openaiService.js";
import { getActiveProfileDiagnostic, type ProfileDiagnosticRecord } from "./profileDiagnosticService.js";

export async function createCampaign(
  input: NewCampaignInput,
  referenceFilePath?: string,
  options?: { campaignPlanId?: number | null; queueId?: number | null; reprocess?: boolean }
) {
  const client = await getClient(input.client_id);
  if (!client) throw new Error("Cliente nao encontrado.");

  const assets = await listClientAssets(input.client_id);
  const normalized = await normalizeBriefing(input, client as ClientProfile, assets);
  const campaignId = await createPendingCampaign(input, normalized, referenceFilePath);
  let pipelineRunId: number | null = null;

  try {
    const profileDiagnostic = await ensureActiveProfileDiagnostic(input.client_id);
    const pipelineRun = await createCampaignPipelineRun({
      campaignId,
      clientId: input.client_id,
      profileDiagnosticId: profileDiagnostic.id,
      inputSnapshot: normalized
    });
    if (!pipelineRun) throw new Error("Nao foi possivel criar a execucao do pipeline.");
    pipelineRunId = Number(pipelineRun.id);

    const strategistRun = await runCampaignPipelineStep(pipelineRunId, "creative_brief", () =>
      executeAgentByKey<CreativeBrief>(
        "strategist_agent",
        buildStrategistAgentContext(normalized, profileDiagnostic, referenceFilePath),
        {
          campaignId,
          clientId: input.client_id,
          campaignPlanId: options?.campaignPlanId ?? null,
          queueId: options?.queueId ?? null,
          pipelineRunId,
          stepKey: "creative_brief",
          operationType: options?.reprocess ? "reprocessamento" : "estrategista"
        }
      )
    );
    const creativeBrief = strategistRun.parsed;
    await saveCampaignArtifact(
      pipelineRunId,
      { artifactType: CAMPAIGN_ARTIFACT_TYPES.creativeBrief, payload: creativeBrief },
      {
        agentId: strategistRun.agent.id,
        agentVersionId: strategistRun.agent_version_id,
        executionLogId: strategistRun.execution_log_id
      }
    );

    const creativeRun = await runCampaignPipelineStep(pipelineRunId, "creative_output", () =>
      executeAgentByKey<CreativeOutput>(
        "creative_agent",
        buildCreativeAgentContext(profileDiagnostic, creativeBrief, normalized.format),
        {
          campaignId,
          clientId: input.client_id,
          campaignPlanId: options?.campaignPlanId ?? null,
          queueId: options?.queueId ?? null,
          pipelineRunId,
          stepKey: "creative_output",
          operationType: options?.reprocess ? "reprocessamento" : "criativo"
        }
      )
    );
    const creativeOutput = creativeRun.parsed;
    await saveCampaignArtifact(
      pipelineRunId,
      { artifactType: CAMPAIGN_ARTIFACT_TYPES.creativeOutput, payload: creativeOutput },
      {
        agentId: creativeRun.agent.id,
        agentVersionId: creativeRun.agent_version_id,
        executionLogId: creativeRun.execution_log_id
      }
    );

    const image = await runCampaignPipelineStep(pipelineRunId, "image_generation", () =>
      generateImage(
        `${creativeOutput.imagePrompt}\nEvitar: ${creativeOutput.negativePrompt}\nNao desenhe, recrie ou incorpore logotipos. Reserve a area sugerida para aplicacao posterior da logo original.`,
        input.formato,
        {
          clientId: input.client_id,
          campaignId,
          campaignPlanId: options?.campaignPlanId ?? null,
          queueId: options?.queueId ?? null,
          operationType: options?.reprocess ? "reprocessamento" : "geracao_imagem"
        }
      )
    );
    const brandOverlay = await runCampaignPipelineStep(pipelineRunId, "brand_overlay", () =>
      applyBrandOverlay({
        campaignId,
        pipelineRunId: Number(pipelineRunId),
        clientId: input.client_id,
        generatedImagePath: image.imagePath,
        generatedImageUrl: image.imageUrl,
        overlay: creativeOutput.brandOverlay
      })
    );
    const strategy = creativeBriefToLegacyStrategy(creativeBrief);
    const creative = creativeOutputToLegacy(creativeOutput);

    await run(
      `UPDATE campaigns SET
        strategist_output_json = ?,
        creative_output_json = ?,
        final_image_url = ?,
        strategist_agent_id = ?,
        creative_agent_id = ?,
        strategy_json = ?,
        creative_json = ?,
        image_path = ?,
        image_url = ?,
        status = 'completed',
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        JSON.stringify(strategy),
        JSON.stringify(creative),
        brandOverlay.finalImageUrl,
        strategistRun.agent.id,
        creativeRun.agent.id,
        JSON.stringify(strategy),
        JSON.stringify(creative),
        image.imagePath,
        image.imageUrl,
        campaignId
      ]
    );

    await completeCampaignPipelineRun(pipelineRunId);
    await updateAiUsageCampaign(
      [strategistRun.ai_usage_log_id, creativeRun.ai_usage_log_id, "aiUsageLogId" in image ? image.aiUsageLogId : null],
      campaignId
    );
    sendCampaignCompletedAsync(campaignId);
    return getCampaign(campaignId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar pipeline da campanha.";
    await run(
      "UPDATE campaigns SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [message, campaignId]
    );
    if (pipelineRunId) await failCampaignPipelineRun(pipelineRunId, error);
    throw error;
  }
}

async function createPendingCampaign(input: NewCampaignInput, normalized: NormalizedBriefing, referenceFilePath?: string) {
  const result = await run(
    `INSERT INTO campaigns (
        client_id, cliente, segmento, objetivo, publico_alvo, oferta, formato, tom_marca,
        paleta_cores, referencias_visuais, restricoes, observacoes, reference_file_path,
        free_briefing, normalized_briefing_json, status
      ) VALUES (
        @client_id, @cliente, @segmento, @objetivo, @publico_alvo, @oferta, @formato, @tom_marca,
        @paleta_cores, @referencias_visuais, @restricoes, @observacoes, @reference_file_path,
        @free_briefing, @normalized_briefing_json, 'processing'
      )`,
    {
      client_id: input.client_id,
      cliente: normalized.client_prompt_context.nome,
      segmento: normalized.client_prompt_context.segmento,
      objetivo: normalized.objective,
      publico_alvo: normalized.target_audience,
      oferta: normalized.offer,
      formato: normalized.format,
      tom_marca: normalized.brand_voice,
      paleta_cores: normalized.color_palette,
      referencias_visuais: normalized.visual_references,
      restricoes: normalized.restrictions,
      observacoes: normalized.observations,
      reference_file_path: referenceFilePath ?? null,
      free_briefing: input.free_briefing,
      normalized_briefing_json: JSON.stringify(normalized)
    }
  );
  return Number(result.lastInsertRowid);
}

function buildStrategistAgentContext(
  normalized: NormalizedBriefing,
  profileDiagnostic: ProfileDiagnosticRecord,
  referenceFilePath?: string
) {
  return {
    profile_diagnostic: profileDiagnostic.payload,
    campaign_briefing: {
      freeBriefing: truncate(normalized.free_briefing, 1800),
      objective: truncate(normalized.objective, 500),
      offer: truncate(normalized.offer, 500),
      format: normalized.format,
      targetAudienceOverride: truncate(normalized.target_audience, 500),
      restrictions: truncate(normalized.restrictions, 700),
      observations: truncate(normalized.observations, 700),
      approvedReferences: normalized.client_prompt_context.referencias_aprovadas_resumidas,
      rejectedReferences: normalized.client_prompt_context.referencias_reprovadas_resumidas,
      campaignReferenceFile: referenceFilePath ?? null
    }
  };
}

function buildCreativeAgentContext(
  profileDiagnostic: ProfileDiagnosticRecord,
  creativeBrief: CreativeBrief,
  format: string
) {
  return {
    profile_diagnostic: profileDiagnostic.payload,
    creative_brief: creativeBrief,
    output_format: format
  };
}

function truncate(value: string, max: number) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

async function ensureActiveProfileDiagnostic(clientId: number) {
  const existing = await getActiveProfileDiagnostic(clientId);
  if (existing) return existing;
  const generated = await analyzeClientBrand(clientId, { manual_notes: "Diagnostico inicial automatico para o pipeline de campanha." });
  if (!generated.profile_diagnostic) throw new Error("Nao foi possivel gerar o diagnostico do cliente.");
  return generated.profile_diagnostic as ProfileDiagnosticRecord;
}

export async function setCampaignCreativeStatus(campaignId: number, creativeStatus: "draft" | "waiting_review" | "approved" | "rejected") {
  await run("UPDATE campaigns SET creative_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [creativeStatus, campaignId]);
  return getCampaign(campaignId);
}

export async function duplicateCampaign(id: number) {
  const campaign = await getCampaign(id);
  if (!campaign) return null;

  const normalized = campaign.normalized_briefing as NormalizedBriefing | undefined;
  return {
    client_id: campaign.client_id,
    free_briefing: campaign.free_briefing,
    objetivo: campaign.objetivo ?? normalized?.objective ?? "",
    oferta: campaign.oferta ?? normalized?.offer ?? "",
    formato: campaign.formato ?? normalized?.format ?? "1:1",
    publico_alvo: campaign.publico_alvo ?? normalized?.target_audience ?? "",
    tom_marca: campaign.tom_marca ?? normalized?.brand_voice ?? "",
    paleta_cores: campaign.paleta_cores ?? normalized?.color_palette ?? "",
    referencias_visuais: campaign.referencias_visuais ?? normalized?.visual_references ?? "",
    restricoes: campaign.restricoes ?? normalized?.restrictions ?? "",
    observacoes: campaign.observacoes ?? normalized?.observations ?? ""
  };
}

export async function listCampaigns() {
  return all(
    `SELECT c.id, c.client_id, COALESCE(c.cliente, cl.name) AS cliente, COALESCE(c.segmento, cl.segment) AS segmento,
              c.objetivo, c.formato, COALESCE(c.final_image_url, c.image_url) AS image_url,
              c.image_url AS generated_image_url, c.status, c.created_at
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY c.created_at DESC`
  );
}

export async function listCreatives() {
  const rows = await all<CampaignRecord>(
    `SELECT c.id, c.client_id, COALESCE(c.cliente, cl.name) AS cliente, c.formato,
              COALESCE(c.creative_output_json, c.creative_json) AS creative_json,
              COALESCE(c.strategist_output_json, c.strategy_json) AS strategy_json,
              COALESCE(c.final_image_url, c.image_url) AS image_url,
              c.image_url AS generated_image_url, c.created_at
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE COALESCE(c.final_image_url, c.image_url) IS NOT NULL
       ORDER BY c.created_at DESC`
  );
  return rows.map((row) => {
      const item = row as CampaignRecord;
      return {
        id: item.id,
        client_id: item.client_id,
        cliente: item.cliente,
        formato: item.formato,
        image_url: item.image_url,
        generated_image_url: item.generated_image_url ?? null,
        creative: JSON.parse(item.creative_json),
        strategy: JSON.parse(item.strategy_json),
        created_at: item.created_at
      };
    });
}

export async function getCampaign(id: number) {
  const campaign = await get<CampaignRecord>(
    `SELECT c.*, COALESCE(c.cliente, cl.name) AS cliente, COALESCE(c.segmento, cl.segment) AS segmento,
              c.image_url AS generated_image_url,
              COALESCE(c.final_image_url, c.image_url) AS image_url
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ?`,
    [id]
  );
  if (!campaign) return null;

  const strategyJson = campaign.strategist_output_json || campaign.strategy_json;
  const creativeJson = campaign.creative_output_json || campaign.creative_json;

  return {
    ...campaign,
    strategy: JSON.parse(strategyJson),
    creative: JSON.parse(creativeJson),
    normalized_briefing: campaign.normalized_briefing_json ? JSON.parse(campaign.normalized_briefing_json) : null,
    pipeline_run: await getLatestCampaignPipelineRun(id),
    reviews: await all(
      `SELECT r.*, u.name reviewer_name
       FROM campaign_reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.campaign_id = ?
       ORDER BY r.created_at DESC, r.id DESC`,
      [id]
    )
  };
}

export async function saveCampaignLearning(campaignId: number, action: string, value?: string) {
  const campaign = await getCampaign(campaignId);
  if (!campaign?.client_id) throw new Error("Campanha sem cliente vinculado.");

  const fieldByAction: Record<string, { field: Parameters<typeof appendClientLearning>[1]; value: string }> = {
    save_cta: { field: "preferred_ctas", value: value || campaign.strategy.cta },
    approve_style: { field: "approved_styles", value: value || campaign.creative.direcao_visual_resumida },
    forbid_style: { field: "forbidden_styles", value: value || campaign.creative.direcao_visual_resumida },
    save_palette: { field: "color_palette", value: value || campaign.paleta_cores || "" },
    save_note: { field: "strategic_notes", value: value || campaign.strategy.angulo },
    liked_style: { field: "approved_styles", value: value || campaign.creative.direcao_visual_resumida },
    disliked_style: { field: "forbidden_styles", value: value || campaign.creative.direcao_visual_resumida },
    save_visual_direction: { field: "visual_references", value: value || campaign.creative.direcao_visual_resumida }
  };

  const learning = fieldByAction[action];
  if (!learning?.value.trim()) throw new Error("Nao ha conteudo para salvar como aprendizado.");
  return appendClientLearning(campaign.client_id, learning.field, learning.value);
}

export async function updateCampaignStatus(
  campaignId: number,
  status: "approved" | "rejected",
  reason: string | undefined,
  userId: number | null,
  tags: string[] = []
) {
  const normalizedReason = reason?.trim() || null;
  if (status === "rejected" && !normalizedReason) throw new AppError("Informe o motivo da reprovação.", 422);
  const campaign = await get<{ client_id: number | null }>("SELECT client_id FROM campaigns WHERE id = ?", [campaignId]);
  if (!campaign) throw new AppError("Campanha não encontrada.", 404);

  await transaction(async (client) => {
    await run(
      "UPDATE campaigns SET creative_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, campaignId],
      client
    );
    await run(
      `INSERT INTO campaign_reviews (campaign_id, client_id, user_id, decision, reason, tags_json)
       VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
      [campaignId, campaign.client_id, userId, status, normalizedReason, JSON.stringify(tags)],
      client
    );
  });
  return getCampaign(campaignId);
}

export async function getCreativeNavigation(id: number) {
  const current = await get<{ id: number }>(
    `SELECT id
     FROM campaigns
     WHERE id = ?`,
    [id]
  );
  if (!current) return null;

  const [previous, next] = await Promise.all([
    get<{ id: number }>(
      `SELECT id FROM campaigns
       WHERE COALESCE(final_image_url, image_url) IS NOT NULL
         AND (created_at, id) > (SELECT created_at, id FROM campaigns WHERE id = ?)
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
      [current.id]
    ),
    get<{ id: number }>(
      `SELECT id FROM campaigns
       WHERE COALESCE(final_image_url, image_url) IS NOT NULL
         AND (created_at, id) < (SELECT created_at, id FROM campaigns WHERE id = ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [current.id]
    )
  ]);

  return {
    previous_id: previous ? Number(previous.id) : null,
    next_id: next ? Number(next.id) : null
  };
}
