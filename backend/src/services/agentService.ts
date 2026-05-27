import OpenAI from "openai";
import type { ResponseTextConfig } from "openai/resources/responses/responses";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import type { AgentExecutionLog, AgentKey, AgentRecord, AgentVersionRecord } from "../types.js";

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs }) : null;

type AgentPayload = Omit<AgentRecord, "id" | "created_at" | "updated_at"> & { change_notes?: string };

export function listAgents() {
  return db.prepare("SELECT * FROM agents ORDER BY execution_order ASC, name ASC").all() as AgentRecord[];
}

export function getAgent(id: number) {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRecord | undefined;
  if (!agent) return null;
  return {
    ...agent,
    versions: getAgentVersions(id),
    logs: getAgentLogs(id, 25)
  };
}

export function getActiveAgent(key: AgentKey) {
  const agent = db.prepare("SELECT * FROM agents WHERE key = ? AND is_active = 1 ORDER BY execution_order ASC LIMIT 1").get(key) as
    | AgentRecord
    | undefined;
  if (!agent) throw new Error(`Agente ativo nao encontrado: ${key}`);
  return agent;
}

export function createAgent(payload: AgentPayload) {
  parseSchema(payload.output_schema_json);
  const result = db
    .prepare(
      `INSERT INTO agents (
        name, key, description, role, model, temperature, max_tokens,
        system_prompt, prompt_template, output_schema_json, is_active, execution_order
      ) VALUES (
        @name, @key, @description, @role, @model, @temperature, @max_tokens,
        @system_prompt, @prompt_template, @output_schema_json, @is_active, @execution_order
      )`
    )
    .run(cleanAgent(payload));
  const id = Number(result.lastInsertRowid);
  createVersion(id, payload.change_notes || "Versao inicial");
  return getAgent(id);
}

export function updateAgent(id: number, payload: AgentPayload) {
  parseSchema(payload.output_schema_json);
  db.prepare(
    `UPDATE agents SET
      name = @name,
      key = @key,
      description = @description,
      role = @role,
      model = @model,
      temperature = @temperature,
      max_tokens = @max_tokens,
      system_prompt = @system_prompt,
      prompt_template = @prompt_template,
      output_schema_json = @output_schema_json,
      is_active = @is_active,
      execution_order = @execution_order,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id`
  ).run({ id, ...cleanAgent(payload) });
  createVersion(id, payload.change_notes || "Alteracao salva pela Central de Agentes");
  return getAgent(id);
}

export function duplicateAgent(id: number) {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRecord | undefined;
  if (!agent) throw new Error("Agente nao encontrado.");
  return createAgent({
    ...agent,
    key: `${agent.key}_copy_${Date.now()}`,
    name: `${agent.name} (copia)`,
    is_active: 0,
    execution_order: agent.execution_order + 10,
    change_notes: `Duplicado de ${agent.name}`
  });
}

export function restoreAgentVersion(agentId: number, versionId: number) {
  const version = db.prepare("SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?").get(versionId, agentId) as
    | AgentVersionRecord
    | undefined;
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRecord | undefined;
  if (!version || !agent) throw new Error("Versao nao encontrada.");

  return updateAgent(agentId, {
    ...agent,
    name: version.name,
    system_prompt: version.system_prompt,
    prompt_template: version.prompt_template,
    output_schema_json: version.output_schema_json,
    model: version.model,
    temperature: version.temperature,
    max_tokens: version.max_tokens,
    change_notes: `Restaurado da versao ${version.version_number}`
  });
}

export function getAgentVersions(agentId: number) {
  return db.prepare("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC").all(agentId) as AgentVersionRecord[];
}

export function getAgentLogs(agentId: number, limit = 100) {
  return db
    .prepare("SELECT * FROM agent_execution_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(agentId, limit) as AgentExecutionLog[];
}

export function compareAgentVersion(agentId: number, versionId: number) {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRecord | undefined;
  const version = db.prepare("SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?").get(versionId, agentId) as
    | AgentVersionRecord
    | undefined;
  if (!agent || !version) throw new Error("Versao nao encontrada.");

  return {
    current: agent,
    version,
    changed_fields: ["name", "system_prompt", "prompt_template", "output_schema_json", "model", "temperature", "max_tokens"].filter(
      (field) => String((agent as unknown as Record<string, unknown>)[field] ?? "") !== String((version as unknown as Record<string, unknown>)[field] ?? "")
    )
  };
}

export async function executeAgentByKey<T>(key: AgentKey, context: unknown, options?: { campaignId?: number | null; clientId?: number | null }) {
  return executeAgent<T>(getActiveAgent(key), context, options);
}

export async function executeAgent<T>(agent: AgentRecord, context: unknown, options?: { campaignId?: number | null; clientId?: number | null }) {
  const schema = parseSchema(agent.output_schema_json);
  const input = buildAgentInput(agent, context);
  const started = Date.now();
  let outputRaw = "";
  let parsed: T | null = null;
  let status = "success";
  let errorMessage: string | null = null;
  let tokensInput: number | null = null;
  let tokensOutput: number | null = null;

  try {
    if (!client) {
      parsed = localAgentResponse<T>(agent.key, context);
      outputRaw = JSON.stringify(parsed, null, 2);
    } else {
      const response = await callOpenAI(agent, input.prompt, schema, false);
      outputRaw = response.output_text;
      try {
        parsed = JSON.parse(outputRaw) as T;
      } catch (parseError) {
        if (!agent.max_tokens || !isLikelyTruncatedJson(parseError)) throw parseError;
        const retry = await callOpenAI(agent, input.prompt, schema, true);
        outputRaw = retry.output_text;
        parsed = JSON.parse(outputRaw) as T;
      }
      const usage = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      tokensInput = usage?.input_tokens ?? null;
      tokensOutput = usage?.output_tokens ?? null;
    }

    const validationErrors = validateAgainstSchema(parsed, schema);
    if (validationErrors.length) {
      throw new Error(validationErrors.join("; "));
    }
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : "Erro ao executar agente.";
    throw error;
  } finally {
    saveExecutionLog({
      agentId: agent.id,
      campaignId: options?.campaignId ?? null,
      clientId: options?.clientId ?? null,
      inputJson: JSON.stringify(input, null, 2),
      outputRaw,
      outputParsedJson: parsed ? JSON.stringify(parsed, null, 2) : null,
      status,
      errorMessage,
      tokensInput,
      tokensOutput,
      latencyMs: Date.now() - started
    });
  }

  return { agent, input, outputRaw, parsed: parsed as T, schema_errors: [] as string[] };
}

export async function testAgent(agentId: number, context: unknown, clientId?: number | null) {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRecord | undefined;
  if (!agent) throw new Error("Agente nao encontrado.");
  try {
    return await executeAgent(agent, context, { clientId: clientId ?? null });
  } catch (error) {
    return {
      agent,
      input: buildAgentInput(agent, context),
      outputRaw: "",
      parsed: null,
      schema_errors: [error instanceof Error ? error.message : "Erro ao testar agente."]
    };
  }
}

function createVersion(agentId: number, changeNotes: string) {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRecord;
  const current = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM agent_versions WHERE agent_id = ?").get(agentId) as {
    next: number;
  };
  db.prepare(
    `INSERT INTO agent_versions (
      agent_id, version_number, name, system_prompt, prompt_template, output_schema_json,
      model, temperature, max_tokens, change_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    agentId,
    current.next,
    agent.name,
    agent.system_prompt,
    agent.prompt_template,
    agent.output_schema_json,
    agent.model,
    agent.temperature,
    agent.max_tokens,
    changeNotes
  );
}

function saveExecutionLog(input: {
  agentId: number;
  campaignId: number | null;
  clientId: number | null;
  inputJson: string;
  outputRaw: string | null;
  outputParsedJson: string | null;
  status: string;
  errorMessage: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  latencyMs: number;
}) {
  db.prepare(
    `INSERT INTO agent_execution_logs (
      agent_id, campaign_id, client_id, input_json, output_raw, output_parsed_json,
      status, error_message, tokens_input, tokens_output, latency_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.agentId,
    input.campaignId,
    input.clientId,
    input.inputJson,
    input.outputRaw,
    input.outputParsedJson,
    input.status,
    input.errorMessage,
    input.tokensInput,
    input.tokensOutput,
    input.latencyMs
  );
}

function buildAgentInput(agent: AgentRecord, context: unknown) {
  const contextJson = JSON.stringify(context, null, 2);
  return {
    system_prompt: agent.system_prompt,
    prompt: agent.prompt_template
      .replaceAll("{{context_json}}", contextJson)
      .replaceAll("{{agent_key}}", agent.key)
      .replaceAll("{{agent_name}}", agent.name),
    context
  };
}

function jsonFormat(name: string, schema: { [key: string]: unknown }): ResponseTextConfig {
  return {
    format: {
      type: "json_schema",
      name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
      schema,
      strict: true
    }
  };
}

function callOpenAI(agent: AgentRecord, prompt: string, schema: { [key: string]: unknown }, omitOutputLimit: boolean) {
  if (!client) throw new Error("OpenAI nao configurada.");
  return client.responses.create({
    model: agent.model,
    input: [
      { role: "system", content: agent.system_prompt },
      { role: "user", content: prompt }
    ],
    text: jsonFormat(`agent_${agent.key}`, schema),
    ...(supportsTemperature(agent.model) && agent.temperature !== null ? { temperature: agent.temperature } : {}),
    ...(!omitOutputLimit && agent.max_tokens ? { max_output_tokens: agent.max_tokens } : {})
  } as never);
}

function isLikelyTruncatedJson(error: unknown) {
  if (!(error instanceof SyntaxError)) return false;
  return /unterminated|unexpected end|bad control character/i.test(error.message);
}

function parseSchema(value: string) {
  const parsed = JSON.parse(value) as { [key: string]: unknown };
  if (parsed.type !== "object") throw new Error("output_schema_json deve ser um JSON Schema de objeto.");
  return parsed;
}

function validateAgainstSchema(value: unknown, schema: { [key: string]: unknown }) {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Resposta nao e um objeto JSON."];
  const object = value as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  required.forEach((field) => {
    if (object[field] === undefined || object[field] === null || object[field] === "") errors.push(`Campo obrigatorio ausente: ${field}`);
  });
  return errors;
}

function localAgentResponse<T>(key: string, context: unknown) {
  const data = context as {
    briefing_normalizado?: Record<string, unknown>;
    estrategia?: Record<string, unknown>;
    offer?: string;
    target_audience?: string;
    objective?: string;
    client?: {
      name?: string;
      segment?: string | null;
      brand_voice?: string | null;
      color_palette?: string | null;
      target_audience?: string | null;
    };
    format?: string;
    brand_voice?: string;
    preferred_ctas?: string;
    color_palette?: string;
    approved_styles?: string;
    forbidden_styles?: string;
    assets?: Array<{ type: string; file_url: string }>;
    sources?: Array<{ text?: string; type?: string; url?: string }>;
    uploaded_materials?: Array<{ type: string; description?: string | null; user_feedback?: string | null }>;
  };

  if (key === "brand_analyzer_agent") {
    const sourceText = data.sources?.map((source) => source.text ?? "").join(" ").slice(0, 800) ?? "";
    const materials = data.uploaded_materials?.map((asset) => `${asset.type} ${asset.description ?? ""} ${asset.user_feedback ?? ""}`).join("; ") ?? "";
    return {
      brand_voice: data.client?.brand_voice || inferFromText(sourceText, "consultivo, claro e profissional"),
      positioning: `Marca percebida como ${data.client?.segment || "negocio"} com comunicacao voltada a clareza e confianca.`,
      target_audience: data.client?.target_audience || "Publico provavel identificado a partir dos materiais enviados.",
      color_palette: data.client?.color_palette ? data.client.color_palette.split(",").map((item) => item.trim()) : ["cores principais a confirmar"],
      visual_style: materials || "Estilo visual a confirmar com mais referencias; usar composicao limpa, legivel e consistente.",
      content_patterns: ["apresentacao de oferta", "prova visual da marca", "chamadas diretas"],
      common_ctas: ["Saiba mais", "Fale conosco", "Solicite uma proposta"],
      recurring_words: sourceText.split(/\s+/).filter((word) => word.length > 5).slice(0, 8),
      approved_style_suggestions: ["Manter elementos visuais consistentes com materiais aprovados", "Priorizar clareza e hierarquia"],
      forbidden_style_suggestions: ["Evitar estilos marcados como reprovados", "Evitar poluicao visual e textos pequenos"],
      strategic_notes: "Analise local gerada com base nos dados disponiveis; revisar antes de aplicar ao perfil.",
      confidence_score: sourceText || materials ? 0.55 : 0.25,
      missing_information: sourceText || materials ? [] : ["Informe site, Instagram ou materiais de referencia para aumentar a confianca."]
    } as T;
  }

  if (key === "creative_agent") {
    const briefing = data.briefing_normalizado ?? data;
    const strategy = data.estrategia ?? {};
    return {
      prompt_imagem: `${String(strategy.briefing_criativo ?? "Criativo publicitario")}. Direcao visual alinhada a ${String(briefing.brand_voice ?? "marca")}, paleta ${String(briefing.color_palette ?? "institucional")}, assets ${(briefing.assets as Array<{ type: string; file_url: string }> | undefined)?.map((asset) => `${asset.type}: ${asset.file_url}`).join(", ") || "nenhum"}.`,
      negative_prompt: `baixa resolucao, texto distorcido, logos inventados, ${(briefing as Record<string, unknown>).forbidden_colors ?? ""}, ${(briefing as Record<string, unknown>).forbidden_styles ?? ""}`,
      direcao_visual_resumida: `Estilo visual baseado no briefing criativo e na memoria do cliente.`
    } as T;
  }

  return {
    angulo: `Transformar ${String(data.offer ?? "a oferta")} em decisao simples para ${String(data.target_audience ?? "o publico")}.`,
    publico: String(data.target_audience ?? "publico de teste"),
    promessa: `Ajudar ${String(data.target_audience ?? "o publico")} a avancar em ${String(data.objective ?? "seu objetivo")}.`,
    headline: `${String(data.offer ?? "Oferta")} para ${String(data.client?.segment ?? data.client?.name ?? "o cliente")}`,
    texto_principal: `Campanha alinhada a memoria criativa do cliente e ao briefing atual.`,
    cta: (String(data.preferred_ctas || "Conheca a oferta").split("\n")[0] || "Conheca a oferta").replace(/^- /, ""),
    briefing_criativo: `Anuncio ${String(data.format ?? "1:1")} com paleta ${String(data.color_palette ?? "da marca")} e estilos aprovados ${String(data.approved_styles ?? "nao informados")}.`
  } as T;
}

function inferFromText(text: string, fallback: string) {
  return text.trim() ? fallback : fallback;
}

function cleanAgent(payload: AgentPayload) {
  return {
    name: payload.name,
    key: payload.key,
    description: payload.description ?? null,
    role: payload.role ?? null,
    model: payload.model,
    temperature: payload.temperature ?? null,
    max_tokens: payload.max_tokens ?? null,
    system_prompt: payload.system_prompt,
    prompt_template: payload.prompt_template,
    output_schema_json: payload.output_schema_json,
    is_active: payload.is_active ? 1 : 0,
    execution_order: payload.execution_order ?? 1
  };
}

function supportsTemperature(model: string) {
  const normalized = model.toLowerCase();
  return !normalized.startsWith("gpt-5") && !normalized.startsWith("o");
}
