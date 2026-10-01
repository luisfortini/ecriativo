import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { all, get, run, transaction } from "../db/connection.js";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

export const visualSelectionSchema = z.object({
  products: z.enum(["none", "manual", "auto"]).default("none"),
  people: z.enum(["none", "manual", "auto"]).default("none"),
  product_ids: z.array(z.coerce.number().int().positive()).max(2).default([]),
  person_ids: z.array(z.coerce.number().int().positive()).max(2).default([]),
  no_people: z.boolean().default(false),
  mode: z.enum(["reference", "composition"]).default("reference")
}).refine(v => !(v.no_people && v.people !== "none"), "Não incluir pessoas é incompatível com selecionar modelos.");
export type VisualSelection = z.infer<typeof visualSelectionSchema>;
export const selectionInput = z.preprocess(value => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}, visualSelectionSchema).optional();

export const subjectSchema = z.object({
  kind: z.enum(["product", "person"]), name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).default(""), sku: z.string().max(100).default(""),
  preservation_notes: z.string().max(2000).default(""), active: z.boolean().default(true),
  approved: z.boolean().default(false), allow_ads: z.boolean().default(false), allow_social: z.boolean().default(false),
  consent_note: z.string().max(2000).default(""),
  expires_on: z.string().date().nullable().default(null)
}).refine(v => v.kind !== "person" || !v.approved || v.consent_note.trim().length >= 5, "Registre a autorização antes de aprovar uma pessoa.");

export async function requireClient(clientId: number) {
  const client = await get("SELECT id FROM clients WHERE id = ?", [clientId]);
  if (!client) throw new AppError("Cliente não encontrado.", 404);
}

export async function listSubjects(clientId: number) {
  await requireClient(clientId);
  const subjects = await all("SELECT * FROM visual_subjects WHERE client_id = ? ORDER BY kind, name", [clientId]);
  const photos = await all("SELECT * FROM visual_photos WHERE client_id = ? ORDER BY is_primary DESC, id", [clientId]);
  return subjects.map(subject => ({ ...subject, photos: photos.filter(p => Number(p.subject_id) === Number(subject.id)).map(p => ({ ...p, file_url: `${config.publicBaseUrl}/uploads/${p.filename}` })) }));
}

export async function saveSubject(clientId: number, id: number | null, raw: unknown) {
  const parsed = subjectSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message, 422);
  await requireClient(clientId);
  const input = parsed.data;
  if (id) {
    const result = await run(`UPDATE visual_subjects SET name=@name, kind=@kind, description=@description, sku=@sku,
      preservation_notes=@preservation_notes, active=@active, approved=@approved, allow_ads=@allow_ads,
      allow_social=@allow_social, consent_note=@consent_note, expires_on=@expires_on, updated_at=CURRENT_TIMESTAMP
      WHERE id=@id AND client_id=@clientId`, { ...input, id, clientId });
    if (!result.rowCount) throw new AppError("Item não encontrado.", 404);
    return { id };
  }
  const result = await run(`INSERT INTO visual_subjects(client_id,kind,name,description,sku,preservation_notes,active,approved,allow_ads,allow_social,consent_note,expires_on)
    VALUES(@clientId,@kind,@name,@description,@sku,@preservation_notes,@active,@approved,@allow_ads,@allow_social,@consent_note,@expires_on)`, { ...input, clientId });
  return { id: Number(result.lastInsertRowid) };
}

export async function addPhoto(clientId: number, subjectId: number, filePath: string, caption: string) {
  const filename = `visual-${randomUUID()}.png`;
  const target = path.join(config.uploadFilesDir, filename);
  try {
    const subject = await get("SELECT id FROM visual_subjects WHERE id = ? AND client_id = ?", [subjectId, clientId]);
    if (!subject) throw new AppError("Item não encontrado.", 404);
    const metadata = await sharp(filePath, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 256 || metadata.height < 256 || (metadata.pages ?? 1) > 1) throw new AppError("Use uma imagem estática com pelo menos 256 × 256 pixels.", 422);
    await sharp(filePath, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toFile(target);
    await transaction(async client => {
      await get("SELECT id FROM visual_subjects WHERE id = ? FOR UPDATE", [subjectId], client);
      const count = await get<{ total: number }>("SELECT COUNT(*)::int total FROM visual_photos WHERE subject_id = ?", [subjectId], client);
      if (Number(count?.total) >= 12) throw new AppError("Limite de 12 fotos por item.", 422);
      await run("INSERT INTO visual_photos(client_id,subject_id,filename,caption,is_primary) VALUES(?,?,?,?,?)", [clientId, subjectId, filename, caption.slice(0, 500), !count?.total], client);
    });
  } catch (error) {
    await fs.unlink(target).catch(() => undefined);
    throw error;
  } finally { await fs.unlink(filePath).catch(() => undefined); }
}

export async function setPrimaryPhoto(clientId: number, subjectId: number, photoId: number) {
  await transaction(async client => {
    const owner = await get("SELECT id FROM visual_subjects WHERE id=? AND client_id=? FOR UPDATE", [subjectId, clientId], client);
    const photo = await get("SELECT id FROM visual_photos WHERE id=? AND subject_id=? AND client_id=?", [photoId, subjectId, clientId], client);
    if (!owner || !photo) throw new AppError("Foto não encontrada.", 404);
    await run("UPDATE visual_photos SET is_primary=FALSE WHERE subject_id=?", [subjectId], client);
    await run("UPDATE visual_photos SET is_primary=TRUE WHERE id=?", [photoId], client);
  });
}

export interface VisualReference { subject_id: number; kind: string; name: string; preservation_notes: string; photo_id: number; filename: string; }
export async function resolveVisuals(clientId: number, selection: VisualSelection, purpose: "ads" | "social", rotation = 0): Promise<VisualReference[]> {
  await requireClient(clientId);
  const references: VisualReference[] = [];
  for (const kind of ["product", "person"] as const) {
    const mode = kind === "product" ? selection.products : selection.people;
    if (mode === "none") continue;
    const ids = kind === "product" ? selection.product_ids : selection.person_ids;
    const candidates = await all<{ id: number; name: string; preservation_notes: string }>(`SELECT id,name,preservation_notes FROM visual_subjects s
      WHERE client_id=? AND kind=? AND active AND approved AND ${purpose === "ads" ? "allow_ads" : "allow_social"}
        AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
        AND EXISTS(SELECT 1 FROM visual_photos p WHERE p.subject_id=s.id) ORDER BY id`, [clientId, kind]);
    const selected = mode === "manual" ? candidates.filter(c => ids.includes(Number(c.id))) : candidates.length ? [candidates[rotation % candidates.length]] : [];
    if (!selected.length || (mode === "manual" && selected.length !== new Set(ids).size)) throw new AppError(`Selecione ${kind === "product" ? "produtos" : "pessoas"} ativos, aprovados e autorizados para este uso.`, 422);
    for (const subject of selected) {
      const photos = await all<{ id: number; filename: string }>("SELECT id,filename FROM visual_photos WHERE subject_id=? ORDER BY is_primary DESC,id LIMIT 2", [subject.id]);
      for (const photo of photos) references.push({ subject_id: Number(subject.id), kind, name: subject.name, preservation_notes: subject.preservation_notes, photo_id: Number(photo.id), filename: photo.filename });
    }
  }
  return references.slice(0, 8);
}

export function photoPath(filename: string) {
  if (!/^visual-[a-f0-9-]+\.png$/.test(filename)) throw new AppError("Arquivo de biblioteca inválido.", 422);
  return path.join(config.uploadFilesDir, filename);
}

export async function validateVisualReferences(clientId: number, references: VisualReference[], purpose: "ads" | "social") {
  for (const ref of references) {
    const valid = await get(`SELECT p.id FROM visual_photos p JOIN visual_subjects s ON s.id=p.subject_id
      WHERE p.id=? AND p.filename=? AND p.client_id=? AND s.id=? AND s.kind=?
        AND s.active AND s.approved AND ${purpose === "ads" ? "s.allow_ads" : "s.allow_social"}
        AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)`, [ref.photo_id,ref.filename,clientId,ref.subject_id,ref.kind]);
    if (!valid) throw new AppError("Uma referência foi revogada, venceu ou não pertence ao cliente. Revise os materiais antes de gerar.",422);
  }
}
