// VANTS · Integraciones · identidades y perfiles públicos
// -----------------------------------------------------------------------------
// Una persona puede entrar con varios accesos (Google, Twitch, Discord…). Se
// agrupan como UNA cuenta cuando comparten la misma cuenta de FACEIT verificada
// o cuando un acceso tiene vinculado el Discord/Twitch con el que entra otro.
// Cada grupo tiene una cuenta principal y un id público estable (pid) que usa
// la ficha /u/<pid>, el ranking y la sala de jugadores.

import { datosValorant, iconoTier } from './juegos.js';
import { evaluar } from './insignias.js';
import { fortnitePublico } from './epic.js';

const TTL = 60_000;
let cache = { at: 0, val: null };
export function invalidarIdentidades() { cache = { at: 0, val: null }; }

async function sha16(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const todas = async (db, sql, ...a) => ((await db.prepare(sql).bind(...a).all().catch(() => ({ results: [] }))).results || []);

export async function identidades(db) {
  if (cache.val && Date.now() - cache.at < TTL) return cache.val;
  // Garantiza la columna vitrina (idempotente): sin ella el SELECT de abajo
  // falla en silencio (todas() traga errores) y desaparecen TODOS los
  // perfiles — fichas, insignias, banner y logros — durante el TTL de caché.
  await db.prepare('ALTER TABLE perfiles_publicos ADD COLUMN vitrina TEXT').run().catch(() => null);
  const padre = new Map();
  const raiz = (x) => { let r = x; while (padre.get(r) !== r) r = padre.get(r); let y = x; while (padre.get(y) !== r) { const n = padre.get(y); padre.set(y, r); y = n; } return r; };
  const nodo = (x) => { if (!padre.has(x)) padre.set(x, x); return x; };
  const unir = (a, b) => { const ra = raiz(nodo(a)), rb = raiz(nodo(b)); if (ra !== rb) padre.set(rb, ra); };

  const fotos = new Map((await todas(db, 'SELECT pid, url, actualizado, datos IS NOT NULL AS tiene FROM integ_foto')).map((f) => [f.pid, f]));
  const [links, players, perfiles, ranking, miembros, riot] = await Promise.all([
    todas(db, 'SELECT auth0_sub, platform, handle, platform_user_id, avatar_url, verified FROM vants_links'),
    todas(db, 'SELECT id, auth0_sub, discord_user_id, auth_user_id, display_name, username, xp, role, avatar_url, creado_at, stats FROM players'),
    todas(db, 'SELECT auth0_sub, nickname, redes, banner, vitrina, updated_at FROM perfiles_publicos'),
    todas(db, 'SELECT auth0_sub, faceit_id, nick, avatar, pais, nivel, elo, partidas, winrate, kd, actualizado FROM integ_ranking'),
    todas(db, 'SELECT auth0_sub FROM integ_equipo_miembros'),
    todas(db, 'SELECT auth0_sub FROM integ_riot'),
  ]);

  const subs = new Set();
  for (const r of [...links, ...perfiles, ...ranking, ...miembros, ...riot]) if (r.auth0_sub) subs.add(r.auth0_sub);
  for (const p of players) if (p.auth0_sub) subs.add(p.auth0_sub);
  for (const s of subs) {
    nodo('s:' + s);
    // El propio acceso de Twitch/Discord cuenta como esa identidad de plataforma.
    const m = s.match(/^(?:oauth2\|)?(twitch|discord)\|(\d+)$/);
    if (m) unir('s:' + s, m[1] + ':' + m[2]);
  }
  for (const l of links) {
    if (!l.platform_user_id) continue;
    if (l.platform === 'faceit' || l.platform === 'discord' || l.platform === 'twitch' || l.platform === 'steam') unir('s:' + l.auth0_sub, l.platform + ':' + l.platform_user_id);
  }
  for (const p of players) {
    const n = p.auth0_sub ? 's:' + p.auth0_sub : 'p:' + p.id;
    nodo(n);
    if (p.discord_user_id) unir(n, 'discord:' + p.discord_user_id);
    const a = String(p.auth_user_id || '').match(/^discord:(\d+)$/);
    if (a) unir(n, 'discord:' + a[1]);
  }

  // Construye los grupos.
  const grupos = new Map();
  const g = (n) => { const r = raiz(n); if (!grupos.has(r)) grupos.set(r, { subs: [], players: [], perfiles: [], ranking: [], links: [] }); return grupos.get(r); };
  for (const s of subs) g('s:' + s).subs.push(s);
  for (const p of players) g(p.auth0_sub ? 's:' + p.auth0_sub : 'p:' + p.id).players.push(p);
  for (const p of perfiles) g('s:' + p.auth0_sub).perfiles.push(p);
  for (const r of ranking) g('s:' + r.auth0_sub).ranking.push(r);
  for (const l of links) g('s:' + l.auth0_sub).links.push(l);

  const porSub = new Map(), porPid = new Map();
  const lista = [];
  for (const gr of grupos.values()) {
    if (!gr.subs.length && !gr.players.length) continue;
    const conSub = gr.players.filter((p) => p.auth0_sub).sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const pref = (s) => (s.startsWith('google-oauth2|') ? 0 : s.startsWith('auth0|') ? 1 : 2);
    const principal = conSub[0]?.auth0_sub || [...gr.subs].sort((a, b) => pref(a) - pref(b) || a.localeCompare(b))[0] || 'p:' + gr.players[0].id;
    const pid = await sha16(principal);
    const perf = [...gr.perfiles].filter((p) => p.nickname).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const rk = [...gr.ranking].sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')))[0] || null;
    const conXp = [...gr.players].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const nick = (perf && perf.nickname) || (conSub[0] && (conSub[0].display_name || conSub[0].username)) || (rk && rk.nick) || (conXp[0] && (conXp[0].display_name || conXp[0].username)) || null;
    if (!nick) continue;
    const foto = fotos.get(pid);
    const fotoUrl = foto ? (foto.tiene ? 'https://int.vants.cc/foto/' + pid + '?v=' + encodeURIComponent(String(foto.actualizado || '').replace(/\D/g, '')) : foto.url) : null;
    const avatar = fotoUrl || (rk && rk.avatar) || gr.links.find((l) => l.avatar_url)?.avatar_url || conXp.find((p) => p.avatar_url && !/embed\/avatars/.test(p.avatar_url))?.avatar_url || null;
    const ident = {
      pid, principal, nick, avatar, fotoPropia: !!fotoUrl,
      alias: [...new Set([nick, rk && rk.nick, ...gr.links.map((l) => l.handle), ...gr.players.flatMap((p) => [p.display_name, p.username])].filter(Boolean).map((x) => String(x).toLowerCase()))],
      subs: gr.subs, players: gr.players, ranking: rk, links: gr.links,
      xp: conXp[0] ? conXp[0].xp || 0 : 0,
      fundador: gr.players.some((p) => p.role === 'owner'),
      desde: gr.players.map((p) => p.creado_at).filter(Boolean).sort()[0] || null,
      redes: (() => { try { return perf && perf.redes ? JSON.parse(perf.redes) : null; } catch { return null; } })(),
      banner: gr.perfiles.map((x) => x.banner).find(Boolean) || null,
      vitrina: (() => { try { const v = gr.perfiles.map((x) => x.vitrina).find(Boolean); return v ? JSON.parse(v) : null; } catch { return null; } })(),
    };
    for (const s of gr.subs) porSub.set(s, ident);
    for (const p of gr.players) if (!p.auth0_sub) porSub.set('p:' + p.id, ident);
    porPid.set(pid, ident);
    lista.push(ident);
  }
  // Protección anti-vaciamiento: todas() se traga los errores, así que si la
  // tabla de perfiles vino vacía pero ya había identidades en caché, se
  // conserva la anterior en vez de cachear un borrado en cascada.
  if (perfiles.length === 0 && cache.val && cache.val.lista.length > 0) {
    return cache.val;
  }
  cache = { at: Date.now(), val: { porSub, porPid, lista } };
  return cache.val;
}

export async function identidadDe(db, sub) { return (await identidades(db)).porSub.get(sub) || null; }

const enLista = (xs) => xs.map(() => '?').join(',') || "''";

// Ficha pública completa de una persona.
export async function perfilPublico(env, pid) {
  const db = env.DB;
  const id = (await identidades(db)).porPid.get(pid);
  if (!id) return null;
  await asegurarRoster(db);
  const s = id.subs.length ? id.subs : ['-'];
  const [equipos, logros, clips, riot] = await Promise.all([
    todas(db, `SELECT t.slug, t.nombre, t.tag, t.game_slug, t.region, t.logo_url, m.rol FROM integ_equipo_miembros m JOIN pt_teams t ON t.slug = m.team_slug WHERE m.auth0_sub IN (${enLista(s)}) ORDER BY m.unido`, ...s),
    todas(db, `SELECT code FROM integ_logros_ok WHERE auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT id, nick, url, plataforma, embed, miniatura, titulo, juego, creado, video FROM integ_clips WHERE publico = 1 AND auth0_sub IN (${enLista(s)}) ORDER BY creado DESC LIMIT 12`, ...s),
    todas(db, `SELECT auth0_sub, nombre, tag FROM integ_riot WHERE auth0_sub IN (${enLista(s)}) ORDER BY actualizado DESC LIMIT 1`, ...s),
  ]);
  const roster = await todas(db, "SELECT r.rol, r.juego, t.slug, t.nombre, t.tag, t.logo_url FROM integ_roster r LEFT JOIN pt_teams t ON t.slug = 'vants' WHERE r.pid = ?", pid);
  const codigos = new Set(logros.map((l) => l.code));
  const nF = [...codigos].filter((c) => c.startsWith('f.')).length, nV = [...codigos].filter((c) => c.startsWith('v.')).length;
  // VALORANT: únicamente con consentimiento explícito (opt-in) vía Riot Sign On (RSO) y API oficial.
  let valorant = null;
  const riotLink = (id.links || []).find((l) => l.platform === 'riot' && Number(l.verified) && l.platform_user_id);
  const subRiot = riotLink ? riotLink.auth0_sub : (riot[0] ? riot[0].auth0_sub : id.subs.find((x) => x.startsWith('google-oauth2|')) || id.subs[0]);
  if (subRiot) {
    const d = await datosValorant(env, subRiot).catch(() => null);
    if (d && d.ok && d.opt_in && d.fuente === 'riot_official' && (d.tier_id || d.riot)) {
      valorant = { riot: d.riot || null, tier: d.tier || null, tier_id: d.tier_id || null, rr: d.rr ?? null, icono: iconoTier(d.tier_id), pico: d.pico || null, fuente: d.fuente };
    }
  }
  const fortnite = await fortnitePublico(env, id.subs).catch(() => null);
  const rk = id.ranking;
  const ins = await evaluar(env, id).catch(() => null);
  // Vitrina personalizada (máx. 6, solo conseguidas) o las primeras automáticas.
  const conseguidas = ins ? ins.conseguidas : ['MEMBER'];
  const vitrina = Array.isArray(id.vitrina) ? id.vitrina.filter((c) => conseguidas.includes(c) || c === 'MEMBER').slice(0, 6) : [];
  return {
    pid: id.pid, nick: id.nick, avatar: id.avatar, fundador: id.fundador, xp: id.xp, desde: id.desde, redes: id.redes, banner: id.banner,
    sello: ins ? ins.sello : null, insignias: vitrina.length ? vitrina : conseguidas,
    faceit: rk ? { nick: rk.nick, nivel: rk.nivel, elo: rk.elo, partidas: rk.partidas, winrate: rk.winrate, kd: rk.kd, pais: rk.pais, avatar: rk.avatar, url: 'https://www.faceit.com/es/players/' + encodeURIComponent(rk.nick) } : null,
    valorant,
    fortnite,
    cuentas: [...new Map(id.links.filter((l) => ['twitch', 'kick', 'youtube', 'x', 'tiktok', 'steam', 'discord', 'faceit'].includes(l.platform)).map((l) => [l.platform, { plataforma: l.platform, handle: l.handle }])).values()],
    equipos: [
      ...roster.map((r) => ({ slug: 'vants', nombre: r.nombre || 'VANTS', tag: r.tag || 'VTS', juego: r.juego, logo_url: r.logo_url, rol: r.rol || 'Jugador', oficial: true })),
      ...equipos.map((e) => ({ slug: e.slug, nombre: e.nombre, tag: e.tag, juego: e.game_slug, logo_url: e.logo_url, rol: e.rol === 'capitan' ? 'Capitán' : 'Jugador', oficial: false })),
    ],
    logros: { faceit: nF, valorant: nV, total: nF + nV },
    clips: clips.map((c) => ({ id: c.id, origen: 'vants', plataforma: c.plataforma, url: c.url, titulo: c.titulo, juego: c.juego, miniatura: c.miniatura, embed: c.embed, video: c.video || null, creado: c.creado && !/[TZ]/.test(c.creado) ? c.creado.replace(' ', 'T') + 'Z' : c.creado, autor: id.nick, propio: false })),
  };
}

// Lista pública (Sala → Cuentas registradas): una entrada por persona.
export async function jugadoresPublicos(env) {
  const { lista } = await identidades(env.DB);
  const sellos = new Map();
  for (const i of lista.slice(0, 200)) { const e = await evaluar(env, i, { conValorant: false }).catch(() => null); sellos.set(i.pid, e ? e.sello : null); }
  return lista
    .map((i) => ({ pid: i.pid, nick: i.nick, avatar: i.avatar, alias: i.alias, fundador: i.fundador, xp: i.xp, sello: sellos.get(i.pid) || null, nivel: i.ranking ? i.ranking.nivel : null, elo: i.ranking ? i.ranking.elo : null }))
    .sort((a, b) => Number(b.fundador) - Number(a.fundador) || (b.elo || 0) - (a.elo || 0) || (b.xp || 0) - (a.xp || 0));
}

/* ------------------------------------------------------------ roster oficial (equipo VANTS) */

async function asegurarRoster(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_roster (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT, juego TEXT, pais TEXT, pid TEXT, orden INTEGER NOT NULL DEFAULT 0,
    player_slug TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')))`).run();
}

const slugify = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'jugador';

export async function rosterOficial(env) {
  const db = env.DB;
  await asegurarRoster(db);
  const t = await db.prepare("SELECT slug, nombre, tag, game_slug, region, logo_url FROM pt_teams WHERE slug = 'vants'").first().catch(() => null);
  const rs = await todas(db, 'SELECT id, nombre, rol, juego, pais, pid, orden, player_slug FROM integ_roster ORDER BY orden, creado');
  const { porPid } = await identidades(db);
  return {
    equipo: t ? { slug: t.slug, nombre: t.nombre, tag: t.tag, juego: t.game_slug, region: t.region, logo_url: t.logo_url } : null,
    jugadores: rs.map((r) => {
      const i = r.pid ? porPid.get(r.pid) : null;
      return {
        id: r.id, nombre: r.nombre, rol: r.rol, juego: r.juego, pais: r.pais, orden: r.orden, pid: i ? i.pid : null,
        avatar: i ? i.avatar : null, cuenta: i ? i.nick : null,
        faceit: i && i.ranking ? { nivel: i.ranking.nivel, elo: i.ranking.elo, nick: i.ranking.nick } : null,
      };
    }),
  };
}

export async function editarRoster(env, p, b) {
  const db = env.DB;
  await asegurarRoster(db);
  const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const juego = ['valorant', 'cs2'].includes(b.juego) ? b.juego : null;
  if (p === '/roster-oficial/equipo') {
    const nombre = txt(b.nombre, 40) || 'VANTS', tag = txt(b.tag, 5).toUpperCase() || 'VTS', region = txt(b.region, 40) || null;
    await db.prepare(
      `INSERT INTO pt_teams (id, slug, nombre, tag, game_slug, region) VALUES (?, 'vants', ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET nombre = excluded.nombre, tag = excluded.tag, game_slug = excluded.game_slug, region = excluded.region`
    ).bind(crypto.randomUUID(), nombre, tag, juego, region).run();
    return { ok: true };
  }
  const t = await db.prepare("SELECT slug FROM pt_teams WHERE slug = 'vants'").first();
  if (!t) await db.prepare("INSERT INTO pt_teams (id, slug, nombre, tag) VALUES (?, 'vants', 'VANTS', 'VTS')").bind(crypto.randomUUID()).run();
  if (p === '/roster-oficial/jugador') {
    const nombre = txt(b.nombre, 32);
    if (nombre.length < 2) return { ok: false, error: 'nombre_invalido', status: 400 };
    const rol = txt(b.rol, 32) || 'Jugador', pais = txt(b.pais, 40) || null;
    const pid = b.pid && /^[0-9a-f]{16}$/.test(b.pid) && (await identidades(db)).porPid.has(b.pid) ? b.pid : null;
    const orden = Number.isFinite(+b.orden) ? Math.max(0, Math.min(99, Math.trunc(+b.orden))) : 0;
    let id = txt(b.id, 40);
    const prev = id ? await db.prepare('SELECT id, player_slug FROM integ_roster WHERE id = ?').bind(id).first() : null;
    if (!prev) id = crypto.randomUUID().replace(/-/g, '');
    let ps = prev && prev.player_slug;
    if (!ps) {
      ps = 'vants-' + slugify(nombre);
      for (let i = 2; await db.prepare('SELECT 1 FROM pt_players WHERE slug = ?').bind(ps).first(); i++) ps = 'vants-' + slugify(nombre) + '-' + i;
    }
    await db.batch([
      db.prepare(
        `INSERT INTO integ_roster (id, nombre, rol, juego, pais, pid, orden, player_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, rol = excluded.rol, juego = excluded.juego, pais = excluded.pais, pid = excluded.pid, orden = excluded.orden`
      ).bind(id, nombre, rol, juego, pais, pid, orden, ps),
      db.prepare(
        `INSERT INTO pt_players (id, slug, source, external_id, nombre, game_slug, team_slug, rol, pais)
         VALUES (?, ?, 'vants', ?, ?, ?, 'vants', ?, ?)
         ON CONFLICT(source, external_id) DO UPDATE SET nombre = excluded.nombre, game_slug = excluded.game_slug, team_slug = 'vants', rol = excluded.rol, pais = excluded.pais, updated_at = datetime('now')`
      ).bind(crypto.randomUUID(), ps, 'roster|' + id, nombre, juego, rol, pais),
    ]);
    return { ok: true, id };
  }
  if (p === '/roster-oficial/quitar') {
    const id = txt(b.id, 40);
    const r = await db.prepare('SELECT id FROM integ_roster WHERE id = ?').bind(id).first();
    if (!r) return { ok: false, error: 'no_encontrado', status: 404 };
    await db.batch([
      db.prepare('DELETE FROM integ_roster WHERE id = ?').bind(id),
      db.prepare("DELETE FROM pt_players WHERE source = 'vants' AND external_id = ?").bind('roster|' + id),
    ]);
    return { ok: true };
  }
  return { ok: false, error: 'no_encontrado', status: 404 };
}
