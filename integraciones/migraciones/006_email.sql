-- VANTS · Integraciones · 006 · caché de emails verificadas (JWT) para
-- correos transaccionales de Resend. La columna creador_sub de pt_torneos
-- se añade en runtime (ALTER TABLE no soporta IF NOT EXISTS en D1).
CREATE TABLE IF NOT EXISTS integ_email_sub (auth0_sub TEXT PRIMARY KEY, email TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime('now')));
