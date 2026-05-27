import path from "node:path";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import type { ClientAsset, ClientAssetType, ClientProfile } from "../types.js";

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
  "site_url",
  "instagram_url"
] as const;

export type ClientPayload = Partial<Record<(typeof clientFields)[number], string>>;

export function listClients() {
  return db
    .prepare(
      `SELECT id, name, segment, brand_voice, color_palette, updated_at, created_at
       FROM clients
       ORDER BY name ASC`
    )
    .all();
}

export function getClient(id: number) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientProfile | undefined;
  if (!client) return null;

  return {
    ...client,
    assets: listClientAssets(id),
    brand_analyses: listClientBrandAnalyses(id),
    campaigns: db
      .prepare(
        `SELECT id, objetivo, oferta, formato, final_image_url, image_url, status, created_at
         FROM campaigns
         WHERE client_id = ?
         ORDER BY created_at DESC`
      )
      .all(id)
  };
}

export function createClient(payload: ClientPayload) {
  const name = payload.name?.trim();
  if (!name) throw new Error("Informe o nome do cliente.");

  const result = db
    .prepare(
      `INSERT INTO clients (
        name, segment, business_description, target_audience, differentiators, brand_voice,
        positioning, color_palette, forbidden_colors, preferred_typography, visual_references,
        approved_styles, forbidden_styles, communication_restrictions, preferred_ctas,
        segment_policies, strategic_notes, site_url, instagram_url
      ) VALUES (
        @name, @segment, @business_description, @target_audience, @differentiators, @brand_voice,
        @positioning, @color_palette, @forbidden_colors, @preferred_typography, @visual_references,
        @approved_styles, @forbidden_styles, @communication_restrictions, @preferred_ctas,
        @segment_policies, @strategic_notes, @site_url, @instagram_url
      )`
    )
    .run(cleanPayload(payload));

  return getClient(Number(result.lastInsertRowid));
}

export function updateClient(id: number, payload: ClientPayload) {
  const assignments = clientFields
    .filter((field) => field !== "name" || payload.name !== undefined)
    .map((field) => `${field} = @${field}`)
    .join(", ");

  db.prepare(`UPDATE clients SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({
    id,
    ...cleanPayload(payload)
  });

  return getClient(id);
}

export function listClientAssets(clientId: number) {
  return db.prepare("SELECT * FROM client_assets WHERE client_id = ? ORDER BY created_at DESC").all(clientId) as ClientAsset[];
}

export function addClientAsset(
  clientId: number,
  type: ClientAssetType,
  filePath: string,
  description?: string,
  options?: { user_feedback?: string; analysis_status?: string }
) {
  const filename = path.basename(filePath);
  const fileUrl = `${config.publicBaseUrl}/uploads/${filename}`;
  const result = db
    .prepare("INSERT INTO client_assets (client_id, type, file_url, description, analysis_status, user_feedback) VALUES (?, ?, ?, ?, ?, ?)")
    .run(clientId, type, fileUrl, description ?? null, options?.analysis_status ?? "pending", options?.user_feedback ?? null);
  return db.prepare("SELECT * FROM client_assets WHERE id = ?").get(result.lastInsertRowid);
}

export function updateClientAssetAnalysis(
  assetId: number,
  payload: { ai_summary?: string; dominant_colors_json?: string; visual_style_tags_json?: string; analysis_status?: string }
) {
  db.prepare(
    `UPDATE client_assets
     SET ai_summary = COALESCE(@ai_summary, ai_summary),
         dominant_colors_json = COALESCE(@dominant_colors_json, dominant_colors_json),
         visual_style_tags_json = COALESCE(@visual_style_tags_json, visual_style_tags_json),
         analysis_status = COALESCE(@analysis_status, analysis_status)
     WHERE id = @assetId`
  ).run({ assetId, ...payload });
}

export function listClientBrandAnalyses(clientId: number) {
  return db
    .prepare("SELECT * FROM client_brand_analysis WHERE client_id = ? ORDER BY created_at DESC")
    .all(clientId);
}

export function appendClientLearning(clientId: number, field: keyof ClientPayload, value: string) {
  const allowed = new Set<string>(clientFields.filter((item) => item !== "name"));
  if (!allowed.has(field)) throw new Error("Campo de aprendizado invalido.");

  const client = db.prepare(`SELECT ${field} FROM clients WHERE id = ?`).get(clientId) as Record<string, string | null> | undefined;
  if (!client) throw new Error("Cliente nao encontrado.");

  const current = client[field] ?? "";
  const next = current.trim() ? `${current.trim()}\n- ${value.trim()}` : `- ${value.trim()}`;
  db.prepare(`UPDATE clients SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(next, clientId);
  return getClient(clientId);
}

function cleanPayload(payload: ClientPayload) {
  return Object.fromEntries(clientFields.map((field) => [field, payload[field]?.trim() || null]));
}
