-- Migración 009: VANTS Sentinel Anti-Cheat (vants_bans, challenges, heartbeats),
-- Formularios nativos (vants_formularios_envios) y tokens efímeros Google drive.file (1 solo login).
-- Idempotente: segura de re-ejecutar en cada despliegue.

CREATE TABLE IF NOT EXISTS vants_bans (
  id TEXT PRIMARY KEY,
  user_sub TEXT,
  nick TEXT,
  steam_id TEXT,
  faceit_id TEXT,
  discord_id TEXT,
  hwid TEXT,
  motivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  evidencia_json TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vants_bans_user_sub ON vants_bans (user_sub, activo);
CREATE INDEX IF NOT EXISTS idx_vants_bans_steam_id ON vants_bans (steam_id, activo);
CREATE INDEX IF NOT EXISTS idx_vants_bans_faceit_id ON vants_bans (faceit_id, activo);
CREATE INDEX IF NOT EXISTS idx_vants_bans_discord_id ON vants_bans (discord_id, activo);
CREATE INDEX IF NOT EXISTS idx_vants_bans_hwid ON vants_bans (hwid, activo);

CREATE TABLE IF NOT EXISTS vants_ac_challenges (
  nonce TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vants_ac_challenges_sub ON vants_ac_challenges (user_sub, expires_at);

CREATE TABLE IF NOT EXISTS vants_ac_heartbeats (
  user_sub TEXT PRIMARY KEY,
  hwid TEXT,
  app_version TEXT,
  vanguard_on INTEGER NOT NULL DEFAULT 0,
  faceit_ac_on INTEGER NOT NULL DEFAULT 0,
  eac_on INTEGER NOT NULL DEFAULT 0,
  battleye_on INTEGER NOT NULL DEFAULT 0,
  shield_status TEXT NOT NULL DEFAULT 'clean',
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vants_ac_hb_exp ON vants_ac_heartbeats (expires_at);

CREATE TABLE IF NOT EXISTS vants_formularios_envios (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  user_sub TEXT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  juego TEXT,
  torneo_slug TEXT,
  organizacion TEXT,
  asunto TEXT,
  datos_json TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'recibido',
  calendar_url TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vants_form_tipo ON vants_formularios_envios (tipo, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_vants_form_sub ON vants_formularios_envios (user_sub, creado_en DESC);

CREATE TABLE IF NOT EXISTS integ_google_drive_tokens (
  canonical_sub TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
