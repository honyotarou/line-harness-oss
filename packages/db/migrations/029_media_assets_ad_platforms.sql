-- R2-backed media metadata + ad platform connection registry (credentials optional; outbound gated in Worker).
CREATE TABLE IF NOT EXISTS media_assets (
  id               TEXT PRIMARY KEY,
  line_account_id  TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  r2_key           TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  byte_size        INTEGER NOT NULL,
  public_token     TEXT NOT NULL UNIQUE,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_line_account_id ON media_assets (line_account_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_public_token ON media_assets (public_token);

CREATE TABLE IF NOT EXISTS ad_platform_connections (
  id                  TEXT PRIMARY KEY,
  provider            TEXT NOT NULL CHECK (provider IN ('meta', 'google', 'tiktok', 'x')),
  name                TEXT NOT NULL,
  line_account_id     TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  external_account_ref TEXT,
  credentials_enc     TEXT,
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_ad_platform_connections_line_account_id ON ad_platform_connections (line_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_platform_connections_provider ON ad_platform_connections (provider);
