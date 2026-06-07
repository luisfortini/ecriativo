import type { Request, Response } from "express";
import {
  getClientWhatsappSettings,
  getGlobalWhatsappSettings,
  sendCampaignCompleted,
  sendManualTest,
  sendQueueFailed,
  testConnection,
  updateClientWhatsappSettings,
  updateGlobalWhatsappSettings
} from "../services/whatsappNotificationService.js";
import { AppError } from "../utils/errors.js";

export async function getWhatsappSettingsController(_req: Request, res: Response) {
  res.json(await getGlobalWhatsappSettings());
}

export async function updateWhatsappSettingsController(req: Request, res: Response) {
  res.json(await updateGlobalWhatsappSettings(req.body));
}

export async function testWhatsappConnectionController(_req: Request, res: Response) {
  res.json(await testConnection());
}

export async function sendWhatsappTestController(req: Request, res: Response) {
  res.json(await sendManualTest(req.body?.message, req.body?.to));
}

export async function getClientWhatsappSettingsController(req: Request, res: Response) {
  res.json(await getClientWhatsappSettings(Number(req.params.id)));
}

export async function updateClientWhatsappSettingsController(req: Request, res: Response) {
  res.json(await updateClientWhatsappSettings(Number(req.params.id), req.body));
}

export async function sendCampaignWhatsappController(req: Request, res: Response) {
  const result = await sendCampaignCompleted(Number(req.params.id), true);
  if (!result) throw new AppError("Envio nao realizado. Verifique configuracoes globais e do cliente.", 422);
  res.json(result);
}

export async function notifyQueueErrorController(req: Request, res: Response) {
  res.json(await sendQueueFailed(Number(req.params.id), req.body?.error || "Notificacao manual de erro da fila."));
}
