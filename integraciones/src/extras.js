// VANTS · Integraciones · extras
// -----------------------------------------------------------------------------
// - Foto de equipo: el capitán (o el dueño) sube una imagen; se guarda en D1
//   (integ_equipo_logo) y se sirve en GET /equipos/logo/<slug>. pt_teams.logo_url
//   apunta a esa URL, así la ven todas las fichas de equipo.
// - Clips: biblioteca del jugador. Publicar por enlace (YouTube, Twitch, Kick,
//   Medal, Streamable, Outplayed) y los clips de su canal de Twitch se añaden
//   solos (Helix /clips). GET /clips/comunidad lista los públicos.
// - Membresía: plan activo leído de D1 (entitlements). El dueño tiene el plan
//   máximo (todos los planes) sin caducidad.

import { esOwner } from './comunidad.js';
import { webhookDiscord } from './comms.js';
import { identidadDe, invalidarIdentidades, perfilPublico, jugadoresPublicos, rosterOficial, editarRoster } from './perfiles.js'
import { rutasInsignias, invalidarInsignias, evaluar } from './insignias.js';

const INT_URL = 'https://vants-integraciones.vants.workers.dev';
const JUEGOS = ['valorant', 'cs2', 'fortnite', 'fc27', 'smash', 'warzone', 'freefire', 'lol', 'wildrift', 'mlbb', 'clashroyale', 'otro'];
const normalizarJuego = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return JUEGOS.includes(s) ? s : 'otro';
};
const PLANES = ['pro', 'creator', 'pase', 'socio'];

async function asegurar(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS integ_equipo_logo (slug TEXT PRIMARY KEY, mime TEXT NOT NULL, datos TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_clips (
      id TEXT PRIMARY KEY, auth0_sub TEXT NOT NULL, nick TEXT, url TEXT NOT NULL, plataforma TEXT NOT NULL,
      embed TEXT, miniatura TEXT, titulo TEXT, juego TEXT, publico INTEGER NOT NULL DEFAULT 1,
      creado TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (auth0_sub, url))`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_integ_clips_sub ON integ_clips (auth0_sub, creado)'),
    db.prepare("CREATE TABLE IF NOT EXISTS integ_foto (pid TEXT PRIMARY KEY, mime TEXT, datos TEXT, url TEXT, actualizado TEXT NOT NULL DEFAULT (datetime('now')))"),
  ]);
}
let listo = false;
async function preparar(env) {
  if (listo) return;
  await asegurar(env.DB);
  await env.DB.prepare('ALTER TABLE integ_clips ADD COLUMN video TEXT').run().catch(() => null); // ya existe
  await env.DB.prepare('ALTER TABLE perfiles_publicos ADD COLUMN banner TEXT').run().catch(() => null); // ya existe
  await env.DB.prepare('ALTER TABLE perfiles_publicos ADD COLUMN vitrina TEXT').run().catch(() => null); // ya existe
  listo = true;
}

const uid = () => crypto.randomUUID().replace(/-/g, '');
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function nickDe(db, sub) {
  const id = await identidadDe(db, sub).catch(() => null);
  if (id && id.nick) return id.nick;
  const p = await db.prepare('SELECT nickname FROM perfiles_publicos WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  if (p && p.nickname) return p.nickname;
  const pl = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  return (pl && (pl.display_name || pl.username)) || 'Jugador';
}

/* ------------------------------------------------------------ clips */

// Devuelve { plataforma, embed, miniatura, id } o null si el enlace no es válido.
export function analizarClip(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const parent = 'vants.vants.workers.dev';
  let m;
  if (h === 'youtu.be' && (m = u.pathname.match(/^\/([\w-]{11})/))) return yt(m[1]);
  if (h === 'youtube.com') {
    if (u.searchParams.get('v') && /^[\w-]{11}$/.test(u.searchParams.get('v'))) return yt(u.searchParams.get('v'));
    if ((m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/))) return yt(m[1]);
  }
  if (h === 'clips.twitch.tv' && (m = u.pathname.match(/^\/([\w-]{3,120})/))) return tw(m[1]);
  if (h === 'twitch.tv' && (m = u.pathname.match(/^\/[\w]+\/clip\/([\w-]{3,120})/))) return tw(m[1]);
  if (h === 'twitch.tv' && (m = u.pathname.match(/^\/videos\/(\d+)/))) return { plataforma: 'twitch', id: m[1], embed: 'https://player.twitch.tv/?video=' + m[1] + '&parent=' + parent + '&autoplay=false', miniatura: null };
  if (h === 'kick.com' && (m = u.pathname.match(/^\/([\w-]+)\/clips\/(clip_[\w]+)/))) return { plataforma: 'kick', id: m[2], canal: m[1], embed: null, miniatura: null };
  if (h === 'kick.com' && /^clip_[\w]+$/.test(u.searchParams.get('clip') || '')) return { plataforma: 'kick', id: u.searchParams.get('clip'), canal: u.pathname.split('/')[1] || null, embed: null, miniatura: null };
  if (h === 'medal.tv' && (m = u.pathname.match(/\/clips\/([\w-]+)/))) return { plataforma: 'medal', id: m[1], embed: 'https://medal.tv/clip/' + m[1] + '?autoplay=0', miniatura: null };
  if (h === 'streamable.com' && (m = u.pathname.match(/^\/(?:e\/)?([a-z0-9]{4,12})$/i))) return { plataforma: 'streamable', id: m[1], embed: 'https://streamable.com/e/' + m[1], miniatura: null };
  if (h === 'outplayed.tv' || h.endsWith('.outplayed.tv')) return { plataforma: 'outplayed', id: u.pathname, embed: null, miniatura: null };
  // FACEIT: los vídeos de faceit.com/<idioma>/players/<nick>/videos/<id> son clips de Allstar.
  if (h === 'faceit.com' && (m = u.pathname.match(/\/players\/[^/]+\/videos\/([0-9a-f]{24})/i))) return fc(m[1].toLowerCase());
  if (h === 'allstar.gg' && /^[0-9a-f]{24}$/i.test(u.searchParams.get('clip') || '')) return fc(u.searchParams.get('clip').toLowerCase());
  if (h === 'allstar.gg' && (m = u.pathname.match(/^\/clip\/([0-9a-f]{24})/i))) return fc(m[1].toLowerCase());
  return null;
  function fc(id) { return { plataforma: 'faceit', id, embed: 'https://allstar.gg/iframe?clip=' + id + '&known=true&platform=FACEIT&useCase=BP', miniatura: null }; }
  function yt(id) { return { plataforma: 'youtube', id, embed: 'https://www.youtube-nocookie.com/embed/' + id, miniatura: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' }; }
  function tw(id) { return { plataforma: 'twitch', id, embed: 'https://clips.twitch.tv/embed?clip=' + id + '&parent=' + parent + '&autoplay=false', miniatura: null }; }
}

async function datosClipFaceit(id) {
  const r = await fetch('https://www.faceit.com/api/allstar/v1/clips/' + id, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const c = j && j.payload;
  if (!c) return null;
  const ok = (v) => { try { const x = new URL(String(v || '')); return x.protocol === 'https:' && /(^|\.)allstar\.gg$/.test(x.hostname) ? x.toString().slice(0, 400) : null; } catch { return null; } };
  return { title: c.title || null, thumbnail_url: ok(c.thumbnail_url) };
}

async function twitchHeaders(env, H) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
  const tk = await H.cacheado('tok:twitch:x', 3000_000, async () => {
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new Error('token_twitch');
    return j.access_token;
  });
  return { Authorization: 'Bearer ' + tk, 'Client-Id': env.TWITCH_CLIENT_ID };
}

async function datosClipTwitch(env, H, id) {
  const hd = await twitchHeaders(env, H).catch(() => null);
  if (!hd) return null;
  const r = await fetch('https://api.twitch.tv/helix/clips?id=' + encodeURIComponent(id), { headers: hd });
  const j = await r.json().catch(() => ({}));
  return (j.data || [])[0] || null;
}

const TWITCH_JUEGOS = {
  '516575': 'valorant',
  '32399': 'cs2',
  '33214': 'fortnite',
  '2011938005': 'fc27',
  '143106037': 'fc27',
  '1745202732': 'fc27',
  '504461': 'smash',
  '512710': 'warzone',
  '502732': 'freefire',
  '21779': 'lol',
  '514858': 'wildrift',
  '512923': 'mlbb',
  '491168': 'clashroyale',
};
const juegoTwitch = (gid) => TWITCH_JUEGOS[String(gid || '')] || 'otro';

// Clips del canal de Twitch del jugador (los más vistos de los últimos 180 días).
async function clipsTwitchCanal(env, H, login) {
  if (!login) return [];
  return H.cacheado('twclips:' + login, 600_000, async () => {
    const hd = await twitchHeaders(env, H).catch(() => null);
    if (!hd) return [];
    const ru = await fetch('https://api.twitch.tv/helix/users?login=' + encodeURIComponent(login), { headers: hd });
    const u = ((await ru.json().catch(() => ({}))).data || [])[0];
    if (!u) return [];
    const desde = new Date(Date.now() - 180 * 864e5).toISOString();
    const rc = await fetch('https://api.twitch.tv/helix/clips?first=24&started_at=' + desde + '&broadcaster_id=' + u.id, { headers: hd });
    const cs = (await rc.json().catch(() => ({}))).data || [];
    return cs.map((c) => ({
      id: 'tw_' + c.id, origen: 'twitch', plataforma: 'twitch', url: c.url, titulo: c.title, juego: juegoTwitch(c.game_id),
      miniatura: c.thumbnail_url || null, embed: 'https://clips.twitch.tv/embed?clip=' + c.id + '&parent=vants.vants.workers.dev&autoplay=false',
      vistas: c.view_count, duracion: c.duration, creado: c.created_at, autor: c.creator_name, propio: false,
    }));
  });
}

const UA_NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
async function kickJson(path) {
  const r = await fetch('https://kick.com/api/v2' + path, { headers: { 'User-Agent': UA_NAV, Accept: 'application/json' } });
  if (!r.ok) throw new Error('kick_' + r.status);
  return r.json();
}
const juegoKick = (c) => {
  const n = String((c && (c.slug || c.name)) || '').toLowerCase();
  if (n.includes('valorant')) return 'valorant';
  if (/counter|cs2|cs-2/.test(n)) return 'cs2';
  if (n.includes('fortnite')) return 'fortnite';
  if (/ea[- ]?sports[- ]?fc|\bfc[- ]?2[4-9]\b|fifa/.test(n)) return 'fc27';
  if (n.includes('smash')) return 'smash';
  if (/warzone|call[- ]?of[- ]?duty/.test(n)) return 'warzone';
  if (/free[- ]?fire/.test(n)) return 'freefire';
  if (/wild[- ]?rift/.test(n)) return 'wildrift';
  if (/league[- ]?of[- ]?legends|\blol\b/.test(n)) return 'lol';
  if (/mobile[- ]?legends|mlbb/.test(n)) return 'mlbb';
  if (/clash[- ]?royale/.test(n)) return 'clashroyale';
  return 'otro';
};

async function datosClipKick(id) {
  const j = await kickJson('/clips/' + encodeURIComponent(id));
  const c = j && j.clip;
  return c ? { titulo: c.title, video: c.video_url || c.clip_url || null, miniatura: c.thumbnail_url || null, juego: juegoKick(c.category), canal: c.channel && c.channel.slug } : null;
}

// Clips del canal de Kick del jugador (los últimos 24).
async function clipsKickCanal(H, canal) {
  if (!canal) return [];
  return H.cacheado('kkclips:' + canal, 600_000, async () => {
    const j = await kickJson('/channels/' + encodeURIComponent(canal) + '/clips?sort=date&time=all');
    return ((j && j.clips) || []).slice(0, 24).map((c) => ({
      id: 'kk_' + c.id, origen: 'kick', plataforma: 'kick', url: 'https://kick.com/' + canal + '/clips/' + c.id, titulo: c.title, juego: juegoKick(c.category),
      miniatura: c.thumbnail_url || null, embed: null, video: c.video_url || c.clip_url || null,
      vistas: c.views ?? c.view_count ?? null, duracion: c.duration, creado: c.created_at, autor: (c.creator && c.creator.username) || canal, propio: false,
    }));
  });
}

async function canalKickDe(db, sub) {
  const c = await db.prepare('SELECT kick FROM integ_canales WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  if (c && c.kick) return c.kick.toLowerCase();
  const l = await db.prepare("SELECT handle FROM vants_links WHERE auth0_sub = ? AND platform = 'kick'").bind(sub).first().catch(() => null);
  return l && l.handle ? String(l.handle).toLowerCase() : null;
}

// Clips subidos desde el ordenador (vitrina vants-clips del Worker principal).
async function clipsSubidos(H, subs) {
  const j = await H.cacheado('featured', 60_000, async () => {
    const r = await fetch('https://vants.vants.workers.dev/api/clips/featured', { headers: { 'User-Agent': UA_NAV, Accept: 'application/json' } });
    return r.ok ? r.json() : { clips: [] };
  }).catch(() => ({ clips: [] }));
  return ((j && j.clips) || []).filter((c) => c && subs.includes(c.sub)).map((c) => ({
    id: c.id, origen: 'subido', plataforma: 'vants', url: c.video, titulo: c.titulo, juego: normalizarJuego(c.juego),
    miniatura: c.thumb || null, embed: null, video: c.video, duracion: c.dur, creado: c.fecha, autor: c.nick, propio: true,
  }));
}

async function canalTwitchDe(db, sub) {
  const c = await db.prepare('SELECT twitch FROM integ_canales WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  if (c && c.twitch) return c.twitch.toLowerCase();
  const l = await db.prepare("SELECT handle FROM vants_links WHERE auth0_sub = ? AND platform = 'twitch'").bind(sub).first().catch(() => null);
  return l && l.handle ? String(l.handle).toLowerCase() : null;
}

const isoD1 = (v) => (v && !/[TZ]/.test(v) ? v.replace(' ', 'T') + 'Z' : v);
const filaClip = (r) => ({ id: r.id, origen: r.plataforma === 'subido' ? 'subido' : 'vants', kv: r.plataforma === 'subido', plataforma: r.plataforma, url: r.url, titulo: r.titulo, juego: r.juego, miniatura: r.miniatura, embed: r.embed, video: r.video || null, creado: isoD1(r.creado), autor: r.nick, publico: !!r.publico, propio: true });

/* ------------------------------------------------------------ foto de equipo */

async function puedeEditarEquipo(db, slug, sub) {
  const e = await db.prepare('SELECT slug, capitan_sub FROM integ_equipos WHERE slug = ?').bind(slug).first();
  if (!e) {
    // Equipos sin capitán en la web (p. ej. el roster oficial «vants»): solo el dueño.
    if (!(await esOwner(db, sub))) return null;
    let t = await db.prepare('SELECT slug FROM pt_teams WHERE slug = ?').bind(slug).first();
    if (!t && slug === 'vants') {
      await db.prepare("INSERT INTO pt_teams (id, slug, nombre, tag) VALUES (?, 'vants', 'VANTS', 'VTS')").bind(crypto.randomUUID()).run();
      t = { slug };
    }
    return t ? { slug } : null;
  }
  if (e.capitan_sub === sub || (await esOwner(db, sub))) return e;
  return null;
}

function b64aBytes(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/* ------------------------------------------------------------ membresía */

export async function membresiaDe(env, sub) {
  const owner = await esOwner(env.DB, sub);
  if (owner) {
    return { plan: 'socio', planes: PLANES, nombre: 'SOCIO VANTS · Dueño', origen: 'owner', caduca: null, activo: true, todos: true };
  }
  const ident = await identidadDe(env.DB, sub).catch(() => null);
  const subs = ident ? ident.subs : [sub];
  const rs = await env.DB.prepare(
    "SELECT tier, period, expires_at, source FROM entitlements WHERE auth0_sub IN (" + subs.map(() => '?').join(',') + ") AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).bind(...subs).all().catch(() => ({ results: [] }));
  const act = (rs.results || []).filter((r) => PLANES.includes(String(r.tier || '').toLowerCase()));
  if (!act.length) return { plan: null, planes: [], activo: false };
  const orden = ['socio', 'creator', 'pro', 'pase'];
  act.sort((a, b) => orden.indexOf(a.tier) - orden.indexOf(b.tier));
  const top = act[0];
  return { plan: top.tier, planes: act.map((r) => r.tier), nombre: null, origen: top.source, caduca: top.expires_at || null, periodo: top.period || null, activo: true, todos: false };
}


/* ------------------------------------------------------------ clips subidos (KV) */
// R2 no está activado en la cuenta y el repositorio de clips no tiene token: los
// vídeos subidos desde el ordenador se guardan en KV (CLIPS_KV) en trozos de
// 20 MB (límite de valor de KV: 25 MiB) y se sirven con soporte de Range.
const MAX_CLIP = Math.round(50.5 * 1024 * 1024);
const TROZO = 20 * 1024 * 1024;

async function servirClipKv(req, env, tipo, id) {
  if (!env.CLIPS_KV) return new Response('no disponible', { status: 503 });
  const cab = { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=604800, immutable', 'x-content-type-options': 'nosniff' };
  if (tipo === 'mini') {
    const t = await env.CLIPS_KV.get('t:' + id, { type: 'arrayBuffer', cacheTtl: 86400 });
    return t ? new Response(t, { headers: { ...cab, 'content-type': 'image/jpeg' } }) : new Response('no encontrado', { status: 404 });
  }
  const meta = await env.CLIPS_KV.get('m:' + id, { type: 'json', cacheTtl: 3600 });
  if (!meta) return new Response('no encontrado', { status: 404 });
  const total = meta.size;
  let ini = 0, fin = total - 1, parcial = false;
  const rg = (req.headers.get('range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (rg) {
    parcial = true;
    if (rg[1] === '' && rg[2] !== '') { ini = Math.max(0, total - Number(rg[2])); }
    else { ini = Number(rg[1] || 0); if (rg[2] !== '') fin = Math.min(total - 1, Number(rg[2])); }
    if (ini >= total || ini > fin) return new Response(null, { status: 416, headers: { ...cab, 'content-range': 'bytes */' + total } });
  }
  const h = { ...cab, 'content-type': meta.mime, 'accept-ranges': 'bytes', 'content-length': String(fin - ini + 1) };
  if (parcial) h['content-range'] = 'bytes ' + ini + '-' + fin + '/' + total;
  if (req.method === 'HEAD') return new Response(null, { status: parcial ? 206 : 200, headers: h });
  const p0 = Math.floor(ini / TROZO), p1 = Math.floor(fin / TROZO);
  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter();
    try {
      for (let i = p0; i <= p1; i++) {
        const b = await env.CLIPS_KV.get('v:' + id + ':' + i, { type: 'arrayBuffer', cacheTtl: 3600 });
        if (!b) break;
        const base = i * TROZO;
        const a = Math.max(ini, base) - base, z = Math.min(fin, base + b.byteLength - 1) - base + 1;
        await w.write(new Uint8Array(b, a, z - a));
      }
    } catch { /* cliente cerró */ }
    await w.close().catch(() => null);
  })();
  return new Response(readable, { status: parcial ? 206 : 200, headers: h });
}

/* ------------------------------------------------------------ rutas */

export async function rutasExtras(req, env, url, p, m, H) {
  // ---- públicas
  let mm;
  if ((mm = p.match(/^\/equipos\/logo\/([a-z0-9-]{1,80})$/)) && m === 'GET') {
    await preparar(env);
    const r = await env.DB.prepare('SELECT mime, datos FROM integ_equipo_logo WHERE slug = ?').bind(mm[1]).first();
    if (!r) return new Response('no encontrado', { status: 404 });
    return new Response(b64aBytes(r.datos), { headers: { 'content-type': r.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
  }
  if ((mm = p.match(/^\/foto\/([0-9a-f]{16})$/)) && m === 'GET') {
    await preparar(env);
    const r = await env.DB.prepare('SELECT mime, datos FROM integ_foto WHERE pid = ? AND datos IS NOT NULL').bind(mm[1]).first();
    if (!r) return new Response('no encontrado', { status: 404 });
    return new Response(b64aBytes(r.datos), { headers: { 'content-type': r.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' } });
  }
  if ((mm = p.match(/^\/clips\/(archivo|mini)\/([0-9a-f]{32})$/)) && (m === 'GET' || m === 'HEAD')) {
    return servirClipKv(req, env, mm[1], mm[2]);
  }
  if (p === '/clips/comunidad' && m === 'GET') {
    await preparar(env);
    const juego = url.searchParams.get('juego');
    const rs = await env.DB.prepare(
      'SELECT id, nick, url, plataforma, embed, miniatura, titulo, juego, publico, creado, video FROM integ_clips WHERE publico = 1 ' + (juego && JUEGOS.includes(juego) ? 'AND juego = ? ' : '') + 'ORDER BY creado DESC LIMIT 48'
    ).bind(...(juego && JUEGOS.includes(juego) ? [juego] : [])).all();
    return H.json({ ok: true, clips: (rs.results || []).map((r) => ({ ...filaClip(r), propio: false })) }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  if (p === '/jugadores' && m === 'GET') return H.json({ ok: true, jugadores: await jugadoresPublicos(env) }, 200, { 'Cache-Control': 'public, max-age=60' });
  if ((mm = p.match(/^\/u\/([0-9a-f]{16})$/)) && m === 'GET') {
    await preparar(env);
    const d = await perfilPublico(env, mm[1]);
    return d ? H.json({ ok: true, perfil: d }, 200, { 'Cache-Control': 'public, max-age=60' }) : H.json({ ok: false, error: 'no_encontrado' }, 404);
  }
  if (p === '/insignias' || p.startsWith('/insignias/')) {
    const subI = p === '/insignias' ? null : await H.usuario(req, env).catch(() => null);
    const ri = await rutasInsignias(req, env, p, m, H, subI);
    if (ri) return ri;
  }
  if (p === '/roster-oficial' && m === 'GET') return H.json({ ok: true, ...(await rosterOficial(env)) });
  if (p.startsWith('/roster-oficial/') && m === 'POST') {
    const sub = await H.usuario(req, env);
    if (!(await esOwner(env.DB, sub))) return H.json({ ok: false, error: 'solo_owner' }, 403);
    const r = await editarRoster(env, p, await req.json().catch(() => ({})));
    invalidarInsignias();
    const st = r.status || 200; delete r.status;
    return H.json(r, r.ok ? 200 : st);
  }

  const privadas = ['/clips/mios', '/clips', '/clips/borrar', '/clips/subir', '/clips/editar', '/equipos/logo', '/membresia', '/perfil/foto', '/perfil/publico', '/perfil/vitrina'];
  if (!privadas.includes(p)) return null;
  await preparar(env);
  const sub = await H.usuario(req, env);

  if (p === '/membresia' && m === 'GET') return H.json({ ok: true, ...(await membresiaDe(env, sub)) });

  // Perfil público editable: banner (URL https) y redes sociales del jugador.
  const REDES_OK = ['twitch', 'youtube', 'x', 'tiktok', 'instagram'];
  if (p === '/perfil/publico') {
    if (m === 'GET') {
      const fila = await env.DB.prepare('SELECT banner, redes, vitrina FROM perfiles_publicos WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
      let redes = null;
      try { redes = fila && fila.redes ? JSON.parse(fila.redes) : null; } catch { redes = null; }
      let vitrina = null;
      try { vitrina = fila && fila.vitrina ? JSON.parse(fila.vitrina) : null; } catch { vitrina = null; }
      return H.json({ ok: true, banner: fila ? fila.banner : null, redes, vitrina: Array.isArray(vitrina) ? vitrina : null });
    }
    if (m !== 'POST') return H.json({ ok: false, error: 'metodo' }, 405);
    const b = await req.json().catch(() => ({}));
    // Banner: imagen subida (data URL ≤ 500 KB; el cliente la recorta a 3:1 y
    // la comprime antes de enviar) o URL https válida. Null = quitar.
    let banner = null;
    if (typeof b.banner === 'string' && b.banner.trim()) {
      const v = b.banner.trim();
      const mt = v.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (mt) {
        if (mt[2].length > 500_000) return H.json({ ok: false, error: 'banner_grande' }, 413);
        banner = v;
      } else if (/^https:\/\/[^\s"'<>]{4,600}$/.test(v)) {
        banner = v;
      } else return H.json({ ok: false, error: 'banner_invalido' }, 400);
    }
    // Redes: solo claves permitidas, valores usuario/url de hasta 120 chars.
    const redes = {};
    if (b.redes && typeof b.redes === 'object') {
      for (const k of REDES_OK) {
        const v = txt(b.redes[k], 120);
        if (v) redes[k] = v;
      }
    }
    const nick = await nickDe(env.DB, sub);
    await env.DB.prepare(
      `INSERT INTO perfiles_publicos (auth0_sub, nickname, redes, banner, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(auth0_sub) DO UPDATE SET redes = excluded.redes, banner = excluded.banner, updated_at = datetime('now')`
    ).bind(sub, nick, JSON.stringify(redes), banner).run();
    invalidarIdentidades();
    return H.json({ ok: true, banner, redes });
  }

  // Vitrina de insignias: cuáles mostrar en la ficha pública y en qué orden.
  // Solo se aceptan insignias conseguidas por el propio usuario; máx. 6.
  if (p === '/perfil/vitrina' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const pedidas = Array.isArray(b.codigos) ? [...new Set(b.codigos.map((c) => String(c || '').slice(0, 40)))].filter(Boolean) : [];
    if (pedidas.length > 6) return H.json({ ok: false, error: 'vitrina_maxima' }, 400);
    const ident = await identidadDe(env.DB, sub).catch(() => null);
    if (!ident) return H.json({ ok: false, error: 'sin_perfil' }, 409);
    const ins = await evaluar(env, ident).catch(() => null);
    const conseguidas = new Set([...(((ins && ins.conseguidas) || [])), 'MEMBER']);
    const codigos = pedidas.filter((c) => consiguidas.has(c));
    const nick = await nickDe(env.DB, sub);
    await env.DB.prepare(
      "INSERT INTO perfiles_publicos (auth0_sub, nickname, vitrina, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(auth0_sub) DO UPDATE SET vitrina = excluded.vitrina, updated_at = datetime('now')"
    ).bind(sub, nick, JSON.stringify(codigos)).run();
    invalidarIdentidades();
    return H.json({ ok: true, codigos });
  }

  // Foto del perfil principal: subida (data URL ≤ 300 KB), enlace https (p. ej. la foto de Google/Twitch) o quitar.
  if (p === '/perfil/foto') {
    const ident = await identidadDe(env.DB, sub).catch(() => null);
    if (m === 'GET') {
      const f = ident ? await env.DB.prepare('SELECT url, datos IS NOT NULL AS tiene FROM integ_foto WHERE pid = ?').bind(ident.pid).first() : null;
      return H.json({ ok: true, pid: ident ? ident.pid : null, avatar: ident ? ident.avatar : null, propia: !!f });
    }
    if (m !== 'POST') return H.json({ ok: false, error: 'metodo' }, 405);
    if (!ident) return H.json({ ok: false, error: 'sin_perfil' }, 409);
    const b = await req.json().catch(() => ({}));
    if (b.quitar) {
      await env.DB.prepare('DELETE FROM integ_foto WHERE pid = ?').bind(ident.pid).run();
    } else if (typeof b.imagen === 'string') {
      const mt = b.imagen.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!mt) return H.json({ ok: false, error: 'imagen_invalida' }, 400);
      if (mt[2].length > 400_000) return H.json({ ok: false, error: 'imagen_grande' }, 413);
      await env.DB.prepare("INSERT INTO integ_foto (pid, mime, datos, url, actualizado) VALUES (?, ?, ?, NULL, datetime('now')) ON CONFLICT(pid) DO UPDATE SET mime = excluded.mime, datos = excluded.datos, url = NULL, actualizado = excluded.actualizado").bind(ident.pid, mt[1], mt[2]).run();
    } else if (typeof b.url === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(b.url)) {
      await env.DB.prepare("INSERT INTO integ_foto (pid, mime, datos, url, actualizado) VALUES (?, NULL, NULL, ?, datetime('now')) ON CONFLICT(pid) DO UPDATE SET mime = NULL, datos = NULL, url = excluded.url, actualizado = excluded.actualizado").bind(ident.pid, b.url).run();
    } else return H.json({ ok: false, error: 'falta_imagen' }, 400);
    invalidarIdentidades();
    const nuevo = await identidadDe(env.DB, sub).catch(() => null);
    return H.json({ ok: true, avatar: nuevo ? nuevo.avatar : null });
  }

  if (p === '/equipos/logo' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const slug = String(b.slug || '');
    const e = await puedeEditarEquipo(env.DB, slug, sub);
    if (!e) return H.json({ ok: false, error: 'solo_capitan' }, 403);
    if (b.quitar) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM integ_equipo_logo WHERE slug = ?').bind(slug),
        env.DB.prepare('UPDATE pt_teams SET logo_url = NULL WHERE slug = ?').bind(slug),
      ]);
      return H.json({ ok: true, logo_url: null });
    }
    let logo;
    const dm = String(b.imagen || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (dm) {
      if (dm[2].length > 700_000) return H.json({ ok: false, error: 'imagen_grande' }, 413);
      await env.DB.prepare("INSERT INTO integ_equipo_logo (slug, mime, datos, actualizado) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(slug) DO UPDATE SET mime = excluded.mime, datos = excluded.datos, actualizado = excluded.actualizado").bind(slug, dm[1], dm[2]).run();
      logo = INT_URL + '/equipos/logo/' + slug + '?v=' + Date.now().toString(36);
    } else {
      let u;
      try { u = new URL(String(b.url || '')); } catch { return H.json({ ok: false, error: 'imagen_invalida' }, 400); }
      if (u.protocol !== 'https:') return H.json({ ok: false, error: 'imagen_invalida' }, 400);
      logo = u.toString().slice(0, 400);
    }
    await env.DB.prepare('UPDATE pt_teams SET logo_url = ? WHERE slug = ?').bind(logo, slug).run();
    return H.json({ ok: true, logo_url: logo });
  }

  if (p === '/clips/mios' && m === 'GET') {
    const ident = await identidadDe(env.DB, sub).catch(() => null);
    const subs = ident ? ident.subs : [sub];
    const rs = await env.DB.prepare('SELECT id, nick, url, plataforma, embed, miniatura, titulo, juego, publico, creado, video FROM integ_clips WHERE auth0_sub IN (' + subs.map(() => '?').join(',') + ') ORDER BY creado DESC LIMIT 200').bind(...subs).all();
    let canal = await canalTwitchDe(env.DB, sub), kick = await canalKickDe(env.DB, sub);
    for (const s2 of subs) { if (!canal) canal = await canalTwitchDe(env.DB, s2); if (!kick) kick = await canalKickDe(env.DB, s2); }
    let twitch = [], errorTwitch = null, kk = [], errorKick = null;
    const [rt, rk, subidos] = await Promise.all([
      clipsTwitchCanal(env, H, canal).catch((e) => { errorTwitch = String(e.message || e); return []; }),
      clipsKickCanal(H, kick).catch((e) => { errorKick = String(e.message || e); return []; }),
      clipsSubidos(H, subs),
    ]);
    twitch = rt; kk = rk;
    const propios = new Set((rs.results || []).map((r) => r.url));
    const filas = (rs.results || []).map(filaClip);
    return H.json({
      ok: true, canal_twitch: canal, canal_kick: kick, clips: filas.filter((c) => !c.kv), subidos: [...filas.filter((c) => c.kv), ...subidos],
      twitch: twitch.filter((c) => !propios.has(c.url)), kick: kk.filter((c) => !propios.has(c.url)),
      error_twitch: errorTwitch, error_kick: errorKick,
    });
  }

  if (p === '/clips' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const info = analizarClip(b.url);
    if (!info) return H.json({ ok: false, error: 'enlace_invalido' }, 400);
    let juego = normalizarJuego(b.juego);
    let titulo = txt(b.titulo, 100), miniatura = info.miniatura, video = null, juegoDet = null;
    if (info.plataforma === 'kick') {
      const d = await datosClipKick(info.id).catch(() => null);
      if (d) { titulo = titulo || txt(d.titulo, 100); miniatura = d.miniatura || miniatura; video = d.video; juegoDet = d.juego; }
      // Kick bloquea a los servidores: el navegador lee el clip (CORS abierto para la web) y manda sus datos.
      const deKick = (v) => { try { const x = new URL(String(v || '')); return x.protocol === 'https:' && /(^|\.)kick\.com$/.test(x.hostname) ? x.toString().slice(0, 400) : null; } catch { return null; } };
      if (!video) video = deKick(b.video);
      if (!miniatura) miniatura = deKick(b.miniatura);
      if (!titulo && b.titulo_kick) titulo = txt(b.titulo_kick, 100);
    }
    if (info.plataforma === 'faceit') {
      const d = await datosClipFaceit(info.id).catch(() => null);
      if (d) { titulo = titulo || txt(d.title, 100); miniatura = d.thumbnail_url || miniatura; }
      if (juego === 'otro') juego = 'cs2';
    }
    if (info.plataforma === 'twitch' && !/^\d+$/.test(info.id)) {
      const d = await datosClipTwitch(env, H, info.id).catch(() => null);
      if (d) { titulo = titulo || txt(d.title, 100); miniatura = d.thumbnail_url || miniatura; }
    }
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM integ_clips WHERE auth0_sub = ?').bind(sub).first();
    if (n && n.n >= 200) return H.json({ ok: false, error: 'limite_clips' }, 409);
    const id = uid();
    const limpio = String(b.url).trim().slice(0, 400);
    const r = await env.DB.prepare(
      'INSERT INTO integ_clips (id, auth0_sub, nick, url, plataforma, embed, miniatura, titulo, juego, publico, video) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(auth0_sub, url) DO NOTHING'
    ).bind(id, sub, await nickDe(env.DB, sub), limpio, info.plataforma, info.embed, miniatura, titulo || 'Clip de ' + (info.plataforma === 'faceit' ? 'FACEIT' : info.plataforma), juego === 'otro' && juegoDet ? juegoDet : juego, b.publico === false ? 0 : 1, video).run();
    if (!r.meta || !r.meta.changes) return H.json({ ok: false, error: 'clip_repetido' }, 409);
    // Comunidad: aviso del clip publicado al canal de creadores.
    await webhookDiscord(env, 'comunidad', {
      embeds: [{ title: '🎬 Nuevo clip: ' + (titulo || 'Clip'), description: 'Por **' + (await nickDe(env.DB, sub) || 'un jugador') + '** · ' + info.plataforma, url: limpio, color: 0xff0d2e, footer: { text: 'VANTS GAMES · comunidad-y-creadores' } }],
    }).catch(() => null);
    return H.json({ ok: true, id });
  }

  if (p === '/clips/subir' && m === 'POST') {
    if (!env.CLIPS_KV) return H.json({ ok: false, error: 'gh_no_config' }, 503);
    const len = parseInt(req.headers.get('content-length') || '0', 10);
    if (len > MAX_CLIP + 1_500_000) return H.json({ ok: false, error: 'clip_demasiado_grande', max_mb: 50.5 }, 413);
    const hoy = await env.DB.prepare("SELECT COUNT(*) n FROM integ_clips WHERE auth0_sub = ? AND plataforma = 'subido' AND creado > datetime('now', '-1 day')").bind(sub).first();
    if (hoy && hoy.n >= 15 && !(await esOwner(env.DB, sub))) return H.json({ ok: false, error: 'demasiadas_subidas' }, 429);
    let form;
    try { form = await req.formData(); } catch { return H.json({ ok: false, error: 'cuerpo_vacio' }, 400); }
    const video = form.get('video'), thumb = form.get('thumb');
    if (!video || typeof video === 'string' || !video.size) return H.json({ ok: false, error: 'falta_video' }, 400);
    if (video.size > MAX_CLIP) return H.json({ ok: false, error: 'clip_demasiado_grande', max_mb: 50.5 }, 413);
    const ext = ['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(String(form.get('ext') || '').toLowerCase()) ? String(form.get('ext')).toLowerCase() : 'mp4';
    const mime = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' }[ext];
    const id = uid();
    // Se lee por streaming y se guarda en trozos de 20 MB (memoria acotada).
    let partes = 0, total = 0, llenos = 0, trozo = new Uint8Array(Math.min(TROZO, video.size));
    const lector = video.stream().getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      let off = 0;
      while (off < value.length) {
        const n = Math.min(value.length - off, trozo.length - llenos);
        trozo.set(value.subarray(off, off + n), llenos);
        llenos += n; off += n; total += n;
        if (llenos === trozo.length) {
          await env.CLIPS_KV.put('v:' + id + ':' + partes++, trozo);
          llenos = 0;
          trozo = new Uint8Array(Math.min(TROZO, Math.max(1, video.size - total)));
        }
      }
    }
    if (llenos) await env.CLIPS_KV.put('v:' + id + ':' + partes++, trozo.subarray(0, llenos));
    const buf = { byteLength: total };
    let hayMini = false;
    if (thumb && typeof thumb !== 'string' && thumb.size && thumb.size <= 400_000) { await env.CLIPS_KV.put('t:' + id, await thumb.arrayBuffer()); hayMini = true; }
    const dur = Math.max(0, Math.min(3600, parseInt(form.get('dur'), 10) || 0));
    await env.CLIPS_KV.put('m:' + id, JSON.stringify({ mime, size: buf.byteLength, partes, dur }));
    const juego = normalizarJuego(form.get('juego'));
    const vurl = INT_URL + '/clips/archivo/' + id;
    await env.DB.prepare(
      "INSERT INTO integ_clips (id, auth0_sub, nick, url, plataforma, embed, miniatura, titulo, juego, publico, video) VALUES (?, ?, ?, ?, 'subido', NULL, ?, ?, ?, ?, ?)"
    ).bind(id, sub, await nickDe(env.DB, sub), vurl, hayMini ? INT_URL + '/clips/mini/' + id : null, txt(form.get('titulo'), 100) || 'Clip', juego, form.get('publico') === '0' ? 0 : 1, vurl).run();
    return H.json({ ok: true, id, video: vurl });
  }

  if (p === '/clips/editar' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const ident = await identidadDe(env.DB, sub).catch(() => null);
    const subs = ident ? ident.subs : [sub];
    const fila = await env.DB.prepare('SELECT id, auth0_sub FROM integ_clips WHERE id = ?').bind(String(b.id || '')).first();
    if (!fila || !(subs.includes(fila.auth0_sub) || (await esOwner(env.DB, sub)))) return H.json({ ok: false, error: 'no_encontrado' }, 404);
    const sets = [], vals = [];
    if (b.juego !== undefined) { sets.push('juego = ?'); vals.push(normalizarJuego(b.juego)); }
    if (b.titulo !== undefined) { sets.push('titulo = ?'); vals.push(txt(b.titulo, 100) || 'Clip'); }
    if (b.publico !== undefined) { sets.push('publico = ?'); vals.push(b.publico ? 1 : 0); }
    if (!sets.length) return H.json({ ok: false, error: 'sin_cambios' }, 400);
    await env.DB.prepare('UPDATE integ_clips SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals, fila.id).run();
    return H.json({ ok: true });
  }

  if (p === '/clips/borrar' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const owner = await esOwner(env.DB, sub);
    const ident = await identidadDe(env.DB, sub).catch(() => null);
    const subs = ident ? ident.subs : [sub];
    const fila = await env.DB.prepare('SELECT id, auth0_sub, plataforma FROM integ_clips WHERE id = ?').bind(String(b.id || '')).first();
    if (fila && fila.plataforma === 'subido' && (owner || subs.includes(fila.auth0_sub)) && env.CLIPS_KV) {
      const meta = await env.CLIPS_KV.get('m:' + fila.id, 'json').catch(() => null);
      for (let i = 0; i < ((meta && meta.partes) || 3); i++) await env.CLIPS_KV.delete('v:' + fila.id + ':' + i).catch(() => null);
      await env.CLIPS_KV.delete('t:' + fila.id).catch(() => null);
      await env.CLIPS_KV.delete('m:' + fila.id).catch(() => null);
    }
    if (fila && subs.includes(fila.auth0_sub)) { await env.DB.prepare('DELETE FROM integ_clips WHERE id = ?').bind(fila.id).run(); return H.json({ ok: true }); }
    const r = owner
      ? await env.DB.prepare('DELETE FROM integ_clips WHERE id = ?').bind(String(b.id || '')).run()
      : await env.DB.prepare('DELETE FROM integ_clips WHERE id = ? AND auth0_sub = ?').bind(String(b.id || ''), sub).run();
    if (!r.meta || !r.meta.changes) return H.json({ ok: false, error: 'no_encontrado' }, 404);
    return H.json({ ok: true });
  }

  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}
