import type { Request, Response } from "express";
import {
  exportAiUsage,
  getAiCostDashboard,
  getAiCostSettings,
  getAiUsageDetail,
  listAiModelPrices,
  updateAiCostSettings,
  upsertAiModelPrice
} from "../services/aiCostService.js";
import { AppError } from "../utils/errors.js";

export async function aiCostDashboardController(req: Request, res: Response) {
  res.json(await getAiCostDashboard(req.query));
}

export async function aiUsageDetailController(req: Request, res: Response) {
  const detail = await getAiUsageDetail(Number(req.params.id));
  if (!detail) throw new AppError("Execucao nao encontrada.", 404);
  res.json(detail);
}

export async function aiModelPricesController(_req: Request, res: Response) {
  res.json(await listAiModelPrices());
}

export async function saveAiModelPriceController(req: Request, res: Response) {
  res.json(await upsertAiModelPrice(req.body));
}

export async function aiCostSettingsController(_req: Request, res: Response) {
  res.json(await getAiCostSettings());
}

export async function saveAiCostSettingsController(req: Request, res: Response) {
  res.json(await updateAiCostSettings(req.body));
}

export async function exportAiUsageController(req: Request, res: Response) {
  const format = String(req.params.format || "csv");
  const result = await exportAiUsage(format, req.query);
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.body);
}
