import { all, get, run } from "../db/connection.js";
import type { CampaignFormat } from "../types.js";
import { createCampaign, setCampaignCreativeStatus } from "./campaignService.js";
import { getClient } from "./clientService.js";
import { sendQueueFailedAsync } from "./whatsappNotificationService.js";

type RecurrenceType = "once" | "daily" | "weekly" | "biweekly" | "monthly";
type PlanStatus = "draft" | "active" | "paused" | "completed";
type ApprovalMode = "draft" | "waiting_review" | "approved";

interface PlanInput {
  name: string;
  theme: string;
  strategic_description?: string;
  objective: string;
  start_date: string;
  end_date: string;
  recurrence_type: RecurrenceType;
  recurrence_days?: number[];
  preferred_time?: string;
  ads_per_client: number;
  ad_format: CampaignFormat;
  max_ads_per_day: number;
  max_ads_per_hour: number;
  min_interval_minutes: number;
  approval_mode: ApprovalMode;
  variation_mode: string;
  status: PlanStatus;
  clients: Array<{ client_id: number; ads_quantity?: number }>;
}

const variations = ["emocional", "oportunidade", "autoridade", "promocional", "educativo", "sazonal", "institucional"];
let running = 0;

export async function listPlans() {
  return all(
    `SELECT p.*, COUNT(DISTINCT pc.client_id) AS clients_count,
              COUNT(q.id) AS queue_count,
              SUM(CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
       FROM campaign_plans p
       LEFT JOIN campaign_plan_clients pc ON pc.campaign_plan_id = p.id
       LEFT JOIN campaign_generation_queue q ON q.campaign_plan_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
  );
}

export async function getPlan(id: number) {
  const plan = await get<Record<string, unknown>>("SELECT * FROM campaign_plans WHERE id = ?", [id]);
  if (!plan) return null;
  return {
    ...plan,
    clients: await all(
      `SELECT pc.*, c.name, c.segment
         FROM campaign_plan_clients pc
         JOIN clients c ON c.id = pc.client_id
         WHERE pc.campaign_plan_id = ?
         ORDER BY c.name`,
      [id]
    ),
    queue: await listQueue({ planId: id }),
    logs: await listGenerationLogs({ planId: id })
  };
}

export async function createPlan(input: PlanInput) {
  const result = await run(
    `INSERT INTO campaign_plans (
        name, theme, strategic_description, objective, start_date, end_date, recurrence_type,
        recurrence_days_json, preferred_time, ads_per_client, ad_format, max_ads_per_day,
        max_ads_per_hour, min_interval_minutes, approval_mode, variation_mode, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.theme,
      input.strategic_description ?? null,
      input.objective,
      input.start_date,
      input.end_date,
      input.recurrence_type,
      JSON.stringify(input.recurrence_days ?? []),
      input.preferred_time ?? null,
      input.ads_per_client,
      input.ad_format,
      input.max_ads_per_day,
      input.max_ads_per_hour,
      input.min_interval_minutes,
      input.approval_mode,
      input.variation_mode,
      input.status
    ]
  );
  const id = Number(result.lastInsertRowid);
  await savePlanClients(id, input.clients, input.ads_per_client);
  if (input.status === "active") await activatePlan(id);
  return getPlan(id);
}

export async function updatePlan(id: number, input: PlanInput) {
  await run(
    `UPDATE campaign_plans SET
      name = ?, theme = ?, strategic_description = ?, objective = ?, start_date = ?, end_date = ?,
      recurrence_type = ?, recurrence_days_json = ?, preferred_time = ?, ads_per_client = ?,
      ad_format = ?, max_ads_per_day = ?, max_ads_per_hour = ?, min_interval_minutes = ?,
      approval_mode = ?, variation_mode = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.name,
      input.theme,
      input.strategic_description ?? null,
      input.objective,
      input.start_date,
      input.end_date,
      input.recurrence_type,
      JSON.stringify(input.recurrence_days ?? []),
      input.preferred_time ?? null,
      input.ads_per_client,
      input.ad_format,
      input.max_ads_per_day,
      input.max_ads_per_hour,
      input.min_interval_minutes,
      input.approval_mode,
      input.variation_mode,
      input.status,
      id
    ]
  );
  await run("DELETE FROM campaign_plan_clients WHERE campaign_plan_id = ?", [id]);
  await savePlanClients(id, input.clients, input.ads_per_client);
  return getPlan(id);
}

export async function activatePlan(id: number) {
  const plan = await get<PlannerPlan>("SELECT * FROM campaign_plans WHERE id = ?", [id]);
  if (!plan) throw new Error("Planejamento nao encontrado.");
  await run("UPDATE campaign_plans SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  const existing = await get<{ total: number }>("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE campaign_plan_id = ?", [id]);
  if (Number(existing?.total ?? 0) === 0) await createQueueForPlan(plan);
  await logPlan(null, id, null, "active", "Planejamento ativado e fila criada.");
  return getPlan(id);
}

export async function pausePlan(id: number) {
  await run("UPDATE campaign_plans SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  await logPlan(null, id, null, "paused", "Planejamento pausado.");
  return getPlan(id);
}

export async function resumePlan(id: number) {
  await run("UPDATE campaign_plans SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  await logPlan(null, id, null, "active", "Planejamento retomado.");
  return getPlan(id);
}

export async function cancelPending(id: number) {
  await run("UPDATE campaign_generation_queue SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'pending'", [id]);
  await logPlan(null, id, null, "cancelled", "Itens pendentes cancelados.");
  return getPlan(id);
}

export async function retryFailures(id: number) {
  await run("UPDATE campaign_generation_queue SET status = 'pending', error_message = NULL, scheduled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'failed'", [id]);
  await logPlan(null, id, null, "retry", "Falhas reenfileiradas.");
  return getPlan(id);
}

export async function generateNow(id: number) {
  await run("UPDATE campaign_generation_queue SET scheduled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'pending'", [id]);
  await logPlan(null, id, null, "generate_now", "Itens pendentes reagendados para agora.");
  return getPlan(id);
}

export async function reprocessQueueItem(id: number) {
  await run("UPDATE campaign_generation_queue SET status = 'pending', scheduled_at = CURRENT_TIMESTAMP, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  return get("SELECT * FROM campaign_generation_queue WHERE id = ?", [id]);
}

export async function listQueue(filters?: { planId?: number }) {
  if (filters?.planId) {
    return all(
      `SELECT q.*, c.name AS client_name, p.theme, p.name AS plan_name
         FROM campaign_generation_queue q
         JOIN clients c ON c.id = q.client_id
         JOIN campaign_plans p ON p.id = q.campaign_plan_id
         WHERE q.campaign_plan_id = ?
         ORDER BY q.scheduled_at ASC`,
      [filters.planId]
    );
  }
  return all(
    `SELECT q.*, c.name AS client_name, p.theme, p.name AS plan_name
       FROM campaign_generation_queue q
       JOIN clients c ON c.id = q.client_id
       JOIN campaign_plans p ON p.id = q.campaign_plan_id
       ORDER BY q.scheduled_at ASC
       LIMIT 300`
  );
}

export async function listGenerationLogs(filters?: { planId?: number }) {
  if (filters?.planId) {
    return all("SELECT * FROM campaign_generation_logs WHERE campaign_plan_id = ? ORDER BY created_at DESC LIMIT 200", [filters.planId]);
  }
  return all("SELECT * FROM campaign_generation_logs ORDER BY created_at DESC LIMIT 300");
}

export async function processDueQueue() {
  const settings = await getSettings();
  if (settings.queue_worker_enabled !== "true") return;
  await recoverStaleProcessingItems();
  const maxConcurrent = Number(settings.max_concurrent_generations ?? 1);
  const processingInDatabase = await get<{ total: number }>("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE status = 'processing'");
  const slots = Math.max(0, maxConcurrent - Math.max(running, Number(processingInDatabase?.total ?? 0)));
  if (slots <= 0) return;

  const items = await all<QueueItem>(
    `SELECT q.*
       FROM campaign_generation_queue q
       JOIN campaign_plans p ON p.id = q.campaign_plan_id
       WHERE q.status = 'pending'
         AND q.scheduled_at <= CURRENT_TIMESTAMP
         AND p.status = 'active'
       ORDER BY q.priority ASC, q.scheduled_at ASC
       LIMIT ?`,
    [slots]
  );

  await Promise.all(items.map((item) => processQueueItem(item)));
}

async function recoverStaleProcessingItems() {
  const staleItems = await all<{ id: number; campaign_plan_id: number; client_id: number }>(
    `SELECT id, campaign_plan_id, client_id
       FROM campaign_generation_queue
       WHERE status = 'processing'
         AND started_at <= CURRENT_TIMESTAMP - INTERVAL '10 minutes'`
  );

  if (staleItems.length === 0) return;

  await Promise.all(staleItems.map(async (item) => {
    await run(
      `UPDATE campaign_generation_queue
       SET status = 'pending',
           error_message = 'Processamento anterior expirou e foi reenfileirado automaticamente.',
           scheduled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [item.id]
    );
    await logPlan(item.id, item.campaign_plan_id, item.client_id, "retry", "Item em processamento expirado reenfileirado automaticamente.");
  }));
}

async function processQueueItem(item: QueueItem) {
  running += 1;
  const started = new Date().toISOString();
  try {
    await run("UPDATE campaign_generation_queue SET status = 'processing', started_at = ?, attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      started,
      item.id
    ]);
    const plan = await get<PlannerPlan>("SELECT * FROM campaign_plans WHERE id = ?", [item.campaign_plan_id]);
    if (!plan) throw new Error("Planejamento nao encontrado.");
    const client = await getClient(item.client_id);
    if (!client) throw new Error("Cliente nao encontrado.");

    const history = await all(
      `SELECT strategist_output_json, creative_output_json, created_at
         FROM campaigns
         WHERE client_id = ? AND free_briefing LIKE ?
         ORDER BY created_at DESC
         LIMIT 8`,
      [item.client_id, `%${plan.theme}%`]
    );

    const campaign = await createCampaign(
      {
        client_id: item.client_id,
        free_briefing: buildAutoBriefing(plan, item, history),
        objetivo: plan.objective,
        oferta: plan.theme,
        formato: plan.ad_format as CampaignFormat,
        observacoes: `Gerado pelo planejamento ${plan.name}. Variacao desejada: ${item.variation_type || plan.variation_mode}.`
      },
      undefined,
      {
        campaignPlanId: item.campaign_plan_id,
        queueId: item.id,
        reprocess: item.attempt_count > 0
      }
    );

    if (!campaign) throw new Error("Campanha nao retornada.");
    const creativeStatus = plan.approval_mode === "draft" ? "draft" : plan.approval_mode === "approved" ? "approved" : "waiting_review";
    await setCampaignCreativeStatus(campaign.id, creativeStatus);
    await run("UPDATE campaign_generation_queue SET status = 'completed', finished_at = ?, generated_campaign_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      new Date().toISOString(),
      campaign.id,
      item.id
    ]);
    await logPlan(item.id, item.campaign_plan_id, item.client_id, "completed", "Campanha gerada com sucesso.", { campaign_id: campaign.id });
    await completePlanIfDone(item.campaign_plan_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar fila.";
    const current = (await get<{ attempt_count: number; max_attempts: number }>(
      "SELECT attempt_count, max_attempts FROM campaign_generation_queue WHERE id = ?",
      [item.id]
    )) ?? { attempt_count: item.attempt_count + 1, max_attempts: item.max_attempts };
    const failed = current.attempt_count >= current.max_attempts;
    const delay = Math.pow(2, Math.max(0, current.attempt_count - 1)) * 5;
    await run(
      `UPDATE campaign_generation_queue
       SET status = ?, error_message = ?, scheduled_at = CURRENT_TIMESTAMP + ?::interval, finished_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [failed ? "failed" : "pending", message, `${delay} minutes`, failed ? new Date().toISOString() : null, item.id]
    );
    await logPlan(item.id, item.campaign_plan_id, item.client_id, failed ? "failed" : "retry", message, { next_retry_minutes: failed ? null : delay });
    if (failed) sendQueueFailedAsync(item.id, error);
  } finally {
    running -= 1;
  }
}

async function savePlanClients(planId: number, clients: PlanInput["clients"], defaultQuantity: number) {
  await Promise.all(clients.map((item) => run(
    "INSERT INTO campaign_plan_clients (campaign_plan_id, client_id, ads_quantity) VALUES (?, ?, ?)",
    [planId, item.client_id, item.ads_quantity || defaultQuantity]
  )));
}

async function createQueueForPlan(plan: PlannerPlan) {
  const clients = await all<{
    client_id: number;
    ads_quantity: number;
  }>("SELECT * FROM campaign_plan_clients WHERE campaign_plan_id = ?", [plan.id]);
  const schedule = buildSchedule(plan, clients.reduce((sum, item) => sum + item.ads_quantity, 0));
  const retryAttempts = Number((await getSettings()).default_retry_attempts ?? 3);
  let index = 0;
  for (const client of clients) {
    for (let i = 0; i < client.ads_quantity; i += 1) {
      await run(
        `INSERT INTO campaign_generation_queue (
          campaign_plan_id, client_id, scheduled_at, priority, max_attempts, variation_type
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [plan.id, client.client_id, schedule[index]?.toISOString() ?? new Date().toISOString(), 5, retryAttempts, variations[index % variations.length]]
      );
      index += 1;
    }
  }
}

function buildSchedule(plan: PlannerPlan, total: number) {
  const start = combineDateAndTime(plan.start_date, plan.preferred_time);
  const end = new Date(`${plan.end_date}T23:59:59`);
  const dates: Date[] = [];
  let cursor = new Date(Math.max(start.getTime(), Date.now()));
  const minInterval = Math.max(1, plan.min_interval_minutes || 5);
  const maxDay = Math.max(1, plan.max_ads_per_day || 5);
  const maxHour = Math.max(1, plan.max_ads_per_hour || 1);
  const allowedDays = safeArray(plan.recurrence_days_json);
  const dayCount = new Map<string, number>();
  const hourCount = new Map<string, number>();

  while (dates.length < total && cursor <= end) {
    if (isAllowedByRecurrence(cursor, plan, allowedDays)) {
      const dayKey = cursor.toISOString().slice(0, 10);
      const hourKey = cursor.toISOString().slice(0, 13);
      if ((dayCount.get(dayKey) ?? 0) < maxDay && (hourCount.get(hourKey) ?? 0) < maxHour) {
        dates.push(new Date(cursor));
        dayCount.set(dayKey, (dayCount.get(dayKey) ?? 0) + 1);
        hourCount.set(hourKey, (hourCount.get(hourKey) ?? 0) + 1);
      }
    }
    cursor = new Date(cursor.getTime() + minInterval * 60 * 1000);
  }
  return dates;
}

function isAllowedByRecurrence(date: Date, plan: PlannerPlan, allowedDays: number[]) {
  if (allowedDays.length && !allowedDays.includes(date.getDay())) return false;
  if (plan.recurrence_type === "once") return date.toISOString().slice(0, 10) === plan.start_date;
  if (plan.recurrence_type === "daily") return true;
  const diffDays = Math.floor((date.getTime() - new Date(`${plan.start_date}T00:00:00`).getTime()) / 86400000);
  if (plan.recurrence_type === "weekly") return diffDays % 7 === 0 || allowedDays.length > 0;
  if (plan.recurrence_type === "biweekly") return diffDays % 14 === 0 || allowedDays.length > 0;
  if (plan.recurrence_type === "monthly") return date.getDate() === new Date(`${plan.start_date}T00:00:00`).getDate();
  return true;
}

function buildAutoBriefing(plan: PlannerPlan, item: QueueItem, history: unknown[]) {
  return [
    `Planejamento: ${plan.name}`,
    `Tema: ${plan.theme}`,
    `Descricao estrategica: ${plan.strategic_description || "nao informada"}`,
    `Objetivo: ${plan.objective}`,
    `Variacao desejada: ${item.variation_type || plan.variation_mode}`,
    "Crie uma variacao nova e evite repetir headline, angulo, composicao visual, CTA e estilo de imagem.",
    `Historico recente do mesmo tema: ${JSON.stringify(history).slice(0, 6000)}`
  ].join("\n");
}

async function getSettings() {
  return Object.fromEntries((await all<{ key: string; value: string }>("SELECT key, value FROM app_settings")).map((row) => [row.key, row.value]));
}

async function logPlan(queueId: number | null, planId: number | null, clientId: number | null, status: string, message: string, metadata?: unknown) {
  await run("INSERT INTO campaign_generation_logs (queue_id, campaign_plan_id, client_id, status, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?)", [
    queueId,
    planId,
    clientId,
    status,
    message,
    metadata ? JSON.stringify(metadata) : null
  ]);
}

async function completePlanIfDone(planId: number) {
  const pending = await get<{ total: number }>("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE campaign_plan_id = ? AND status IN ('pending', 'processing')", [planId]);
  if (Number(pending?.total ?? 0) === 0) await run("UPDATE campaign_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [planId]);
}

function safeArray(value: string | null) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

function combineDateAndTime(date: string, time?: string | null) {
  return new Date(`${date}T${time || "09:00"}:00`);
}

interface PlannerPlan {
  id: number;
  name: string;
  theme: string;
  strategic_description: string | null;
  objective: string;
  start_date: string;
  end_date: string;
  recurrence_type: RecurrenceType;
  recurrence_days_json: string | null;
  preferred_time: string | null;
  ads_per_client: number;
  ad_format: string;
  max_ads_per_day: number;
  max_ads_per_hour: number;
  min_interval_minutes: number;
  approval_mode: ApprovalMode;
  variation_mode: string;
  status: PlanStatus;
}

interface QueueItem {
  id: number;
  campaign_plan_id: number;
  client_id: number;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  variation_type: string | null;
}
