import { db } from "../db/connection.js";
import type { CampaignFormat } from "../types.js";
import { createCampaign, setCampaignCreativeStatus } from "./campaignService.js";
import { getClient } from "./clientService.js";

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

export function listPlans() {
  return db
    .prepare(
      `SELECT p.*, COUNT(DISTINCT pc.client_id) AS clients_count,
              COUNT(q.id) AS queue_count,
              SUM(CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
       FROM campaign_plans p
       LEFT JOIN campaign_plan_clients pc ON pc.campaign_plan_id = p.id
       LEFT JOIN campaign_generation_queue q ON q.campaign_plan_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    )
    .all();
}

export function getPlan(id: number) {
  const plan = db.prepare("SELECT * FROM campaign_plans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!plan) return null;
  return {
    ...plan,
    clients: db
      .prepare(
        `SELECT pc.*, c.name, c.segment
         FROM campaign_plan_clients pc
         JOIN clients c ON c.id = pc.client_id
         WHERE pc.campaign_plan_id = ?
         ORDER BY c.name`
      )
      .all(id),
    queue: listQueue({ planId: id }),
    logs: listGenerationLogs({ planId: id })
  };
}

export function createPlan(input: PlanInput) {
  const result = db
    .prepare(
      `INSERT INTO campaign_plans (
        name, theme, strategic_description, objective, start_date, end_date, recurrence_type,
        recurrence_days_json, preferred_time, ads_per_client, ad_format, max_ads_per_day,
        max_ads_per_hour, min_interval_minutes, approval_mode, variation_mode, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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
    );
  const id = Number(result.lastInsertRowid);
  savePlanClients(id, input.clients, input.ads_per_client);
  if (input.status === "active") activatePlan(id);
  return getPlan(id);
}

export function updatePlan(id: number, input: PlanInput) {
  db.prepare(
    `UPDATE campaign_plans SET
      name = ?, theme = ?, strategic_description = ?, objective = ?, start_date = ?, end_date = ?,
      recurrence_type = ?, recurrence_days_json = ?, preferred_time = ?, ads_per_client = ?,
      ad_format = ?, max_ads_per_day = ?, max_ads_per_hour = ?, min_interval_minutes = ?,
      approval_mode = ?, variation_mode = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
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
  );
  db.prepare("DELETE FROM campaign_plan_clients WHERE campaign_plan_id = ?").run(id);
  savePlanClients(id, input.clients, input.ads_per_client);
  return getPlan(id);
}

export function activatePlan(id: number) {
  const plan = db.prepare("SELECT * FROM campaign_plans WHERE id = ?").get(id) as PlannerPlan | undefined;
  if (!plan) throw new Error("Planejamento nao encontrado.");
  db.prepare("UPDATE campaign_plans SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  const existing = db.prepare("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE campaign_plan_id = ?").get(id) as { total: number };
  if (existing.total === 0) createQueueForPlan(plan);
  logPlan(null, id, null, "active", "Planejamento ativado e fila criada.");
  return getPlan(id);
}

export function pausePlan(id: number) {
  db.prepare("UPDATE campaign_plans SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  logPlan(null, id, null, "paused", "Planejamento pausado.");
  return getPlan(id);
}

export function resumePlan(id: number) {
  db.prepare("UPDATE campaign_plans SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  logPlan(null, id, null, "active", "Planejamento retomado.");
  return getPlan(id);
}

export function cancelPending(id: number) {
  db.prepare("UPDATE campaign_generation_queue SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'pending'").run(id);
  logPlan(null, id, null, "cancelled", "Itens pendentes cancelados.");
  return getPlan(id);
}

export function retryFailures(id: number) {
  db.prepare(
    "UPDATE campaign_generation_queue SET status = 'pending', error_message = NULL, scheduled_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'failed'"
  ).run(id);
  logPlan(null, id, null, "retry", "Falhas reenfileiradas.");
  return getPlan(id);
}

export function generateNow(id: number) {
  db.prepare("UPDATE campaign_generation_queue SET scheduled_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE campaign_plan_id = ? AND status = 'pending'").run(id);
  logPlan(null, id, null, "generate_now", "Itens pendentes reagendados para agora.");
  return getPlan(id);
}

export function reprocessQueueItem(id: number) {
  db.prepare(
    "UPDATE campaign_generation_queue SET status = 'pending', scheduled_at = datetime('now'), error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(id);
  return db.prepare("SELECT * FROM campaign_generation_queue WHERE id = ?").get(id);
}

export function listQueue(filters?: { planId?: number }) {
  if (filters?.planId) {
    return db
      .prepare(
        `SELECT q.*, c.name AS client_name, p.theme, p.name AS plan_name
         FROM campaign_generation_queue q
         JOIN clients c ON c.id = q.client_id
         JOIN campaign_plans p ON p.id = q.campaign_plan_id
         WHERE q.campaign_plan_id = ?
         ORDER BY datetime(q.scheduled_at) ASC`
      )
      .all(filters.planId);
  }
  return db
    .prepare(
      `SELECT q.*, c.name AS client_name, p.theme, p.name AS plan_name
       FROM campaign_generation_queue q
       JOIN clients c ON c.id = q.client_id
       JOIN campaign_plans p ON p.id = q.campaign_plan_id
       ORDER BY datetime(q.scheduled_at) ASC
       LIMIT 300`
    )
    .all();
}

export function listGenerationLogs(filters?: { planId?: number }) {
  if (filters?.planId) {
    return db.prepare("SELECT * FROM campaign_generation_logs WHERE campaign_plan_id = ? ORDER BY created_at DESC LIMIT 200").all(filters.planId);
  }
  return db.prepare("SELECT * FROM campaign_generation_logs ORDER BY created_at DESC LIMIT 300").all();
}

export async function processDueQueue() {
  const settings = getSettings();
  if (settings.queue_worker_enabled !== "true") return;
  recoverStaleProcessingItems();
  const maxConcurrent = Number(settings.max_concurrent_generations ?? 1);
  const processingInDatabase = db
    .prepare("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE status = 'processing'")
    .get() as { total: number };
  const slots = Math.max(0, maxConcurrent - Math.max(running, processingInDatabase.total));
  if (slots <= 0) return;

  const items = db
    .prepare(
      `SELECT q.*
       FROM campaign_generation_queue q
       JOIN campaign_plans p ON p.id = q.campaign_plan_id
       WHERE q.status = 'pending'
         AND datetime(q.scheduled_at) <= datetime('now')
         AND p.status = 'active'
       ORDER BY q.priority ASC, datetime(q.scheduled_at) ASC
       LIMIT ?`
    )
    .all(slots) as QueueItem[];

  await Promise.all(items.map((item) => processQueueItem(item)));
}

function recoverStaleProcessingItems() {
  const staleItems = db
    .prepare(
      `SELECT id, campaign_plan_id, client_id
       FROM campaign_generation_queue
       WHERE status = 'processing'
         AND datetime(started_at) <= datetime('now', '-10 minutes')`
    )
    .all() as Array<{ id: number; campaign_plan_id: number; client_id: number }>;

  if (staleItems.length === 0) return;

  const update = db.prepare(
    `UPDATE campaign_generation_queue
     SET status = 'pending',
         error_message = 'Processamento anterior expirou e foi reenfileirado automaticamente.',
         scheduled_at = datetime('now'),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  staleItems.forEach((item) => {
    update.run(item.id);
    logPlan(item.id, item.campaign_plan_id, item.client_id, "retry", "Item em processamento expirado reenfileirado automaticamente.");
  });
}

async function processQueueItem(item: QueueItem) {
  running += 1;
  const started = new Date().toISOString();
  try {
    db.prepare("UPDATE campaign_generation_queue SET status = 'processing', started_at = ?, attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      started,
      item.id
    );
    const plan = db.prepare("SELECT * FROM campaign_plans WHERE id = ?").get(item.campaign_plan_id) as PlannerPlan;
    const client = getClient(item.client_id);
    if (!client) throw new Error("Cliente nao encontrado.");

    const history = db
      .prepare(
        `SELECT strategist_output_json, creative_output_json, created_at
         FROM campaigns
         WHERE client_id = ? AND free_briefing LIKE ?
         ORDER BY created_at DESC
         LIMIT 8`
      )
      .all(item.client_id, `%${plan.theme}%`);

    const campaign = await createCampaign({
      client_id: item.client_id,
      free_briefing: buildAutoBriefing(plan, item, history),
      objetivo: plan.objective,
      oferta: plan.theme,
      formato: plan.ad_format as CampaignFormat,
      observacoes: `Gerado pelo planejamento ${plan.name}. Variacao desejada: ${item.variation_type || plan.variation_mode}.`
    });

    if (!campaign) throw new Error("Campanha nao retornada.");
    const creativeStatus = plan.approval_mode === "draft" ? "draft" : plan.approval_mode === "approved" ? "approved" : "waiting_review";
    setCampaignCreativeStatus(campaign.id, creativeStatus);
    db.prepare(
      "UPDATE campaign_generation_queue SET status = 'completed', finished_at = ?, generated_campaign_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(new Date().toISOString(), campaign.id, item.id);
    logPlan(item.id, item.campaign_plan_id, item.client_id, "completed", "Campanha gerada com sucesso.", { campaign_id: campaign.id });
    completePlanIfDone(item.campaign_plan_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar fila.";
    const current = db.prepare("SELECT attempt_count, max_attempts FROM campaign_generation_queue WHERE id = ?").get(item.id) as {
      attempt_count: number;
      max_attempts: number;
    };
    const failed = current.attempt_count >= current.max_attempts;
    const delay = Math.pow(2, Math.max(0, current.attempt_count - 1)) * 5;
    db.prepare(
      `UPDATE campaign_generation_queue
       SET status = ?, error_message = ?, scheduled_at = datetime('now', ?), finished_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(failed ? "failed" : "pending", message, `+${delay} minutes`, failed ? new Date().toISOString() : null, item.id);
    logPlan(item.id, item.campaign_plan_id, item.client_id, failed ? "failed" : "retry", message, { next_retry_minutes: failed ? null : delay });
  } finally {
    running -= 1;
  }
}

function savePlanClients(planId: number, clients: PlanInput["clients"], defaultQuantity: number) {
  const stmt = db.prepare("INSERT INTO campaign_plan_clients (campaign_plan_id, client_id, ads_quantity) VALUES (?, ?, ?)");
  clients.forEach((item) => stmt.run(planId, item.client_id, item.ads_quantity || defaultQuantity));
}

function createQueueForPlan(plan: PlannerPlan) {
  const clients = db.prepare("SELECT * FROM campaign_plan_clients WHERE campaign_plan_id = ?").all(plan.id) as Array<{
    client_id: number;
    ads_quantity: number;
  }>;
  const schedule = buildSchedule(plan, clients.reduce((sum, item) => sum + item.ads_quantity, 0));
  const retryAttempts = Number(getSettings().default_retry_attempts ?? 3);
  const stmt = db.prepare(
    `INSERT INTO campaign_generation_queue (
      campaign_plan_id, client_id, scheduled_at, priority, max_attempts, variation_type
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  let index = 0;
  clients.forEach((client) => {
    for (let i = 0; i < client.ads_quantity; i += 1) {
      stmt.run(plan.id, client.client_id, schedule[index]?.toISOString() ?? new Date().toISOString(), 5, retryAttempts, variations[index % variations.length]);
      index += 1;
    }
  });
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

function getSettings() {
  return Object.fromEntries(db.prepare("SELECT key, value FROM app_settings").all().map((row) => [(row as { key: string; value: string }).key, (row as { key: string; value: string }).value]));
}

function logPlan(queueId: number | null, planId: number | null, clientId: number | null, status: string, message: string, metadata?: unknown) {
  db.prepare(
    "INSERT INTO campaign_generation_logs (queue_id, campaign_plan_id, client_id, status, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(queueId, planId, clientId, status, message, metadata ? JSON.stringify(metadata) : null);
}

function completePlanIfDone(planId: number) {
  const pending = db
    .prepare("SELECT COUNT(*) AS total FROM campaign_generation_queue WHERE campaign_plan_id = ? AND status IN ('pending', 'processing')")
    .get(planId) as { total: number };
  if (pending.total === 0) db.prepare("UPDATE campaign_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(planId);
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
