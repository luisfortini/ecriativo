import path from "node:path";
import { config } from "../config.js";
import { all, get, run } from "../db/connection.js";
import type { ClientAsset, ClientAssetType, ClientBrandAnalysis, ClientProfile } from "../types.js";

const clientFields = [
  "name",
  "segment",
  "business_description",
  "target_audience",
  "differentiators",
  "brand_voice",
  "positioning",
  "color_palette",
  "forbidden_colors",
  "preferred_typography",
  "visual_references",
  "approved_styles",
  "forbidden_styles",
  "communication_restrictions",
  "preferred_ctas",
  "segment_policies",
  "strategic_notes",
  "brand_memory_summary",
  "site_url",
  "instagram_url"
] as const;

export type ClientPayload = Partial<Record<(typeof clientFields)[number], string>>;

export async function listClients() {
  return all(
    `SELECT id, name, segment, brand_voice, color_palette, updated_at, created_at
       FROM clients
       ORDER BY name ASC`
  );
}

export async function getClient(id: number) {
  const client = await get<ClientProfile>("SELECT * FROM clients WHERE id = ?", [id]);
  if (!client) return null;

  return {
    ...client,
    assets: await listClientAssets(id),
    brand_analyses: await listClientBrandAnalyses(id),
    campaigns: await all(
      `SELECT id, objetivo, oferta, formato, final_image_url, image_url, status, created_at
         FROM campaigns
         WHERE client_id = ?
         ORDER BY created_at DESC`
      ,
      [id]
    )
  };
}

export async function createClient(payload: ClientPayload) {
  const name = payload.name?.trim();
  if (!name) throw new Error("Informe o nome do cliente.");

  const result = await run(
    `INSERT INTO clients (
        name, segment, business_description, target_audience, differentiators, brand_voice,
        positioning, color_palette, forbidden_colors, preferred_typography, visual_references,
        approved_styles, forbidden_styles, communication_restrictions, preferred_ctas,
        segment_policies, strategic_notes, brand_memory_summary, site_url, instagram_url
      ) VALUES (
        @name, @segment, @business_description, @target_audience, @differentiators, @brand_voice,
        @positioning, @color_palette, @forbidden_colors, @preferred_typography, @visual_references,
        @approved_styles, @forbidden_styles, @communication_restrictions, @preferred_ctas,
        @segment_policies, @strategic_notes, @brand_memory_summary, @site_url, @instagram_url
      )`,
    cleanPayload(payload)
  );

  return getClient(Number(result.lastInsertRowid));
}

export async function updateClient(id: number, payload: ClientPayload) {
  const assignments = clientFields
    .filter((field) => field !== "name" || payload.name !== undefined)
    .map((field) => `${field} = @${field}`)
    .join(", ");

  await run(`UPDATE clients SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`, {
    id,
    ...cleanPayload(payload)
  });

  return getClient(id);
}

export async function listClientAssets(clientId: number) {
  return all<ClientAsset>("SELECT * FROM client_assets WHERE client_id = ? ORDER BY created_at DESC", [clientId]);
}

export async function addClientAsset(
  clientId: number,
  type: ClientAssetType,
  filePath: string,
  description?: string,
  options?: { user_feedback?: string; analysis_status?: string }
) {
  const filename = path.basename(filePath);
  const fileUrl = `${config.publicBaseUrl}/uploads/${filename}`;
  const result = await run(
    "INSERT INTO client_assets (client_id, type, file_url, description, analysis_status, user_feedback) VALUES (?, ?, ?, ?, ?, ?)",
    [clientId, type, fileUrl, description ?? null, options?.analysis_status ?? "pending", options?.user_feedback ?? null]
  );
  return get("SELECT * FROM client_assets WHERE id = ?", [result.lastInsertRowid]);
}

export async function updateClientAssetAnalysis(
  assetId: number,
  payload: { ai_summary?: string; dominant_colors_json?: string; visual_style_tags_json?: string; analysis_status?: string }
) {
  await run(
    `UPDATE client_assets
     SET ai_summary = COALESCE(@ai_summary, ai_summary),
         dominant_colors_json = COALESCE(@dominant_colors_json, dominant_colors_json),
         visual_style_tags_json = COALESCE(@visual_style_tags_json, visual_style_tags_json),
         analysis_status = COALESCE(@analysis_status, analysis_status)
     WHERE id = @assetId`,
    { assetId, ...payload }
  );
}

export async function listClientBrandAnalyses(clientId: number) {
  return all<ClientBrandAnalysis>("SELECT * FROM client_brand_analysis WHERE client_id = ? ORDER BY created_at DESC", [clientId]);
}

export async function appendClientLearning(clientId: number, field: keyof ClientPayload, value: string) {
  const allowed = new Set<string>(clientFields.filter((item) => item !== "name"));
  if (!allowed.has(field)) throw new Error("Campo de aprendizado invalido.");

  const client = await get<Record<string, string | null>>(`SELECT ${field} FROM clients WHERE id = ?`, [clientId]);
  if (!client) throw new Error("Cliente nao encontrado.");

  const current = client[field] ?? "";
  const next = current.trim() ? `${current.trim()}\n- ${value.trim()}` : `- ${value.trim()}`;
  await run(`UPDATE clients SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [next, clientId]);
  return getClient(clientId);
}

function cleanPayload(payload: ClientPayload) {
  return Object.fromEntries(clientFields.map((field) => [field, payload[field]?.trim() || null]));
}
