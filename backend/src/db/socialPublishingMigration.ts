export const socialPublishingMigration = {
  id: "015_social_publishing",
  up: `
    ALTER TABLE social_contents ADD CONSTRAINT social_contents_org_client_id UNIQUE(organization_id,client_id,id);
    CREATE TABLE social_accounts (
      id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook')),
      account_id TEXT NOT NULL, name TEXT NOT NULL, token_encrypted TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE, connected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id,client_id,platform,account_id), UNIQUE(organization_id,client_id,id),
      FOREIGN KEY(organization_id,client_id) REFERENCES clients(organization_id,id)
    );
    CREATE TABLE social_oauth_states (
      id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, state_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(organization_id,client_id) REFERENCES clients(organization_id,id)
    );
    CREATE TABLE social_publications (
      id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      client_id BIGINT NOT NULL, content_id BIGINT NOT NULL, account_id BIGINT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL, time_zone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','publishing','published','failed','uncertain','cancelled')),
      snapshot JSONB NOT NULL, started_at TIMESTAMPTZ, published_at TIMESTAMPTZ,
      provider_id TEXT, permalink TEXT, error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id,client_id,content_id) REFERENCES social_contents(organization_id,client_id,id),
      FOREIGN KEY(organization_id,client_id,account_id) REFERENCES social_accounts(organization_id,client_id,id)
    );
    CREATE UNIQUE INDEX social_publication_once ON social_publications(content_id,account_id) WHERE status IN ('scheduled','publishing','published','uncertain');
    CREATE INDEX social_publication_due ON social_publications(organization_id,scheduled_at) WHERE status='scheduled';
    DO $$ DECLARE tbl TEXT; BEGIN
      FOREACH tbl IN ARRAY ARRAY['social_accounts','social_oauth_states','social_publications'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
        EXECUTE format('CREATE POLICY organization_isolation ON %I USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id())',tbl);
      END LOOP;
    END $$;
    CREATE FUNCTION protect_scheduled_social_content() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.caption IS DISTINCT FROM OLD.caption OR NEW.images IS DISTINCT FROM OLD.images OR NEW.alt_text IS DISTINCT FROM OLD.alt_text)
        AND EXISTS(SELECT 1 FROM social_publications WHERE content_id=OLD.id AND status IN ('scheduled','publishing','uncertain')) THEN
        RAISE EXCEPTION 'Cancele os agendamentos ou confira a publicação antes de alterar o conteúdo.';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER protect_scheduled_social_content BEFORE UPDATE ON social_contents FOR EACH ROW EXECUTE FUNCTION protect_scheduled_social_content();
  `
};
