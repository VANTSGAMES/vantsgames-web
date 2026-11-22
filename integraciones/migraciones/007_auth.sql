-- VANTS · Integraciones · 007 · VANTS Identity (Google OIDC + Email OTP + sesiones)
-- Tablas en D1 vants-db para emitir y rotar sesiones propias de VANTS manteniendo
-- compatibilidad 1:1 con auth0_sub (google-oauth2|<sub>, auth0|... y vants|<uuid>).

CREATE TABLE IF NOT EXISTS integ_auth_identities (
  provider      TEXT NOT NULL,          -- 'google' | 'email'
  provider_sub  TEXT NOT NULL,          -- google sub o email normalizado en minúsculas
  canonical_sub TEXT NOT NULL,          -- 'google-oauth2|<sub>', 'auth0|...' o 'vants|<uuid>'
  email         TEXT,
  name          TEXT,
  avatar_url    TEXT,
  creado        TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_auth_id_canonical ON integ_auth_identities(canonical_sub);

CREATE TABLE IF NOT EXISTS integ_auth_sessions (
  id            TEXT PRIMARY KEY,
  canonical_sub TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 hex del refresh token opaco
  email         TEXT,
  name          TEXT,
  avatar_url    TEXT,
  user_agent    TEXT,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sess_sub ON integ_auth_sessions(canonical_sub);

CREATE TABLE IF NOT EXISTS integ_auth_otp (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,          -- SHA-256 hex(email:code:pepper)
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_otp_email ON integ_auth_otp(email, creado DESC);
