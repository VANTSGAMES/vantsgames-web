import { identidades } from './perfiles.js';
// VANTS · Integraciones · comunidad
// -----------------------------------------------------------------------------
// Funciones de la web que faltaban, todas sobre D1 vants-db:
//   · Ranking VANTS (jugadores de la plataforma por ELO de FACEIT y por XP)
//   · Equipos creados por los jugadores (crear, unirse con código, salir,
//     expulsar) — la ficha pública se escribe en pt_teams / pt_players para
//     que /api/teams de Vantsgames la muestre sin cambios.
//   · Mis inscripciones a torneos (tournament_teams)
//   · Logros de juego calculados con datos verificados (FACEIT, equipos,
//     inscripciones, cuentas vinculadas)
//   · Eventos de la comunidad (integ_eventos)
//   · Publicación para la cuenta owner: torneos (pt_torneos), anuncios
//     (pt_articulos), eventos e inscripciones (tournament_teams.status).
// La vinculación de FACEIT NO se toca aquí: solo se lee vants_links.

const JUEGOS = ['valorant', 'cs2'];
const ESTADOS_T = ['upcoming', 'ongoing', 'finished', 'cancelled'];

const txt = (v, max) => {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'item';
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const fechaISO = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
};
const uid = () => crypto.randomUUID();
function codigoInvitacion() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => abc[x % abc.length]).join('');
}

async function slugLibre(db, tabla, base) {
  let s = base;
  for (let i = 2; i < 50; i++) {
    const r = await db.prepare('SELECT 1 FROM ' + tabla + ' WHERE slug = ?').bind(s).first();
    if (!r) return s;
    s = base.slice(0, 32) + '-' + i;
  }
  return base.slice(0, 28) + '-' + Date.now().toString(36);
}

// Nick público del jugador: perfil público → FACEIT → cuenta → genérico.
export async function nickDe(db, sub) {
  const pp = await db.prepare('SELECT nickname FROM perfiles_publicos WHERE auth0_sub = ?').bind(sub).first();
  if (pp && pp.nickname) return pp.nickname;
  const fl = await db.prepare("SELECT handle FROM vants_links WHERE auth0_sub = ? AND platform = 'faceit'").bind(sub).first();
  if (fl && fl.handle) return fl.handle;
  const pl = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first();
  if (pl && (pl.display_name || pl.username)) return pl.display_name || pl.username;
  return 'Jugador';
}

export async function esOwner(db, sub) {
  const r = await db.prepare("SELECT 1 FROM players WHERE auth0_sub = ? AND role = 'owner'").bind(sub).first();
  if (r) return true;
  // Otras formas de entrar del dueño (Twitch/Discord/FACEIT): si el id del
  // proveedor de esta sesión está vinculado a la cuenta owner, también es owner.
  // Misma cuenta de FACEIT verificada por OAuth que la cuenta owner.
  const f = await db.prepare(
    "SELECT 1 FROM vants_links a JOIN vants_links b ON b.platform = 'faceit' AND b.platform_user_id = a.platform_user_id JOIN players p ON p.auth0_sub = b.auth0_sub AND p.role = 'owner' WHERE a.auth0_sub = ? AND a.platform = 'faceit' AND a.platform_user_id IS NOT NULL LIMIT 1"
  ).bind(sub).first().catch(() => null);
  if (f) return true;
  const m = String(sub || '').match(/^(?:oauth2\|)?(twitch|discord|faceit)\|(.+)$/);
  if (!m) return false;
  const o = await db.prepare(
    "SELECT 1 FROM vants_links l JOIN players p ON p.auth0_sub = l.auth0_sub AND p.role = 'owner' WHERE l.platform = ? AND l.platform_user_id = ? LIMIT 1"
  ).bind(m[1], m[2]).first();
  return !!o;
}

/* ============================================================ ranking */

// Guarda la foto de FACEIT de un jugador vinculado.
export async function guardarRanking(env, sub, f) {
  if (!f || !f.jugador) return;
  const j = f.jugador, e = f.estadisticas || {};
  await env.DB.prepare(
    `INSERT INTO integ_ranking (auth0_sub, faceit_id, nick, avatar, pais, nivel, elo, partidas, winrate, kd, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(auth0_sub) DO UPDATE SET faceit_id=excluded.faceit_id, nick=excluded.nick, avatar=excluded.avatar, pais=excluded.pais,
       nivel=excluded.nivel, elo=excluded.elo, partidas=excluded.partidas, winrate=excluded.winrate, kd=excluded.kd, actualizado=excluded.actualizado`
  ).bind(sub, j.id, j.nickname, j.avatar, j.pais, j.nivel, j.elo, e.partidas ?? null, e.winrate ?? null, e.kd ?? null).run();
}

// Cron: refresca hasta `max` jugadores (los más antiguos primero).
export async function refrescarRanking(env, perfilFaceit, max = 20) {
  const links = await env.DB.prepare(
    `SELECT l.auth0_sub, l.platform_user_id FROM vants_links l
     LEFT JOIN integ_ranking r ON r.auth0_sub = l.auth0_sub
     WHERE l.platform = 'faceit' AND l.platform_user_id IS NOT NULL
     ORDER BY COALESCE(r.actualizado, '1970-01-01') ASC LIMIT ?`
  ).bind(max).all();
  for (const l of links.results || []) {
    try { await guardarRanking(env, l.auth0_sub, await perfilFaceit(env, l.platform_user_id)); } catch { /* siguiente */ }
  }
  // Quita del ranking a quien desvinculó FACEIT.
  await env.DB.prepare("DELETE FROM integ_ranking WHERE auth0_sub NOT IN (SELECT auth0_sub FROM vants_links WHERE platform = 'faceit')").run();
}

async function equipoPorSub(db) {
  const rs = await db.prepare(
    `SELECT m.auth0_sub, t.slug, t.nombre, t.tag, t.game_slug FROM integ_equipo_miembros m JOIN pt_teams t ON t.slug = m.team_slug`
  ).all();
  const mapa = new Map();
  for (const r of rs.results || []) if (!mapa.has(r.auth0_sub)) mapa.set(r.auth0_sub, { slug: r.slug, nombre: r.nombre, tag: r.tag, juego: r.game_slug });
  return mapa;
}

async function rankingPublico(env, perfilFaceit) {
  let n = await env.DB.prepare('SELECT COUNT(*) n FROM integ_ranking').first();
  if (!n || !n.n) { await refrescarRanking(env, perfilFaceit, 25); }
  const eq = await equipoPorSub(env.DB);
  const rs = await env.DB.prepare(
    `SELECT auth0_sub, faceit_id, nick, avatar, pais, nivel, elo, partidas, winrate, kd, actualizado
     FROM integ_ranking ORDER BY elo DESC NULLS LAST, nivel DESC NULLS LAST`
  ).all();
  // Una misma cuenta de FACEIT vinculada desde dos accesos cuenta una vez.
  const vistos = new Set();
  const faceit = [];
  const ids = await identidades(env.DB).catch(() => null);
  for (const r of rs.results || []) {
    if (vistos.has(r.faceit_id)) continue;
    vistos.add(r.faceit_id);
    const idn = ids && ids.porSub.get(r.auth0_sub);
    faceit.push({
      pid: idn ? idn.pid : null, vants: idn ? idn.nick : null, fundador: !!(idn && idn.fundador),
      pos: faceit.length + 1, nick: r.nick, avatar: r.avatar, pais: r.pais, nivel: r.nivel, elo: r.elo,
      partidas: r.partidas, winrate: r.winrate, kd: r.kd, faceit_id: r.faceit_id,
      url: 'https://www.faceit.com/es/players/' + encodeURIComponent(r.nick),
      equipo: eq.get(r.auth0_sub) || null, actualizado: r.actualizado,
    });
  }
  // XP: una fila por persona (varios accesos de la misma cuenta cuentan una vez).
  const xp = [];
  if (ids) {
    const filas = ids.lista.filter((i) => i.players.length).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 100);
    for (const i of filas) {
      const subEq = i.subs.find((x) => eq.get(x));
      xp.push({ pos: xp.length + 1, pid: i.pid, nick: i.nick, avatar: i.avatar, xp: i.xp || 0, fundador: i.fundador, equipo: (subEq && eq.get(subEq)) || null });
    }
  }
  return { faceit, xp };
}

/* ============================================================ equipos */

async function misEquipos(db, sub) {
  const rs = await db.prepare(
    `SELECT t.slug, t.nombre, t.tag, t.game_slug, t.region, t.logo_url, e.capitan_sub, e.codigo, m.rol
     FROM integ_equipo_miembros m JOIN pt_teams t ON t.slug = m.team_slug JOIN integ_equipos e ON e.slug = t.slug
     WHERE m.auth0_sub = ? ORDER BY m.unido`
  ).bind(sub).all();
  const out = [];
  for (const r of rs.results || []) {
    const ms = await db.prepare('SELECT auth0_sub, nick, rol, unido FROM integ_equipo_miembros WHERE team_slug = ? ORDER BY unido').bind(r.slug).all();
    const capitan = r.capitan_sub === sub;
    out.push({
      slug: r.slug, nombre: r.nombre, tag: r.tag, juego: r.game_slug, region: r.region, logo_url: r.logo_url || null, capitan,
      codigo: capitan ? r.codigo : null,
      miembros: (ms.results || []).map((x) => ({ id: capitan ? x.auth0_sub : undefined, nick: x.nick, rol: x.rol, unido: x.unido, yo: x.auth0_sub === sub })),
    });
  }
  return out;
}

async function addMiembro(db, slug, juego, sub, rol) {
  const nick = await nickDe(db, sub);
  const pslug = await slugLibre(db, 'pt_players', slugify(nick + '-' + juego));
  await db.batch([
    db.prepare('INSERT INTO integ_equipo_miembros (team_slug, auth0_sub, nick, rol) VALUES (?, ?, ?, ?)').bind(slug, sub, nick, rol),
    db.prepare(
      `INSERT INTO pt_players (id, slug, source, external_id, nombre, game_slug, team_slug, rol)
       VALUES (?, ?, 'vants', ?, ?, ?, ?, ?)
       ON CONFLICT(source, external_id) DO UPDATE SET team_slug = excluded.team_slug, rol = excluded.rol, nombre = excluded.nombre, updated_at = datetime('now')`
    ).bind(uid(), pslug, sub + '|' + juego, nick, juego, slug, rol === 'capitan' ? 'Capitán' : 'Jugador'),
  ]);
}

async function quitarMiembro(db, slug, juego, sub) {
  await db.batch([
    db.prepare('DELETE FROM integ_equipo_miembros WHERE team_slug = ? AND auth0_sub = ?').bind(slug, sub),
    db.prepare("DELETE FROM pt_players WHERE source = 'vants' AND external_id = ?").bind(sub + '|' + juego),
  ]);
}

async function crearEquipo(env, sub, b) {
  const db = env.DB;
  const nombre = txt(b.nombre, 32);
  const tag = String(b.tag || '').trim().toUpperCase();
  const juego = String(b.juego || '');
  const region = txt(b.region, 40);
  if (!nombre || nombre.length < 2) return { status: 400, body: { ok: false, error: 'nombre_invalido' } };
  if (!/^[A-Z0-9]{2,4}$/.test(tag)) return { status: 400, body: { ok: false, error: 'tag_invalido' } };
  if (!JUEGOS.includes(juego)) return { status: 400, body: { ok: false, error: 'juego_invalido' } };
  const ya = await db.prepare('SELECT t.slug FROM integ_equipo_miembros m JOIN pt_teams t ON t.slug = m.team_slug WHERE m.auth0_sub = ? AND t.game_slug = ?').bind(sub, juego).first();
  if (ya) return { status: 409, body: { ok: false, error: 'ya_tienes_equipo', slug: ya.slug } };
  const repe = await db.prepare('SELECT 1 FROM pt_teams WHERE lower(nombre) = lower(?)').bind(nombre).first();
  if (repe) return { status: 409, body: { ok: false, error: 'nombre_en_uso' } };
  const slug = await slugLibre(db, 'pt_teams', slugify(nombre));
  const codigo = codigoInvitacion();
  await db.batch([
    db.prepare('INSERT INTO pt_teams (id, slug, nombre, tag, game_slug, region) VALUES (?, ?, ?, ?, ?, ?)').bind(uid(), slug, nombre, tag, juego, region),
    db.prepare('INSERT INTO integ_equipos (slug, capitan_sub, juego, codigo) VALUES (?, ?, ?, ?)').bind(slug, sub, juego, codigo),
  ]);
  await addMiembro(db, slug, juego, sub, 'capitan');
  return { status: 200, body: { ok: true, slug, codigo } };
}

async function unirseEquipo(env, sub, b, notificar) {
  const db = env.DB;
  const codigo = String(b.codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(codigo)) return { status: 400, body: { ok: false, error: 'codigo_invalido' } };
  const e = await db.prepare('SELECT e.slug, e.juego, e.capitan_sub, t.nombre FROM integ_equipos e JOIN pt_teams t ON t.slug = e.slug WHERE e.codigo = ?').bind(codigo).first();
  if (!e) return { status: 404, body: { ok: false, error: 'codigo_no_existe' } };
  const ya = await db.prepare('SELECT m.team_slug FROM integ_equipo_miembros m JOIN pt_teams t ON t.slug = m.team_slug WHERE m.auth0_sub = ? AND t.game_slug = ?').bind(sub, e.juego).first();
  if (ya) return { status: 409, body: { ok: false, error: ya.team_slug === e.slug ? 'ya_eres_miembro' : 'ya_tienes_equipo', slug: ya.team_slug } };
  const n = await db.prepare('SELECT COUNT(*) n FROM integ_equipo_miembros WHERE team_slug = ?').bind(e.slug).first();
  if (n && n.n >= 10) return { status: 409, body: { ok: false, error: 'equipo_lleno' } };
  await addMiembro(db, e.slug, e.juego, sub, 'jugador');
  const nick = await nickDe(db, sub);
  await notificar(env, e.capitan_sub, 'equipo', nick + ' se ha unido a ' + e.nombre, null, '/equipos/' + e.slug).catch(() => null);
  return { status: 200, body: { ok: true, slug: e.slug } };
}

async function salirEquipo(env, sub, b) {
  const db = env.DB;
  const slug = String(b.slug || '');
  const e = await db.prepare('SELECT slug, juego, capitan_sub FROM integ_equipos WHERE slug = ?').bind(slug).first();
  if (!e) return { status: 404, body: { ok: false, error: 'equipo_no_existe' } };
  const soy = await db.prepare('SELECT 1 FROM integ_equipo_miembros WHERE team_slug = ? AND auth0_sub = ?').bind(slug, sub).first();
  if (!soy) return { status: 403, body: { ok: false, error: 'no_eres_miembro' } };
  await quitarMiembro(db, slug, e.juego, sub);
  const resto = await db.prepare('SELECT auth0_sub FROM integ_equipo_miembros WHERE team_slug = ? ORDER BY unido').bind(slug).all();
  const quedan = resto.results || [];
  if (quedan.length === 0) {
    await db.batch([
      db.prepare('DELETE FROM integ_equipos WHERE slug = ?').bind(slug),
      db.prepare('DELETE FROM pt_teams WHERE slug = ?').bind(slug),
    ]);
    return { status: 200, body: { ok: true, disuelto: true } };
  }
  if (e.capitan_sub === sub) {
    const nuevo = quedan[0].auth0_sub;
    await db.batch([
      db.prepare('UPDATE integ_equipos SET capitan_sub = ? WHERE slug = ?').bind(nuevo, slug),
      db.prepare("UPDATE integ_equipo_miembros SET rol = 'capitan' WHERE team_slug = ? AND auth0_sub = ?").bind(slug, nuevo),
      db.prepare("UPDATE pt_players SET rol = 'Capitán' WHERE source = 'vants' AND external_id = ?").bind(nuevo + '|' + e.juego),
    ]);
  }
  return { status: 200, body: { ok: true } };
}

async function capitanDe(db, slug, sub) {
  const e = await db.prepare('SELECT slug, juego, capitan_sub, codigo FROM integ_equipos WHERE slug = ?').bind(slug).first();
  return e && e.capitan_sub === sub ? e : null;
}

/* ============================================================ logros */

const LOGROS = [
  { code: 'perfil', nombre: 'Identidad VANTS', desc: 'Elige tu nick público en el perfil.', cat: 'Cuenta' },
  { code: 'faceit', nombre: 'Conectado a FACEIT', desc: 'Vincula tu cuenta de FACEIT.', cat: 'Cuenta' },
  { code: 'discord', nombre: 'En el servidor', desc: 'Vincula tu cuenta de Discord.', cat: 'Cuenta' },
  { code: 'creador', nombre: 'En directo', desc: 'Registra tu canal de Twitch o Kick.', cat: 'Cuenta' },
  { code: 'equipo', nombre: 'Formación', desc: 'Forma parte de un equipo VANTS.', cat: 'Equipo' },
  { code: 'capitan', nombre: 'Capitán', desc: 'Crea un equipo y lidera su plantilla.', cat: 'Equipo' },
  { code: 'plantilla', nombre: 'Plantilla completa', desc: 'Tu equipo tiene 5 o más jugadores.', cat: 'Equipo' },
  { code: 'inscrito', nombre: 'Primera inscripción', desc: 'Inscribe un equipo en un torneo.', cat: 'Torneos' },
  { code: 'confirmado', nombre: 'Clasificado', desc: 'Una inscripción tuya es confirmada por la organización.', cat: 'Torneos' },
  { code: 'nivel5', nombre: 'Nivel 5 FACEIT', desc: 'Alcanza el nivel 5 en FACEIT CS2.', cat: 'FACEIT', meta: 5, k: 'nivel' },
  { code: 'nivel8', nombre: 'Nivel 8 FACEIT', desc: 'Alcanza el nivel 8 en FACEIT CS2.', cat: 'FACEIT', meta: 8, k: 'nivel' },
  { code: 'nivel10', nombre: 'Nivel 10 FACEIT', desc: 'Alcanza el nivel máximo de FACEIT CS2.', cat: 'FACEIT', meta: 10, k: 'nivel' },
  { code: 'p50', nombre: '50 partidas', desc: 'Juega 50 partidas en FACEIT CS2.', cat: 'FACEIT', meta: 50, k: 'partidas' },
  { code: 'p250', nombre: '250 partidas', desc: 'Juega 250 partidas en FACEIT CS2.', cat: 'FACEIT', meta: 250, k: 'partidas' },
  { code: 'p1000', nombre: '1000 partidas', desc: 'Juega 1000 partidas en FACEIT CS2.', cat: 'FACEIT', meta: 1000, k: 'partidas' },
  { code: 'racha5', nombre: 'Racha de 5', desc: 'Encadena 5 victorias seguidas en FACEIT.', cat: 'FACEIT', meta: 5, k: 'mejor_racha' },
  { code: 'kd', nombre: 'Positivo', desc: 'Mantén un K/D medio de 1.0 o más en FACEIT.', cat: 'FACEIT', meta: 1, k: 'kd' },
];

async function logrosDe(env, sub, perfilFaceit) {
  const db = env.DB;
  const [links, pp, can, eqs, ins] = await Promise.all([
    db.prepare('SELECT platform, platform_user_id FROM vants_links WHERE auth0_sub = ?').bind(sub).all(),
    db.prepare('SELECT nickname FROM perfiles_publicos WHERE auth0_sub = ?').bind(sub).first(),
    db.prepare('SELECT twitch, kick FROM integ_canales WHERE auth0_sub = ?').bind(sub).first(),
    db.prepare('SELECT m.team_slug, m.rol, (SELECT COUNT(*) FROM integ_equipo_miembros x WHERE x.team_slug = m.team_slug) n FROM integ_equipo_miembros m WHERE m.auth0_sub = ?').bind(sub).all(),
    db.prepare('SELECT status FROM tournament_teams WHERE auth0_sub = ?').bind(sub).all(),
  ]);
  const lk = Object.fromEntries((links.results || []).map((l) => [l.platform, l]));
  const E = eqs.results || [], I = ins.results || [];
  let st = null, nivel = null;
  if (lk.faceit && lk.faceit.platform_user_id) {
    try {
      const f = await perfilFaceit(env, lk.faceit.platform_user_id);
      if (f) { st = f.estadisticas || {}; nivel = f.jugador ? f.jugador.nivel : null; await guardarRanking(env, sub, f).catch(() => null); }
    } catch { /* FACEIT caído: se muestran sin progreso */ }
  }
  const valores = { nivel, partidas: st && st.partidas, mejor_racha: st && st.mejor_racha, kd: st && st.kd };
  const hecho = {
    perfil: !!(pp && pp.nickname),
    faceit: !!lk.faceit,
    discord: !!lk.discord,
    creador: !!(lk.twitch || lk.kick || (can && (can.twitch || can.kick))),
    equipo: E.length > 0,
    capitan: E.some((e) => e.rol === 'capitan'),
    plantilla: E.some((e) => e.n >= 5),
    inscrito: I.length > 0,
    confirmado: I.some((i) => i.status === 'confirmado'),
  };
  const logros = LOGROS.map((l) => {
    if (l.k) {
      const v = valores[l.k];
      const ok = v != null && v >= l.meta;
      return { code: l.code, nombre: l.nombre, descripcion: l.desc, categoria: l.cat, conseguido: ok, progreso: v != null ? { actual: v, meta: l.meta } : null };
    }
    return { code: l.code, nombre: l.nombre, descripcion: l.desc, categoria: l.cat, conseguido: !!hecho[l.code], progreso: null };
  });
  return { conseguidos: logros.filter((l) => l.conseguido).length, total: logros.length, logros };
}

/* ============================================================ eventos */

async function eventosPublicos(db, todos) {
  const rs = await db.prepare(
    todos
      ? 'SELECT * FROM integ_eventos ORDER BY empieza DESC LIMIT 200'
      : "SELECT * FROM integ_eventos WHERE COALESCE(termina, empieza) >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours') ORDER BY empieza ASC LIMIT 100"
  ).all();
  return rs.results || [];
}

/* ============================================================ owner */

function torneoDesde(b) {
  const juego = String(b.juego || b.game_slug || '');
  const estado = String(b.estado || 'upcoming');
  return {
    nombre: txt(b.nombre, 80),
    descripcion: txt(b.descripcion, 1000),
    game_slug: juego,
    estado,
    region: txt(b.region, 40),
    location_type: b.location_type === 'lan' ? 'lan' : 'online',
    prize_value: numOrNull(b.prize_value),
    prize_currency: (txt(b.prize_currency, 3) || 'USD').toUpperCase(),
    fee: numOrNull(b.fee) || 0,
    max_teams: numOrNull(b.max_teams),
    starts_at: fechaISO(b.starts_at),
    ends_at: fechaISO(b.ends_at),
    formato: txt(b.formato, 80),
    reglas: txt(b.reglas, 4000),
    logo_url: txt(b.logo_url, 400),
    major: b.major ? 1 : 0,
  };
}

async function avisarTodos(env, notificar, discord, tipo, titulo, cuerpo, url) {
  await notificar(env, null, tipo, titulo, cuerpo, url).catch(() => null);
  const base = String(env.SITE_URL || '').replace(/\/$/, '');
  await discord(env, 'anuncios', { embeds: [{ title: titulo, description: cuerpo || '', url: base + url, color: 0xff2e4d, footer: { text: 'VANTS GAMES' } }] }).catch(() => null);
}

async function owner(env, sub, p, m, req, H) {
  const db = env.DB;
  if (!(await esOwner(db, sub))) return H.json({ ok: false, error: 'solo_owner' }, 403);
  const b = m === 'POST' ? await req.json().catch(() => ({})) : {};

  if (p === '/admin/resumen' && m === 'GET') {
    const [t, a, e, i] = await Promise.all([
      db.prepare('SELECT slug, nombre, game_slug, estado, starts_at, max_teams FROM pt_torneos ORDER BY created_at DESC LIMIT 100').all(),
      db.prepare('SELECT slug, titulo, publicado_at, estado FROM pt_articulos ORDER BY COALESCE(publicado_at, created_at) DESC LIMIT 100').all(),
      eventosPublicos(db, true),
      db.prepare(
        `SELECT tt.id, tt.tournament_id, tt.name, tt.tag, tt.captain, tt.region, tt.status, tt.created_at, pt.nombre torneo
         FROM tournament_teams tt LEFT JOIN pt_torneos pt ON pt.slug = tt.tournament_id ORDER BY tt.created_at DESC LIMIT 200`
      ).all(),
    ]);
    return H.json({ ok: true, torneos: t.results || [], anuncios: a.results || [], eventos: e, inscripciones: i.results || [] });
  }

  if (p === '/admin/torneo' && m === 'POST') {
    const t = torneoDesde(b);
    const edita = !!b.slug;
    if ((!edita || b.nombre !== undefined) && (!t.nombre || t.nombre.length < 3)) return H.json({ ok: false, error: 'nombre_invalido' }, 400);
    if ((!edita || b.juego !== undefined) && !JUEGOS.includes(t.game_slug)) return H.json({ ok: false, error: 'juego_invalido' }, 400);
    if (!ESTADOS_T.includes(t.estado)) return H.json({ ok: false, error: 'estado_invalido' }, 400);
    if (t.ends_at && t.starts_at && t.ends_at < t.starts_at) return H.json({ ok: false, error: 'fechas_invalidas' }, 400);
    const cols = Object.keys(t);
    if (b.slug) {
      const ex = await db.prepare('SELECT slug FROM pt_torneos WHERE slug = ?').bind(String(b.slug)).first();
      if (!ex) return H.json({ ok: false, error: 'no_encontrado' }, 404);
      // Solo se actualizan los campos enviados (el resto se conserva).
      const env2 = (c) => (c === 'game_slug' ? b.juego !== undefined || b.game_slug !== undefined : b[c] !== undefined);
      const upd = cols.filter(env2);
      await db.prepare('UPDATE pt_torneos SET ' + upd.map((c) => c + ' = ?').join(', ') + ", updated_at = datetime('now') WHERE slug = ?")
        .bind(...upd.map((c) => t[c]), ex.slug).run();
      return H.json({ ok: true, slug: ex.slug, actualizado: true });
    }
    const slug = await slugLibre(db, 'pt_torneos', slugify(t.nombre));
    await db.prepare('INSERT INTO pt_torneos (id, slug, source, ' + cols.join(', ') + ") VALUES (?, ?, 'vants', " + cols.map(() => '?').join(', ') + ')')
      .bind(uid(), slug, ...cols.map((c) => t[c])).run();
    await avisarTodos(env, H.notificar, H.discord, 'torneo', 'Nuevo torneo: ' + t.nombre, t.descripcion ? t.descripcion.slice(0, 200) : 'Inscripciones abiertas en VANTS.', '/torneos/' + slug);
    return H.json({ ok: true, slug });
  }

  if (p === '/admin/anuncio' && m === 'POST') {
    const titulo = txt(b.titulo, 140), cuerpo = txt(b.cuerpo, 20000), resumen = txt(b.resumen, 300);
    const juego = JUEGOS.includes(b.juego) ? b.juego : null;
    if (!titulo || titulo.length < 3 || !cuerpo) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    if (b.slug) {
      const r = await db.prepare('UPDATE pt_articulos SET titulo = ?, resumen = ?, cuerpo = ?, game_slug = ? WHERE slug = ?').bind(titulo, resumen, cuerpo, juego, String(b.slug)).run();
      return H.json({ ok: true, slug: b.slug, actualizado: !!(r.meta && r.meta.changes) });
    }
    const slug = await slugLibre(db, 'pt_articulos', slugify(titulo));
    const autor = await nickDe(db, sub);
    await db.prepare("INSERT INTO pt_articulos (id, slug, titulo, resumen, cuerpo, autor, game_slug, estado, publicado_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', strftime('%Y-%m-%dT%H:%M:%SZ','now'))")
      .bind(uid(), slug, titulo, resumen, cuerpo, autor, juego).run();
    await avisarTodos(env, H.notificar, H.discord, 'anuncio', titulo, resumen || cuerpo.slice(0, 200), '/noticias/' + slug);
    return H.json({ ok: true, slug });
  }

  if (p === '/admin/evento' && m === 'POST') {
    const titulo = txt(b.titulo, 120), empieza = fechaISO(b.empieza), termina = fechaISO(b.termina);
    if (!titulo || !empieza) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    if (termina && termina < empieza) return H.json({ ok: false, error: 'fechas_invalidas' }, 400);
    const url = txt(b.url, 400);
    if (url && !/^https?:\/\//i.test(url)) return H.json({ ok: false, error: 'url_invalida' }, 400);
    const fila = [titulo, txt(b.tipo, 30) || 'comunidad', txt(b.descripcion, 2000), JUEGOS.includes(b.juego) ? b.juego : null, txt(b.lugar, 120), url, empieza, termina];
    if (b.id) {
      await db.prepare('UPDATE integ_eventos SET titulo=?, tipo=?, descripcion=?, juego=?, lugar=?, url=?, empieza=?, termina=? WHERE id = ?').bind(...fila, String(b.id)).run();
      return H.json({ ok: true, id: b.id, actualizado: true });
    }
    const id = uid();
    await db.prepare('INSERT INTO integ_eventos (id, titulo, tipo, descripcion, juego, lugar, url, empieza, termina) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ...fila).run();
    await avisarTodos(env, H.notificar, H.discord, 'evento', 'Nuevo evento: ' + titulo, fila[2] ? fila[2].slice(0, 200) : null, '/eventos');
    return H.json({ ok: true, id });
  }

  if (p === '/admin/borrar' && m === 'POST') {
    const id = String(b.id || '');
    if (!id) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    if (b.tipo === 'torneo') {
      await db.batch([
        db.prepare('DELETE FROM pt_torneos WHERE slug = ?').bind(id),
        db.prepare('DELETE FROM tournament_teams WHERE tournament_id = ?').bind(id),
        db.prepare('DELETE FROM tournament_matches WHERE tournament_id = ?').bind(id),
      ]);
    } else if (b.tipo === 'anuncio') {
      await db.prepare('DELETE FROM pt_articulos WHERE slug = ?').bind(id).run();
    } else if (b.tipo === 'evento') {
      await db.prepare('DELETE FROM integ_eventos WHERE id = ?').bind(id).run();
    } else return H.json({ ok: false, error: 'tipo_invalido' }, 400);
    return H.json({ ok: true });
  }

  if (p === '/admin/inscripcion' && m === 'POST') {
    const id = String(b.id || ''), status = String(b.status || '');
    if (!['pendiente', 'confirmado', 'rechazado'].includes(status)) return H.json({ ok: false, error: 'estado_invalido' }, 400);
    const fila = await db.prepare('SELECT tt.auth0_sub, tt.name, tt.tournament_id, pt.nombre FROM tournament_teams tt LEFT JOIN pt_torneos pt ON pt.slug = tt.tournament_id WHERE tt.id = ?').bind(id).first();
    if (!fila) return H.json({ ok: false, error: 'no_encontrado' }, 404);
    await db.prepare('UPDATE tournament_teams SET status = ? WHERE id = ?').bind(status, id).run();
    if (fila.auth0_sub && status !== 'pendiente') {
      await H.notificar(env, fila.auth0_sub, 'torneo',
        (status === 'confirmado' ? 'Inscripción confirmada: ' : 'Inscripción rechazada: ') + fila.name,
        fila.nombre || fila.tournament_id, '/torneos/' + fila.tournament_id).catch(() => null);
    }
    return H.json({ ok: true });
  }

  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}

/* ============================================================ router */

// Devuelve Response o null si la ruta no es de este módulo.
export async function rutasComunidad(req, env, url, p, m, H) {
  // ---- públicas
  if (p === '/ranking' && m === 'GET') {
    const r = await H.cacheado('ranking', 60_000, () => rankingPublico(env, H.perfilFaceit));
    return H.json({ ok: true, ...r }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  if (p === '/eventos' && m === 'GET') {
    return H.json({ ok: true, eventos: await eventosPublicos(env.DB, url.searchParams.get('todos') === '1') }, 200, { 'Cache-Control': 'public, max-age=30' });
  }
  const mEq = p.match(/^\/equipos\/([a-z0-9-]{1,48})$/);
  if (mEq && m === 'GET') {
    const slug = mEq[1];
    const e = await env.DB.prepare('SELECT slug, juego, creado FROM integ_equipos WHERE slug = ?').bind(slug).first();
    if (!e) return H.json({ ok: true, vants: false, miembros: [] });
    const ms = await env.DB.prepare(
      `SELECT m.auth0_sub, m.nick, m.rol, m.unido, r.nivel, r.elo, p.slug pslug FROM integ_equipo_miembros m
       LEFT JOIN integ_ranking r ON r.auth0_sub = m.auth0_sub
       LEFT JOIN pt_players p ON p.source = 'vants' AND p.external_id = m.auth0_sub || '|' || ?
       WHERE m.team_slug = ? ORDER BY m.rol = 'capitan' DESC, m.unido`
    ).bind(e.juego, slug).all();
    const { porSub } = await identidades(env.DB);
    return H.json({ ok: true, vants: true, creado: e.creado, miembros: (ms.results || []).map((x) => { const i = porSub.get(x.auth0_sub); return { nick: x.nick, rol: x.rol, unido: x.unido, nivel: x.nivel, elo: x.elo, slug: x.pslug, pid: i ? i.pid : null, avatar: i ? i.avatar : null }; }) });
  }
  const mJ = p.match(/^\/jugador\/([a-z0-9-]{1,60})$/);
  if (mJ && m === 'GET') {
    // FACEIT de un jugador VANTS a partir de su ficha pt_players.
    const pl = await env.DB.prepare("SELECT external_id FROM pt_players WHERE slug = ? AND source = 'vants'").bind(mJ[1]).first();
    const sub = pl && String(pl.external_id || '').split('|')[0];
    const r = sub ? await env.DB.prepare('SELECT nick, avatar, pais, nivel, elo, partidas, winrate, kd, faceit_id FROM integ_ranking WHERE auth0_sub = ?').bind(sub).first() : null;
    return H.json({ ok: true, faceit: r ? { ...r, url: 'https://www.faceit.com/es/players/' + encodeURIComponent(r.nick) } : null });
  }

  const privadas = ['/mis-equipos', '/equipos', '/equipos/unirse', '/equipos/salir', '/equipos/expulsar', '/equipos/codigo', '/mis-inscripciones', '/logros', '/rol'];
  if (!privadas.includes(p) && !p.startsWith('/admin/')) return null;

  // ---- privadas (Auth0)
  const sub = await H.usuario(req, env);
  const res = (r) => H.json(r.body, r.status);

  if (p === '/rol' && m === 'GET') return H.json({ ok: true, owner: await esOwner(env.DB, sub), nick: await nickDe(env.DB, sub) });
  if (p === '/mis-equipos' && m === 'GET') return H.json({ ok: true, equipos: await misEquipos(env.DB, sub) });
  if (p === '/equipos' && m === 'POST') return res(await crearEquipo(env, sub, await req.json().catch(() => ({}))));
  if (p === '/equipos/unirse' && m === 'POST') return res(await unirseEquipo(env, sub, await req.json().catch(() => ({})), H.notificar));
  if (p === '/equipos/salir' && m === 'POST') return res(await salirEquipo(env, sub, await req.json().catch(() => ({}))));
  if (p === '/equipos/expulsar' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const e = await capitanDe(env.DB, String(b.slug || ''), sub);
    if (!e) return H.json({ ok: false, error: 'solo_capitan' }, 403);
    const id = String(b.id || '');
    if (!id || id === sub) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    await quitarMiembro(env.DB, e.slug, e.juego, id);
    await H.notificar(env, id, 'equipo', 'Has salido del equipo', 'El capitán te ha retirado de la plantilla.', '/equipos').catch(() => null);
    return H.json({ ok: true });
  }
  if (p === '/equipos/codigo' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const e = await capitanDe(env.DB, String(b.slug || ''), sub);
    if (!e) return H.json({ ok: false, error: 'solo_capitan' }, 403);
    const codigo = codigoInvitacion();
    await env.DB.prepare('UPDATE integ_equipos SET codigo = ? WHERE slug = ?').bind(codigo, e.slug).run();
    return H.json({ ok: true, codigo });
  }
  if (p === '/mis-inscripciones' && m === 'GET') {
    const rs = await env.DB.prepare(
      `SELECT tt.id, tt.tournament_id slug, tt.name, tt.tag, tt.status, tt.created_at, pt.nombre torneo, pt.starts_at, pt.estado, pt.game_slug
       FROM tournament_teams tt LEFT JOIN pt_torneos pt ON pt.slug = tt.tournament_id WHERE tt.auth0_sub = ? ORDER BY tt.created_at DESC`
    ).bind(sub).all();
    return H.json({ ok: true, inscripciones: rs.results || [] });
  }
  if (p === '/logros' && m === 'GET') return H.json({ ok: true, ...(await logrosDe(env, sub, H.perfilFaceit)) });
  if (p.startsWith('/admin/')) return owner(env, sub, p, m, req, H);
  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}
