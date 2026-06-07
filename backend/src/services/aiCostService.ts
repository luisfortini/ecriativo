import { all as dbAll, get, run, toPostgresBoolean } from "../db/connection.js";

export type AiOperationType =
  | "normalizacao_briefing"
  | "estrategista"
  | "criativo"
  | "analise_marca"
  | "geracao_imagem"
  | "rotina_agendada"
  | "reprocessamento"
  | "agente";

interface UsageInput {
  clientId?: number | null;
  campaignId?: number | null;
  campaignPlanId?: number | null;
  queueId?: number | null;
  agentId?: number | null;
  agentKey?: string | null;
  model?: string | null;
  operationType: AiOperationType;
  status: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  imageCount?: number;
  contextCharacters?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  metadata?: unknown;
  sourceLogId?: number | null;
  createdAt?: string;
}

export async function recordAiUsage(input: UsageInput) {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const imageCount = input.imageCount ?? 0;
  const price = await getActiveModelPrice(input.model);
  const inputCost = (inputTokens / 1_000_000) * price.input_price_per_1m_tokens;
  const outputCost = (outputTokens / 1_000_000) * price.output_price_per_1m_tokens;
  const imageCost = imageCount * price.image_price;
  const totalCost = inputCost + outputCost;
  const totalEstimatedCost = totalCost + imageCost;
  const priceSnapshot = JSON.stringify({
    model: input.model ?? "",
    input_price_per_1m_tokens: price.input_price_per_1m_tokens,
    output_price_per_1m_tokens: price.output_price_per_1m_tokens,
    image_price: price.image_price,
    currency: price.currency
  });

  const result = await run(
    `INSERT INTO ai_usage_logs (
        client_id, campaign_id, campaign_plan_id, queue_id, agent_id, agent_key, model,
        operation_type, status, input_tokens, output_tokens, total_tokens,
        input_cost, output_cost, total_cost, image_count, image_cost,
        total_estimated_cost, context_characters, latency_ms, error_message,
        metadata_json, price_snapshot_json, source_log_id, created_at
      ) VALUES (
        @clientId, @campaignId, @campaignPlanId, @queueId, @agentId, @agentKey, @model,
        @operationType, @status, @inputTokens, @outputTokens, @totalTokens,
        @inputCost, @outputCost, @totalCost, @imageCount, @imageCost,
        @totalEstimatedCost, @contextCharacters, @latencyMs, @errorMessage,
        @metadataJson, @priceSnapshot, @sourceLogId, COALESCE(@createdAt, CURRENT_TIMESTAMP)
      )`,
    {
      clientId: input.clientId ?? null,
      campaignId: input.campaignId ?? null,
      campaignPlanId: input.campaignPlanId ?? null,
      queueId: input.queueId ?? null,
      agentId: input.agentId ?? null,
      agentKey: input.agentKey ?? null,
      model: input.model ?? null,
      operationType: input.operationType,
      status: input.status,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      imageCount,
      imageCost,
      totalEstimatedCost,
      contextCharacters: input.contextCharacters ?? 0,
      latencyMs: input.latencyMs ?? null,
      errorMessage: input.errorMessage ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      priceSnapshot,
      sourceLogId: input.sourceLogId ?? null,
      createdAt: input.createdAt ?? null
    }
  );

  return Number(result.lastInsertRowid);
}

export async function updateAiUsageCampaign(ids: Array<number | null | undefined>, campaignId: number) {
  const valid = ids.filter((id): id is number => typeof id === "number");
  if (!valid.length) return;
  await Promise.all(valid.map((id) => run("UPDATE ai_usage_logs SET campaign_id = ? WHERE id = ?", [campaignId, id])));
}

export async function listAiModelPrices() {
  return dbAll("SELECT * FROM ai_model_prices ORDER BY active DESC, model ASC");
}

export async function upsertAiModelPrice(input: Record<string, unknown>) {
  const id = Number(input.id ?? 0);
  const payload = {
    model: String(input.model ?? "").trim(),
    input: Number(input.input_price_per_1m_tokens ?? 0),
    output: Number(input.output_price_per_1m_tokens ?? 0),
    image: Number(input.image_price ?? 0),
    currency: String(input.currency ?? "USD").trim() || "USD",
    active: toPostgresBoolean(input.active)
  };
  if (!payload.model) throw new Error("Informe o modelo.");
  if (id) {
    await run(
      `UPDATE ai_model_prices
       SET model = ?, input_price_per_1m_tokens = ?, output_price_per_1m_tokens = ?,
           image_price = ?, currency = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [payload.model, payload.input, payload.output, payload.image, payload.currency, payload.active, id]
    );
  } else {
    await run(
      `INSERT INTO ai_model_prices (
        model, input_price_per_1m_tokens, output_price_per_1m_tokens, image_price, currency, active
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(model) DO UPDATE SET
        input_price_per_1m_tokens = excluded.input_price_per_1m_tokens,
        output_price_per_1m_tokens = excluded.output_price_per_1m_tokens,
        image_price = excluded.image_price,
        currency = excluded.currency,
        active = excluded.active,
        updated_at = CURRENT_TIMESTAMP`,
      [payload.model, payload.input, payload.output, payload.image, payload.currency, payload.active]
    );
  }
  return listAiModelPrices();
}

export async function getAiCostSettings() {
  const keys = [
    "ai_default_currency",
    "ai_cost_max_per_campaign",
    "ai_cost_max_per_client_month",
    "ai_cost_max_per_routine",
    "ai_cost_limit_mode"
  ];
  const rows = await dbAll<{ key: string; value: string }>(`SELECT key, value FROM app_settings WHERE key IN (${keys.map(() => "?").join(",")})`, keys);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function updateAiCostSettings(input: Record<string, unknown>) {
  const allowed = await getAiCostSettings();
  for (const key of Object.keys(allowed)) {
    if (input[key] !== undefined) {
      await run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(input[key])]
      );
    }
  }
  return getAiCostSettings();
}

export async function getAiCostDashboard(filters: Record<string, unknown>) {
  const where = buildWhere(filters);
  const params = where.params;
  const summary = await one(
    `SELECT
       COALESCE(SUM(total_estimated_cost), 0) total_cost,
       COALESCE(SUM(input_tokens), 0) input_tokens,
       COALESCE(SUM(output_tokens), 0) output_tokens,
       COALESCE(SUM(total_tokens), 0) total_tokens,
       COALESCE(SUM(image_count), 0) image_count,
       COUNT(*) executions,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) error_count,
       SUM(CASE WHEN input_tokens > 10000 OR context_characters > 50000 THEN 1 ELSE 0 END) excessive_context_count,
       COUNT(DISTINCT campaign_id) campaigns,
       COUNT(DISTINCT client_id) clients,
       COUNT(DISTINCT agent_id) agents
     FROM ai_usage_logs u ${where.sql}`,
    params
  );
  const totalCost = Number(summary.total_cost ?? 0);
  const executions = Number(summary.executions ?? 0);

  const topClient = await one(
    `SELECT c.id, c.name, SUM(u.total_estimated_cost) total_cost
     FROM ai_usage_logs u LEFT JOIN clients c ON c.id = u.client_id ${where.sql}
     GROUP BY c.id ORDER BY total_cost DESC LIMIT 1`,
    params
  );
  const topAgent = await one(
    `SELECT u.agent_key, a.name, SUM(u.total_estimated_cost) total_cost
     FROM ai_usage_logs u LEFT JOIN agents a ON a.id = u.agent_id ${where.sql}
     GROUP BY u.agent_key, a.name ORDER BY total_cost DESC LIMIT 1`,
    params
  );
  const largestExecution = await one(`SELECT id, total_tokens, total_estimated_cost FROM ai_usage_logs u ${where.sql} ORDER BY total_tokens DESC LIMIT 1`, params);

  const groups = {
    costByDay: await all(`SELECT created_at::date::text label, SUM(total_estimated_cost) value, SUM(total_tokens) tokens FROM ai_usage_logs u ${where.sql} GROUP BY label ORDER BY label`, params),
    costByClient: await all(`SELECT COALESCE(c.name, 'Sem cliente') label, SUM(u.total_estimated_cost) value FROM ai_usage_logs u LEFT JOIN clients c ON c.id = u.client_id ${where.sql} GROUP BY label ORDER BY value DESC LIMIT 10`, params),
    costByAgent: await all(`SELECT COALESCE(a.name, u.agent_key, 'Sem agente') label, SUM(u.total_estimated_cost) value FROM ai_usage_logs u LEFT JOIN agents a ON a.id = u.agent_id ${where.sql} GROUP BY label ORDER BY value DESC LIMIT 10`, params),
    costByModel: await all(`SELECT COALESCE(model, 'Sem modelo') label, SUM(total_estimated_cost) value FROM ai_usage_logs u ${where.sql} GROUP BY label ORDER BY value DESC LIMIT 10`, params),
    tokensByAgent: await all(`SELECT COALESCE(a.name, u.agent_key, 'Sem agente') label, SUM(u.total_tokens) value FROM ai_usage_logs u LEFT JOIN agents a ON a.id = u.agent_id ${where.sql} GROUP BY label ORDER BY value DESC LIMIT 10`, params),
    campaigns: await all(`SELECT COALESCE(camp.id::text, u.campaign_id::text) label, SUM(u.total_estimated_cost) value FROM ai_usage_logs u LEFT JOIN campaigns camp ON camp.id = u.campaign_id ${whereWith(where, "u.campaign_id IS NOT NULL")} GROUP BY u.campaign_id, camp.id ORDER BY value DESC LIMIT 10`, params),
    routines: await all(`SELECT COALESCE(p.name, 'Sem rotina') label, SUM(u.total_estimated_cost) value FROM ai_usage_logs u LEFT JOIN campaign_plans p ON p.id = u.campaign_plan_id ${whereWith(where, "u.campaign_plan_id IS NOT NULL")} GROUP BY u.campaign_plan_id, p.name ORDER BY value DESC LIMIT 10`, params)
  };

  const rankings = {
    clients: await all(`SELECT c.id, c.name label, SUM(u.total_estimated_cost) total_cost, SUM(u.total_tokens) total_tokens FROM ai_usage_logs u JOIN clients c ON c.id = u.client_id ${where.sql} GROUP BY c.id ORDER BY total_cost DESC LIMIT 10`, params),
    campaigns: await all(`SELECT u.campaign_id id, COALESCE(c.cliente, 'Campanha ' || u.campaign_id::text) label, SUM(u.total_estimated_cost) total_cost, SUM(u.total_tokens) total_tokens FROM ai_usage_logs u LEFT JOIN campaigns c ON c.id = u.campaign_id ${whereWith(where, "u.campaign_id IS NOT NULL")} GROUP BY u.campaign_id, c.cliente ORDER BY total_cost DESC LIMIT 10`, params),
    agents: await all(`SELECT u.agent_id id, COALESCE(a.name, u.agent_key) label, SUM(u.total_estimated_cost) total_cost, SUM(u.total_tokens) total_tokens FROM ai_usage_logs u LEFT JOIN agents a ON a.id = u.agent_id ${where.sql} GROUP BY u.agent_id, u.agent_key, a.name ORDER BY total_cost DESC LIMIT 10`, params),
    executions: await all(`SELECT u.id, COALESCE(c.name, 'Sem cliente') client_name, u.agent_key, u.operation_type, u.total_estimated_cost, u.total_tokens, u.created_at FROM ai_usage_logs u LEFT JOIN clients c ON c.id = u.client_id ${where.sql} ORDER BY u.total_estimated_cost DESC, u.total_tokens DESC LIMIT 10`, params),
    routines: await all(`SELECT u.campaign_plan_id id, COALESCE(p.name, 'Rotina ' || u.campaign_plan_id::text) label, SUM(u.total_estimated_cost) total_cost, SUM(u.total_tokens) total_tokens FROM ai_usage_logs u LEFT JOIN campaign_plans p ON p.id = u.campaign_plan_id ${whereWith(where, "u.campaign_plan_id IS NOT NULL")} GROUP BY u.campaign_plan_id, p.name ORDER BY total_cost DESC LIMIT 10`, params)
  };

  const logs = await all(
    `SELECT u.*, c.name client_name, a.name agent_name, p.name plan_name
     FROM ai_usage_logs u
     LEFT JOIN clients c ON c.id = u.client_id
     LEFT JOIN agents a ON a.id = u.agent_id
     LEFT JOIN campaign_plans p ON p.id = u.campaign_plan_id
     ${where.sql}
     ORDER BY u.created_at DESC
     LIMIT 300`,
    params
  );

  return {
    summary: {
      ...summary,
      avg_cost_per_campaign: divide(totalCost, Number(summary.campaigns ?? 0)),
      avg_cost_per_client: divide(totalCost, Number(summary.clients ?? 0)),
      avg_cost_per_agent: divide(totalCost, Number(summary.agents ?? 0)),
      avg_cost_per_image: divide(Number(summary.image_count ?? 0) ? sumField(logs, "image_cost") : 0, Number(summary.image_count ?? 0)),
      error_rate: executions ? Number(summary.error_count ?? 0) / executions : 0,
      top_client: topClient,
      top_agent: topAgent,
      largest_execution: largestExecution
    },
    groups,
    rankings,
    insights: buildInsights(summary, groups),
    alerts: await buildAlerts(summary, groups, rankings),
    logs
  };
}

export async function getAiUsageDetail(id: number) {
  return get(
    `SELECT u.*, c.name client_name, camp.cliente campaign_name, a.name agent_name, p.name plan_name
       FROM ai_usage_logs u
       LEFT JOIN clients c ON c.id = u.client_id
       LEFT JOIN campaigns camp ON camp.id = u.campaign_id
       LEFT JOIN agents a ON a.id = u.agent_id
       LEFT JOIN campaign_plans p ON p.id = u.campaign_plan_id
       WHERE u.id = ?`,
    [id]
  );
}

export async function exportAiUsage(format: string, filters: Record<string, unknown>) {
  const data = (await getAiCostDashboard(filters)).logs as Record<string, unknown>[];
  if (format === "json") return { contentType: "application/json", body: JSON.stringify(data, null, 2), filename: "ai-usage.json" };
  const headers = [
    "id",
    "created_at",
    "client_name",
    "campaign_id",
    "plan_name",
    "agent_key",
    "model",
    "operation_type",
    "status",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "total_estimated_cost",
    "image_count",
    "context_characters",
    "latency_ms",
    "error_message"
  ];
  const csv = [headers.join(","), ...data.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
  return {
    contentType: format === "excel" ? "application/vnd.ms-excel" : "text/csv",
    body: csv,
    filename: format === "excel" ? "ai-usage.xls" : "ai-usage.csv"
  };
}

async function getActiveModelPrice(model?: string | null) {
  const row = model ? await get<PriceRow>("SELECT * FROM ai_model_prices WHERE model = ? AND active = TRUE ORDER BY updated_at DESC LIMIT 1", [model]) : undefined;
  return row ?? ({ input_price_per_1m_tokens: 0, output_price_per_1m_tokens: 0, image_price: 0, currency: "USD" } as PriceRow);
}

function buildWhere(filters: Record<string, unknown>) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, string> = {
    client_id: "u.client_id",
    campaign_id: "u.campaign_id",
    campaign_plan_id: "u.campaign_plan_id",
    queue_id: "u.queue_id",
    agent_id: "u.agent_id",
    model: "u.model",
    status: "u.status",
    operation_type: "u.operation_type"
  };
  if (filters.start_date) {
    clauses.push("u.created_at::date >= ?::date");
    params.push(filters.start_date);
  }
  if (filters.end_date) {
    clauses.push("u.created_at::date <= ?::date");
    params.push(filters.end_date);
  }
  Object.entries(map).forEach(([key, column]) => {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  });
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function all(sql: string, params: unknown[]) {
  return dbAll<Record<string, unknown>>(sql, params);
}

async function one(sql: string, params: unknown[]) {
  return (await get<Record<string, unknown>>(sql, params)) ?? {};
}

function whereWith(where: { sql: string }, condition: string) {
  return where.sql ? `${where.sql} AND ${condition}` : `WHERE ${condition}`;
}

function divide(value: number, divisor: number) {
  return divisor ? value / divisor : 0;
}

function sumField(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

function buildInsights(summary: Record<string, unknown>, groups: Record<string, Record<string, unknown>[]>) {
  const insights: string[] = [];
  const clientCosts = groups.costByClient ?? [];
  const avgClient = divide(sumField(clientCosts, "value"), clientCosts.length);
  const topClient = clientCosts[0];
  if (topClient && avgClient > 0 && Number(topClient.value) > avgClient * 1.2) {
    insights.push(`Este cliente consumiu ${Math.round((Number(topClient.value) / avgClient - 1) * 100)}% mais custo que a media dos clientes filtrados.`);
  }
  const agentCosts = groups.costByAgent ?? [];
  const creative = agentCosts.find((item) => String(item.label).toLowerCase().includes("criativo"));
  const strategist = agentCosts.find((item) => String(item.label).toLowerCase().includes("estrategista"));
  if (creative && strategist && Number(creative.value) > Number(strategist.value)) insights.push("O agente criativo esta consumindo mais que o estrategista.");
  if (Number(summary.excessive_context_count ?? 0) > 0) insights.push("Ha execucoes com contexto excessivo no periodo.");
  const imageCost = Number(summary.image_count ?? 0) > 0 ? "Grande parte do custo pode vir de imagens se o preco por imagem estiver configurado." : "";
  if (imageCost) insights.push(imageCost);
  if (Number(summary.input_tokens ?? 0) + Number(summary.output_tokens ?? 0) > 0) insights.push("Grande parte do custo textual vem dos prompts e respostas registrados nos agentes.");
  return insights;
}

async function buildAlerts(summary: Record<string, unknown>, groups: Record<string, Record<string, unknown>[]>, rankings: Record<string, Record<string, unknown>[]>) {
  const alerts: string[] = [];
  if (Number(summary.excessive_context_count ?? 0) > 0) alerts.push("Execucao acima de 10k tokens de entrada ou contexto muito grande detectada.");
  if (Number(summary.error_count ?? 0) > 0) alerts.push("Ha erros recorrentes que podem consumir tokens.");
  const settings = await getAiCostSettings();
  const routineLimit = Number(settings.ai_cost_max_per_routine ?? 0);
  if (routineLimit && (rankings.routines ?? []).some((item) => Number(item.total_cost ?? 0) > routineLimit)) alerts.push("Rotina consumindo mais que o limite configurado.");
  const clientLimit = Number(settings.ai_cost_max_per_client_month ?? 0);
  if (clientLimit && (groups.costByClient ?? []).some((item) => Number(item.value ?? 0) > clientLimit)) alerts.push("Cliente com custo acima do esperado.");
  return alerts;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface PriceRow {
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
  image_price: number;
  currency: string;
}
