import type { Request, Response } from "express";
import { z } from "zod";
import {
  createCampaign,
  duplicateCampaign,
  getCampaign,
  listCampaigns,
  listCreatives,
  saveCampaignLearning,
  updateCampaignStatus
} from "../services/campaignService.js";
import { AppError } from "../utils/errors.js";

const campaignSchema = z.object({
  client_id: z.coerce.number().int().positive("Selecione um cliente."),
  free_briefing: z.string().min(5, "Informe o briefing livre."),
  objetivo: z.string().optional(),
  publico_alvo: z.string().optional(),
  oferta: z.string().optional(),
  formato: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  tom_marca: z.string().optional(),
  paleta_cores: z.string().optional(),
  referencias_visuais: z.string().optional(),
  restricoes: z.string().optional(),
  observacoes: z.string().optional()
});

export async function createCampaignController(req: Request, res: Response) {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise os dados do briefing.", 422);

  const campaign = await createCampaign(parsed.data, req.file?.path);
  res.status(201).json(campaign);
}

export async function listCampaignsController(_req: Request, res: Response) {
  res.json(await listCampaigns());
}

export async function getCampaignController(req: Request, res: Response) {
  const campaign = await getCampaign(Number(req.params.id));
  if (!campaign) throw new AppError("Campanha nao encontrada.", 404);
  res.json(campaign);
}

export async function listCreativesController(_req: Request, res: Response) {
  res.json(await listCreatives());
}

export async function saveCampaignLearningController(req: Request, res: Response) {
  const parsed = z.object({ action: z.string(), value: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) throw new AppError("Informe uma acao de aprendizado valida.", 422);
  res.json(await saveCampaignLearning(Number(req.params.id), parsed.data.action, parsed.data.value));
}

export async function updateCampaignStatusController(req: Request, res: Response) {
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!parsed.success) throw new AppError("Informe aprovado ou reprovado.", 422);
  res.json(await updateCampaignStatus(Number(req.params.id), parsed.data.status));
}

export async function duplicateCampaignController(req: Request, res: Response) {
  const payload = await duplicateCampaign(Number(req.params.id));
  if (!payload) throw new AppError("Campanha nao encontrada.", 404);
  res.json(payload);
}
