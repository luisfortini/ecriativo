export const studioMigration = {
  id: "016_guided_studio_and_brand_contacts",
  up: `
    ALTER TABLE organizations ADD COLUMN account_type TEXT NOT NULL DEFAULT 'agency'
      CHECK (account_type IN ('company', 'agency'));
    ALTER TABLE clients ADD COLUMN contact_phone TEXT;
    ALTER TABLE clients ADD COLUMN instagram_handle TEXT;
    ALTER TABLE clients ADD COLUMN address TEXT;
  `
};
