-- VANTS · Integraciones · 002 — equipos de jugadores, eventos y ranking VANTS.
-- Idempotente: el workflow re-ejecuta todas las migraciones en cada deploy.

-- Equipos creados por los jugadores (la ficha pública vive en pt_teams).
CREATE TABLE IF NOT EXISTS integ_equipos (
  slug TEXT PRIMARY KEY,
  capitan_sub TEXT NOT NULL,
  juego TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integ_equipo_miembros (
  team_slug TEXT NOT NULL,
  auth0_sub TEXT NOT NULL,
  nick TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'jugador',
  unido TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_slug, auth0_sub)
);
CREATE INDEX IF NOT EXISTS idx_integ_miembros_sub ON integ_equipo_miembros (auth0_sub);

-- Eventos de la comunidad publicados por la organización.
CREATE TABLE IF NOT EXISTS integ_eventos (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comunidad',
  descripcion TEXT,
  juego TEXT,
  lugar TEXT,
  url TEXT,
  empieza TEXT NOT NULL,
  termina TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_integ_eventos_empieza ON integ_eventos (empieza);

-- Ranking VANTS: foto del FACEIT de cada jugador vinculado (la refresca el cron).
CREATE TABLE IF NOT EXISTS integ_ranking (
  auth0_sub TEXT PRIMARY KEY,
  faceit_id TEXT NOT NULL,
  nick TEXT NOT NULL,
  avatar TEXT,
  pais TEXT,
  nivel INTEGER,
  elo INTEGER,
  partidas INTEGER,
  winrate REAL,
  kd REAL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
