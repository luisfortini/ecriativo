import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { get } from "../db/connection.js";
import { AppError } from "../utils/errors.js";

export async function generatedMediaController(req: Request, res: Response) {
  const filename = safeFilename(String(req.params.filename));
  const pattern = `%${filename}`;
  const owner = await get(
    `SELECT id FROM campaigns
     WHERE image_url LIKE ? OR final_image_url LIKE ? OR image_path LIKE ?
     LIMIT 1`,
    [pattern, pattern, pattern]
  );
  if (!owner) throw new AppError("Arquivo nao encontrado.", 404);
  await sendTenantFile(res, config.generatedFilesDir, filename);
}

export async function uploadedMediaController(req: Request, res: Response) {
  const filename = safeFilename(String(req.params.filename));
  const pattern = `%${filename}`;
  const owner = await get(
    `SELECT id FROM client_assets WHERE file_url LIKE ?
     UNION ALL
     SELECT id FROM campaigns WHERE reference_file_path LIKE ?
     LIMIT 1`,
    [pattern, pattern]
  );
  if (!owner) throw new AppError("Arquivo nao encontrado.", 404);
  await sendTenantFile(res, config.uploadFilesDir, filename);
}

function safeFilename(value: string) {
  const decoded = decodeURIComponent(value);
  if (!decoded || path.basename(decoded) !== decoded || decoded.includes("..")) {
    throw new AppError("Arquivo invalido.", 400);
  }
  return decoded;
}

async function sendTenantFile(res: Response, directory: string, filename: string) {
  const root = path.resolve(directory);
  const target = path.resolve(root, filename);
  if (path.dirname(target) !== root) throw new AppError("Arquivo invalido.", 400);
  try {
    await fs.access(target);
  } catch {
    throw new AppError("Arquivo nao encontrado.", 404);
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(target);
}
