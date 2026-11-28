/**
 * Insignias VANTS — catálogo y concesión automática.
 *
 * Cada insignia tiene una regla que se evalúa con datos reales del servidor
 * (plan de Stripe en `entitlements`, FACEIT, VALORANT, logros, torneos, equipos,
 * clips, canales). Se recalculan en cada consulta (caché corta), así que
 * aparecen solas en cuanto se cumple el requisito y se retiran si deja de
 * cumplirse (p. ej. una suscripción caducada). Las insignias «por invitación»
 * (SOCIO, PARTNER) las concede el dueño desde la ficha pública del jugador.
 *
 *   GET  /insignias                 catálogo + nº de jugadores que la tienen (público)
 *   GET  /insignias/mias            mis insignias con progreso (sesión)
 *   POST /insignias/conceder        { pid, code, quitar? }  (solo dueño)
 */
import { identidades } from './perfiles.js';
import { datosValorant } from './juegos.js';
import { esOwner } from './comunidad.js';

// forma: hex | escudo | estrella | circulo | diamante — icono: ver client/src/components/Insignia3D.tsx
export const CATALOGO = [
  { code: 'SOCIO', nombre: 'SOCIO VANTS', categoria: 'membresia', rareza: 'mythic', color: '#FF0D2E', forma: 'escudo', icono: 'v', descripcion: 'Socio oficial de la marca VANTS: voto en el circuito y Discord privado.', requisito: 'Plan SOCIO VANTS (solo por invitación de la organización).' },
  { code: 'PRO', nombre: 'PRO', categoria: 'membresia', rareza: 'epic', color: '#FF0D2E', forma: 'hex', icono: 'rayo', descripcion: 'Suscripción VANTS PRO activa. Incluye el sello PRO junto al nick.', requisito: 'Plan VANTS PRO vigente (mensual o anual).' },
  { code: 'PLUS', nombre: 'PLUS', categoria: 'membresia', rareza: 'rare', color: '#4CC9F0', forma: 'hex', icono: 'mas', descripcion: 'Pase de temporada S4 activo.', requisito: 'PASE S4 comprado y vigente (180 días).' },
  { code: 'CREATOR', nombre: 'CREATOR', categoria: 'membresia', rareza: 'epic', color: '#B44CFF', forma: 'hex', icono: 'play', descripcion: 'Creador de contenido de VANTS con sello CREATOR.', requisito: 'Plan VANTS CREATOR vigente.' },
  { code: 'FOUNDER', nombre: 'FOUNDER', categoria: 'identidad', rareza: 'mythic', color: '#F5C044', forma: 'escudo', icono: 'diamante', descripcion: 'Cuenta fundadora de VANTS GAMES.', requisito: 'Ser una cuenta fundadora de VANTS.' },
  { code: 'MEMBER', nombre: 'MEMBER', categoria: 'identidad', rareza: 'common', color: '#aebfce', forma: 'hex', icono: 'persona', descripcion: 'Cuenta registrada en VANTS GAMES.', requisito: 'Crear tu cuenta en VANTS.' },
  { code: 'VERIFIED', nombre: 'VERIFIED', categoria: 'identidad', rareza: 'rare', color: '#4CC9F0', forma: 'escudo', icono: 'check', descripcion: 'Identidad comprobada en dos plataformas.', requisito: 'Vincular FACEIT y Discord (o Riot ID) a tu cuenta.' },
  { code: 'PARTNER', nombre: 'PARTNER', categoria: 'identidad', rareza: 'legendary', color: '#F5C044', forma: 'hex', icono: 'anillos', descripcion: 'Colaboración oficial con VANTS.', requisito: 'Concedida por la organización.' },
  { code: 'ELITE', nombre: 'ELITE', categoria: 'competitivo', rareza: 'legendary', color: '#aebfce', forma: 'estrella', icono: 'corona', descripcion: 'Élite competitiva en FACEIT o VALORANT.', requisito: 'Nivel 10 de FACEIT o rango Inmortal/Radiante en VALORANT.' },
  { code: 'CHAMPION', nombre: 'CHAMPION', categoria: 'competitivo', rareza: 'legendary', color: '#F5C044', forma: 'escudo', icono: 'copa', descripcion: 'Campeón de un torneo oficial de VANTS.', requisito: 'Ganar la final de un torneo oficial de VANTS.' },
  { code: 'TOP 10', nombre: 'TOP 10', categoria: 'competitivo', rareza: 'epic', color: '#FF0D2E', forma: 'escudo', icono: 'estrella', descripcion: 'Entre los 10 mejores del Ranking VANTS.', requisito: 'Top 10 del Ranking VANTS con al menos 1.000 XP.' },
  { code: 'RISING STAR', nombre: 'RISING STAR', categoria: 'competitivo', rareza: 'rare', color: '#4CC9F0', forma: 'estrella', icono: 'estrella', descripcion: 'Progresión destacada en tus juegos.', requisito: 'Conseguir 50 logros de FACEIT o VALORANT.', meta: 50 },
  { code: 'VETERAN', nombre: 'VETERAN', categoria: 'competitivo', rareza: 'rare', color: '#8d949e', forma: 'escudo', icono: 'galones', descripcion: 'Participación constante en torneos oficiales.', requisito: '5 inscripciones confirmadas en torneos oficiales.', meta: 5 },
  { code: 'COLECCIONISTA', nombre: 'COLECCIONISTA', categoria: 'competitivo', rareza: 'epic', color: '#8d949e', forma: 'diamante', icono: 'gema', descripcion: 'Coleccionista de logros VANTS.', requisito: 'Conseguir 250 de los 1000 logros de juego.', meta: 250 },
  { code: 'CAPITAN', nombre: 'CAPITÁN', categoria: 'comunidad', rareza: 'rare', color: '#FF9E2C', forma: 'circulo', icono: 'brazalete', descripcion: 'Capitán de un equipo del circuito.', requisito: 'Crear un equipo en VANTS y ser su capitán.' },
  { code: 'ROSTER', nombre: 'ROSTER VANTS', categoria: 'comunidad', rareza: 'legendary', color: '#8d949e', forma: 'circulo', icono: 'v', descripcion: 'Jugador del roster oficial de VANTS.', requisito: 'Formar parte del roster oficial (/equipo-vants).' },
  { code: 'STREAMER', nombre: 'STREAMER', categoria: 'comunidad', rareza: 'common', color: '#B44CFF', forma: 'circulo', icono: 'directo', descripcion: 'Emite sus partidas en Twitch o Kick.', requisito: 'Vincular tu canal de Twitch o Kick.' },
  { code: 'FORTNITE', nombre: 'FORTNITE', categoria: 'competitivo', rareza: 'rare', color: '#9D4DFF', forma: 'escudo', icono: 'f', descripcion: 'Cuenta de Epic Games verificada para jugar Fortnite en el circuito VANTS.', requisito: 'Vincular tu cuenta de Epic Games (Fortnite) con el inicio de sesión oficial de Epic.' },
  { code: 'CLIPPER', nombre: 'CLIPPER', categoria: 'comunidad', rareza: 'rare', color: '#41d98d', forma: 'circulo', icono: 'clip', descripcion: 'Comparte sus mejores jugadas con la comunidad.', requisito: 'Publicar 5 clips en VANTS.', meta: 5 },
];
const POR_CODE = new Map(CATALOGO.map((b) => [b.code, b]));
export const MANUALES = ['SOCIO', 'PARTNER', 'CREATOR', 'VERIFIED', 'CHAMPION'];

const todas = async (db, sql, ...a) => ((await db.prepare(sql).bind(...a).all().catch(() => ({ results: [] }))).results || []);
const enLista = (xs) => xs.map(() => '?').join(',') || "''";

async function asegurar(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_insignias_manual (
    pid TEXT NOT NULL, code TEXT NOT NULL, por TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (pid, code))`).run();
}

let cacheEval = new Map();
/** Evalúa todas las insignias de una identidad (grupo de cuentas de una persona). */
export async function evaluar(env, ident, { conValorant = true } = {}) {
  const k = ident.pid + (conValorant ? ':v' : '');
  const c = cacheEval.get(k);
  if (c && Date.now() - c.at < 60_000) return c.val;
  const db = env.DB;
  await asegurar(db);
  const s = ident.subs.length ? ident.subs : ['-'];
  const [ents, logros, clips, capitan, canales, torneos, finales, manual, roster, epic] = await Promise.all([
    todas(db, `SELECT tier, expires_at FROM entitlements WHERE auth0_sub IN (${enLista(s)}) AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`, ...s),
    todas(db, `SELECT COUNT(DISTINCT code) n FROM integ_logros_ok WHERE auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT COUNT(*) n FROM integ_clips WHERE auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT COUNT(*) n FROM integ_equipos WHERE capitan_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT twitch, kick FROM integ_canales WHERE auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT COUNT(DISTINCT tournament_id) n FROM tournament_teams WHERE status = 'confirmado' AND auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, `SELECT COUNT(*) n FROM tournament_matches m JOIN tournament_teams t ON t.id = m.ganador WHERE m.ronda IN ('f','lf') AND m.estado = 'final' AND t.auth0_sub IN (${enLista(s)})`, ...s),
    todas(db, 'SELECT code, creado FROM integ_insignias_manual WHERE pid = ?', ident.pid),
    todas(db, 'SELECT 1 FROM integ_roster WHERE pid = ? LIMIT 1', ident.pid),
    todas(db, `SELECT 1 FROM integ_epic WHERE auth0_sub IN (${enLista(s)}) LIMIT 1`, ...s),
  ]);
  // Insignias que ya concedió el motor de logros del Worker principal (si hay acceso de lectura).
  let motor = [];
  if (env.ACH_DB) motor = await todas(env.ACH_DB, `SELECT b.code FROM user_badge_awards a JOIN badge_definitions b ON b.id = a.badge_id WHERE a.status = 'active' AND a.user_id IN (${enLista(s)})`, ...s);
  const tiers = new Set(ents.map((e) => String(e.tier || '').toLowerCase()));
  const man = new Set(manual.map((m) => m.code));
  const mot = new Set(motor.map((m) => m.code));
  const owner = ident.fundador;
  const plats = new Set(ident.links.filter((l) => l.platform_user_id || l.handle).map((l) => l.platform));
  for (const sub of ident.subs) { const m = sub.match(/^(?:oauth2\|)?(twitch|discord)\|/); if (m) plats.add(m[1]); }
  const nLogros = (logros[0] && logros[0].n) || 0;
  const nClips = (clips[0] && clips[0].n) || 0;
  const nTorneos = (torneos[0] && torneos[0].n) || 0;
  const tieneCanal = canales.some((r) => r.twitch || r.kick) || plats.has('twitch') || plats.has('kick');
  const nivelF = ident.ranking ? Number(ident.ranking.nivel) || 0 : 0;
  let tierV = 0;
  if (conValorant) {
    const riotLink = (ident.links || []).find((l) => l.platform === 'riot' && Number(l.verified) && l.platform_user_id);
    const subRiot = riotLink ? riotLink.auth0_sub : (ident.subs.find((x) => x.startsWith('google-oauth2|')) || ident.subs[0]);
    if (subRiot) {
      const d = await datosValorant(env, subRiot).catch(() => null);
      if (d && d.ok && d.opt_in && d.fuente === 'riot_official') {
        tierV = Number(d.tier_id) || 0;
        if (d.riot) plats.add('riot');
      }
    }
  }
  const { lista } = await identidades(db);
  const top = [...lista].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 10);
  const enTop = ident.xp >= 1000 && top.some((x) => x.pid === ident.pid);

  const r = (ok, actual, meta) => ({ ok: !!ok, ...(meta ? { progreso: { actual: Math.min(actual, meta), meta } } : {}) });
  const ev = {
    SOCIO: r(owner || tiers.has('socio') || man.has('SOCIO')),
    PRO: r(owner || tiers.has('pro') || mot.has('PRO')),
    PLUS: r(owner || tiers.has('pase') || tiers.has('plus') || mot.has('PLUS')),
    CREATOR: r(owner || tiers.has('creator') || man.has('CREATOR') || mot.has('CREATOR')),
    FOUNDER: r(owner || mot.has('FOUNDER')),
    MEMBER: r(true),
    VERIFIED: r(owner || man.has('VERIFIED') || mot.has('VERIFIED') || (plats.has('faceit') && (plats.has('discord') || plats.has('riot')))),
    PARTNER: r(owner || man.has('PARTNER') || mot.has('PARTNER')),
    ELITE: r(nivelF >= 10 || tierV >= 24 || mot.has('ELITE')),
    CHAMPION: r(((finales[0] && finales[0].n) || 0) > 0 || man.has('CHAMPION') || mot.has('CHAMPION')),
    'TOP 10': r(enTop || mot.has('TOP 10')),
    'RISING STAR': r(nLogros >= 50 || mot.has('RISING STAR'), nLogros, 50),
    VETERAN: r(nTorneos >= 5 || mot.has('VETERAN'), nTorneos, 5),
    COLECCIONISTA: r(nLogros >= 250, nLogros, 250),
    CAPITAN: r(((capitan[0] && capitan[0].n) || 0) > 0),
    ROSTER: r(roster.length > 0),
    STREAMER: r(tieneCanal),
    FORTNITE: r(epic.length > 0),
    CLIPPER: r(nClips >= 5, nClips, 5),
  };
  const sello = ev.SOCIO.ok ? 'SOCIO' : ev.CREATOR.ok ? 'CREATOR' : ev.PRO.ok || ev.PLUS.ok ? 'PRO' : null;
  const val = {
    sello,
    insignias: CATALOGO.map((b) => ({ code: b.code, ...ev[b.code], manual: man.has(b.code) })),
    conseguidas: CATALOGO.filter((b) => ev[b.code].ok).map((b) => b.code),
  };
  cacheEval.set(k, { at: Date.now(), val });
  return val;
}

let cacheCat = { at: 0, val: null };
async function catalogoPublico(env) {
  if (cacheCat.val && Date.now() - cacheCat.at < 300_000) return cacheCat.val;
  const { lista } = await identidades(env.DB);
  const cuenta = new Map(CATALOGO.map((b) => [b.code, 0]));
  for (const i of lista.slice(0, 200)) {
    const e = await evaluar(env, i, { conValorant: false }).catch(() => null);
    if (e) for (const c of e.conseguidas) cuenta.set(c, cuenta.get(c) + 1);
  }
  const val = CATALOGO.map((b) => ({ ...b, titulares: cuenta.get(b.code) || 0, manual: MANUALES.includes(b.code) }));
  cacheCat = { at: Date.now(), val };
  return val;
}

export function invalidarInsignias() { cacheEval = new Map(); cacheCat = { at: 0, val: null }; }

export async function rutasInsignias(req, env, p, m, H, sub) {
  if (p === '/insignias' && m === 'GET') {
    return H.json({ ok: true, catalogo: await catalogoPublico(env) }, 200, { 'Cache-Control': 'public, max-age=120' });
  }
  if (p === '/insignias/mias' && m === 'GET') {
    if (!sub) return H.json({ ok: false, error: 'no_autenticado' }, 401);
    const ident = (await identidades(env.DB)).porSub.get(sub);
    if (!ident) return H.json({ ok: true, sello: null, insignias: CATALOGO.map((b) => ({ code: b.code, ok: b.code === 'MEMBER' })), conseguidas: ['MEMBER'] });
    return H.json({ ok: true, pid: ident.pid, ...(await evaluar(env, ident)) });
  }
  if (p === '/insignias/conceder' && m === 'POST') {
    if (!sub) return H.json({ ok: false, error: 'no_autenticado' }, 401);
    if (!(await esOwner(env.DB, sub))) return H.json({ ok: false, error: 'solo_owner' }, 403);
    const b = await req.json().catch(() => ({}));
    const pid = String(b.pid || ''), code = String(b.code || '');
    if (!/^[0-9a-f]{16}$/.test(pid) || !POR_CODE.has(code)) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    if (!MANUALES.includes(code)) return H.json({ ok: false, error: 'insignia_automatica' }, 400);
    await asegurar(env.DB);
    if (b.quitar) await env.DB.prepare('DELETE FROM integ_insignias_manual WHERE pid = ? AND code = ?').bind(pid, code).run();
    else await env.DB.prepare('INSERT OR IGNORE INTO integ_insignias_manual (pid, code, por) VALUES (?, ?, ?)').bind(pid, code, sub).run();
    invalidarInsignias();
    return H.json({ ok: true });
  }
  return null;
}
