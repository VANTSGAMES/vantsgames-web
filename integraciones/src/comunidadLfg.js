// VANTS · Comunidad Fase 1: Buscador LFG / LFT / Scrims (port del API Express a D1)
// -----------------------------------------------------------------------------
// Contrato JSON idéntico a `/api/community/lfg*` de Express (ver client/src/lib/communityApi.ts):
//
//   GET    /community/lfg                       (público + JWT opcional) → { listings }
//   POST   /community/lfg                       (sesión) → 201 { listing }
//   DELETE /community/lfg/:id                   (sesión, autor) → { deleted, id }
//   POST   /community/lfg/:id/apply             (sesión) → 201 { application }
//   GET    /community/lfg/:id/applications      (sesión, autor) → { applications }
//   PATCH  /community/lfg/applications/:appId   (sesión, autor) → { application }

const LFG_TTL_DAYS = 7;
const VALID_GAMES = new Set([
  'valorant', 'cs2', 'fortnite', 'fc27', 'smash', 'warzone',
  'freefire', 'lol', 'wildrift', 'mlbb', 'clashroyale',
]);
const VALID_TYPES = new Set(['lft', 'lfg', 'scrim']);
const VALID_REGIONS = new Set(['VE', 'LATAM-N', 'LATAM-S', 'BR', 'NA']);

let tablasListas = false;
export function resetComunidadLfgCacheForTests() {
  tablasListas = false;
}

async function ensureTablasLfg(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_lfg_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_sub TEXT NOT NULL,
    author_nick TEXT NOT NULL,
    type TEXT NOT NULL,
    game_slug TEXT NOT NULL,
    title TEXT NOT NULL,
    team_name TEXT,
    role_needed TEXT NOT NULL,
    rank_level TEXT NOT NULL,
    schedule TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'VE',
    slots_open INTEGER NOT NULL DEFAULT 1,
    contact TEXT NOT NULL,
    notes TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_lfg_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    applicant_sub TEXT NOT NULL,
    applicant_nick TEXT NOT NULL,
    role TEXT NOT NULL,
    contact TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  )`).run();
  tablasListas = true;
}

function cleanText(value, max) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);
}

function validarAnuncio(input) {
  const type = cleanText(input.type, 16).toLowerCase();
  if (!VALID_TYPES.has(type)) return { ok: false, error: 'Selecciona si buscas equipo (LFT), jugador (LFG) o scrim.' };
  const gameSlug = cleanText(input.gameSlug, 32).toLowerCase();
  if (!VALID_GAMES.has(gameSlug)) return { ok: false, error: 'Selecciona uno de los 11 videojuegos del circuito VANTS.' };
  const title = cleanText(input.title, 90);
  if (title.length < 4) return { ok: false, error: 'Escribe un titular claro (mínimo 4 caracteres).' };
  const roleNeeded = cleanText(input.roleNeeded, 60);
  if (roleNeeded.length < 2) return { ok: false, error: 'Indica el rol o posición (ej. Duelist, IGL, AWPer, Flex).' };
  const rankLevel = cleanText(input.rankLevel, 50);
  if (rankLevel.length < 2) return { ok: false, error: 'Indica tu rango o nivel requerido (ej. Ascendente+, FACEIT Nvl 8).' };
  const schedule = cleanText(input.schedule, 80);
  if (schedule.length < 3) return { ok: false, error: 'Indica tu horario habitual (ej. Lunes a Viernes 20:00–23:00 VET).' };
  const region = cleanText(input.region || 'VE', 16).toUpperCase();
  if (!VALID_REGIONS.has(region)) return { ok: false, error: 'Selecciona una región válida.' };
  const contact = cleanText(input.contact, 80);
  if (contact.length < 3) return { ok: false, error: 'Agrega un contacto (usuario de Discord, Riot ID o X).' };
  const rawSlots = Number(input.slotsOpen ?? 1);
  const slotsOpen = type === 'lft' ? 1 : Number.isFinite(rawSlots) ? Math.max(1, Math.min(10, Math.round(rawSlots))) : 1;
  const teamName = cleanText(input.teamName, 60) || null;
  const notes = cleanText(input.notes, 400) || null;
  return { ok: true, data: { type, gameSlug, title, teamName, roleNeeded, rankLevel, schedule, region, slotsOpen, contact, notes } };
}

function validarSolicitud(input) {
  const role = cleanText(input.role, 60);
  if (role.length < 2) return { ok: false, error: 'Indica tu rol o especialidad.' };
  const contact = cleanText(input.contact, 80);
  if (contact.length < 3) return { ok: false, error: 'Incluye tu usuario de Discord o contacto.' };
  const message = cleanText(input.message, 320);
  if (message.length < 6) return { ok: false, error: 'Escribe un mensaje breve (mínimo 6 caracteres).' };
  return { ok: true, data: { role, contact, message } };
}

// Express usa `userId` numérico; en D1 la identidad es el `sub`, así que exponemos un entero estable derivado.
function userIdNumerico(sub) {
  let h = 0;
  for (const ch of String(sub || '')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return (h % 2147483646) + 1;
}

function listingRow(r) {
  return {
    id: Number(r.id),
    userId: userIdNumerico(r.user_sub),
    authorNick: r.author_nick,
    type: r.type,
    gameSlug: r.game_slug,
    title: r.title,
    teamName: r.team_name ?? null,
    roleNeeded: r.role_needed,
    rankLevel: r.rank_level,
    schedule: r.schedule,
    region: r.region,
    slotsOpen: Number(r.slots_open),
    contact: r.contact,
    notes: r.notes ?? null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

function applicationRow(r) {
  return {
    id: Number(r.id),
    listingId: Number(r.listing_id),
    applicantUserId: userIdNumerico(r.applicant_sub),
    applicantNick: r.applicant_nick,
    role: r.role,
    contact: r.contact,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
  };
}

async function resolverNick(db, claims) {
  const sub = claims && claims.sub ? String(claims.sub) : '';
  if (sub) {
    const p = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (p && (p.display_name || p.username)) return String(p.display_name || p.username).trim().slice(0, 60);
  }
  const fallback = (claims && claims.name) || (claims && claims.email ? String(claims.email).split('@')[0] : '') || 'Jugador';
  return String(fallback).trim().slice(0, 60) || 'Jugador';
}

function parseId(s) {
  const n = Number.parseInt(String(s), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function rutasComunidadLfg(req, env, url, p, m, { json, usuarioClaims }) {
  if (p !== '/community/lfg' && !p.startsWith('/community/lfg/')) return null;
  const db = env.DB;
  await ensureTablasLfg(db);

  const sesion = async (mensaje) => {
    const claims = await usuarioClaims(req, env).catch(() => null);
    if (!claims || !claims.sub) return { error: json({ error: mensaje }, 401) };
    return { claims };
  };

  // GET /community/lfg
  if (p === '/community/lfg' && m === 'GET') {
    try {
      const game = (url.searchParams.get('game') || '').trim().toLowerCase();
      const type = (url.searchParams.get('type') || '').trim().toLowerCase();
      const region = (url.searchParams.get('region') || '').trim().toUpperCase();
      const claims = await usuarioClaims(req, env).catch(() => null);
      const viewerSub = claims && claims.sub ? String(claims.sub) : null;

      const rows = (await db.prepare(
        'SELECT * FROM integ_community_lfg_listings WHERE expires_at > ? ORDER BY created_at DESC, id DESC LIMIT 100',
      ).bind(new Date().toISOString()).all()).results || [];
      const filtrados = rows.filter((r) => (!game || r.game_slug === game) && (!type || r.type === type) && (!region || r.region === region));

      const counts = new Map();
      const cr = (await db.prepare(
        'SELECT listing_id, COUNT(*) AS total FROM integ_community_lfg_applications GROUP BY listing_id',
      ).all()).results || [];
      for (const c of cr) counts.set(Number(c.listing_id), Number(c.total) || 0);

      const applied = new Set();
      if (viewerSub) {
        const ar = (await db.prepare(
          'SELECT listing_id FROM integ_community_lfg_applications WHERE applicant_sub = ?',
        ).bind(viewerSub).all()).results || [];
        for (const a of ar) applied.add(Number(a.listing_id));
      }

      return json({
        listings: filtrados.map((r) => ({
          ...listingRow(r),
          applicationsCount: counts.get(Number(r.id)) || 0,
          isOwner: Boolean(viewerSub && r.user_sub === viewerSub),
          hasApplied: applied.has(Number(r.id)),
        })),
      });
    } catch (e) {
      return json({ error: 'No se pudieron cargar los anuncios de equipo y scrims.' }, 500);
    }
  }

  // POST /community/lfg
  if (p === '/community/lfg' && m === 'POST') {
    const s = await sesion('Inicia sesión para publicar.');
    if (s.error) return s.error;
    const body = await req.json().catch(() => ({}));
    const v = validarAnuncio({
      type: body?.type, gameSlug: body?.gameSlug, title: body?.title, teamName: body?.teamName,
      roleNeeded: body?.roleNeeded, rankLevel: body?.rankLevel, schedule: body?.schedule,
      region: body?.region, slotsOpen: body?.slotsOpen, contact: body?.contact, notes: body?.notes,
    });
    if (!v.ok) return json({ error: v.error }, 400);
    try {
      const nick = await resolverNick(db, s.claims);
      const now = Date.now();
      const createdAt = new Date(now).toISOString();
      const expiresAt = new Date(now + LFG_TTL_DAYS * 86400_000).toISOString();
      const d = v.data;
      const res = await db.prepare(
        `INSERT INTO integ_community_lfg_listings
          (user_sub, author_nick, type, game_slug, title, team_name, role_needed, rank_level, schedule, region, slots_open, contact, notes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        String(s.claims.sub), nick, d.type, d.gameSlug, d.title, d.teamName, d.roleNeeded, d.rankLevel,
        d.schedule, d.region, d.slotsOpen, d.contact, d.notes, expiresAt, createdAt,
      ).run();
      const id = res && res.meta ? res.meta.last_row_id : null;
      const row = await db.prepare('SELECT * FROM integ_community_lfg_listings WHERE id = ?').bind(id).first();
      return json({ listing: { ...listingRow(row), applicationsCount: 0, isOwner: true, hasApplied: false } }, 201);
    } catch (e) {
      return json({ error: 'No se pudo publicar el anuncio.' }, 500);
    }
  }

  // PATCH /community/lfg/applications/:appId
  const mApp = p.match(/^\/community\/lfg\/applications\/([^/]+)$/);
  if (mApp && m === 'PATCH') {
    const s = await sesion('Inicia sesión para responder solicitudes.');
    if (s.error) return s.error;
    const appId = parseId(mApp[1]);
    if (!appId) return json({ error: 'ID de solicitud inválido.' }, 400);
    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || '').trim().toLowerCase();
    if (status !== 'accepted' && status !== 'declined') {
      return json({ error: "Estado inválido. Usa 'accepted' o 'declined'." }, 400);
    }
    try {
      const app = await db.prepare('SELECT * FROM integ_community_lfg_applications WHERE id = ?').bind(appId).first();
      if (!app) return json({ error: 'Solicitud no encontrada.' }, 404);
      const listing = await db.prepare('SELECT id, user_sub FROM integ_community_lfg_listings WHERE id = ?').bind(app.listing_id).first();
      if (!listing || listing.user_sub !== String(s.claims.sub)) {
        return json({ error: 'No tienes permiso para responder esta solicitud.' }, 403);
      }
      await db.prepare('UPDATE integ_community_lfg_applications SET status = ? WHERE id = ?').bind(status, appId).run();
      const updated = await db.prepare('SELECT * FROM integ_community_lfg_applications WHERE id = ?').bind(appId).first();
      return json({ application: applicationRow(updated) });
    } catch (e) {
      return json({ error: 'No se pudo actualizar la solicitud.' }, 500);
    }
  }

  const mId = p.match(/^\/community\/lfg\/([^/]+)(?:\/(apply|applications))?$/);
  if (!mId) return null;
  const sub = mId[2] || '';

  // DELETE /community/lfg/:id
  if (!sub && m === 'DELETE') {
    const s = await sesion('Inicia sesión para continuar.');
    if (s.error) return s.error;
    const id = parseId(mId[1]);
    if (!id) return json({ error: 'ID de anuncio inválido.' }, 400);
    try {
      const row = await db.prepare('SELECT id, user_sub FROM integ_community_lfg_listings WHERE id = ?').bind(id).first();
      if (!row || row.user_sub !== String(s.claims.sub)) {
        return json({ error: 'Anuncio no encontrado o sin permisos.' }, 404);
      }
      await db.prepare('DELETE FROM integ_community_lfg_applications WHERE listing_id = ?').bind(id).run();
      await db.prepare('DELETE FROM integ_community_lfg_listings WHERE id = ?').bind(id).run();
      return json({ deleted: true, id });
    } catch (e) {
      return json({ error: 'No se pudo eliminar el anuncio.' }, 500);
    }
  }

  // POST /community/lfg/:id/apply
  if (sub === 'apply' && m === 'POST') {
    const s = await sesion('Inicia sesión para enviar una solicitud.');
    if (s.error) return s.error;
    const listingId = parseId(mId[1]);
    if (!listingId) return json({ error: 'ID de anuncio inválido.' }, 400);
    const body = await req.json().catch(() => ({}));
    const v = validarSolicitud({ role: body?.role, contact: body?.contact, message: body?.message });
    if (!v.ok) return json({ error: v.error }, 400);
    try {
      const listing = await db.prepare('SELECT * FROM integ_community_lfg_listings WHERE id = ?').bind(listingId).first();
      if (!listing) return json({ error: 'Este anuncio ya no existe.' }, 404);
      if (new Date(listing.expires_at).getTime() <= Date.now()) return json({ error: 'Este anuncio ya expiró.' }, 410);
      const sb = String(s.claims.sub);
      if (listing.user_sub === sb) return json({ error: 'No puedes postularte a tu propio anuncio.' }, 400);
      const existing = await db.prepare(
        'SELECT id FROM integ_community_lfg_applications WHERE listing_id = ? AND applicant_sub = ?',
      ).bind(listingId, sb).first();
      if (existing) return json({ error: 'Ya enviaste una solicitud a este anuncio.' }, 409);

      const nick = await resolverNick(db, s.claims);
      const res = await db.prepare(
        `INSERT INTO integ_community_lfg_applications
          (listing_id, applicant_sub, applicant_nick, role, contact, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).bind(listingId, sb, nick, v.data.role, v.data.contact, v.data.message, new Date().toISOString()).run();
      const id = res && res.meta ? res.meta.last_row_id : null;
      const row = await db.prepare('SELECT * FROM integ_community_lfg_applications WHERE id = ?').bind(id).first();
      return json({ application: applicationRow(row) }, 201);
    } catch (e) {
      return json({ error: 'No se pudo enviar la solicitud.' }, 500);
    }
  }

  // GET /community/lfg/:id/applications
  if (sub === 'applications' && m === 'GET') {
    const s = await sesion('Inicia sesión para ver solicitudes.');
    if (s.error) return s.error;
    const listingId = parseId(mId[1]);
    if (!listingId) return json({ error: 'ID de anuncio inválido.' }, 400);
    try {
      const listing = await db.prepare('SELECT id, user_sub FROM integ_community_lfg_listings WHERE id = ?').bind(listingId).first();
      if (!listing) return json({ error: 'Anuncio no encontrado.' }, 404);
      if (listing.user_sub !== String(s.claims.sub)) {
        return json({ error: 'Solo el autor puede ver las solicitudes de este anuncio.' }, 403);
      }
      const rows = (await db.prepare(
        'SELECT * FROM integ_community_lfg_applications WHERE listing_id = ? ORDER BY created_at DESC, id DESC',
      ).bind(listingId).all()).results || [];
      return json({ applications: rows.map(applicationRow) });
    } catch (e) {
      return json({ error: 'No se pudieron cargar las solicitudes.' }, 500);
    }
  }

  return null;
}
