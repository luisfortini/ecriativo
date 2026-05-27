import { db } from "./connection.js";

function columns(table: string) {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name));
}

function addColumn(table: string, name: string, definition: string) {
  if (!columns(table).has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function tableSql(table: string) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined;
  return row?.sql ?? "";
}

function ensureClientAssetsSchema() {
  const sql = tableSql("client_assets");
  if (!sql || !sql.includes("CHECK")) return;
  db.exec(`
    ALTER TABLE client_assets RENAME TO client_assets_old;
    CREATE TABLE client_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      description TEXT,
      analysis_status TEXT,
      ai_summary TEXT,
      dominant_colors_json TEXT,
      visual_style_tags_json TEXT,
      user_feedback TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    INSERT INTO client_assets (
      id, client_id, type, file_url, description, created_at
    )
    SELECT id, client_id, type, file_url, description, created_at
    FROM client_assets_old;
    DROP TABLE client_assets_old;
  `);
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      site_url TEXT,
      instagram_url TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      tone TEXT,
      palette TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      brand_id INTEGER,
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
      strategist_agent_id INTEGER,
      creative_agent_id INTEGER,
      strategy_json TEXT NOT NULL DEFAULT '{}',
      creative_json TEXT NOT NULL DEFAULT '{}',
      image_path TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      creative_status TEXT NOT NULL DEFAULT 'approved',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    );

    CREATE TABLE IF NOT EXISTS client_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      description TEXT,
      analysis_status TEXT,
      ai_summary TEXT,
      dominant_colors_json TEXT,
      visual_style_tags_json TEXT,
      user_feedback TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS client_brand_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      role TEXT,
      model TEXT NOT NULL,
      temperature REAL,
      max_tokens INTEGER,
      system_prompt TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      output_schema_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      execution_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      version_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      output_schema_json TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL,
      max_tokens INTEGER,
      change_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      campaign_id INTEGER,
      client_id INTEGER,
      input_json TEXT NOT NULL,
      output_raw TEXT,
      output_parsed_json TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaign_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaign_plan_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_plan_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      ads_quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_plan_id) REFERENCES campaign_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_generation_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_plan_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      scheduled_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 5,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error_message TEXT,
      generated_campaign_id INTEGER,
      variation_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_plan_id) REFERENCES campaign_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (generated_campaign_id) REFERENCES campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS campaign_generation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER,
      campaign_plan_id INTEGER,
      client_id INTEGER,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (queue_id) REFERENCES campaign_generation_queue(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_plan_id) REFERENCES campaign_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);
    CREATE INDEX IF NOT EXISTS idx_client_assets_client_id ON client_assets(client_id);
    CREATE INDEX IF NOT EXISTS idx_client_brand_analysis_client_id ON client_brand_analysis(client_id);
    CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON agent_versions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON agent_execution_logs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_generation_queue_status_scheduled ON campaign_generation_queue(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_campaign_plans_status ON campaign_plans(status);
  `);

  const clientColumns: Array<[string, string]> = [
    ["segment", "TEXT"],
    ["business_description", "TEXT"],
    ["target_audience", "TEXT"],
    ["differentiators", "TEXT"],
    ["brand_voice", "TEXT"],
    ["positioning", "TEXT"],
    ["color_palette", "TEXT"],
    ["forbidden_colors", "TEXT"],
    ["preferred_typography", "TEXT"],
    ["visual_references", "TEXT"],
    ["approved_styles", "TEXT"],
    ["forbidden_styles", "TEXT"],
    ["communication_restrictions", "TEXT"],
    ["preferred_ctas", "TEXT"],
    ["segment_policies", "TEXT"],
    ["strategic_notes", "TEXT"],
    ["site_url", "TEXT"],
    ["instagram_url", "TEXT"],
    ["updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"]
  ];

  clientColumns.forEach(([name, definition]) => addColumn("clients", name, definition));

  const campaignColumns: Array<[string, string]> = [
    ["free_briefing", "TEXT"],
    ["normalized_briefing_json", "TEXT"],
    ["strategist_output_json", "TEXT"],
    ["creative_output_json", "TEXT"],
    ["final_image_url", "TEXT"],
    ["strategist_agent_id", "INTEGER"],
    ["creative_agent_id", "INTEGER"],
    ["creative_status", "TEXT NOT NULL DEFAULT 'approved'"]
  ];

  campaignColumns.forEach(([name, definition]) => addColumn("campaigns", name, definition));

  ensureClientAssetsSchema();
  const assetColumns: Array<[string, string]> = [
    ["analysis_status", "TEXT"],
    ["ai_summary", "TEXT"],
    ["dominant_colors_json", "TEXT"],
    ["visual_style_tags_json", "TEXT"],
    ["user_feedback", "TEXT"]
  ];
  assetColumns.forEach(([name, definition]) => addColumn("client_assets", name, definition));

  seedAgents();
  rebrandAgents();
  seedAppSettings();
}

function seedAppSettings() {
  const defaults: Record<string, string> = {
    max_concurrent_generations: "1",
    openai_requests_per_minute_limit: "20",
    image_generation_per_hour_limit: "10",
    default_retry_attempts: "3",
    queue_worker_enabled: "true",
    min_interval_minutes: "5"
  };
  const stmt = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
  Object.entries(defaults).forEach(([key, value]) => stmt.run(key, value));
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
    briefing_criativo: { type: "string" }
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

function seedAgents() {
  const insert = db.prepare(`
    INSERT INTO agents (
      name, key, description, role, model, temperature, max_tokens,
      system_prompt, prompt_template, output_schema_json, is_active, execution_order
    ) VALUES (
      @name, @key, @description, @role, @model, @temperature, @max_tokens,
      @system_prompt, @prompt_template, @output_schema_json, 1, @execution_order
    )
  `);

  const count = db.prepare("SELECT COUNT(*) AS total FROM agents WHERE key = ?").get("strategist_agent") as { total: number };
  if (count.total === 0) {
    insert.run({
      name: "Agente Estrategista",
      key: "strategist_agent",
      description: "Cria estrategia, angulo, promessa, copy e briefing criativo.",
      role: "Primeiro agente do fluxo de campanha.",
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
      temperature: 0.4,
      max_tokens: 1800,
      system_prompt: "Voce e o Agente Estrategista do e-Criativo. Gere estrategia de anuncio em portugues do Brasil, especifica, acionavel e pronta para performance. Use a memoria do cliente como padrao, mas priorize dados da campanha atual. Respeite restricoes, cores proibidas, politicas do segmento e CTAs preferidos. Responda somente no JSON do schema.",
      prompt_template: "Contexto completo da campanha e memoria do cliente:\\n{{context_json}}",
      output_schema_json: strategistSchema,
      execution_order: 1
    });
  }

  const creativeCount = db.prepare("SELECT COUNT(*) AS total FROM agents WHERE key = ?").get("creative_agent") as { total: number };
  if (creativeCount.total === 0) {
    insert.run({
      name: "Agente Criativo",
      key: "creative_agent",
      description: "Transforma briefing estrategico em prompt final de imagem.",
      role: "Segundo agente do fluxo, executado apos o estrategista.",
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
      temperature: 0.5,
      max_tokens: 1800,
      system_prompt: "Voce e o Agente Criativo do e-Criativo. Transforme o briefing estrategico em prompt de imagem publicitaria claro. Preserve identidade visual do cliente, cite assets disponiveis por URL quando forem relevantes, siga estilos aprovados e evite estilos reprovados, cores proibidas, logos inventados e texto ilegivel. Responda somente no JSON do schema.",
      prompt_template: "Briefing normalizado e estrategia aprovada:\\n{{context_json}}",
      output_schema_json: creativeSchema,
      execution_order: 2
    });
  }

  const analyzerCount = db.prepare("SELECT COUNT(*) AS total FROM agents WHERE key = ?").get("brand_analyzer_agent") as { total: number };
  if (analyzerCount.total === 0) {
    insert.run({
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
  }

  db.exec(`
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
    );
  `);
}

function rebrandAgents() {
  db.prepare(`
    UPDATE agents
    SET
      system_prompt = REPLACE(system_prompt, 'CriativoPro', 'e-Criativo'),
      updated_at = CURRENT_TIMESTAMP
    WHERE system_prompt LIKE '%CriativoPro%'
  `).run();

  db.prepare(`
    UPDATE agent_versions
    SET system_prompt = REPLACE(system_prompt, 'CriativoPro', 'e-Criativo')
    WHERE system_prompt LIKE '%CriativoPro%'
  `).run();
}
