-- VANTS · Integraciones · juegos: Riot ID (VALORANT), logros conseguidos y equipo FACEIT.
CREATE TABLE IF NOT EXISTS integ_riot (
  auth0_sub   TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  tag         TEXT NOT NULL,
  region      TEXT,
  puuid       TEXT,
  verificado  INTEGER NOT NULL DEFAULT 0,
  datos       TEXT,
  actualizado TEXT
);
CREATE TABLE IF NOT EXISTS integ_logros_ok (
  auth0_sub  TEXT NOT NULL,
  code       TEXT NOT NULL,
  conseguido TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (auth0_sub, code)
);
CREATE TABLE IF NOT EXISTS integ_faceit_equipo (
  auth0_sub   TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  actualizado TEXT
);
