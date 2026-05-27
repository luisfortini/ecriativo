import type { Request, Response } from "express";
import { z } from "zod";
import { addClientAsset, createClient, getClient, listClients, updateClient } from "../services/clientService.js";
import { analyzeClientBrand, applyBrandAnalysis, getClientBrandAnalyses, reanalyzeClientMaterials } from "../services/brandAnalysisService.js";
import type { ClientAssetType } from "../types.js";
import { AppError } from "../utils/errors.js";

const clientSchema = z.object({
  name: z.string().min(2, "Informe o nome do cliente."),
  segment: z.string().optional(),
  business_description: z.string().optional(),
  target_audience: z.string().optional(),
  differentiators: z.string().optional(),
  brand_voice: z.string().optional(),
  positioning: z.string().optional(),
  color_palette: z.string().optional(),
  forbidden_colors: z.string().optional(),
  preferred_typography: z.string().optional(),
  visual_references: z.string().optional(),
  approved_styles: z.string().optional(),
  forbidden_styles: z.string().optional(),
  communication_restrictions: z.string().optional(),
  preferred_ctas: z.string().optional(),
  segment_policies: z.string().optional(),
  strategic_notes: z.string().optional(),
  site_url: z.string().optional(),
  instagram_url: z.string().optional()
});

const assetSchema = z.object({
  type: z.enum([
    "logo_main",
    "logo_white",
    "logo_dark",
    "reference_image",
    "approved_ad",
    "rejected_ad",
    "instagram_screenshot",
    "website_screenshot",
    "approved_reference",
    "rejected_reference",
    "previous_campaign",
    "brand_material"
  ]),
  description: z.string().optional(),
  user_feedback: z.string().optional()
});

const analysisSchema = z.object({
  site_url: z.string().optional(),
  instagram_url: z.string().optional(),
  manual_notes: z.string().optional(),
  asset_ids: z.array(z.coerce.number()).optional()
});

const applyAnalysisSchema = z.object({
  fields: z.array(z.string()).min(1)
});

export function listClientsController(_req: Request, res: Response) {
  res.json(listClients());
}

export function getClientController(req: Request, res: Response) {
  const client = getClient(Number(req.params.id));
  if (!client) throw new AppError("Cliente nao encontrado.", 404);
  res.json(client);
}

export function createClientController(req: Request, res: Response) {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o perfil do cliente.", 422);
  res.status(201).json(createClient(parsed.data));
}

export function updateClientController(req: Request, res: Response) {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o perfil do cliente.", 422);
  res.json(updateClient(Number(req.params.id), parsed.data));
}

export function addClientAssetController(req: Request, res: Response) {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Informe o tipo do arquivo.", 422);
  if (!req.file) throw new AppError("Envie um arquivo.", 422);
  res.status(201).json(
    addClientAsset(Number(req.params.id), parsed.data.type as ClientAssetType, req.file.path, parsed.data.description, {
      user_feedback: parsed.data.user_feedback
    })
  );
}

export async function analyzeClientBrandController(req: Request, res: Response) {
  const parsed = analysisSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Informe site, Instagram, notas ou materiais para analisar.", 422);
  res.json(await analyzeClientBrand(Number(req.params.id), parsed.data));
}

export function listClientBrandAnalysesController(req: Request, res: Response) {
  res.json(getClientBrandAnalyses(Number(req.params.id)));
}

export function applyBrandAnalysisController(req: Request, res: Response) {
  const parsed = applyAnalysisSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Selecione pelo menos uma sugestao para aplicar.", 422);
  res.json(applyBrandAnalysis(Number(req.params.id), Number(req.params.analysisId), parsed.data));
}

export async function reanalyzeClientMaterialsController(req: Request, res: Response) {
  res.json(await reanalyzeClientMaterials(Number(req.params.id)));
}
