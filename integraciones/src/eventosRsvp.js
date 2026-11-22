// VANTS · Comunidad Fase 5: Eventos y Showmatches con RSVP, lista de espera y check-in
// -----------------------------------------------------------------------------
// Persiste en D1 (`vants-db`) con autocreación de tablas y seed inicial de 5 eventos.
// Contrato 100 % compatible con `client/src/pages/EventosComunidad.tsx`,
// `client/src/components/EventWidgets.tsx` y `client/src/pages/Comunidad.tsx`:
//
//   GET    /community/events               (público + JWT opcional)
//   POST   /community/events               (owner/moderador)
//   PATCH  /community/events/:id           (owner/moderador)
//   POST   /community/events/:id/rsvp      (sesión)
//   DELETE /community/events/:id/rsvp      (sesión; promueve waitlist si se libera cupo)
//   POST   /community/events/:id/checkin   (sesión; alterna check-in en cupo confirmado)

import { esOwner } from './comunidad.js';

const VALID_TYPES = new Set(['showmatch', 'scrim_abierta', 'quedada', 'watchparty', 'torneo_relampago']);
const VALID_MODALITIES = new Set(['online', 'presencial', 'hibrido']);
const VALID_GAMES = new Set([
  'general', 'valorant', 'cs2', 'fortnite', 'fc27', 'smash',
  'warzone', 'freefire', 'lol', 'wildrift', 'mlbb', 'clashroyale',
]);
const DEFAULT_OWNER_EMAILS = new Set(['geimerjhoan099@gmail.com']);

let tablasListas = false;
export function resetEventosCacheForTests() {
  tablasListas = false;
}

async function ensureTablasEventos(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_events (
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
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_event_rsvps (
    event_id TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    user_nick TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    role_note TEXT,
    checked_in INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (event_id, user_sub)
  )`).run();
  tablasListas = true;
}

function buildDefaultEvents(nowMs = Date.now()) {
  const inHours = (h) => new Date(nowMs + h * 60 * 60 * 1000).toISOString();
  const created = new Date(nowMs - 6 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'showmatch-valorant-allstars-s4',
      title: 'Showmatch Estelar VALORANT · VANTS All-Stars vs Comunidad',
      type: 'showmatch',
      gameSlug: 'valorant',
      modality: 'online',
      location: 'Discord Oficial VANTS · Canal #showmatch + Directo Twitch',
      streamUrl: 'https://www.twitch.tv/feisreal',
      description: 'Serie Bo3 con capitanes elegidos por la comunidad, casters en vivo y sorteo de insignias de temporada entre los asistentes con check-in confirmado.',
      startsAt: inHours(28),
      endsAt: inHours(31),
      capacity: 20,
      featured: true,
      status: 'open',
      hostNick: 'Organización VANTS',
      createdAt: created,
    },
    {
      id: 'scrim-abierta-cs2-10man-s4',
      title: 'Noche de 10-Man CS2 · Scrims Abiertas FACEIT',
      type: 'scrim_abierta',
      gameSlug: 'cs2',
      modality: 'online',
      location: 'Hub CS2 VANTS · Salas balanceadas por ELO',
      streamUrl: null,
      description: 'Partidas competitivas 5v5 con capitanes rotativos, veto de mapas en vivo y práctica ideal para armar equipo antes de los torneos semanales.',
      startsAt: inHours(46),
      endsAt: inHours(50),
      capacity: 30,
      featured: false,
      status: 'open',
      hostNick: 'Staff CS2 VANTS',
      createdAt: created,
    },
    {
      id: 'copa-relampago-fc27-1v1',
      title: 'Copa Relámpago FC 27 · 1v1 Nocturna Crossplay',
      type: 'torneo_relampago',
      gameSlug: 'fc27',
      modality: 'online',
      location: 'PS5 / Xbox Series / PC · Check-in 30 min antes',
      streamUrl: null,
      description: 'Eliminación directa ágil de 16 jugadores en una sola noche. Confirma tu cupo por RSVP y deja tu EA ID en la nota de registro.',
      startsAt: inHours(72),
      endsAt: inHours(75),
      capacity: 16,
      featured: false,
      status: 'open',
      hostNick: 'Comunidad FC 27',
      createdAt: created,
    },
    {
      id: 'watchparty-finales-s4',
      title: 'Watch Party Oficial · Finales del Circuito VANTS S4',
      type: 'watchparty',
      gameSlug: 'general',
      modality: 'hibrido',
      location: 'Twitch VANTS + Sala de Voz Comunidad',
      streamUrl: 'https://www.twitch.tv/feisreal',
      description: "Seguimiento en vivo de las Grandes Finales de VALORANT y CS2 con análisis táctico, Pick'em en tiempo real y dinámicas con la comunidad.",
      startsAt: inHours(96),
      endsAt: inHours(100),
      capacity: 100,
      featured: true,
      status: 'open',
      hostNick: 'VANTS Broadcast',
      createdAt: created,
    },
    {
      id: 'quedada-fortnite-custom-s4',
      title: 'Quedada Fortnite Zero Build · Salas Personalizadas',
      type: 'quedada',
      gameSlug: 'fortnite',
      modality: 'online',
      location: 'Salas Privadas · Código publicado al hacer check-in',
      streamUrl: null,
      description: 'Cuatro partidas personalizadas en modo Dúos y Solos Zero Build para jugadores registrados en VANTS. Abierto a todos los niveles.',
      startsAt: inHours(120),
      endsAt: inHours(123),
      capacity: 60,
      featured: false,
      status: 'open',
      hostNick: 'Staff Fortnite VANTS',
      createdAt: created,
    },
  ];
}

async function ensureSeeded(db, nowMs = Date.now()) {
  await ensureTablasEventos(db);
  const hit = await db.prepare('SELECT id FROM integ_community_events LIMIT 1').first();
  if (hit) return;
  for (const ev of buildDefaultEvents(nowMs)) {
    await db.prepare(
      `INSERT OR IGNORE INTO integ_community_events
        (id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, status, host_nick, created_by_sub, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    ).bind(
      ev.id, ev.title, ev.type, ev.gameSlug, ev.modality, ev.location,
      ev.streamUrl, ev.description, ev.startsAt, ev.endsAt,
      ev.capacity, ev.featured ? 1 : 0, ev.status, ev.hostNick, ev.createdAt,
    ).run();
  }
}

function computeCapacity(capacity, confirmedCount) {
  const safeCap = Math.max(1, Math.floor(Number(capacity) || 1));
  const safeConf = Math.max(0, Math.floor(Number(confirmedCount) || 0));
  const spotsLeft = Math.max(0, safeCap - safeConf);
  const fillPercent = Math.min(100, Math.round((safeConf / safeCap) * 100));
  const isFull = spotsLeft === 0;
  return { spotsLeft, fillPercent, isFull, nextRsvpStatus: isFull ? 'waitlist' : 'confirmed' };
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const aInactive = a.isPast || a.status !== 'open' ? 1 : 0;
    const bInactive = b.isPast || b.status !== 'open' ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
}

function validateRoleNote(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, roleNote: null };
  if (typeof raw !== 'string') return { ok: false, error: 'La nota de inscripción debe ser texto.' };
  const clean = raw.trim();
  if (clean.length > 120) return { ok: false, error: 'La nota de inscripción no puede superar los 120 caracteres.' };
  return { ok: true, roleNote: clean || null };
}

function isSafeHttpUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateEventDraft(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 5 || title.length > 120) {
    return { ok: false, error: 'El título del evento debe tener entre 5 y 120 caracteres.' };
  }
  const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : 'showmatch';
  if (!VALID_TYPES.has(type)) return { ok: false, error: 'Tipo de evento inválido.' };

  const gameSlug = typeof input.gameSlug === 'string' ? input.gameSlug.trim().toLowerCase() : 'general';
  if (!VALID_GAMES.has(gameSlug)) return { ok: false, error: 'Videojuego inválido.' };

  const modality = typeof input.modality === 'string' ? input.modality.trim().toLowerCase() : 'online';
  if (!VALID_MODALITIES.has(modality)) return { ok: false, error: 'Modalidad inválida.' };

  const location = typeof input.location === 'string' ? input.location.trim() : '';
  if (location.length < 3 || location.length > 140) {
    return { ok: false, error: 'Indica el lugar o plataforma del evento (3 a 140 caracteres).' };
  }

  let streamUrl = null;
  if (typeof input.streamUrl === 'string' && input.streamUrl.trim()) {
    const candidate = input.streamUrl.trim();
    if (candidate.length > 400 || !isSafeHttpUrl(candidate)) {
      return { ok: false, error: 'El enlace de transmisión debe empezar por https:// o http://.' };
    }
    streamUrl = candidate;
  }

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length < 10 || description.length > 600) {
    return { ok: false, error: 'La descripción debe tener entre 10 y 600 caracteres.' };
  }

  const startsRaw = typeof input.startsAt === 'string' ? input.startsAt.trim() : '';
  const startDate = new Date(startsRaw);
  if (!startsRaw || Number.isNaN(startDate.getTime())) {
    return { ok: false, error: 'Indica una fecha y hora de inicio válida.' };
  }

  let endsAt = null;
  if (typeof input.endsAt === 'string' && input.endsAt.trim()) {
    const endDate = new Date(input.endsAt.trim());
    if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return { ok: false, error: 'La fecha de fin debe ser posterior a la de inicio.' };
    }
    endsAt = endDate.toISOString();
  }

  const capNum = Number(input.capacity ?? 20);
  if (!Number.isFinite(capNum) || capNum < 2 || capNum > 500) {
    return { ok: false, error: 'La capacidad debe estar entre 2 y 500 cupos.' };
  }

  return {
    ok: true,
    data: {
      title,
      type,
      gameSlug,
      modality,
      location,
      streamUrl,
      description,
      startsAt: startDate.toISOString(),
      endsAt,
      capacity: Math.round(capNum),
      featured: Boolean(input.featured),
    },
  };
}

async function esModeradorEvento(env, claims) {
  if (!claims || !claims.sub) return false;
  const email = String(claims.email || '').trim().toLowerCase();
  if (email && DEFAULT_OWNER_EMAILS.has(email)) return true;
  const extra = String(env.VANTS_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email && extra.includes(email)) return true;
  return esOwner(env.DB, claims.sub).catch(() => false);
}

async function resolverNickJugador(db, claims) {
  const sub = claims && claims.sub ? String(claims.sub) : '';
  if (sub) {
    const p = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (p && (p.display_name || p.username)) return String(p.display_name || p.username).trim().slice(0, 60);
    const rk = await db.prepare('SELECT nick FROM integ_ranking WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (rk && rk.nick) return String(rk.nick).trim().slice(0, 60);
  }
  const fallback = (claims && claims.name) || (claims && claims.email ? String(claims.email).split('@')[0] : '') || 'Jugador';
  return String(fallback).trim().slice(0, 60) || 'Jugador';
}

async function construirOverview(db, { viewerSub = null, viewerIsModerator = false, nowMs = Date.now() } = {}) {
  await ensureSeeded(db, nowMs);
  const [evRes, rsvpRes] = await Promise.all([
    db.prepare('SELECT * FROM integ_community_events').all(),
    db.prepare('SELECT * FROM integ_community_event_rsvps ORDER BY updated_at ASC').all(),
  ]);
  const eventRows = evRes.results || [];
  const rsvpRows = rsvpRes.results || [];

  const rsvpsByEvent = new Map();
  for (const r of rsvpRows) {
    const list = rsvpsByEvent.get(r.event_id) || [];
    list.push(r);
    rsvpsByEvent.set(r.event_id, list);
  }

  let totalRsvps = 0;
  let userConfirmedCount = 0;
  let userWaitlistCount = 0;

  const items = eventRows.map((e) => {
    const evRsvps = rsvpsByEvent.get(e.id) || [];
    const confirmed = evRsvps.filter((r) => r.status === 'confirmed');
    const waitlist = evRsvps.filter((r) => r.status === 'waitlist');
    totalRsvps += confirmed.length + waitlist.length;

    const viewerHit = viewerSub ? evRsvps.find((r) => r.user_sub === viewerSub) || null : null;
    if (viewerHit && viewerHit.status === 'confirmed') userConfirmedCount += 1;
    if (viewerHit && viewerHit.status === 'waitlist') userWaitlistCount += 1;

    const cap = computeCapacity(e.capacity, confirmed.length);
    const endRef = e.ends_at
      ? new Date(e.ends_at).getTime()
      : new Date(e.starts_at).getTime() + 3 * 60 * 60 * 1000;
    const isPast = Number.isFinite(endRef) && endRef < nowMs;
    const status = e.status === 'closed' || e.status === 'cancelled' ? e.status : 'open';
    const isOpenForRsvp = status === 'open' && !isPast;

    return {
      id: e.id,
      title: e.title,
      type: e.type || 'showmatch',
      gameSlug: e.game_slug || 'general',
      modality: e.modality || 'online',
      location: e.location,
      streamUrl: e.stream_url || null,
      description: e.description,
      startsAt: e.starts_at,
      endsAt: e.ends_at || null,
      capacity: Number(e.capacity) || 20,
      featured: Boolean(e.featured),
      status,
      hostNick: e.host_nick || 'Organización VANTS',
      createdAt: e.created_at,
      confirmedCount: confirmed.length,
      waitlistCount: waitlist.length,
      spotsLeft: cap.spotsLeft,
      fillPercent: cap.fillPercent,
      isFull: cap.isFull,
      isPast,
      isOpenForRsvp,
      viewerRsvp: viewerHit
        ? {
            status: viewerHit.status === 'waitlist' ? 'waitlist' : 'confirmed',
            roleNote: viewerHit.role_note || null,
            checkedIn: Boolean(viewerHit.checked_in),
            updatedAt: viewerHit.updated_at,
          }
        : null,
      attendeesPreview: confirmed.slice(0, 8).map((r) => ({
        nick: r.user_nick,
        status: 'confirmed',
        checkedIn: Boolean(r.checked_in),
      })),
    };
  });

  const sorted = sortEvents(items);
  const totalUpcoming = sorted.filter((e) => !e.isPast && e.status === 'open').length;

  return {
    events: sorted,
    summary: { totalUpcoming, totalRsvps, userConfirmedCount, userWaitlistCount },
    viewer: { isModerator: Boolean(viewerIsModerator) },
  };
}

export async function rutasEventosRsvp(req, env, url, p, m, { json, usuarioClaims }) {
  if (p !== '/community/events' && !p.startsWith('/community/events/')) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // GET /community/events (público; si trae Bearer válido añade estado del usuario y rol moderador)
  if (p === '/community/events' && m === 'GET') {
    const claims = await usuarioClaims(req, env).catch(() => null);
    const viewerIsModerator = await esModeradorEvento(env, claims);
    const overview = await construirOverview(env.DB, {
      viewerSub: claims && claims.sub ? claims.sub : null,
      viewerIsModerator,
      nowMs,
    });
    return json(overview);
  }

  // POST /community/events (crear evento oficial · solo moderador/owner)
  if (p === '/community/events' && m === 'POST') {
    const claims = await usuarioClaims(req, env);
    if (!(await esModeradorEvento(env, claims))) {
      return json({ ok: false, error: 'Solo administradores u owners pueden crear eventos oficiales.' }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const v = validateEventDraft(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);

    await ensureSeeded(env.DB, nowMs);
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
    const id = `evt-${nowMs.toString(36)}-${rand}`;
    const hostNick = await resolverNickJugador(env.DB, claims);
    const d = v.data;

    await env.DB.prepare(
      `INSERT INTO integ_community_events
        (id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, status, host_nick, created_by_sub, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
    ).bind(
      id, d.title, d.type, d.gameSlug, d.modality, d.location, d.streamUrl,
      d.description, d.startsAt, d.endsAt, d.capacity, d.featured ? 1 : 0,
      hostNick, claims.sub, nowIso,
    ).run();

    const overview = await construirOverview(env.DB, {
      viewerSub: claims.sub,
      viewerIsModerator: true,
      nowMs,
    });
    return json(overview, 201);
  }

  // Rutas con :id -> /community/events/:id, /community/events/:id/rsvp, /community/events/:id/checkin
  const tail = p.slice('/community/events/'.length);
  const parts = tail.split('/').filter(Boolean);
  const eventId = decodeURIComponent(parts[0] || '').trim();
  const action = parts[1] || '';
  if (!eventId || parts.length > 2) return json({ ok: false, error: 'Evento no encontrado.' }, 404);

  // PATCH /community/events/:id (abrir/cerrar/cancelar · solo moderador/owner)
  if (!action && m === 'PATCH') {
    const claims = await usuarioClaims(req, env);
    if (!(await esModeradorEvento(env, claims))) {
      return json({ ok: false, error: 'Solo administradores u owners pueden gestionar eventos.' }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const rawStatus = String(body.status || '').trim().toLowerCase();
    if (rawStatus !== 'open' && rawStatus !== 'closed' && rawStatus !== 'cancelled') {
      return json({ ok: false, error: "Estado inválido. Usa 'open', 'closed' o 'cancelled'." }, 400);
    }
    await ensureSeeded(env.DB, nowMs);
    const ev = await env.DB.prepare('SELECT id FROM integ_community_events WHERE id = ?').bind(eventId).first();
    if (!ev) return json({ ok: false, error: 'Evento no encontrado.' }, 404);

    await env.DB.prepare('UPDATE integ_community_events SET status = ? WHERE id = ?').bind(rawStatus, eventId).run();
    const overview = await construirOverview(env.DB, {
      viewerSub: claims.sub,
      viewerIsModerator: true,
      nowMs,
    });
    return json(overview);
  }

  // POST /community/events/:id/rsvp (inscribirse o actualizar nota)
  if (action === 'rsvp' && m === 'POST') {
    const claims = await usuarioClaims(req, env);
    const body = await req.json().catch(() => ({}));
    const noteCheck = validateRoleNote(body.roleNote);
    if (!noteCheck.ok) return json({ ok: false, error: noteCheck.error }, 400);

    await ensureSeeded(env.DB, nowMs);
    const ev = await env.DB.prepare('SELECT * FROM integ_community_events WHERE id = ?').bind(eventId).first();
    if (!ev) return json({ ok: false, error: 'Evento no encontrado.' }, 404);

    const endRef = ev.ends_at
      ? new Date(ev.ends_at).getTime()
      : new Date(ev.starts_at).getTime() + 3 * 60 * 60 * 1000;
    if (ev.status !== 'open' || (Number.isFinite(endRef) && endRef < nowMs)) {
      return json({ ok: false, error: 'Las inscripciones para este evento ya están cerradas.' }, 409);
    }

    const rsvpsRes = await env.DB.prepare(
      'SELECT user_sub, status, role_note, checked_in FROM integ_community_event_rsvps WHERE event_id = ?'
    ).bind(eventId).all();
    const evRsvps = rsvpsRes.results || [];
    const existing = evRsvps.find((r) => r.user_sub === claims.sub);
    const confirmedCount = evRsvps.filter((r) => r.status === 'confirmed').length;
    const assignedStatus = existing
      ? existing.status
      : computeCapacity(ev.capacity, confirmedCount).nextRsvpStatus;

    const userNick = await resolverNickJugador(env.DB, claims);
    const nextRoleNote = body.roleNote !== undefined ? noteCheck.roleNote : (existing ? existing.role_note : null);

    await env.DB.prepare(
      `INSERT INTO integ_community_event_rsvps (event_id, user_sub, user_nick, status, role_note, checked_in, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, user_sub) DO UPDATE SET
         user_nick = excluded.user_nick,
         role_note = excluded.role_note,
         updated_at = excluded.updated_at`
    ).bind(
      eventId, claims.sub, userNick, assignedStatus, nextRoleNote,
      existing ? Number(existing.checked_in || 0) : 0, nowIso,
    ).run();

    const viewerIsModerator = await esModeradorEvento(env, claims);
    const overview = await construirOverview(env.DB, {
      viewerSub: claims.sub,
      viewerIsModerator,
      nowMs,
    });
    return json({ rsvpStatus: assignedStatus, ...overview });
  }

  // DELETE /community/events/:id/rsvp (cancelar inscripción + promover primer waitlist)
  if (action === 'rsvp' && m === 'DELETE') {
    const claims = await usuarioClaims(req, env);
    await ensureSeeded(env.DB, nowMs);
    const ev = await env.DB.prepare('SELECT id FROM integ_community_events WHERE id = ?').bind(eventId).first();
    if (!ev) return json({ ok: false, error: 'Evento no encontrado.' }, 404);

    const existing = await env.DB.prepare(
      'SELECT status FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?'
    ).bind(eventId, claims.sub).first();
    if (!existing) return json({ ok: false, error: 'No tienes una inscripción activa en este evento.' }, 404);

    await env.DB.prepare(
      'DELETE FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?'
    ).bind(eventId, claims.sub).run();

    if (existing.status === 'confirmed') {
      const nextWait = await env.DB.prepare(
        "SELECT user_sub FROM integ_community_event_rsvps WHERE event_id = ? AND status = 'waitlist' ORDER BY updated_at ASC LIMIT 1"
      ).bind(eventId).first();
      if (nextWait && nextWait.user_sub) {
        await env.DB.prepare(
          "UPDATE integ_community_event_rsvps SET status = 'confirmed', updated_at = ? WHERE event_id = ? AND user_sub = ?"
        ).bind(nowIso, eventId, nextWait.user_sub).run();
      }
    }

    const viewerIsModerator = await esModeradorEvento(env, claims);
    const overview = await construirOverview(env.DB, {
      viewerSub: claims.sub,
      viewerIsModerator,
      nowMs,
    });
    return json(overview);
  }

  // POST /community/events/:id/checkin (alternar check-in para cupo confirmado)
  if (action === 'checkin' && m === 'POST') {
    const claims = await usuarioClaims(req, env);
    await ensureSeeded(env.DB, nowMs);
    const ev = await env.DB.prepare('SELECT id, status FROM integ_community_events WHERE id = ?').bind(eventId).first();
    if (!ev) return json({ ok: false, error: 'Evento no encontrado.' }, 404);
    if (ev.status === 'cancelled') return json({ ok: false, error: 'Este evento fue cancelado.' }, 409);

    const existing = await env.DB.prepare(
      'SELECT status, checked_in FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?'
    ).bind(eventId, claims.sub).first();
    if (!existing) {
      return json({ ok: false, error: 'Primero confirma tu asistencia (RSVP) para hacer check-in.' }, 400);
    }
    if (existing.status !== 'confirmed') {
      return json({ ok: false, error: 'Tu inscripción está en lista de espera; el check-in es solo para cupos confirmados.' }, 409);
    }

    const nextCheckedIn = !existing.checked_in;
    await env.DB.prepare(
      'UPDATE integ_community_event_rsvps SET checked_in = ?, updated_at = ? WHERE event_id = ? AND user_sub = ?'
    ).bind(nextCheckedIn ? 1 : 0, nowIso, eventId, claims.sub).run();

    const viewerIsModerator = await esModeradorEvento(env, claims);
    const overview = await construirOverview(env.DB, {
      viewerSub: claims.sub,
      viewerIsModerator,
      nowMs,
    });
    return json({ checkedIn: nextCheckedIn, ...overview });
  }

  return json({ ok: false, error: 'no_encontrado' }, 404);
}
