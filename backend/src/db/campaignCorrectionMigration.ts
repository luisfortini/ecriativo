export const campaignCorrectionMigration = {
  id: "017_campaign_image_corrections",
  up: `
    CREATE UNIQUE INDEX IF NOT EXISTS campaigns_id_organization_unique ON campaigns(id,organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS clients_id_organization_unique ON clients(id,organization_id);
    CREATE TABLE campaign_image_corrections (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      campaign_id BIGINT NOT NULL,
      client_id BIGINT NOT NULL,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL CHECK(length(note) BETWEEN 5 AND 2000),
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')),
      before_image_url TEXT NOT NULL,
      before_generated_image_url TEXT,
      before_image_path TEXT,
      image_url TEXT,
      generated_image_url TEXT,
      image_path TEXT,
      prompt TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      FOREIGN KEY(campaign_id,organization_id) REFERENCES campaigns(id,organization_id) ON DELETE CASCADE,
      FOREIGN KEY(client_id,organization_id) REFERENCES clients(id,organization_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX campaign_one_active_correction ON campaign_image_corrections(campaign_id)
      WHERE status IN ('queued','processing');
    CREATE INDEX campaign_correction_history ON campaign_image_corrections(organization_id,campaign_id,id DESC);
    ALTER TABLE campaign_image_corrections ENABLE ROW LEVEL SECURITY;
    ALTER TABLE campaign_image_corrections FORCE ROW LEVEL SECURITY;
    CREATE POLICY organization_isolation ON campaign_image_corrections
      USING(organization_id=app_current_organization_id())
      WITH CHECK(organization_id=app_current_organization_id());
  `
};
