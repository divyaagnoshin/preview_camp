-- Saved cloud-import connection profiles. Lets users register multiple
-- S3 / FTP / GCS sources up front (Manage > Cloud Import) and then run a
-- one-click import from any of them, instead of re-typing credentials
-- every time. Credentials live in JSONB so the schema doesn't have to
-- change when a provider needs new fields.
CREATE TABLE IF NOT EXISTS cloud_import_configs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  provider    TEXT        NOT NULL CHECK (provider IN ('s3', 'ftp', 'gcs')),
  credentials JSONB       NOT NULL DEFAULT '{}'::jsonb,
  options     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cloud_import_configs_org
  ON cloud_import_configs (org_id);
