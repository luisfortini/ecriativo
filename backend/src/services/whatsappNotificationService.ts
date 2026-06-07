import { config } from "../config.js";
import { get, run } from "../db/connection.js";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

type NotificationType = "campaign_completed" | "campaign_failed" | "queue_failed" | "agent_error" | "daily_summary" | "manual_test";

interface SendOptions {
  clientId?: number | null;
  campaignId?: number | null;
  campaignPlanId?: number | null;
  queueId?: number | null;
  type: NotificationType;
  recipient: string;
  message: string;
  mediaUrl?: string | null;
}

const globalDefaults = {
  evolution_base_url: "",
  evolution_api_key: "",
  evolution_instance_name: "",
  evolution_text_endpoint_path: "/message/sendText/{instance}",
  evolution_image_endpoint_path: "/message/sendMedia/{instance}",
  evolution_connection_endpoint_path: "/instance/connectionState/{instance}",
  default_notification_phone: "",
  notify_on_campaign_completed: false,
  notify_on_campaign_failed: true,
  notify_on_queue_failed: true,
  notify_on_agent_error: true,
  notify_on_daily_summary: false,
  whatsapp_delivery_enabled: false
};

const clientDefaults = {
  responsible_phone: "",
  whatsapp_group: "",
  receive_generated_campaigns: false,
  receive_errors: false,
  receive_weekly_summary: false,
  delivery_format: "image_caption",
  active: true
};

export async function getGlobalWhatsappSettings() {
  return { ...globalDefaults, ...(await getSettings("global", null)) };
}

export async function updateGlobalWhatsappSettings(input: Record<string, unknown>) {
  const next = { ...(await getGlobalWhatsappSettings()), ...coerceSettings(input) };
  await saveSettings("global", null, true, next);
  return next;
}

export async function getClientWhatsappSettings(clientId: number) {
  return { ...clientDefaults, ...(await getSettings("client", clientId)) };
}

export async function updateClientWhatsappSettings(clientId: number, input: Record<string, unknown>) {
  const next = { ...(await getClientWhatsappSettings(clientId)), ...coerceSettings(input) };
  await saveSettings("client", clientId, Boolean(next.active), next);
  return next;
}

export async function testConnection() {
  const settings = await getGlobalWhatsappSettings();
  assertConfigured(settings);
  const response = await fetch(buildUrl(settings, settings.evolution_connection_endpoint_path), {
    headers: evolutionHeaders(settings)
  });
  const body = await readProviderResponse(response);
  if (!response.ok) throw new Error(providerErrorMessage(response.status, body));
  return body;
}

export async function sendText(to: string, message: string) {
  return sendViaEvolution({ type: "manual_test", recipient: to, message });
}

export async function sendImage(to: string, imageUrl: string, caption: string) {
  return sendViaEvolution({ type: "manual_test", recipient: to, message: caption, mediaUrl: imageUrl });
}

export function sendCampaignCompletedAsync(campaignId: number) {
  void sendCampaignCompleted(campaignId).catch(() => undefined);
}

export async function sendCampaignCompleted(campaignId: number, force = false) {
  const global = await getGlobalWhatsappSettings();
  if (force ? global.whatsapp_delivery_enabled !== true : !enabled(global, "notify_on_campaign_completed")) return null;
  if (!force && await hasDuplicate({ campaignId, type: "campaign_completed" })) return null;

  const campaign = await getCampaignForNotification(campaignId);
  if (!campaign) throw new Error("Campanha nao encontrada.");
  const clientSettings = campaign.client_id ? await getClientWhatsappSettings(Number(campaign.client_id)) : clientDefaults;
  if (!force && (clientSettings.active === false || clientSettings.receive_generated_campaigns === false)) return null;

  const recipient = recipientForClient(clientSettings, global);
  if (!recipient) return null;
  const caption = buildAdCaption(campaign);
  const message = [
    "✅ Criativo gerado com sucesso!",
    "",
    `Cliente: ${campaign.cliente || campaign.client_name || "-"}`,
    `Campanha: ${campaign.objetivo || campaign.oferta || `#${campaign.id}`}`,
    `Tema: ${campaign.oferta || "-"}`,
    "",
    "Legenda:",
    caption,
    "",
    `CTA: ${campaign.strategy?.cta || "-"}`,
    "",
    "Status: aguardando aprovação."
  ].join("\n");

  if (!force && clientSettings.delivery_format === "internal_alert") return null;
  if (!force && clientSettings.delivery_format === "link_only") {
    return sendViaEvolution({
      clientId: Number(campaign.client_id) || null,
      campaignId,
      type: "campaign_completed",
      recipient,
      message: `${message}\n\nAbrir campanha: ${config.frontendOrigin}/campanhas/${campaignId}`
    });
  }
  return sendViaEvolution({
    clientId: Number(campaign.client_id) || null,
    campaignId,
    type: "campaign_completed",
    recipient,
    message,
    mediaUrl: campaign.image_url || campaign.final_image_url || null
  });
}

export function sendCampaignFailedAsync(campaignId: number, error: unknown) {
  void sendCampaignFailed(campaignId, error).catch(() => undefined);
}

export async function sendCampaignFailed(campaignId: number, error: unknown) {
  const global = await getGlobalWhatsappSettings();
  if (!enabled(global, "notify_on_campaign_failed")) return null;
  if (await hasDuplicate({ campaignId, type: "campaign_failed" })) return null;
  const campaign = await getCampaignForNotification(campaignId);
  const recipient = global.default_notification_phone;
  if (!recipient) return null;
  return sendViaEvolution({
    clientId: Number(campaign?.client_id) || null,
    campaignId,
    type: "campaign_failed",
    recipient,
    message: buildErrorMessage({
      clientName: String(campaign?.cliente || campaign?.client_name || "-"),
      planName: String(campaign?.oferta || campaign?.objetivo || `Campanha ${campaignId}`),
      operationType: "campanha",
      agentKey: "-",
      attempt: "-",
      errorMessage: errorMessage(error)
    })
  });
}

export function sendQueueFailedAsync(queueId: number, error: unknown) {
  void sendQueueFailed(queueId, error).catch(() => undefined);
}

export async function sendQueueFailed(queueId: number, error: unknown) {
  const global = await getGlobalWhatsappSettings();
  if (!enabled(global, "notify_on_queue_failed")) return null;
  if (await hasDuplicate({ queueId, type: "queue_failed" })) return null;
  const row = await get<Record<string, unknown>>(
    `SELECT q.*, c.name client_name, p.name plan_name
       FROM campaign_generation_queue q
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN campaign_plans p ON p.id = q.campaign_plan_id
       WHERE q.id = ?`,
    [queueId]
  );
  const recipient = global.default_notification_phone;
  if (!recipient) return null;
  return sendViaEvolution({
    clientId: Number(row?.client_id) || null,
    campaignPlanId: Number(row?.campaign_plan_id) || null,
    queueId,
    type: "queue_failed",
    recipient,
    message: buildErrorMessage({
      clientName: String(row?.client_name || "-"),
      planName: String(row?.plan_name || `Fila ${queueId}`),
      operationType: "rotina_agendada",
      agentKey: "-",
      attempt: `${Number(row?.attempt_count ?? 0)}/${Number(row?.max_attempts ?? 0)}`,
      errorMessage: errorMessage(error)
    })
  });
}

export function sendAgentErrorAsync(agentExecutionLogId: number) {
  void sendAgentError(agentExecutionLogId).catch(() => undefined);
}

export async function sendAgentError(agentExecutionLogId: number) {
  const global = await getGlobalWhatsappSettings();
  if (!enabled(global, "notify_on_agent_error")) return null;
  const row = await get<Record<string, unknown>>(
    `SELECT l.*, a.key agent_key, c.name client_name
       FROM agent_execution_logs l
       LEFT JOIN agents a ON a.id = l.agent_id
       LEFT JOIN clients c ON c.id = l.client_id
       WHERE l.id = ?`,
    [agentExecutionLogId]
  );
  if (!row) throw new Error("Log de agente nao encontrado.");
  if (await hasDuplicate({ campaignId: Number(row.campaign_id) || null, type: "agent_error", queueId: agentExecutionLogId })) return null;
  const recipient = global.default_notification_phone;
  if (!recipient) return null;
  return sendViaEvolution({
    clientId: Number(row.client_id) || null,
    campaignId: Number(row.campaign_id) || null,
    queueId: agentExecutionLogId,
    type: "agent_error",
    recipient,
    message: buildErrorMessage({
      clientName: String(row.client_name || "-"),
      planName: row.campaign_id ? `Campanha ${row.campaign_id}` : "-",
      operationType: "agente",
      agentKey: String(row.agent_key || "-"),
      attempt: "-",
      errorMessage: String(row.error_message || "Erro no agente.")
    })
  });
}

export async function sendDailySummary() {
  const global = await getGlobalWhatsappSettings();
  if (!enabled(global, "notify_on_daily_summary") || !global.default_notification_phone) return null;
  const summary = await get<Record<string, unknown>>(
    `SELECT COUNT(*) campaigns,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) completed,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) failed
       FROM campaign_generation_queue
       WHERE created_at::date = CURRENT_DATE`
  ) ?? {};
  return sendViaEvolution({
    type: "daily_summary",
    recipient: global.default_notification_phone,
    message: `Resumo diario e-Criativo\n\nItens: ${summary.campaigns ?? 0}\nConcluidos: ${summary.completed ?? 0}\nFalhas: ${summary.failed ?? 0}`
  });
}

export async function sendManualTest(message?: string, to?: string) {
  const global = await getGlobalWhatsappSettings();
  const recipient = to || global.default_notification_phone;
  if (!recipient) throw new Error("Configure um numero padrao para teste.");
  return sendViaEvolution({
    type: "manual_test",
    recipient,
    message: message || "Mensagem de teste do e-Criativo via WhatsApp."
  });
}

async function sendViaEvolution(input: SendOptions) {
  const settings = await getGlobalWhatsappSettings();
  if (!settings.whatsapp_delivery_enabled && input.type !== "manual_test") return null;
  assertConfigured(settings);
  const logId = await createNotificationLog(input);
  try {
    const isMedia = Boolean(input.mediaUrl);
    const response = await fetch(buildUrl(settings, isMedia ? settings.evolution_image_endpoint_path : settings.evolution_text_endpoint_path), {
      method: "POST",
      headers: {
        ...evolutionHeaders(settings),
        "content-type": "application/json"
      },
      body: JSON.stringify(isMedia ? await mediaPayload(input) : textPayload(input))
    });
    const providerResponse = await readProviderResponse(response);
    if (!response.ok) throw new Error(providerErrorMessage(response.status, providerResponse));
    await updateNotificationLog(logId, "sent", providerResponse, null);
    return { id: logId, status: "sent", providerResponse };
  } catch (error) {
    await updateNotificationLog(logId, "failed", null, errorMessage(error));
    return { id: logId, status: "failed", error: errorMessage(error) };
  }
}

async function getSettings(scopeType: "global" | "client", scopeId: number | null) {
  const row = await get<{ settings_json: string }>(
    "SELECT settings_json FROM notification_settings WHERE scope_type = ? AND COALESCE(scope_id, 0) = COALESCE(?, 0) AND channel = 'whatsapp'",
    [scopeType, scopeId]
  );
  if (!row) return {};
  try {
    return JSON.parse(row.settings_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function saveSettings(scopeType: "global" | "client", scopeId: number | null, enabled: boolean, settings: Record<string, unknown>) {
  const existing = await get<{ id: number }>(
    "SELECT id FROM notification_settings WHERE scope_type = ? AND COALESCE(scope_id, 0) = COALESCE(?, 0) AND channel = 'whatsapp'",
    [scopeType, scopeId]
  );
  if (existing) {
    await run("UPDATE notification_settings SET enabled = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [enabled, JSON.stringify(settings), existing.id]);
    return;
  }
  await run("INSERT INTO notification_settings (scope_type, scope_id, channel, enabled, settings_json) VALUES (?, ?, 'whatsapp', ?, ?)", [
    scopeType,
    scopeId,
    enabled,
    JSON.stringify(settings)
  ]);
}

function coerceSettings(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (["notify_on_campaign_completed", "notify_on_campaign_failed", "notify_on_queue_failed", "notify_on_agent_error", "notify_on_daily_summary", "whatsapp_delivery_enabled", "receive_generated_campaigns", "receive_errors", "receive_weekly_summary", "active"].includes(key)) {
        return [key, value === true || value === "true" || value === "1" || value === 1];
      }
      return [key, String(value ?? "")];
    })
  );
}

function enabled(settings: Record<string, unknown>, key: string) {
  return settings.whatsapp_delivery_enabled === true && settings[key] === true;
}

function recipientForClient(clientSettings: Record<string, unknown>, global: Record<string, unknown>) {
  return String(clientSettings.whatsapp_group || clientSettings.responsible_phone || global.default_notification_phone || "").trim();
}

function assertConfigured(settings: Record<string, unknown>) {
  if (!settings.evolution_base_url || !settings.evolution_api_key || !settings.evolution_instance_name) {
    throw new Error("Configure URL, API Key e instancia da Evolution API.");
  }
}

function buildUrl(settings: Record<string, unknown>, pathValue: unknown) {
  const base = String(settings.evolution_base_url).replace(/\/+$/, "");
  const path = String(pathValue || "").replace("{instance}", encodeURIComponent(String(settings.evolution_instance_name))).replace(/^\/?/, "/");
  return `${base}${path}`;
}

function evolutionHeaders(settings: Record<string, unknown>) {
  return {
    apikey: String(settings.evolution_api_key),
    authorization: `Bearer ${String(settings.evolution_api_key)}`
  };
}

function textPayload(input: SendOptions) {
  return {
    number: normalizeRecipient(input.recipient),
    text: input.message,
    options: { delay: 1200 }
  };
}

async function mediaPayload(input: SendOptions) {
  const media = await mediaForProvider(input.mediaUrl || "");
  return {
    number: normalizeRecipient(input.recipient),
    mediatype: "image",
    mimetype: "image/png",
    media,
    fileName: "criativo.png",
    caption: input.message,
    options: { delay: 1200 }
  };
}

async function mediaForProvider(mediaUrl: string) {
  const localPath = localMediaPath(mediaUrl);
  if (!localPath) return mediaUrl;
  const buffer = await fs.readFile(localPath);
  return buffer.toString("base64");
}

function localMediaPath(mediaUrl: string) {
  try {
    const url = new URL(mediaUrl);
    const publicBase = new URL(config.publicBaseUrl);
    if (url.origin !== publicBase.origin) return null;
    const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!cleanPath.startsWith("generated/") && !cleanPath.startsWith("uploads/")) return null;
    const candidates = [path.resolve(cleanPath), path.resolve("backend", cleanPath)];
    return candidates.find((candidate) => fsSync.existsSync(candidate)) ?? candidates[0];
  } catch {
    return null;
  }
}

function normalizeRecipient(value: string) {
  return value.replace(/[^\d@g.-]/g, "");
}

async function readProviderResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function providerErrorMessage(status: number, body: unknown) {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401 || status === 403) return `Evolution API recusou autenticacao (${status}).`;
  if (/disconnected|not.*connect/i.test(serialized)) return "Instancia da Evolution API desconectada.";
  if (/number|jid|recipient/i.test(serialized)) return "Numero de WhatsApp invalido ou nao encontrado.";
  return `Evolution API retornou HTTP ${status}: ${serialized.slice(0, 500)}`;
}

async function createNotificationLog(input: SendOptions) {
  const result = await run(
    `INSERT INTO notification_logs (
        client_id, campaign_id, campaign_plan_id, queue_id, notification_type,
        channel, recipient, message, media_url, status
      ) VALUES (?, ?, ?, ?, ?, 'whatsapp', ?, ?, ?, 'pending')`
    ,
    [input.clientId ?? null, input.campaignId ?? null, input.campaignPlanId ?? null, input.queueId ?? null, input.type, input.recipient, input.message, input.mediaUrl ?? null]
  );
  return Number(result.lastInsertRowid);
}

async function updateNotificationLog(id: number, status: "sent" | "failed", providerResponse: unknown, error: string | null) {
  await run(
    `UPDATE notification_logs
     SET status = ?, provider_response_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, providerResponse ? JSON.stringify(providerResponse) : null, error, id]
  );
}

async function hasDuplicate(input: { campaignId?: number | null; queueId?: number | null; type: NotificationType }) {
  if (input.campaignId) {
    const row = await get("SELECT id FROM notification_logs WHERE campaign_id = ? AND notification_type = ? AND status IN ('pending','sent') LIMIT 1", [input.campaignId, input.type]);
    if (row) return true;
  }
  if (input.queueId) {
    const row = await get("SELECT id FROM notification_logs WHERE queue_id = ? AND notification_type = ? AND status IN ('pending','sent') LIMIT 1", [input.queueId, input.type]);
    if (row) return true;
  }
  return false;
}

async function getCampaignForNotification(campaignId: number) {
  const row = await get<Record<string, unknown>>(
    `SELECT c.*, cl.name client_name
       FROM campaigns c
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ?`,
    [campaignId]
  );
  if (!row) return null;
  return {
    ...row,
    strategy: safeJson(String(row.strategist_output_json || row.strategy_json || "{}")),
    creative: safeJson(String(row.creative_output_json || row.creative_json || "{}"))
  } as Record<string, any>;
}

function buildAdCaption(campaign: Record<string, any>) {
  const text = String(campaign.strategy?.texto_principal || campaign.creative?.direcao_visual_resumida || "");
  return text.replace(/^\s*texto principal para an[uú]ncio:\s*/i, "").trim() || text.trim();
}

function buildErrorMessage(input: { clientName: string; planName: string; operationType: string; agentKey: string; attempt: string; errorMessage: string }) {
  return [
    "⚠️ Erro na geração de campanha",
    "",
    `Cliente: ${input.clientName}`,
    `Campanha/Rotina: ${input.planName}`,
    `Etapa: ${input.operationType}`,
    `Agente: ${input.agentKey}`,
    `Tentativa: ${input.attempt}`,
    "",
    "Erro:",
    input.errorMessage,
    "",
    "Ação recomendada:",
    "Verifique a fila de geração no painel."
  ].join("\n");
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Erro desconhecido.");
}
