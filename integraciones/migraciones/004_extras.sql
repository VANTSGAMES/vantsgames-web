-- Foto de equipo, biblioteca de clips (idempotente)
CREATE TABLE IF NOT EXISTS integ_equipo_logo (slug TEXT PRIMARY KEY, mime TEXT NOT NULL, datos TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS integ_clips (
  id TEXT PRIMARY KEY, auth0_sub TEXT NOT NULL, nick TEXT, url TEXT NOT NULL, plataforma TEXT NOT NULL,
  embed TEXT, miniatura TEXT, titulo TEXT, juego TEXT, publico INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (auth0_sub, url));
CREATE INDEX IF NOT EXISTS idx_integ_clips_sub ON integ_clips (auth0_sub, creado);
