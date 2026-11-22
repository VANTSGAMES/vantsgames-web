-- VANTS · Fase 5: Eventos y Showmatches con inscripción RSVP, lista de espera y check-in.

CREATE TABLE IF NOT EXISTS integ_community_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'showmatch',
  game_slug TEXT NOT NULL DEFAULT 'general',
  modality TEXT NOT NULL DEFAULT 'online',
  location TEXT NOT NULL,
  stream_url TEXT,
  description TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  capacity INTEGER NOT NULL DEFAULT 20,
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  host_nick TEXT NOT NULL,
  created_by_sub TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_integ_community_events_starts
  ON integ_community_events (starts_at);

CREATE TABLE IF NOT EXISTS integ_community_event_rsvps (
  event_id TEXT NOT NULL,
  user_sub TEXT NOT NULL,
  user_nick TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  role_note TEXT,
  checked_in INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (event_id, user_sub)
);

CREATE INDEX IF NOT EXISTS idx_integ_community_event_rsvps_event
  ON integ_community_event_rsvps (event_id, updated_at);
