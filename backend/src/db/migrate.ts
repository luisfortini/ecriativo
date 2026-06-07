import { all, exec, get, run } from "./connection.js";

interface Migration {
  id: string;
  up: string;
}

const strategistSchema = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: ["angulo", "publico", "promessa", "headline", "texto_principal", "cta", "briefing_criativo"],
  properties: {
    angulo: { type: "string" },
    publico: { type: "string" },
    promessa: { type: "string" },
    headline: { type: "string" },
    texto_principal: { type: "string" },
    cta: { type: "string" },
    briefing_criativo: {
      type: "object",
      additionalProperties: false,
      required: ["conceito", "emocao", "composicao", "paleta", "elementos_visuais", "hierarquia", "evitar"],
      properties: {
        conceito: { type: "string" },
        emocao: { type: "string" },
        composicao: { type: "string" },
        paleta: { type: "array", items: { type: "string" } },
        elementos_visuais: { type: "array", items: { type: "string" } },
        hierarquia: { type: "string" },
        evitar: { type: "array", items: { type: "string" } }
      }
    }
  }
}, null, 2);

const creativeSchema = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: ["prompt_imagem", "negative_prompt", "direcao_visual_resumida"],
  properties: {
    prompt_imagem: { type: "string" },
    negative_prompt: { type: "string" },
    direcao_visual_resumida: { type: "string" }
  }
}, null, 2);

const brandAnalyzerSchema = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: [
    "brand_voice",
    "positioning",
    "target_audience",
    "color_palette",
    "visual_style",
    "content_patterns",
    "common_ctas",
    "recurring_words",
    "approved_style_suggestions",
    "forbidden_style_suggestions",
    "strategic_notes",
    "confidence_score",
    "missing_information"
  ],
  properties: {
    brand_voice: { type: "string" },
    positioning: { type: "string" },
    target_audience: { type: "string" },
    color_palette: { type: "array", items: { type: "string" } },
    visual_style: { type: "string" },
    content_patterns: { type: "array", items: { type: "string" } },
    common_ctas: { type: "array", items: { type: "string" } },
    recurring_words: { type: "array", items: { type: "string" } },
    approved_style_suggestions: { type: "array", items: { type: "string" } },
    forbidden_style_suggestions: { type: "array", items: { type: "string" } },
    strategic_notes: { type: "string" },
    confidence_score: { type: "number" },
    missing_information: { type: "array", items: { type: "string" } }
  }
}, null, 2);

const migrations: Migration[] = [
  {
    id: "001_initial_postgres_schema",
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clients (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        segment TEXT,
        business_description TEXT,
        target_audience TEXT,
        differentiators TEXT,
        brand_voice TEXT,
        positioning TEXT,
        color_palette TEXT,
        forbidden_colors TEXT,
        preferred_typography TEXT,
        visual_references TEXT,
        approved_styles TEXT,
        forbidden_styles TEXT,
        communication_restrictions TEXT,
        preferred_ctas TEXT,
        segment_policies TEXT,
        strategic_notes TEXT,
        brand_memory_summary TEXT,
        site_url TEXT,
        instagram_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS brands (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id),
        name TEXT NOT NULL,
        tone TEXT,
        palette TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id),
        brand_id BIGINT REFERENCES brands(id),
        cliente TEXT,
        segmento TEXT,
        objetivo TEXT,
        publico_alvo TEXT,
        oferta TEXT,
        formato TEXT,
        tom_marca TEXT,
        paleta_cores TEXT,
        referencias_visuais TEXT,
        restricoes TEXT,
        observacoes TEXT,
        reference_file_path TEXT,
        free_briefing TEXT,
        normalized_briefing_json TEXT,
        strategist_output_json TEXT,
        creative_output_json TEXT,
        final_image_url TEXT,
        strategist_agent_id BIGINT,
        creative_agent_id BIGINT,
        strategy_json TEXT NOT NULL DEFAULT '{}',
        creative_json TEXT NOT NULL DEFAULT '{}',
        image_path TEXT,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        creative_status TEXT NOT NULL DEFAULT 'approved',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS client_assets (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        file_url TEXT NOT NULL,
        description TEXT,
        analysis_status TEXT,
        ai_summary TEXT,
        dominant_colors_json TEXT,
        visual_style_tags_json TEXT,
        user_feedback TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS client_brand_analysis (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_url TEXT,
        extracted_text TEXT,
        extracted_images_json TEXT,
        suggested_brand_voice TEXT,
        suggested_color_palette TEXT,
        suggested_positioning TEXT,
        suggested_target_audience TEXT,
        suggested_visual_style TEXT,
        suggested_ctas TEXT,
        suggested_restrictions TEXT,
        raw_ai_output_json TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agents (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        description TEXT,
        role TEXT,
        model TEXT NOT NULL,
        temperature DOUBLE PRECISION,
        max_tokens INTEGER,
        system_prompt TEXT NOT NULL,
        prompt_template TEXT NOT NULL,
        output_schema_json TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        execution_order INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_versions (
        id BIGSERIAL PRIMARY KEY,
        agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        prompt_template TEXT NOT NULL,
        output_schema_json TEXT NOT NULL,
        model TEXT NOT NULL,
        temperature DOUBLE PRECISION,
        max_tokens INTEGER,
        change_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id BIGSERIAL PRIMARY KEY,
        agent_id BIGINT NOT NULL REFERENCES agents(id),
        campaign_id BIGINT REFERENCES campaigns(id),
        client_id BIGINT REFERENCES clients(id),
        input_json TEXT NOT NULL,
        output_raw TEXT,
        output_parsed_json TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        tokens_input INTEGER,
        tokens_output INTEGER,
        total_tokens INTEGER,
        context_chars INTEGER,
        tamanho_contexto_caracteres INTEGER,
        agent_key TEXT,
        context_warning TEXT,
        latency_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaign_plans (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        theme TEXT NOT NULL,
        strategic_description TEXT,
        objective TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        recurrence_type TEXT NOT NULL,
        recurrence_days_json TEXT,
        preferred_time TEXT,
        ads_per_client INTEGER NOT NULL DEFAULT 1,
        ad_format TEXT NOT NULL DEFAULT '1:1',
        max_ads_per_day INTEGER NOT NULL DEFAULT 5,
        max_ads_per_hour INTEGER NOT NULL DEFAULT 1,
        min_interval_minutes INTEGER NOT NULL DEFAULT 5,
        approval_mode TEXT NOT NULL DEFAULT 'waiting_review',
        variation_mode TEXT NOT NULL DEFAULT 'sazonal',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaign_plan_clients (
        id BIGSERIAL PRIMARY KEY,
        campaign_plan_id BIGINT NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        ads_quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaign_generation_queue (
        id BIGSERIAL PRIMARY KEY,
        campaign_plan_id BIGINT NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        scheduled_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 5,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        generated_campaign_id BIGINT REFERENCES campaigns(id),
        variation_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaign_generation_logs (
        id BIGSERIAL PRIMARY KEY,
        queue_id BIGINT REFERENCES campaign_generation_queue(id) ON DELETE CASCADE,
        campaign_plan_id BIGINT REFERENCES campaign_plans(id) ON DELETE CASCADE,
        client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ai_model_prices (
        id BIGSERIAL PRIMARY KEY,
        model TEXT NOT NULL UNIQUE,
        input_price_per_1m_tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
        output_price_per_1m_tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
        image_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id),
        campaign_id BIGINT REFERENCES campaigns(id),
        campaign_plan_id BIGINT REFERENCES campaign_plans(id),
        queue_id BIGINT REFERENCES campaign_generation_queue(id),
        agent_id BIGINT REFERENCES agents(id),
        agent_key TEXT,
        model TEXT,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        input_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        output_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        image_count INTEGER NOT NULL DEFAULT 0,
        image_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        total_estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        context_characters INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        error_message TEXT,
        metadata_json TEXT,
        price_snapshot_json TEXT,
        source_log_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_settings (
        id BIGSERIAL PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id BIGINT,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope_type, scope_id, channel)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_global_channel
        ON notification_settings(scope_type, channel)
        WHERE scope_id IS NULL;

      CREATE TABLE IF NOT EXISTS notification_logs (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id),
        campaign_id BIGINT REFERENCES campaigns(id),
        campaign_plan_id BIGINT REFERENCES campaign_plans(id),
        queue_id BIGINT REFERENCES campaign_generation_queue(id),
        notification_type TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        media_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_response_json TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    id: "002_indexes",
    up: `
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_client_assets_client_id ON client_assets(client_id);
      CREATE INDEX IF NOT EXISTS idx_client_brand_analysis_client_id ON client_brand_analysis(client_id);
      CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON agent_versions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON agent_execution_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_client_id ON agent_execution_logs(client_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_campaign_id ON agent_execution_logs(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON agent_execution_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_campaign_generation_queue_status_scheduled ON campaign_generation_queue(status, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_campaign_generation_queue_client_id ON campaign_generation_queue(client_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_generation_queue_plan_id ON campaign_generation_queue(campaign_plan_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_plans_status ON campaign_plans(status);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_client_id ON ai_usage_logs(client_id);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_campaign_id ON ai_usage_logs(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_agent_id ON ai_usage_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON ai_usage_logs(status);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_campaign_type ON notification_logs(campaign_id, notification_type);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_queue_type ON notification_logs(queue_id, notification_type);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_client_id ON notification_logs(client_id);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);
    `
  }
];

export async function migrate() {
  await exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const appliedRows = await all<{ id: string }>("SELECT id FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.id));
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await exec(migration.up);
    await run("INSERT INTO schema_migrations (id) VALUES (?)", [migration.id]);
  }
  await seedAgents();
  await seedAppSettings();
  await seedAiModelPrices();
  await seedNotificationSettings();
  await backfillAiUsageLogs();
}

async function seedAppSettings() {
  const defaults: Record<string, string> = {
    max_concurrent_generations: "1",
    openai_requests_per_minute_limit: "20",
    image_generation_per_hour_limit: "10",
    default_retry_attempts: "3",
    queue_worker_enabled: "true",
    min_interval_minutes: "5",
    ai_default_currency: "USD",
    ai_cost_max_per_campaign: "0",
    ai_cost_max_per_client_month: "0",
    ai_cost_max_per_routine: "0",
    ai_cost_limit_mode: "alert"
  };
  for (const [key, value] of Object.entries(defaults)) {
    await run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING", [key, value]);
  }
}

async function seedAiModelPrices() {
  const models = new Set([process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2"]);
  for (const model of models) {
    await run(
      `INSERT INTO ai_model_prices (
        model, input_price_per_1m_tokens, output_price_per_1m_tokens, image_price, currency, active
      ) VALUES (?, 0, 0, 0, ?, TRUE)
      ON CONFLICT(model) DO NOTHING`,
      [model, process.env.AI_DEFAULT_CURRENCY ?? "USD"]
    );
  }
}

async function seedNotificationSettings() {
  const defaults = {
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
  await run(
    `INSERT INTO notification_settings (scope_type, scope_id, channel, enabled, settings_json)
     VALUES ('global', NULL, 'whatsapp', TRUE, ?)
     ON CONFLICT (scope_type, channel) WHERE scope_id IS NULL DO NOTHING`,
    [JSON.stringify(defaults)]
  );
}

async function seedAgents() {
  await createAgentIfMissing({
    name: "Agente Estrategista",
    key: "strategist_agent",
    description: "Cria estrategia, angulo, promessa, copy e briefing criativo.",
    role: "Primeiro agente do fluxo de campanha.",
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
    temperature: 0.4,
    max_tokens: 1800,
    system_prompt: "Voce e o Agente Estrategista do e-Criativo. Gere uma estrategia de anuncio em portugues do Brasil, especifica, acionavel e pronta para performance. Use a memoria resumida do cliente como padrao, mas priorize dados da campanha atual. Respeite restricoes, cores proibidas, politicas do segmento e CTAs preferidos. Seja objetivo: briefing_criativo deve ser estruturado, com campos curtos, sem repetir contexto. Responda somente no JSON do schema.",
    prompt_template: "Contexto enxuto da campanha e memoria consolidada do cliente:\\n{{context_json}}",
    output_schema_json: strategistSchema,
    execution_order: 1
  });
  await createAgentIfMissing({
    name: "Agente Criativo",
    key: "creative_agent",
    description: "Transforma briefing estrategico em prompt final de imagem.",
    role: "Segundo agente do fluxo, executado apos o estrategista.",
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
    temperature: 0.5,
    max_tokens: 1800,
    system_prompt: "Voce e o Agente Criativo do e-Criativo. Transforme a estrategia objetiva em prompt de imagem publicitaria claro. Preserve identidade visual do cliente, use referencias aprovadas quando relevantes, siga estilos aprovados e evite estilos reprovados, cores proibidas, logos inventados e texto ilegivel. Seja conciso e nao repita memoria do cliente. Responda somente no JSON do schema.",
    prompt_template: "Estrategia objetiva, memoria visual resumida e restricoes atuais:\\n{{context_json}}",
    output_schema_json: creativeSchema,
    execution_order: 2
  });
  await createAgentIfMissing({
    name: "Agente Analista de Marca",
    key: "brand_analyzer_agent",
    description: "Analisa presenca digital e materiais enviados para sugerir memoria criativa do cliente.",
    role: "Agente administrativo usado na aba Analise de Marca do cliente.",
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
    temperature: 0.3,
    max_tokens: 2200,
    system_prompt: "Voce e o Agente Analista de Marca do e-Criativo. Analise informacoes publicas, textos, metadados e materiais enviados de uma marca. Gere sugestoes objetivas para memoria criativa, sem inventar fatos nao observados. Nunca assuma acesso a conteudo privado. Responda somente no JSON do schema.",
    prompt_template: "Contexto de analise de marca:\\n{{context_json}}",
    output_schema_json: brandAnalyzerSchema,
    execution_order: 0
  });

  await exec(`
    INSERT INTO agent_versions (
      agent_id, version_number, name, system_prompt, prompt_template, output_schema_json,
      model, temperature, max_tokens, change_notes
    )
    SELECT
      a.id, 1, a.name, a.system_prompt, a.prompt_template, a.output_schema_json,
      a.model, a.temperature, a.max_tokens, 'Seed inicial'
    FROM agents a
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_versions av WHERE av.agent_id = a.id
    )
  `);
}

async function createAgentIfMissing(agent: Record<string, unknown>) {
  await run(
    `INSERT INTO agents (
      name, key, description, role, model, temperature, max_tokens,
      system_prompt, prompt_template, output_schema_json, is_active, execution_order
    ) VALUES (
      @name, @key, @description, @role, @model, @temperature, @max_tokens,
      @system_prompt, @prompt_template, @output_schema_json, TRUE, @execution_order
    ) ON CONFLICT(key) DO NOTHING`,
    agent
  );
}

async function backfillAiUsageLogs() {
  await exec(`
    INSERT INTO ai_usage_logs (
      client_id, campaign_id, agent_id, agent_key, model, operation_type, status,
      input_tokens, output_tokens, total_tokens, context_characters, latency_ms,
      error_message, metadata_json, source_log_id, created_at
    )
    SELECT
      l.client_id, l.campaign_id, l.agent_id, COALESCE(l.agent_key, a.key), a.model,
      CASE
        WHEN COALESCE(l.agent_key, a.key) = 'strategist_agent' THEN 'estrategista'
        WHEN COALESCE(l.agent_key, a.key) = 'creative_agent' THEN 'criativo'
        WHEN COALESCE(l.agent_key, a.key) = 'brand_analyzer_agent' THEN 'analise_marca'
        ELSE 'agente'
      END,
      l.status,
      COALESCE(l.tokens_input, 0),
      COALESCE(l.tokens_output, 0),
      COALESCE(l.total_tokens, COALESCE(l.tokens_input, 0) + COALESCE(l.tokens_output, 0)),
      COALESCE(l.context_chars, l.tamanho_contexto_caracteres, LENGTH(l.input_json)),
      l.latency_ms,
      l.error_message,
      json_build_object('backfilled_from', 'agent_execution_logs')::text,
      l.id,
      l.created_at
    FROM agent_execution_logs l
    JOIN agents a ON a.id = l.agent_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ai_usage_logs u WHERE u.source_log_id = l.id AND u.operation_type != 'geracao_imagem'
    )
  `);
}
