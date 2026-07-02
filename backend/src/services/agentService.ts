import OpenAI from "openai";
import type { ResponseTextConfig } from "openai/resources/responses/responses";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { config } from "../config.js";
import {
  CREATIVE_BRIEF_SCHEMA_VERSION,
  CREATIVE_OUTPUT_SCHEMA_VERSION,
  PROFILE_DIAGNOSTIC_SCHEMA_VERSION,
  resolveContractSchema,
  validateAgentContractBinding
} from "../contracts/index.js";
import { all, get, run, toPostgresBoolean } from "../db/connection.js";
import type { AgentExecutionLog, AgentKey, AgentRecord, AgentVersionRecord } from "../types.js";
import { recordAiUsage, type AiOperationType } from "./aiCostService.js";
import { sendAgentErrorAsync } from "./whatsappNotificationService.js";

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs }) : null;

type AgentPayload = Omit<
  AgentRecord,
  "id" | "created_at" | "updated_at" | "is_active" | "contract_key" | "contract_version"
> & { is_active: boolean | number; change_notes?: string };

type AgentExecutionOptions = {
  campaignId?: number | null;
  clientId?: number | null;
  campaignPlanId?: number | null;
  queueId?: number | null;
  pipelineRunId?: number | null;
  stepKey?: string | null;
  operationType?: AiOperationType;
};

export async function listAgents() {
  return all<AgentRecord>("SELECT * FROM agents ORDER BY execution_order ASC, name ASC");
}

export async function getAgent(id: number) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [id]);
  if (!agent) return null;
  return {
    ...agent,
    versions: await getAgentVersions(id),
    logs: await getAgentLogs(id, 25)
  };
}

export async function getActiveAgent(key: AgentKey) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE key = ? AND is_active = TRUE ORDER BY execution_order ASC LIMIT 1", [key]);
  if (!agent) throw new Error(`Agente ativo nao encontrado: ${key}`);
  return agent;
}

export async function createAgent(payload: AgentPayload) {
  parseSchema(payload.output_schema_json);
  const result = await run(
    `INSERT INTO agents (
        name, key, description, role, model, temperature, max_tokens,
        system_prompt, prompt_template, output_schema_json, is_active, execution_order
      ) VALUES (
        @name, @key, @description, @role, @model, @temperature, @max_tokens,
        @system_prompt, @prompt_template, @output_schema_json, @is_active, @execution_order
      )`,
    cleanAgent(payload)
  );
  const id = Number(result.lastInsertRowid);
  await createVersion(id, payload.change_notes || "Versao inicial");
  return getAgent(id);
}

export async function updateAgent(id: number, payload: AgentPayload) {
  const current = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [id]);
  if (!current) throw new Error("Agente nao encontrado.");
  const outputSchemaJson = current.contract_key && current.contract_version
    ? JSON.stringify(validateAgentContractBinding(current.key, current.contract_key, current.contract_version), null, 2)
    : payload.output_schema_json;
  parseSchema(outputSchemaJson);
  await run(
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
    WHERE id = @id`,
    { id, ...cleanAgent(payload, outputSchemaJson) }
  );
  await createVersion(id, payload.change_notes || "Alteracao salva pela Central de Agentes");
  return getAgent(id);
}

export async function duplicateAgent(id: number) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [id]);
  if (!agent) throw new Error("Agente nao encontrado.");
  return createAgent({
    ...agent,
    key: `${agent.key}_copy_${Date.now()}`,
    name: `${agent.name} (copia)`,
    is_active: false,
    execution_order: agent.execution_order + 10,
    change_notes: `Duplicado de ${agent.name}`
  });
}

export async function restoreAgentVersion(agentId: number, versionId: number) {
  const version = await get<AgentVersionRecord>("SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?", [versionId, agentId]);
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [agentId]);
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

export async function getAgentVersions(agentId: number) {
  return all<AgentVersionRecord>("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC", [agentId]);
}

export async function getAgentLogs(agentId: number, limit = 100) {
  return all<AgentExecutionLog>("SELECT * FROM agent_execution_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?", [agentId, limit]);
}

export async function compareAgentVersion(agentId: number, versionId: number) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [agentId]);
  const version = await get<AgentVersionRecord>("SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?", [versionId, agentId]);
  if (!agent || !version) throw new Error("Versao nao encontrada.");

  return {
    current: agent,
    version,
    changed_fields: ["name", "system_prompt", "prompt_template", "output_schema_json", "model", "temperature", "max_tokens"].filter(
      (field) => String((agent as unknown as Record<string, unknown>)[field] ?? "") !== String((version as unknown as Record<string, unknown>)[field] ?? "")
    )
  };
}

export async function executeAgentByKey<T>(
  key: AgentKey,
  context: unknown,
  options?: AgentExecutionOptions
) {
  return executeAgent<T>(await getActiveAgent(key), context, options);
}

export async function executeAgent<T>(
  agent: AgentRecord,
  context: unknown,
  options?: AgentExecutionOptions
) {
  const schema = resolveAgentSchema(agent);
  const agentVersionId = await getCurrentAgentVersionId(agent.id);
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
      let usage = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      try {
        parsed = JSON.parse(outputRaw) as T;
      } catch (parseError) {
        if (!agent.max_tokens || !isLikelyTruncatedJson(parseError)) throw parseError;
        const retry = await callOpenAI(agent, input.prompt, schema, true);
        outputRaw = retry.output_text;
        parsed = JSON.parse(outputRaw) as T;
        usage = retry.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      }
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
    const saved = await saveExecutionLog({
      agentId: agent.id,
      agentKey: agent.key,
      model: agent.model,
      campaignId: options?.campaignId ?? null,
      clientId: options?.clientId ?? null,
      campaignPlanId: options?.campaignPlanId ?? null,
      queueId: options?.queueId ?? null,
      pipelineRunId: options?.pipelineRunId ?? null,
      agentVersionId,
      stepKey: options?.stepKey ?? null,
      operationType: options?.operationType ?? operationTypeForAgent(agent.key),
      inputJson: JSON.stringify(input, null, 2),
      outputRaw,
      outputParsedJson: parsed ? JSON.stringify(parsed, null, 2) : null,
      status,
      errorMessage,
      tokensInput,
      tokensOutput,
      contextChars: input.context_chars,
      latencyMs: Date.now() - started
    });
    (input as typeof input & { execution_log_id?: number; ai_usage_log_id?: number }).execution_log_id = saved.executionLogId;
    (input as typeof input & { execution_log_id?: number; ai_usage_log_id?: number }).ai_usage_log_id = saved.aiUsageLogId;
  }

  return {
    agent,
    input,
    outputRaw,
    parsed: parsed as T,
    schema_errors: [] as string[],
    execution_log_id: (input as typeof input & { execution_log_id?: number }).execution_log_id,
    ai_usage_log_id: (input as typeof input & { ai_usage_log_id?: number }).ai_usage_log_id,
    agent_version_id: agentVersionId
  };
}

export async function testAgent(agentId: number, context: unknown, clientId?: number | null) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [agentId]);
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

async function createVersion(agentId: number, changeNotes: string) {
  const agent = await get<AgentRecord>("SELECT * FROM agents WHERE id = ?", [agentId]);
  if (!agent) throw new Error("Agente nao encontrado.");
  const current = await get<{ next: number }>("SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM agent_versions WHERE agent_id = ?", [agentId]) as {
    next: number;
  };
  await run(
    `INSERT INTO agent_versions (
      agent_id, version_number, name, system_prompt, prompt_template, output_schema_json,
      model, temperature, max_tokens, change_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ]
  );
}

async function saveExecutionLog(input: {
  agentId: number;
  agentKey: string;
  model: string;
  campaignId: number | null;
  clientId: number | null;
  campaignPlanId: number | null;
  queueId: number | null;
  pipelineRunId: number | null;
  agentVersionId: number | null;
  stepKey: string | null;
  operationType: AiOperationType;
  inputJson: string;
  outputRaw: string | null;
  outputParsedJson: string | null;
  status: string;
  errorMessage: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  contextChars: number;
  latencyMs: number;
}) {
  const totalTokens = (input.tokensInput ?? 0) + (input.tokensOutput ?? 0);
  const contextWarning = input.tokensInput && input.tokensInput > 10000 ? "contexto excessivo" : null;
  const result = await run(
    `INSERT INTO agent_execution_logs (
      agent_id, campaign_id, client_id, input_json, output_raw, output_parsed_json,
      status, error_message, tokens_input, tokens_output, total_tokens, context_chars, tamanho_contexto_caracteres,
      agent_key, context_warning, latency_ms, pipeline_run_id, agent_version_id, step_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      totalTokens || null,
      input.contextChars,
      input.contextChars,
      input.agentKey,
      contextWarning,
      input.latencyMs,
      input.pipelineRunId,
      input.agentVersionId,
      input.stepKey
    ]
  );
  const executionLogId = Number(result.lastInsertRowid);
  const aiUsageLogId = await recordAiUsage({
    clientId: input.clientId,
    campaignId: input.campaignId,
    campaignPlanId: input.campaignPlanId,
    queueId: input.queueId,
    agentId: input.agentId,
    agentKey: input.agentKey,
    model: input.model,
    operationType: input.operationType,
    status: input.status,
    inputTokens: input.tokensInput,
    outputTokens: input.tokensOutput,
    contextCharacters: input.contextChars,
    latencyMs: input.latencyMs,
    errorMessage: input.errorMessage,
    sourceLogId: executionLogId,
    metadata: { context_warning: contextWarning }
  });
  if (input.status === "error") sendAgentErrorAsync(executionLogId);
  return { executionLogId, aiUsageLogId };
}

function operationTypeForAgent(key: string): AiOperationType {
  if (key === "strategist_agent") return "estrategista";
  if (key === "creative_agent") return "criativo";
  if (key === "brand_analyzer_agent") return "analise_marca";
  return "agente";
}

function buildAgentInput(agent: AgentRecord, context: unknown) {
  const compactContext = compactContextForPrompt(context);
  const contextJson = JSON.stringify(compactContext);
  return {
    system_prompt: agent.system_prompt,
    prompt: agent.prompt_template
      .replaceAll("{{context_json}}", contextJson)
      .replaceAll("{{agent_key}}", agent.key)
      .replaceAll("{{agent_name}}", agent.name),
    context: compactContext,
    context_chars: contextJson.length
  };
}

export function compactContextForPrompt(context: unknown): unknown {
  return compactValue(context, { key: "", depth: 0 });
}

function compactValue(value: unknown, meta: { key: string; depth: number }): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") return truncatePromptString(value, limitForKey(meta.key));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const maxItems = arrayLimitForKey(meta.key);
    return value
      .slice(0, maxItems)
      .map((item) => compactValue(item, { key: meta.key, depth: meta.depth + 1 }))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  if (meta.depth > 6) return undefined;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["brand_analyses", "campaigns", "logs", "raw_ai_output_json", "extracted_text", "extracted_images_json"].includes(key))
      .map(([key, item]) => [key, compactValue(item, { key, depth: meta.depth + 1 })] as const)
      .filter(([, item]) => item !== undefined && !(Array.isArray(item) && item.length === 0) && !isEmptyObject(item))
  );
}

function limitForKey(key: string) {
  if (key === "brand_memory_summary" || key === "resumo_memoria_marca" || key === "aprendizados_recentes") return 1500;
  if (key === "briefing_criativo") return 2500;
  if (key === "estrategia_objetiva") return 4000;
  if (key === "resumo") return 500;
  if (key.includes("prompt")) return 1800;
  return 900;
}

function arrayLimitForKey(key: string) {
  if (key.includes("campanhas")) return 3;
  if (key.includes("aprovadas") || key.includes("reprovadas")) return 5;
  if (key === "paleta" || key === "elementos_visuais" || key === "evitar") return 8;
  return 10;
}

function truncatePromptString(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function isPlainObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEmptyObject(value: unknown) {
  return isPlainObject(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

function jsonFormat(name: string, schema: TSchema): ResponseTextConfig {
  return {
    format: {
      type: "json_schema",
      name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
      schema,
      strict: true
    }
  };
}

function callOpenAI(agent: AgentRecord, prompt: string, schema: TSchema, omitOutputLimit: boolean) {
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
  const parsed = JSON.parse(value) as TSchema;
  if (parsed.type !== "object") throw new Error("output_schema_json deve ser um JSON Schema de objeto.");
  return parsed;
}

function resolveAgentSchema(agent: AgentRecord): TSchema {
  if (Boolean(agent.contract_key) !== Boolean(agent.contract_version)) {
    throw new Error(`Vinculo de contrato incompleto para o agente ${agent.key}.`);
  }
  if (agent.contract_key && agent.contract_version) {
    return validateAgentContractBinding(agent.key, agent.contract_key, agent.contract_version);
  }
  return parseSchema(agent.output_schema_json);
}

async function getCurrentAgentVersionId(agentId: number) {
  const version = await get<{ id: number }>(
    "SELECT id FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC LIMIT 1",
    [agentId]
  );
  return version ? Number(version.id) : null;
}

function validateAgainstSchema(value: unknown, schema: TSchema) {
  if (Value.Check(schema, value)) return [];
  return [...Value.Errors(schema, value)]
    .slice(0, 10)
    .map((error) => `${error.path || "/"}: ${error.message}`);
}

function localAgentResponse<T>(key: string, context: unknown) {
  const data = context as {
    briefing_normalizado?: Record<string, unknown>;
    estrategia?: Record<string, unknown>;
    estrategia_objetiva?: Record<string, unknown>;
    creative_brief?: Record<string, unknown>;
    profile_diagnostic?: Record<string, unknown>;
    client_prompt_context?: Record<string, unknown>;
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
      schemaVersion: PROFILE_DIAGNOSTIC_SCHEMA_VERSION,
      brandVoice: data.client?.brand_voice || inferFromText(sourceText, "consultivo, claro e profissional"),
      positioning: `Marca percebida como ${data.client?.segment || "negocio"} com comunicacao voltada a clareza e confianca.`,
      targetAudience: data.client?.target_audience || "Publico provavel identificado a partir dos materiais enviados.",
      colorPalette: data.client?.color_palette ? data.client.color_palette.split(",").map((item) => item.trim()) : ["cores principais a confirmar"],
      visualStyle: materials || "Estilo visual a confirmar com mais referencias; usar composicao limpa, legivel e consistente.",
      contentPatterns: ["apresentacao de oferta", "prova visual da marca", "chamadas diretas"],
      commonCtas: ["Saiba mais", "Fale conosco", "Solicite uma proposta"],
      recurringWords: sourceText.split(/\s+/).filter((word) => word.length > 5).slice(0, 8),
      approvedStyleSuggestions: ["Manter elementos visuais consistentes com materiais aprovados", "Priorizar clareza e hierarquia"],
      forbiddenStyleSuggestions: ["Evitar estilos marcados como reprovados", "Evitar poluicao visual e textos pequenos"],
      strategicNotes: "Analise local gerada com base nos dados disponiveis; revisar antes de aplicar ao perfil.",
      confidenceScore: sourceText || materials ? 0.55 : 0.25,
      missingInformation: sourceText || materials ? [] : ["Informe site, Instagram ou materiais de referencia para aumentar a confianca."]
    } as T;
  }

  if (key === "creative_agent") {
    const brief = (data.creative_brief ?? data.estrategia_objetiva ?? data.estrategia ?? {}) as Record<string, unknown>;
    const visual = isObject(brief.visualDirection) ? brief.visualDirection : {};
    return {
      schemaVersion: CREATIVE_OUTPUT_SCHEMA_VERSION,
      imagePrompt: `${String(brief.imageInstructions ?? "Criativo publicitario")}. Conceito: ${String(visual.concept ?? "")}. Composicao: ${String(visual.composition ?? "")}.`,
      negativePrompt: `baixa resolucao, texto distorcido, logos inventados, ${listText(brief.restrictions)}, ${listText(visual.avoid)}`,
      visualDirectionSummary: String(visual.concept ?? "Estilo visual baseado no Creative Brief e na memoria do cliente."),
      brandOverlay: {
        logoRequired: true,
        preferredPosition: "bottom_right",
        sizePercent: 14
      }
    } as T;
  }

  const briefing = (data.briefing_normalizado ?? data) as Record<string, unknown>;
  const promptContext = isObject(briefing.client_prompt_context) ? briefing.client_prompt_context : data.client_prompt_context ?? {};
  const targetAudience = String(briefing.target_audience ?? promptContext.publico_alvo_principal ?? data.target_audience ?? "publico de teste");
  const objective = String(briefing.objective ?? data.objective ?? "gerar interesse pela oferta");
  const offer = String(briefing.offer ?? data.offer ?? "Oferta");
  const restrictions = splitList(briefing.restrictions ?? promptContext.restricoes_comunicacao);
  const forbiddenStyles = splitList(briefing.forbidden_styles ?? promptContext.estilo_visual_proibido);
  return {
    schemaVersion: CREATIVE_BRIEF_SCHEMA_VERSION,
    campaignObjective: objective,
    targetAudience,
    funnelStage: "consideracao",
    communicationAngle: `Transformar ${offer} em uma decisao simples para ${targetAudience}.`,
    mainPromise: `Ajudar ${targetAudience} a avancar em ${objective}.`,
    centralBenefit: `Clareza sobre o valor de ${offer}.`,
    objectionAddressed: "Reduzir incerteza e facilitar a decisao.",
    headline: `${offer} para ${String(data.client?.segment ?? data.client?.name ?? "o cliente")}`,
    subheadline: `Uma proposta clara e alinhada ao que ${targetAudience} precisa.`,
    callToAction: (String(briefing.preferred_ctas ?? data.preferred_ctas ?? "Conheca a oferta").split("\n")[0] || "Conheca a oferta").replace(/^- /, ""),
    toneOfVoice: String(briefing.brand_voice ?? promptContext.tom_de_voz ?? "claro e profissional"),
    allowedTriggers: ["clareza", "beneficio", "confianca"],
    restrictions,
    visualDirection: {
      concept: `Anuncio ${String(briefing.format ?? data.format ?? "1:1")} para ${offer}.`,
      emotion: "Confianca e clareza.",
      composition: "Hierarquia visual simples com foco na promessa principal.",
      colorPalette: splitList(briefing.color_palette ?? promptContext.paleta_de_cores ?? "cores da marca").slice(0, 5),
      visualElements: ["produto ou servico em destaque", "elementos da identidade visual"],
      avoid: forbiddenStyles.length ? forbiddenStyles : ["poluicao visual", "texto ilegivel"]
    },
    elementHierarchy: ["headline", "beneficio principal", "prova visual", "CTA"],
    imageInstructions: "Criar composicao publicitaria legivel, consistente com a identidade visual e pronta para midia paga.",
    adCaption: `${offer}: uma proposta clara para ${targetAudience}. ${objective}. Conheca a oferta.`,
    captionInstructions: "Apresentar a promessa principal com clareza, explicar o beneficio central e finalizar com o CTA."
  } as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function splitList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(/[,\n]/).map((item) => item.replace(/^- /, "").trim()).filter(Boolean);
}

function listText(value: unknown) {
  return splitList(value).join(", ");
}

function inferFromText(text: string, fallback: string) {
  return text.trim() ? fallback : fallback;
}

function cleanAgent(payload: AgentPayload, outputSchemaJson = payload.output_schema_json) {
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
    output_schema_json: outputSchemaJson,
    is_active: toPostgresBoolean(payload.is_active),
    execution_order: payload.execution_order ?? 1
  };
}

function supportsTemperature(model: string) {
  const normalized = model.toLowerCase();
  return !normalized.startsWith("gpt-5") && !normalized.startsWith("o");
}
