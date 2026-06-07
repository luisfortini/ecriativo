import { all, get, run } from "../db/connection.js";
import type { BrandAnalysisOutput, ClientAsset, ClientBrandAnalysis, ClientProfile } from "../types.js";
import { executeAgentByKey } from "./agentService.js";
import { getClient, listClientAssets, updateClientAssetAnalysis } from "./clientService.js";

interface AnalyzeInput {
  site_url?: string;
  instagram_url?: string;
  manual_notes?: string;
  asset_ids?: number[];
}

interface ApplyInput {
  fields: string[];
}

const applyMap: Record<string, { clientField: string; analysisField: keyof BrandAnalysisOutput; format?: (value: unknown) => string }> = {
  brand_voice: { clientField: "brand_voice", analysisField: "brand_voice" },
  positioning: { clientField: "positioning", analysisField: "positioning" },
  target_audience: { clientField: "target_audience", analysisField: "target_audience" },
  color_palette: { clientField: "color_palette", analysisField: "color_palette", format: list },
  visual_style: { clientField: "visual_references", analysisField: "visual_style" },
  common_ctas: { clientField: "preferred_ctas", analysisField: "common_ctas", format: bulletList },
  approved_styles: { clientField: "approved_styles", analysisField: "approved_style_suggestions", format: bulletList },
  forbidden_styles: { clientField: "forbidden_styles", analysisField: "forbidden_style_suggestions", format: bulletList },
  restrictions: { clientField: "communication_restrictions", analysisField: "forbidden_style_suggestions", format: bulletList },
  strategic_notes: { clientField: "strategic_notes", analysisField: "strategic_notes" }
};

export async function analyzeClientBrand(clientId: number, input: AnalyzeInput) {
  const client = (await getClient(clientId)) as (ClientProfile & { assets: ClientAsset[] }) | null;
  if (!client) throw new Error("Cliente nao encontrado.");
  await persistProvidedUrls(clientId, input);

  const sources = await collectSources(input);
  const assets = await selectAssets(clientId, input.asset_ids);
  const context = {
    client,
    sources,
    manual_notes: input.manual_notes ?? "",
    uploaded_materials: assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      file_url: asset.file_url,
      description: asset.description,
      user_feedback: asset.user_feedback,
      analysis_status: asset.analysis_status
    })),
    rules: [
      "Nunca usar conteudo privado.",
      "Nunca burlar login, bloqueios ou permissoes.",
      "Nao sobrescrever dados do cliente automaticamente.",
      "Materiais aprovados sao referencia positiva; materiais reprovados sao referencia negativa."
    ]
  };

  const run = await executeAgentByKey<BrandAnalysisOutput>("brand_analyzer_agent", context, { clientId });
  const analysis = await saveAnalysis(clientId, sources, assets, run.parsed);

  await Promise.all(assets.map((asset) =>
    updateClientAssetAnalysis(asset.id, {
      analysis_status: "analyzed",
      ai_summary: buildAssetSummary(asset, run.parsed),
      dominant_colors_json: JSON.stringify(run.parsed.color_palette ?? []),
      visual_style_tags_json: JSON.stringify(run.parsed.approved_style_suggestions ?? [])
    })
  ));

  return {
    analysis,
    suggestions: run.parsed,
    comparison: buildComparison(client, run.parsed)
  };
}

async function persistProvidedUrls(clientId: number, input: AnalyzeInput) {
  const updates: Record<string, string | null | number> = { clientId };
  if (input.site_url?.trim()) updates.site_url = input.site_url.trim();
  if (input.instagram_url?.trim()) updates.instagram_url = input.instagram_url.trim();
  const keys = Object.keys(updates).filter((key) => key !== "clientId");
  if (!keys.length) return;
  await run(`UPDATE clients SET ${keys.map((key) => `${key} = @${key}`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = @clientId`, updates);
}

export async function getClientBrandAnalyses(clientId: number) {
  return all<ClientBrandAnalysis>("SELECT * FROM client_brand_analysis WHERE client_id = ? ORDER BY created_at DESC", [clientId]);
}

export async function applyBrandAnalysis(clientId: number, analysisId: number, input: ApplyInput) {
  const client = (await getClient(clientId)) as ClientProfile | null;
  const analysis = await get<ClientBrandAnalysis>("SELECT * FROM client_brand_analysis WHERE id = ? AND client_id = ?", [analysisId, clientId]);
  if (!client || !analysis) throw new Error("Analise nao encontrada.");

  const output = JSON.parse(analysis.raw_ai_output_json || "{}") as BrandAnalysisOutput;
  const updates: Record<string, string | null> = {};

  input.fields.forEach((field) => {
    const mapping = applyMap[field];
    if (!mapping) return;
    const raw = output[mapping.analysisField];
    const value = mapping.format ? mapping.format(raw) : String(raw ?? "");
    if (value.trim()) updates[mapping.clientField] = value.trim();
  });

  if (Object.keys(updates).length === 0) return getClient(clientId);

  const assignments = Object.keys(updates).map((field) => `${field} = @${field}`).join(", ");
  await run(`UPDATE clients SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @clientId`, { ...updates, clientId });
  return getClient(clientId);
}

export async function reanalyzeClientMaterials(clientId: number) {
  const assets = (await listClientAssets(clientId)).filter((asset) =>
    ["instagram_screenshot", "website_screenshot", "approved_reference", "rejected_reference", "previous_campaign", "brand_material", "approved_ad", "rejected_ad"].includes(asset.type)
  );
  return analyzeClientBrand(clientId, { asset_ids: assets.map((asset) => asset.id), manual_notes: "Reanalise de materiais cadastrados." });
}

async function collectSources(input: AnalyzeInput) {
  const sources: Array<{ type: string; url: string; text: string; images: string[]; status: string }> = [];
  if (input.site_url?.trim()) sources.push(await collectPublicPage("site", input.site_url.trim()));
  if (input.instagram_url?.trim()) sources.push(await collectPublicPage("instagram", input.instagram_url.trim()));
  if (input.manual_notes?.trim()) sources.push({ type: "manual", url: "", text: input.manual_notes.trim(), images: [], status: "provided" });
  return sources;
}

async function collectPublicPage(type: string, url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "e-Criativo brand analysis bot; public content only"
      }
    });
    const html = await response.text();
    return {
      type,
      url,
      text: extractText(html).slice(0, 12000),
      images: extractImages(html, url).slice(0, 12),
      status: response.ok ? "collected" : `http_${response.status}`
    };
  } catch (error) {
    return {
      type,
      url,
      text: "",
      images: [],
      status: error instanceof Error ? error.message : "failed"
    };
  }
}

function extractText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImages(html: string, baseUrl: string) {
  const images = new Set<string>();
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      images.add(new URL(match[1], baseUrl).toString());
    } catch {
      // Ignore invalid image URLs from public pages.
    }
  }
  return [...images];
}

async function selectAssets(clientId: number, ids?: number[]) {
  const assets = await listClientAssets(clientId);
  if (!ids?.length) return assets;
  const allowed = new Set(ids);
  return assets.filter((asset) => allowed.has(asset.id));
}

async function saveAnalysis(clientId: number, sources: Awaited<ReturnType<typeof collectSources>>, assets: ClientAsset[], output: BrandAnalysisOutput) {
  const sourceType = sources.map((source) => source.type).join(",") || (assets.length ? "manual_assets" : "manual");
  const sourceUrl = sources.map((source) => source.url).filter(Boolean).join("\n") || null;
  const extractedText = sources.map((source) => `[${source.type}] ${source.text}`).join("\n\n");
  const extractedImages = {
    public_images: sources.flatMap((source) => source.images.map((url) => ({ source: source.url, url }))),
    uploaded_materials: assets.map((asset) => ({ id: asset.id, type: asset.type, file_url: asset.file_url, user_feedback: asset.user_feedback }))
  };

  const result = await run(
    `INSERT INTO client_brand_analysis (
        client_id, source_type, source_url, extracted_text, extracted_images_json,
        suggested_brand_voice, suggested_color_palette, suggested_positioning,
        suggested_target_audience, suggested_visual_style, suggested_ctas,
        suggested_restrictions, raw_ai_output_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [
      clientId,
      sourceType,
      sourceUrl,
      extractedText,
      JSON.stringify(extractedImages),
      output.brand_voice,
      list(output.color_palette),
      output.positioning,
      output.target_audience,
      output.visual_style,
      bulletList(output.common_ctas),
      bulletList(output.forbidden_style_suggestions),
      JSON.stringify(output)
    ]
  );

  return get("SELECT * FROM client_brand_analysis WHERE id = ?", [result.lastInsertRowid]);
}

function buildComparison(client: ClientProfile, output: BrandAnalysisOutput) {
  return [
    { field: "brand_voice", label: "Tom de voz", current: client.brand_voice, suggestion: output.brand_voice },
    { field: "positioning", label: "Posicionamento", current: client.positioning, suggestion: output.positioning },
    { field: "target_audience", label: "Publico-alvo", current: client.target_audience, suggestion: output.target_audience },
    { field: "color_palette", label: "Paleta de cores", current: client.color_palette, suggestion: list(output.color_palette) },
    { field: "visual_style", label: "Referencias visuais", current: client.visual_references, suggestion: output.visual_style },
    { field: "common_ctas", label: "CTAs preferidos", current: client.preferred_ctas, suggestion: bulletList(output.common_ctas) },
    { field: "approved_styles", label: "Estilos aprovados", current: client.approved_styles, suggestion: bulletList(output.approved_style_suggestions) },
    { field: "forbidden_styles", label: "Estilos proibidos", current: client.forbidden_styles, suggestion: bulletList(output.forbidden_style_suggestions) },
    { field: "restrictions", label: "Restricoes recomendadas", current: client.communication_restrictions, suggestion: bulletList(output.forbidden_style_suggestions) },
    { field: "strategic_notes", label: "Observacoes estrategicas", current: client.strategic_notes, suggestion: output.strategic_notes }
  ];
}

function buildAssetSummary(asset: ClientAsset, output: BrandAnalysisOutput) {
  const polarity = ["rejected_ad", "rejected_reference"].includes(asset.type) ? "referencia negativa" : "referencia positiva";
  return `${polarity}: ${output.visual_style}. Cores sugeridas: ${list(output.color_palette)}.`;
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value ?? "");
}

function bulletList(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => `- ${item}`).join("\n") : String(value ?? "");
}
