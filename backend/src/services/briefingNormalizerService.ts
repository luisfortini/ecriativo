import type { ClientAsset, ClientProfile, NewCampaignInput, NormalizedBriefing } from "../types.js";

function pick(current: string | undefined, memory: string | null | undefined, fallback = "") {
  return current?.trim() || memory?.trim() || fallback;
}

export function normalizeBriefing(input: NewCampaignInput, client: ClientProfile, assets: ClientAsset[]): NormalizedBriefing {
  const latestAnalysis = getLatestAnalysisOutput(client);
  const approvedReferences = assets.filter((asset) => ["approved_reference", "approved_ad", "reference_image", "logo_main", "brand_material"].includes(asset.type));
  const rejectedReferences = assets.filter((asset) => ["rejected_reference", "rejected_ad"].includes(asset.type));
  const extractedPalette = assets
    .map((asset) => safeJsonArray(asset.dominant_colors_json))
    .flat()
    .filter(Boolean)
    .join(", ");
  const visualLearnings = assets
    .map((asset) => asset.ai_summary)
    .filter(Boolean)
    .join("\n");

  return {
    client,
    assets,
    free_briefing: input.free_briefing.trim(),
    objective: input.objetivo?.trim() || input.free_briefing.trim(),
    offer: input.oferta?.trim() || "Oferta definida no briefing livre",
    format: input.formato,
    target_audience: pick(input.publico_alvo, client.target_audience),
    brand_voice: pick(input.tom_marca, client.brand_voice || latestAnalysis.brand_voice),
    color_palette: pick(input.paleta_cores, client.color_palette || latestAnalysis.color_palette),
    visual_references: pick(input.referencias_visuais, client.visual_references || latestAnalysis.visual_style),
    restrictions: pick(input.restricoes, client.communication_restrictions),
    observations: input.observacoes?.trim() || "",
    differentiators: client.differentiators ?? "",
    positioning: client.positioning ?? "",
    forbidden_colors: client.forbidden_colors ?? "",
    preferred_typography: client.preferred_typography ?? "",
    approved_styles: client.approved_styles || latestAnalysis.approved_styles,
    forbidden_styles: client.forbidden_styles || latestAnalysis.forbidden_styles,
    approved_references: approvedReferences,
    rejected_references: rejectedReferences,
    extracted_palette: extractedPalette,
    visual_learnings: visualLearnings,
    posting_patterns: latestAnalysis.content_patterns,
    preferred_ctas: client.preferred_ctas || latestAnalysis.common_ctas,
    segment_policies: client.segment_policies ?? "",
    strategic_notes: client.strategic_notes || latestAnalysis.strategic_notes,
    source_priority:
      "Dados preenchidos na campanha atual têm prioridade. Memória do cliente serve como padrão. Não sobrescrever memória sem ação explícita do usuário."
  };
}

function getLatestAnalysisOutput(client: ClientProfile) {
  const latest = client.brand_analyses?.[0];
  if (!latest?.raw_ai_output_json) {
    return {
      brand_voice: "",
      color_palette: "",
      visual_style: "",
      approved_styles: "",
      forbidden_styles: "",
      content_patterns: "",
      common_ctas: "",
      strategic_notes: ""
    };
  }

  try {
    const parsed = JSON.parse(latest.raw_ai_output_json) as {
      brand_voice?: string;
      color_palette?: string[];
      visual_style?: string;
      approved_style_suggestions?: string[];
      forbidden_style_suggestions?: string[];
      content_patterns?: string[];
      common_ctas?: string[];
      strategic_notes?: string;
    };
    return {
      brand_voice: parsed.brand_voice ?? "",
      color_palette: parsed.color_palette?.join(", ") ?? "",
      visual_style: parsed.visual_style ?? "",
      approved_styles: parsed.approved_style_suggestions?.map((item) => `- ${item}`).join("\n") ?? "",
      forbidden_styles: parsed.forbidden_style_suggestions?.map((item) => `- ${item}`).join("\n") ?? "",
      content_patterns: parsed.content_patterns?.map((item) => `- ${item}`).join("\n") ?? "",
      common_ctas: parsed.common_ctas?.map((item) => `- ${item}`).join("\n") ?? "",
      strategic_notes: parsed.strategic_notes ?? ""
    };
  } catch {
    return {
      brand_voice: "",
      color_palette: "",
      visual_style: "",
      approved_styles: "",
      forbidden_styles: "",
      content_patterns: "",
      common_ctas: "",
      strategic_notes: ""
    };
  }
}

function safeJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
