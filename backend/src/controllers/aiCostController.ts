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

export function aiCostDashboardController(req: Request, res: Response) {
  res.json(getAiCostDashboard(req.query));
}

export function aiUsageDetailController(req: Request, res: Response) {
  const detail = getAiUsageDetail(Number(req.params.id));
  if (!detail) throw new AppError("Execucao nao encontrada.", 404);
  res.json(detail);
}

export function aiModelPricesController(_req: Request, res: Response) {
  res.json(listAiModelPrices());
}

export function saveAiModelPriceController(req: Request, res: Response) {
  res.json(upsertAiModelPrice(req.body));
}

export function aiCostSettingsController(_req: Request, res: Response) {
  res.json(getAiCostSettings());
}

export function saveAiCostSettingsController(req: Request, res: Response) {
  res.json(updateAiCostSettings(req.body));
}

export function exportAiUsageController(req: Request, res: Response) {
  const format = String(req.params.format || "csv");
  const result = exportAiUsage(format, req.query);
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.body);
}
