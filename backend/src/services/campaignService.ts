import { db } from "../db/connection.js";
import type { CampaignRecord, ClientProfile, CreativeOutput, NewCampaignInput, NormalizedBriefing, StrategyOutput } from "../types.js";
import { executeAgentByKey } from "./agentService.js";
import { normalizeBriefing } from "./briefingNormalizerService.js";
import { appendClientLearning, getClient, listClientAssets } from "./clientService.js";
import { generateImage } from "./openaiService.js";

export async function createCampaign(input: NewCampaignInput, referenceFilePath?: string) {
  const client = getClient(input.client_id);
  if (!client) throw new Error("Cliente nao encontrado.");

  const assets = listClientAssets(input.client_id);
  const normalized = normalizeBriefing(input, client as ClientProfile, assets);
  const strategistRun = await executeAgentByKey<StrategyOutput>("strategist_agent", { ...normalized, arquivo_referencia_campanha: referenceFilePath ?? null }, {
    clientId: input.client_id
  });
  const strategy = strategistRun.parsed;
  const creativeRun = await executeAgentByKey<CreativeOutput>("creative_agent", { briefing_normalizado: normalized, estrategia: strategy }, { clientId: input.client_id });
  const creative = creativeRun.parsed;
  const image = await generateImage(creative.prompt_imagem, input.formato);

  const result = db
    .prepare(
      `INSERT INTO campaigns (
        client_id, cliente, segmento, objetivo, publico_alvo, oferta, formato, tom_marca,
        paleta_cores, referencias_visuais, restricoes, observacoes, reference_file_path,
        free_briefing, normalized_briefing_json, strategist_output_json, creative_output_json,
        final_image_url, strategist_agent_id, creative_agent_id, strategy_json, creative_json, image_path, image_url, status
      ) VALUES (
        @client_id, @cliente, @segmento, @objetivo, @publico_alvo, @oferta, @formato, @tom_marca,
        @paleta_cores, @referencias_visuais, @restricoes, @observacoes, @reference_file_path,
        @free_briefing, @normalized_briefing_json, @strategist_output_json, @creative_output_json,
        @final_image_url, @strategist_agent_id, @creative_agent_id, @strategy_json, @creative_json, @image_path, @image_url, 'completed'
      )`
    )
    .run({
      client_id: input.client_id,
      cliente: normalized.client.name,
      segmento: normalized.client.segment,
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
      normalized_briefing_json: JSON.stringify(normalized),
      strategist_output_json: JSON.stringify(strategy),
      creative_output_json: JSON.stringify(creative),
      final_image_url: image.imageUrl,
      strategist_agent_id: strategistRun.agent.id,
      creative_agent_id: creativeRun.agent.id,
      strategy_json: JSON.stringify(strategy),
      creative_json: JSON.stringify(creative),
      image_path: image.imagePath,
      image_url: image.imageUrl
    });

  const campaignId = Number(result.lastInsertRowid);
  db.prepare("UPDATE agent_execution_logs SET campaign_id = ? WHERE campaign_id IS NULL AND client_id = ? AND agent_id IN (?, ?)").run(
    campaignId,
    input.client_id,
    strategistRun.agent.id,
    creativeRun.agent.id
  );

  return getCampaign(campaignId);
}

export function setCampaignCreativeStatus(campaignId: number, creativeStatus: "draft" | "waiting_review" | "approved" | "rejected") {
  db.prepare("UPDATE campaigns SET creative_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(creativeStatus, campaignId);
  return getCampaign(campaignId);
}

export function duplicateCampaign(id: number) {
  const campaign = getCampaign(id);
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

export function listCampaigns() {
  return db
    .prepare(
      `SELECT c.id, c.client_id, COALESCE(c.cliente, cl.name) AS cliente, COALESCE(c.segmento, cl.segment) AS segmento,
              c.objetivo, c.formato, COALESCE(c.final_image_url, c.image_url) AS image_url, c.status, c.created_at
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY c.created_at DESC`
    )
    .all();
}

export function listCreatives() {
  return db
    .prepare(
      `SELECT c.id, c.client_id, COALESCE(c.cliente, cl.name) AS cliente, c.formato,
              COALESCE(c.creative_output_json, c.creative_json) AS creative_json,
              COALESCE(c.strategist_output_json, c.strategy_json) AS strategy_json,
              COALESCE(c.final_image_url, c.image_url) AS image_url, c.created_at
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE COALESCE(c.final_image_url, c.image_url) IS NOT NULL
       ORDER BY c.created_at DESC`
    )
    .all()
    .map((row) => {
      const item = row as CampaignRecord;
      return {
        id: item.id,
        client_id: item.client_id,
        cliente: item.cliente,
        formato: item.formato,
        image_url: item.image_url,
        creative: JSON.parse(item.creative_json),
        strategy: JSON.parse(item.strategy_json),
        created_at: item.created_at
      };
    });
}

export function getCampaign(id: number) {
  const campaign = db
    .prepare(
      `SELECT c.*, COALESCE(c.cliente, cl.name) AS cliente, COALESCE(c.segmento, cl.segment) AS segmento,
              COALESCE(c.final_image_url, c.image_url) AS image_url
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ?`
    )
    .get(id) as CampaignRecord | undefined;
  if (!campaign) return null;

  const strategyJson = campaign.strategist_output_json || campaign.strategy_json;
  const creativeJson = campaign.creative_output_json || campaign.creative_json;

  return {
    ...campaign,
    strategy: JSON.parse(strategyJson),
    creative: JSON.parse(creativeJson),
    normalized_briefing: campaign.normalized_briefing_json ? JSON.parse(campaign.normalized_briefing_json) : null
  };
}

export function saveCampaignLearning(campaignId: number, action: string, value?: string) {
  const campaign = getCampaign(campaignId);
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

export function updateCampaignStatus(campaignId: number, status: "approved" | "rejected") {
  db.prepare("UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, campaignId);
  return getCampaign(campaignId);
}
