export const socialBrandMigration = {
  id: "014_social_brand_and_language",
  up: `
    ALTER TABLE clients ADD COLUMN content_language TEXT NOT NULL DEFAULT '';
    ALTER TABLE social_contents ADD COLUMN visual_direction TEXT NOT NULL DEFAULT '';
  `
};
