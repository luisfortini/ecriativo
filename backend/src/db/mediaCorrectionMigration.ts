export const mediaCorrectionMigration = {
  id: "013_persistent_media_and_selective_corrections",
  up: `
    ALTER TABLE social_contents ADD COLUMN correction_request JSONB;
    CREATE TABLE media_files (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
      kind TEXT NOT NULL CHECK(kind IN ('generated','uploads')),
      filename TEXT NOT NULL, content_type TEXT NOT NULL, data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id,kind,filename)
    );
    ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
    ALTER TABLE media_files FORCE ROW LEVEL SECURITY;
    CREATE POLICY organization_isolation ON media_files
      USING(organization_id=app_current_organization_id())
      WITH CHECK(organization_id=app_current_organization_id());
  `
};
