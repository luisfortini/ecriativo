import { all, get } from "../db/connection.js";
import type { ClientAsset, ClientPromptContext } from "../types.js";

const LIMITS = {
  brandMemorySummary: 1500,
  campaignSummary: 500,
  recentCampaigns: 3,
  approvedReferences: 5,
  rejectedReferences: 5,
  field: 900,
  shortField: 360
} as const;

const approvedTypes = new Set(["approved_reference", "approved_ad", "reference_image", "logo_main", "brand_material"]);
const rejectedTypes = new Set(["rejected_reference", "rejected_ad"]);

export async function buildClientPromptContext(clientId: number): Promise<ClientPromptContext> {
  const client = await get<Record<string, string | number | null>>("SELECT * FROM clients WHERE id = ?", [clientId]);
  if (!client) throw new Error("Cliente nao encontrado.");

  const assets = await all<ClientAsset>("SELECT * FROM client_assets WHERE client_id = ? ORDER BY created_at DESC", [clientId]);
  const latestAnalysis = await latestBrandAnalysisSummary(clientId);

  return compactObject({
    nome: text(client.name),
    segmento: text(client.segment),
    descricao_resumida_negocio: truncate(text(client.business_description), LIMITS.field),
    publico_alvo_principal: truncate(text(client.target_audience || latestAnalysis.target_audience), LIMITS.field),
    posicionamento: truncate(text(client.positioning || latestAnalysis.positioning), LIMITS.field),
    tom_de_voz: truncate(text(client.brand_voice || latestAnalysis.brand_voice), LIMITS.shortField),
    paleta_de_cores: truncate(text(client.color_palette || latestAnalysis.color_palette), LIMITS.shortField),
    cores_proibidas: truncate(text(client.forbidden_colors), LIMITS.shortField),
    tipografia_preferida: truncate(text(client.preferred_typography), LIMITS.shortField),
    estilo_visual_aprovado: truncate(text(client.approved_styles || latestAnalysis.approved_styles), LIMITS.field),
    estilo_visual_proibido: truncate(text(client.forbidden_styles || latestAnalysis.forbidden_styles), LIMITS.field),
    ctas_preferidos: truncate(text(client.preferred_ctas || latestAnalysis.common_ctas), LIMITS.shortField),
    restricoes_comunicacao: truncate(text(client.communication_restrictions), LIMITS.field),
    resumo_memoria_marca: truncate(text(client.brand_memory_summary || latestAnalysis.strategic_notes || client.strategic_notes), LIMITS.brandMemorySummary),
    aprendizados_recentes: truncate(buildRecentLearnings(client, assets), LIMITS.brandMemorySummary),
    ultimas_campanhas_resumidas: await recentCampaigns(clientId),
    referencias_aprovadas_resumidas: summarizeReferences(assets.filter((asset) => approvedTypes.has(asset.type)), LIMITS.approvedReferences),
    referencias_reprovadas_resumidas: summarizeReferences(assets.filter((asset) => rejectedTypes.has(asset.type)), LIMITS.rejectedReferences)
  }) as ClientPromptContext;
}

async function latestBrandAnalysisSummary(clientId: number) {
  const row = await get<Record<string, string | null>>(
    `SELECT suggested_brand_voice, suggested_color_palette, suggested_positioning,
            suggested_target_audience, suggested_visual_style, suggested_ctas,
            suggested_restrictions, raw_ai_output_json
     FROM client_brand_analysis
     WHERE client_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId]
  );

  if (!row) return emptyAnalysis();

  const parsed = parseAnalysis(row.raw_ai_output_json);
  return {
    brand_voice: row.suggested_brand_voice || parsed.brand_voice,
    color_palette: row.suggested_color_palette || list(parsed.color_palette),
    positioning: row.suggested_positioning || parsed.positioning,
    target_audience: row.suggested_target_audience || parsed.target_audience,
    visual_style: row.suggested_visual_style || parsed.visual_style,
    common_ctas: row.suggested_ctas || list(parsed.common_ctas),
    approved_styles: list(parsed.approved_style_suggestions) || row.suggested_visual_style || "",
    forbidden_styles: row.suggested_restrictions || list(parsed.forbidden_style_suggestions),
    strategic_notes: parsed.strategic_notes
  };
}

function emptyAnalysis() {
  return {
    brand_voice: "",
    color_palette: "",
    positioning: "",
    target_audience: "",
    visual_style: "",
    common_ctas: "",
    approved_styles: "",
    forbidden_styles: "",
    strategic_notes: ""
  };
}

function parseAnalysis(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function buildRecentLearnings(client: Record<string, string | number | null>, assets: ClientAsset[]) {
  return [
    text(client.strategic_notes),
    ...assets
      .map((asset) => asset.ai_summary || asset.user_feedback || asset.description || "")
      .filter(Boolean)
      .slice(0, 5)
  ]
    .filter(Boolean)
    .join("\n");
}

async function recentCampaigns(clientId: number) {
  const rows = await all<Record<string, string | number | null>>(
    `SELECT id, objetivo, oferta, formato, strategist_output_json, creative_output_json, strategy_json, creative_json, created_at
     FROM campaigns
     WHERE client_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [clientId, LIMITS.recentCampaigns]
  );

  return rows.map((row) => {
      const campaign = row as Record<string, string | number | null>;
      return {
        id: Number(campaign.id),
        resumo: truncate(
          [
            `Objetivo: ${text(campaign.objetivo)}`,
            `Oferta: ${text(campaign.oferta)}`,
            `Formato: ${text(campaign.formato)}`,
            summarizeJson(campaign.strategist_output_json || campaign.strategy_json),
            summarizeJson(campaign.creative_output_json || campaign.creative_json)
          ]
            .filter(Boolean)
            .join(" | "),
          LIMITS.campaignSummary
        ),
        created_at: text(campaign.created_at)
      };
    });
}

function summarizeReferences(assets: ClientAsset[], limit: number) {
  return assets.slice(0, limit).map((asset) => ({
    tipo: asset.type,
    resumo: truncate([asset.description, asset.ai_summary, asset.user_feedback].filter(Boolean).join(" | ") || asset.type, LIMITS.campaignSummary),
    url: asset.file_url
  }));
}

function summarizeJson(value: string | number | null) {
  if (!value || typeof value !== "string") return "";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return truncate(
      [
        parsed.headline ? `Headline: ${String(parsed.headline)}` : "",
        parsed.angulo ? `Angulo: ${String(parsed.angulo)}` : "",
        parsed.direcao_visual_resumida ? `Visual: ${String(parsed.direcao_visual_resumida)}` : ""
      ]
        .filter(Boolean)
        .join(" | "),
      LIMITS.campaignSummary
    );
  } catch {
    return "";
  }
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : text(value);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function truncate(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function compactObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactObject).filter((item) => !isEmpty(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, compactObject(item)] as const)
      .filter(([, item]) => !isEmpty(item))
  );
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
