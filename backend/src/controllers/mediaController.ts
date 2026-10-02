import path from "node:path";
import type { Request, Response } from "express";
import { get } from "../db/connection.js";
import { AppError } from "../utils/errors.js";
import { readMedia, type MediaKind } from "../services/mediaStorageService.js";

export async function generatedMediaController(req: Request, res: Response) {
  const filename = safeFilename(String(req.params.filename));
  const pattern = `%${filename}`;
  const owner = await get(
    `SELECT id FROM campaigns
     WHERE image_url LIKE ? OR final_image_url LIKE ? OR image_path LIKE ?
     UNION ALL SELECT s.id FROM social_contents s WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(s.images) image WHERE image->>'filename' = ? OR image->>'url' LIKE ?)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.revisions) revision CROSS JOIN LATERAL jsonb_array_elements(COALESCE(revision->'images','[]'::jsonb)) image WHERE image->>'filename' = ? OR image->>'url' LIKE ?)
     LIMIT 1`,
    [pattern, pattern, pattern, filename, pattern, filename, pattern]
  );
  if (!owner) throw new AppError("Arquivo nao encontrado.", 404);
  await sendTenantFile(res, "generated", filename);
}

export async function uploadedMediaController(req: Request, res: Response) {
  const filename = safeFilename(String(req.params.filename));
  const pattern = `%${filename}`;
  const owner = await get(
    `SELECT id FROM client_assets WHERE file_url LIKE ?
     UNION ALL
     SELECT id FROM campaigns WHERE reference_file_path LIKE ?
     UNION ALL SELECT id FROM visual_photos WHERE filename = ?
     LIMIT 1`,
    [pattern, pattern, filename]
  );
  if (!owner) throw new AppError("Arquivo nao encontrado.", 404);
  await sendTenantFile(res, "uploads", filename);
}

function safeFilename(value: string) {
  const decoded = decodeURIComponent(value);
  if (!decoded || path.basename(decoded) !== decoded || decoded.includes("..")) {
    throw new AppError("Arquivo invalido.", 400);
  }
  return decoded;
}

async function sendTenantFile(res: Response, kind: MediaKind, filename: string) {
  const stored=await readMedia(kind,filename);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.type(stored.content_type).send(stored.data);
}
