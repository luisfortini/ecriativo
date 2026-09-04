import {
  CreativeBriefSchema,
  CreativeOutputSchema,
  ProfileDiagnosticSchema
} from "../contracts/index.js";
import bcrypt from "bcryptjs";
import { all, exec, get, run, withOrganizationContext } from "./connection.js";

interface Migration {
  id: string;
  up: string;
}

const strategistSchema = JSON.stringify(CreativeBriefSchema, null, 2);
const creativeSchema = JSON.stringify(CreativeOutputSchema, null, 2);
const brandAnalyzerSchema = JSON.stringify(ProfileDiagnosticSchema, null, 2);

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
  },
  {
    id: "003_versioned_pipeline_artifacts",
    up: `
      CREATE TABLE IF NOT EXISTS client_profile_diagnostics (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version > 0),
        schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) > 0),
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'active', 'superseded', 'failed')),
        payload JSONB NOT NULL,
        source_hash TEXT,
        source_snapshot JSONB,
        agent_id BIGINT REFERENCES agents(id) ON DELETE SET NULL,
        agent_version_id BIGINT REFERENCES agent_versions(id) ON DELETE SET NULL,
        execution_log_id BIGINT REFERENCES agent_execution_logs(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_id, version)
      );

      CREATE TABLE IF NOT EXISTS campaign_pipeline_runs (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        profile_diagnostic_id BIGINT REFERENCES client_profile_diagnostics(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        current_step TEXT,
        input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        error_message TEXT,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE agent_execution_logs
        ADD COLUMN IF NOT EXISTS pipeline_run_id BIGINT REFERENCES campaign_pipeline_runs(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS agent_version_id BIGINT REFERENCES agent_versions(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS step_key TEXT;

      CREATE TABLE IF NOT EXISTS campaign_artifacts (
        id BIGSERIAL PRIMARY KEY,
        pipeline_run_id BIGINT NOT NULL REFERENCES campaign_pipeline_runs(id) ON DELETE CASCADE,
        artifact_type TEXT NOT NULL CHECK (length(trim(artifact_type)) > 0),
        schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) > 0),
        version INTEGER NOT NULL CHECK (version > 0),
        status TEXT NOT NULL DEFAULT 'completed'
          CHECK (status IN ('draft', 'completed', 'failed', 'superseded')),
        payload JSONB NOT NULL,
        agent_id BIGINT REFERENCES agents(id) ON DELETE SET NULL,
        agent_version_id BIGINT REFERENCES agent_versions(id) ON DELETE SET NULL,
        execution_log_id BIGINT REFERENCES agent_execution_logs(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pipeline_run_id, artifact_type, version)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_client_profile_diagnostics_active
        ON client_profile_diagnostics(client_id)
        WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_client_profile_diagnostics_client_id
        ON client_profile_diagnostics(client_id);
      CREATE INDEX IF NOT EXISTS idx_client_profile_diagnostics_status
        ON client_profile_diagnostics(status);

      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_runs_client_id
        ON campaign_pipeline_runs(client_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_runs_campaign_id
        ON campaign_pipeline_runs(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_runs_status
        ON campaign_pipeline_runs(status);

      CREATE INDEX IF NOT EXISTS idx_campaign_artifacts_pipeline_run_id
        ON campaign_artifacts(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_artifacts_artifact_type
        ON campaign_artifacts(artifact_type);
      CREATE INDEX IF NOT EXISTS idx_campaign_artifacts_status
        ON campaign_artifacts(status);
      CREATE INDEX IF NOT EXISTS idx_campaign_artifacts_run_type
        ON campaign_artifacts(pipeline_run_id, artifact_type, version DESC);

      CREATE INDEX IF NOT EXISTS idx_agent_logs_pipeline_run_id
        ON agent_execution_logs(pipeline_run_id);
    `
  },
  {
    id: "004_agent_contract_bindings",
    up: `
      ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS contract_key TEXT,
        ADD COLUMN IF NOT EXISTS contract_version TEXT;

      UPDATE agents
      SET contract_key = CASE key
            WHEN 'brand_analyzer_agent' THEN 'profile_diagnostic'
            WHEN 'strategist_agent' THEN 'creative_brief'
            WHEN 'creative_agent' THEN 'creative_output'
            ELSE contract_key
          END,
          contract_version = CASE
            WHEN key IN ('brand_analyzer_agent', 'strategist_agent', 'creative_agent') THEN '1.0.0'
            ELSE contract_version
          END
      WHERE key IN ('brand_analyzer_agent', 'strategist_agent', 'creative_agent');

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'agents_contract_binding_pair_check'
        ) THEN
          ALTER TABLE agents
            ADD CONSTRAINT agents_contract_binding_pair_check
            CHECK (
              (contract_key IS NULL AND contract_version IS NULL)
              OR
              (length(trim(contract_key)) > 0 AND length(trim(contract_version)) > 0)
            );
        END IF;
      END
      $$;

      CREATE INDEX IF NOT EXISTS idx_agents_contract_binding
        ON agents(contract_key, contract_version)
        WHERE contract_key IS NOT NULL;
    `
  },
  {
    id: "005_campaign_pipeline_events",
    up: `
      CREATE TABLE IF NOT EXISTS campaign_pipeline_events (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
        pipeline_run_id BIGINT REFERENCES campaign_pipeline_runs(id) ON DELETE CASCADE,
        step_key TEXT,
        event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (campaign_id IS NOT NULL OR pipeline_run_id IS NOT NULL)
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_events_campaign_id
        ON campaign_pipeline_events(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_events_pipeline_run_id
        ON campaign_pipeline_events(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_events_event_type
        ON campaign_pipeline_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_events_severity
        ON campaign_pipeline_events(severity);
      CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_events_created_at
        ON campaign_pipeline_events(created_at DESC);
    `
  },
  {
    id: "006_creative_agent_brand_overlay_prompt",
    up: `
      WITH updated AS (
        UPDATE agents
        SET system_prompt = system_prompt || E'\\n\\nBrand Overlay: nunca desenhe, recrie ou incorpore a logo do cliente diretamente na imagem. Gere somente o layout sem logo. Em brandOverlay, apenas sugira se a logo original deve ser aplicada, escolha uma unica posicao permitida e indique o tamanho percentual. Considere equilibrio visual, area de respiro e legibilidade; a aplicacao sera feita posteriormente pelo backend.',
            updated_at = CURRENT_TIMESTAMP
        WHERE key = 'creative_agent'
          AND POSITION('Brand Overlay:' IN system_prompt) = 0
        RETURNING *
      )
      INSERT INTO agent_versions (
        agent_id, version_number, name, system_prompt, prompt_template, output_schema_json,
        model, temperature, max_tokens, change_notes
      )
      SELECT
        u.id,
        COALESCE((SELECT MAX(av.version_number) FROM agent_versions av WHERE av.agent_id = u.id), 0) + 1,
        u.name,
        u.system_prompt,
        u.prompt_template,
        u.output_schema_json,
        u.model,
        u.temperature,
        u.max_tokens,
        'Instrucoes de Brand Overlay adicionadas'
      FROM updated u;
    `
  },
  {
    id: "007_creative_brief_v2_ad_caption",
    up: `
      UPDATE agents
      SET contract_version = '2.0.0',
          system_prompt = CASE
            WHEN POSITION('Creative Brief v2:' IN system_prompt) = 0 THEN
              system_prompt || E'\\n\\nCreative Brief v2: preencha adCaption com a legenda final completa e pronta para publicacao, no idioma adequado ao briefing. Nao escreva instrucoes, comentarios editoriais ou metalinguagem em adCaption. Mantenha captionInstructions separado, contendo apenas orientacoes editoriais reutilizaveis para futuras adaptacoes da legenda.'
            ELSE system_prompt
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE key = 'strategist_agent';
    `
  },
  {
    id: "008_users_auth",
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
        ON users(lower(email));
      CREATE INDEX IF NOT EXISTS idx_users_active
        ON users(active);
      CREATE INDEX IF NOT EXISTS idx_users_role
        ON users(role);
    `
  },
  {
    id: "009_campaign_reviews",
    up: `
      CREATE TABLE IF NOT EXISTS campaign_reviews (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
        reason TEXT,
        tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (decision != 'rejected' OR length(trim(COALESCE(reason, ''))) > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_reviews_campaign_id
        ON campaign_reviews(campaign_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_campaign_reviews_client_id
        ON campaign_reviews(client_id, created_at DESC);

      UPDATE campaigns
      SET creative_status = status,
          status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('approved', 'rejected');

      ALTER TABLE campaigns
        ALTER COLUMN creative_status SET DEFAULT 'waiting_review';
    `
  },
  {
    id: "010_saas_multi_organization",
    up: `
      CREATE TABLE IF NOT EXISTS organizations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
        slug TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
        plan_code TEXT NOT NULL DEFAULT 'trial',
        billing_status TEXT NOT NULL DEFAULT 'trialing' CHECK (billing_status IN ('trialing', 'active', 'past_due', 'cancelled')),
        trial_ends_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP + INTERVAL '14 days',
        max_members INTEGER NOT NULL DEFAULT 3 CHECK (max_members > 0),
        max_clients INTEGER NOT NULL DEFAULT 10 CHECK (max_clients > 0),
        monthly_ai_budget DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (monthly_ai_budget >= 0),
        billing_customer_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique
        ON organizations(lower(slug));

      CREATE TABLE IF NOT EXISTS organization_members (
        id BIGSERIAL PRIMARY KEY,
        organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_organization_members_user
        ON organization_members(user_id, status);

      INSERT INTO organizations (name, slug)
      SELECT 'Organizacao principal', 'principal'
      WHERE NOT EXISTS (SELECT 1 FROM organizations);

      INSERT INTO organization_members (organization_id, user_id, role, status, is_default)
      SELECT o.id, u.id, CASE WHEN u.role = 'admin' THEN 'owner' ELSE 'member' END, 'active', TRUE
      FROM organizations o
      CROSS JOIN users u
      WHERE o.id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
      ON CONFLICT (organization_id, user_id) DO NOTHING;

      CREATE OR REPLACE FUNCTION app_current_organization_id()
      RETURNS BIGINT
      LANGUAGE SQL
      STABLE
      AS $$
        SELECT NULLIF(current_setting('app.organization_id', true), '')::BIGINT
      $$;

      ALTER TABLE clients ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE brands ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE client_brand_analysis ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE agent_execution_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_plan_clients ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_generation_queue ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_generation_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE ai_model_prices ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE client_profile_diagnostics ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_pipeline_runs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_artifacts ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_pipeline_events ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
      ALTER TABLE campaign_reviews ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);

      DO $$
      DECLARE tenant_id BIGINT;
      DECLARE table_name TEXT;
      BEGIN
        SELECT id INTO tenant_id FROM organizations ORDER BY id LIMIT 1;
        FOREACH table_name IN ARRAY ARRAY[
          'clients','brands','campaigns','client_assets','client_brand_analysis','agents',
          'agent_versions','agent_execution_logs','app_settings','campaign_plans',
          'campaign_plan_clients','campaign_generation_queue','campaign_generation_logs',
          'ai_model_prices','ai_usage_logs','notification_settings','notification_logs',
          'client_profile_diagnostics','campaign_pipeline_runs','campaign_artifacts',
          'campaign_pipeline_events','campaign_reviews'
        ] LOOP
          EXECUTE format('UPDATE %I SET organization_id = $1 WHERE organization_id IS NULL', table_name) USING tenant_id;
          EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET DEFAULT app_current_organization_id()', table_name);
          EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', table_name);
        END LOOP;
      END $$;

      ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_name_key;
      ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_key_key;
      ALTER TABLE ai_model_prices DROP CONSTRAINT IF EXISTS ai_model_prices_model_key;
      ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
      ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_scope_type_scope_id_channel_key;
      DROP INDEX IF EXISTS idx_notification_settings_global_channel;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_name_unique
        ON clients(organization_id, lower(name));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_org_key_unique
        ON agents(organization_id, key);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_prices_org_model_unique
        ON ai_model_prices(organization_id, model);
      ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (organization_id, key);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_org_global_channel
        ON notification_settings(organization_id, scope_type, channel)
        WHERE scope_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_org_scope_unique
        ON notification_settings(organization_id, scope_type, scope_id, channel)
        WHERE scope_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_clients_organization ON clients(organization_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_campaign_plans_organization ON campaign_plans(organization_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_organization ON ai_usage_logs(organization_id, created_at DESC);

      DO $$
      DECLARE table_name TEXT;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'clients','brands','campaigns','client_assets','client_brand_analysis','agents',
          'agent_versions','agent_execution_logs','app_settings','campaign_plans',
          'campaign_plan_clients','campaign_generation_queue','campaign_generation_logs',
          'ai_model_prices','ai_usage_logs','notification_settings','notification_logs',
          'client_profile_diagnostics','campaign_pipeline_runs','campaign_artifacts',
          'campaign_pipeline_events','campaign_reviews'
        ] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
          EXECUTE format('DROP POLICY IF EXISTS organization_isolation ON %I', table_name);
          EXECUTE format(
            'CREATE POLICY organization_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',
            table_name
          );
        END LOOP;
      END $$;

      DO $$
      DECLARE schema_name TEXT := current_schema();
      DECLARE can_manage_roles BOOLEAN;
      BEGIN
        SELECT (rolsuper OR rolcreaterole) INTO can_manage_roles FROM pg_roles WHERE rolname = current_user;
        IF can_manage_roles THEN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecriativo_tenant') THEN
            CREATE ROLE ecriativo_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
          END IF;
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO ecriativo_tenant', schema_name);
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ecriativo_tenant', schema_name);
          EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO ecriativo_tenant', schema_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecriativo_tenant', schema_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO ecriativo_tenant', schema_name);
        END IF;
      END $$;
    `
  },
  {
    id: "011_tenant_relationship_integrity",
    up: `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_org_id ON clients(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_org_id ON brands(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_org_id ON campaigns(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_org_id ON agents(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_versions_org_id ON agent_versions(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_logs_org_id ON agent_execution_logs(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_plans_org_id ON campaign_plans(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_queue_org_id ON campaign_generation_queue(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_diagnostics_org_id ON client_profile_diagnostics(organization_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_runs_org_id ON campaign_pipeline_runs(organization_id, id);

      DO $$
      DECLARE spec TEXT[];
      BEGIN
        FOREACH spec SLICE 1 IN ARRAY ARRAY[
          ARRAY['brands','brands_client_org_fk','client_id','clients'],
          ARRAY['campaigns','campaigns_client_org_fk','client_id','clients'],
          ARRAY['campaigns','campaigns_brand_org_fk','brand_id','brands'],
          ARRAY['client_assets','client_assets_client_org_fk','client_id','clients'],
          ARRAY['client_brand_analysis','client_analysis_client_org_fk','client_id','clients'],
          ARRAY['agent_versions','agent_versions_agent_org_fk','agent_id','agents'],
          ARRAY['agent_execution_logs','agent_logs_agent_org_fk','agent_id','agents'],
          ARRAY['agent_execution_logs','agent_logs_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['agent_execution_logs','agent_logs_client_org_fk','client_id','clients'],
          ARRAY['campaign_plan_clients','plan_clients_plan_org_fk','campaign_plan_id','campaign_plans'],
          ARRAY['campaign_plan_clients','plan_clients_client_org_fk','client_id','clients'],
          ARRAY['campaign_generation_queue','queue_plan_org_fk','campaign_plan_id','campaign_plans'],
          ARRAY['campaign_generation_queue','queue_client_org_fk','client_id','clients'],
          ARRAY['campaign_generation_queue','queue_campaign_org_fk','generated_campaign_id','campaigns'],
          ARRAY['campaign_generation_logs','generation_logs_queue_org_fk','queue_id','campaign_generation_queue'],
          ARRAY['campaign_generation_logs','generation_logs_plan_org_fk','campaign_plan_id','campaign_plans'],
          ARRAY['campaign_generation_logs','generation_logs_client_org_fk','client_id','clients'],
          ARRAY['ai_usage_logs','ai_usage_client_org_fk','client_id','clients'],
          ARRAY['ai_usage_logs','ai_usage_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['ai_usage_logs','ai_usage_plan_org_fk','campaign_plan_id','campaign_plans'],
          ARRAY['ai_usage_logs','ai_usage_queue_org_fk','queue_id','campaign_generation_queue'],
          ARRAY['ai_usage_logs','ai_usage_agent_org_fk','agent_id','agents'],
          ARRAY['notification_logs','notification_logs_client_org_fk','client_id','clients'],
          ARRAY['notification_logs','notification_logs_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['notification_logs','notification_logs_plan_org_fk','campaign_plan_id','campaign_plans'],
          ARRAY['notification_logs','notification_logs_queue_org_fk','queue_id','campaign_generation_queue'],
          ARRAY['client_profile_diagnostics','profile_diagnostics_client_org_fk','client_id','clients'],
          ARRAY['client_profile_diagnostics','profile_diagnostics_agent_org_fk','agent_id','agents'],
          ARRAY['client_profile_diagnostics','profile_diagnostics_version_org_fk','agent_version_id','agent_versions'],
          ARRAY['client_profile_diagnostics','profile_diagnostics_log_org_fk','execution_log_id','agent_execution_logs'],
          ARRAY['campaign_pipeline_runs','pipeline_runs_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['campaign_pipeline_runs','pipeline_runs_client_org_fk','client_id','clients'],
          ARRAY['campaign_pipeline_runs','pipeline_runs_profile_org_fk','profile_diagnostic_id','client_profile_diagnostics'],
          ARRAY['campaign_artifacts','artifacts_run_org_fk','pipeline_run_id','campaign_pipeline_runs'],
          ARRAY['campaign_artifacts','artifacts_agent_org_fk','agent_id','agents'],
          ARRAY['campaign_artifacts','artifacts_version_org_fk','agent_version_id','agent_versions'],
          ARRAY['campaign_artifacts','artifacts_log_org_fk','execution_log_id','agent_execution_logs'],
          ARRAY['campaign_pipeline_events','pipeline_events_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['campaign_pipeline_events','pipeline_events_run_org_fk','pipeline_run_id','campaign_pipeline_runs'],
          ARRAY['campaign_reviews','reviews_campaign_org_fk','campaign_id','campaigns'],
          ARRAY['campaign_reviews','reviews_client_org_fk','client_id','clients']
        ] LOOP
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = spec[2]) THEN
            EXECUTE format(
              'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id, %I) REFERENCES %I(organization_id, id)',
              spec[1], spec[2], spec[3], spec[4]
            );
          END IF;
        END LOOP;
      END $$;
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
  await seedInitialAdmin();
  await ensureOrganizationMemberships();
  const organizations = await all<{ id: number }>("SELECT id FROM organizations WHERE status = 'active' ORDER BY id");
  for (const organization of organizations) {
    await seedOrganizationDefaults(Number(organization.id));
  }
}

export async function seedOrganizationDefaults(organizationId: number) {
  await withOrganizationContext(organizationId, async () => {
    await seedAgents();
    await seedAppSettings();
    await seedAiModelPrices();
    await seedNotificationSettings();
    await backfillAiUsageLogs();
  });
}

async function ensureOrganizationMemberships() {
  const organization = await get<{ id: number }>("SELECT id FROM organizations ORDER BY id LIMIT 1");
  if (!organization) throw new Error("Nenhuma organizacao disponivel.");
  const initialName = process.env.INITIAL_ORGANIZATION_NAME?.trim();
  if (initialName && initialName.length >= 2) {
    await run("UPDATE organizations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [initialName, organization.id]);
  }
  await run(
    `INSERT INTO organization_members (organization_id, user_id, role, status, is_default)
     SELECT ?, u.id, CASE WHEN u.role = 'admin' THEN 'owner' ELSE 'member' END, 'active', TRUE
     FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id)
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [organization.id]
  );
}

async function seedInitialAdmin() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const hasAnyAdminSetting = Boolean(name || email || password);

  if (!hasAnyAdminSetting) return;
  if (!name || !email || !password) {
    throw new Error("ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD devem ser informados em conjunto.");
  }
  if (name.length < 2) throw new Error("ADMIN_NAME deve ter pelo menos 2 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL invalido.");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");

  const existing = await get<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower(?)", [email]);
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await run(
    `INSERT INTO users (name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'admin', TRUE)`,
    [name, email, passwordHash]
  );
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
    await run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(organization_id, key) DO NOTHING", [key, value]);
  }
}

async function seedAiModelPrices() {
  const models = new Set([process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2"]);
  for (const model of models) {
    await run(
      `INSERT INTO ai_model_prices (
        model, input_price_per_1m_tokens, output_price_per_1m_tokens, image_price, currency, active
      ) VALUES (?, 0, 0, 0, ?, TRUE)
      ON CONFLICT(organization_id, model) DO NOTHING`,
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
     ON CONFLICT (organization_id, scope_type, channel) WHERE scope_id IS NULL DO NOTHING`,
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
    system_prompt: "Voce e o Agente Estrategista do e-Criativo. Gere uma estrategia de anuncio especifica, acionavel e pronta para performance, usando o idioma adequado ao briefing. Use a memoria resumida do cliente como padrao, mas priorize dados da campanha atual. Respeite restricoes, cores proibidas, politicas do segmento e CTAs preferidos. Preencha adCaption com a legenda final completa e pronta para publicacao, sem instrucoes, comentarios editoriais ou metalinguagem. Mantenha captionInstructions separado, contendo apenas orientacoes editoriais reutilizaveis. Seja objetivo, use campos curtos e nao repita o contexto. Responda somente no JSON do schema.",
    prompt_template: "Contexto enxuto da campanha e memoria consolidada do cliente:\\n{{context_json}}",
    output_schema_json: strategistSchema,
    contract_key: "creative_brief",
    contract_version: "2.0.0",
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
    system_prompt: "Voce e o Agente Criativo do e-Criativo. Transforme a estrategia objetiva em prompt de imagem publicitaria claro. Preserve identidade visual do cliente, use referencias aprovadas quando relevantes, siga estilos aprovados e evite estilos reprovados, cores proibidas e texto ilegivel. Nunca desenhe, recrie ou incorpore a logo do cliente diretamente na imagem; gere somente o layout sem logo. Em brandOverlay, apenas sugira se a logo original deve ser aplicada, escolha uma unica posicao permitida e indique o tamanho percentual considerando equilibrio visual, area de respiro e legibilidade. A aplicacao da logo original sera feita posteriormente pelo backend. Seja conciso e nao repita memoria do cliente. Responda somente no JSON do schema.",
    prompt_template: "Estrategia objetiva, memoria visual resumida e restricoes atuais:\\n{{context_json}}",
    output_schema_json: creativeSchema,
    contract_key: "creative_output",
    contract_version: "1.0.0",
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
    contract_key: "profile_diagnostic",
    contract_version: "1.0.0",
    execution_order: 0
  });

  await syncBuiltInAgentSchemas();

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

async function syncBuiltInAgentSchemas() {
  const schemas = new Map([
    ["strategist_agent", strategistSchema],
    ["creative_agent", creativeSchema],
    ["brand_analyzer_agent", brandAnalyzerSchema]
  ]);

  for (const [key, schema] of schemas) {
    const agent = await get<Record<string, unknown>>("SELECT * FROM agents WHERE key = ?", [key]);
    if (!agent || String(agent.output_schema_json) === schema) continue;

    await run(
      `UPDATE agents
       SET output_schema_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [schema, agent.id]
    );
    const nextVersion = await get<{ next: number }>(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM agent_versions WHERE agent_id = ?",
      [agent.id]
    );
    await run(
      `INSERT INTO agent_versions (
        agent_id, version_number, name, system_prompt, prompt_template, output_schema_json,
        model, temperature, max_tokens, change_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        nextVersion?.next ?? 1,
        agent.name,
        agent.system_prompt,
        agent.prompt_template,
        schema,
        agent.model,
        agent.temperature,
        agent.max_tokens,
        "Schema sincronizado com contrato oficial"
      ]
    );
  }
}

async function createAgentIfMissing(agent: Record<string, unknown>) {
  await run(
    `INSERT INTO agents (
      name, key, description, role, model, temperature, max_tokens,
      system_prompt, prompt_template, output_schema_json, contract_key, contract_version,
      is_active, execution_order
    ) VALUES (
      @name, @key, @description, @role, @model, @temperature, @max_tokens,
      @system_prompt, @prompt_template, @output_schema_json, @contract_key, @contract_version,
      TRUE, @execution_order
    ) ON CONFLICT(organization_id, key) DO NOTHING`,
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
