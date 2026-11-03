-- vants-integraciones · tablas propias (D1 vants-db). Idempotente.
CREATE TABLE IF NOT EXISTS integ_estado (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS integ_canales (auth0_sub TEXT PRIMARY KEY, twitch TEXT, kick TEXT, actualizado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS integ_directos (
  plataforma TEXT NOT NULL, canal TEXT NOT NULL, nombre TEXT, en_vivo INTEGER NOT NULL DEFAULT 0,
  titulo TEXT, juego TEXT, espectadores INTEGER, miniatura TEXT, url TEXT, desde TEXT,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (plataforma, canal));
CREATE TABLE IF NOT EXISTS integ_notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, auth0_sub TEXT, tipo TEXT NOT NULL, titulo TEXT NOT NULL,
  cuerpo TEXT, url TEXT, creada TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_integ_notif_sub ON integ_notificaciones (auth0_sub, id);
CREATE TABLE IF NOT EXISTS integ_notif_lectura (auth0_sub TEXT PRIMARY KEY, leido_hasta TEXT NOT NULL);
