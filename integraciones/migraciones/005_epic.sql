-- Cuentas de Epic Games (Fortnite) vinculadas por OAuth de Epic Account Services.
CREATE TABLE IF NOT EXISTS integ_epic (
  auth0_sub    TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL UNIQUE,
  display_name TEXT,
  desde        TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado  TEXT NOT NULL DEFAULT (datetime('now'))
);
