export const contentMigration = {
  id: "012_content_library_and_editorial",
  up: `
    ALTER TABLE clients ADD COLUMN country TEXT;
    ALTER TABLE clients ADD COLUMN state TEXT;
    ALTER TABLE clients ADD COLUMN city TEXT;
    ALTER TABLE clients ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
    ALTER TABLE clients ADD COLUMN anniversary_date TEXT;
    ALTER TABLE clients ADD COLUMN founding_year TEXT;
    CREATE TABLE visual_subjects (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('product','person')),
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '',
      preservation_notes TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
      approved BOOLEAN NOT NULL DEFAULT FALSE, allow_ads BOOLEAN NOT NULL DEFAULT FALSE,
      allow_social BOOLEAN NOT NULL DEFAULT FALSE, consent_note TEXT NOT NULL DEFAULT '',
      expires_on DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, client_id, id),
      FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id)
    );
    CREATE TABLE visual_photos (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, subject_id BIGINT NOT NULL,
      filename TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id, client_id, subject_id) REFERENCES visual_subjects(organization_id, client_id, id)
    );
    CREATE UNIQUE INDEX visual_photo_primary ON visual_photos(subject_id) WHERE is_primary;
    ALTER TABLE campaigns ADD COLUMN visual_selection JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE campaign_plans ADD COLUMN visual_selection JSONB NOT NULL DEFAULT '{}';
    CREATE TABLE editorial_plans (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT FALSE,
      posts_per_week INTEGER NOT NULL CHECK(posts_per_week BETWEEN 1 AND 21),
      pillars JSONB NOT NULL DEFAULT '[]', formats JSONB NOT NULL DEFAULT '["post"]',
      visual_selection JSONB NOT NULL DEFAULT '{}', automatic BOOLEAN NOT NULL DEFAULT FALSE,
      weekly_image_limit INTEGER NOT NULL DEFAULT 10 CHECK(weekly_image_limit BETWEEN 1 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, client_id, id),
      FOREIGN KEY(organization_id, client_id) REFERENCES clients(organization_id, id)
    );
    CREATE TABLE editorial_batches (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, plan_id BIGINT NOT NULL, week_start DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'planning', evidence JSONB NOT NULL DEFAULT '[]',
      research_note TEXT NOT NULL DEFAULT '', snapshot JSONB NOT NULL DEFAULT '{}',
      image_calls INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, client_id, id), UNIQUE(plan_id, week_start),
      FOREIGN KEY(organization_id, client_id, plan_id) REFERENCES editorial_plans(organization_id, client_id, id)
    );
    CREATE TABLE social_contents (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, batch_id BIGINT NOT NULL, position INTEGER NOT NULL,
      scheduled_date DATE NOT NULL, format TEXT NOT NULL CHECK(format IN ('post','carousel','story')),
      topic TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', alt_text TEXT NOT NULL DEFAULT '',
      image_prompts JSONB NOT NULL DEFAULT '[]', images JSONB NOT NULL DEFAULT '[]',
      sources JSONB NOT NULL DEFAULT '[]', visual_snapshot JSONB NOT NULL DEFAULT '[]',
      revisions JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','processing','review','approved','rejected','failed','cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0, error_message TEXT, review_note TEXT,
      started_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, position),
      FOREIGN KEY(organization_id, client_id, batch_id) REFERENCES editorial_batches(organization_id, client_id, id)
    );
    CREATE INDEX social_queue ON social_contents(organization_id, status, scheduled_date);
    DO $$ DECLARE tbl TEXT; BEGIN
      FOREACH tbl IN ARRAY ARRAY['visual_subjects','visual_photos','editorial_plans','editorial_batches','social_contents'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('CREATE POLICY organization_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())', tbl);
      END LOOP;
    END $$;
  `
};
