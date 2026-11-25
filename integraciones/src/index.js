// VANTS · Integraciones (Cloudflare Worker)
// -----------------------------------------------------------------------------
// Perfil de FACEIT (nivel, ELO, estadísticas, partidas, equipo), estado
// "en partida" (eventos del webhook de FACEIT guardados en D1), directos de
// Twitch y Kick, y notificaciones de la web (campana) + avisos a Discord.
//
// Base de datos: D1 vants-db (binding DB), la misma que usan el linker y el
// webhook de FACEIT. Tablas propias con prefijo integ_ (ver migraciones/).
// Cron cada 2 min: procesa eventos de FACEIT nuevos y revisa los directos.
//
// Secretos (wrangler secret / GitHub Actions):
//   FACEIT_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET,
//   KICK_CLIENT_ID, KICK_CLIENT_SECRET, DISCORD_BOT_TOKEN,
//   EPIC_CLIENT_SECRET, FORTNITE_API_KEY (opcional, estadísticas)
// Variables: AUTH0_DOMAIN, AUTH0_AUDIENCE, SITE_ORIGINS, SITE_URL,
//   CANALES_TWITCH, CANALES_KICK (canales oficiales, separados por coma)

import { rutasComunidad, refrescarRanking, guardarRanking } from './comunidad.js';
import { rutasJuegos, equipoFaceit } from './juegos.js';
import { rutasExtras } from './extras.js';
import { rutasEpic } from './epic.js';
import { rutasComms } from './comms.js';
import { rutasAuth, verificarJwtDual } from './auth.js';
import { rutasEventosRsvp } from './eventosRsvp.js';
import { rutasComunidadLfg } from './comunidadLfg.js';
import { rutasComunidadForo } from './comunidadForo.js';
import { rutasComunidadMisiones } from './comunidadMisiones.js';
import { rutasComunidadVotaciones } from './comunidadVotaciones.js';
import { rutasGooglePro } from './googlePro.js';
import { rutasVidiqSeo } from './vidiqSeo.js';
import { rutasSkilling } from './skilling.js';

const FACEIT = 'https://open.faceit.com/data/v4';
const cache = new Map(); // caché en memoria del isolate

// ---------------------------------------------------------------- utilidades
function cors(env, req) {
  const origin = req.headers.get('origin') || '';
  const permitidos = String(env.SITE_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isWebAllowed = permitidos.includes(origin) || (env.ALLOW_LOCALHOST === '1' && /^http:\/\/localhost(:\d+)?$/.test(origin));
  const isNativeApp =
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost' ||
    origin === 'null' ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = !origin || isWebAllowed || isNativeApp;
  const headers = {
    'Access-Control-Allow-Origin': ok && origin ? origin : permitidos[0] || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isWebAllowed && origin) headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}
function json(body, status, h) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', ...(h || {}) } });
}
async function cacheado(clave, ms, fn) {
  const c = cache.get(clave);
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  if (cache.size > 300) cache.clear();
  cache.set(clave, { at: Date.now(), v });
  return v;
}
const lista = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ---------------------------------------------------------------- JWT dual (VANTS + Auth0)
// Verifica el JWT (VANTS Identity RS256 o Auth0) y devuelve los claims completos
// (sub + email verificado, usado por los correos transaccionales).
async function usuarioClaims(req, env) {
  const a = req.headers.get('authorization') || '';
  if (!a.startsWith('Bearer ')) throw new Error('sin_sesion');
  return verificarJwtDual(a.slice(7).trim(), env);
}
// Firma histórica: solo el sub (identidad). Los claims completos van arriba.
async function usuario(req, env) {
  return (await usuarioClaims(req, env)).sub;
}

// ---------------------------------------------------------------- FACEIT
async function fx(env, ruta) {
  const r = await fetch(FACEIT + ruta, { headers: { Authorization: 'Bearer ' + env.FACEIT_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('faceit_' + r.status);
  return r.json();
}

async function perfilFaceit(env, pid) {
  return cacheado('fp:' + pid, 60_000, async () => {
    const [p, st, hist, equipos] = await Promise.all([
      fx(env, '/players/' + pid),
      fx(env, '/players/' + pid + '/stats/cs2').catch(() => null),
      fx(env, '/players/' + pid + '/games/cs2/stats?limit=10').catch(() => null),
      fx(env, '/players/' + pid + '/teams?limit=5').catch(() => null),
    ]);
    if (!p) return null;
    const cs = (p.games && (p.games.cs2 || p.games.csgo)) || {};
    const lt = (st && st.lifetime) || {};
    const jugador = {
      id: p.player_id,
      nickname: p.nickname,
      avatar: p.avatar || null,
      pais: p.country || null,
      nivel: num(cs.skill_level),
      elo: num(cs.faceit_elo),
      region: cs.region || null,
      url: 'https://www.faceit.com/es/players/' + encodeURIComponent(p.nickname),
      verificado: !!p.verified,
    };
    const estadisticas = st ? {
      partidas: num(lt['Total Matches'] ?? lt['Matches']),
      victorias: num(lt['Wins']),
      winrate: num(lt['Win Rate %']),
      kd: num(lt['Average K/D Ratio']),
      hs: num(lt['Average Headshots %']),
      adr: num(lt['ADR']),
      racha: num(lt['Current Win Streak']),
      mejor_racha: num(lt['Longest Win Streak']),
      recientes: Array.isArray(lt['Recent Results']) ? lt['Recent Results'].map((x) => x === '1') : [],
    } : null;
    const partidas = ((hist && hist.items) || []).map((it) => {
      const s = it.stats || {};
      return {
        id: s['Match Id'] || null,
        mapa: s['Map'] || null,
        victoria: s['Result'] === '1',
        marcador: s['Score'] || null,
        kills: num(s['Kills']), muertes: num(s['Deaths']), asistencias: num(s['Assists']),
        kd: num(s['K/D Ratio']), adr: num(s['ADR']), hs: num(s['Headshots %']),
        equipo: s['Team'] || null,
        fecha: s['Match Finished At'] ? new Date(Number(s['Match Finished At']) * (Number(s['Match Finished At']) < 1e12 ? 1000 : 1)).toISOString() : (s['Updated At'] || null),
        url: s['Match Id'] ? 'https://www.faceit.com/es/cs2/room/' + s['Match Id'] : null,
      };
    });
    // Equipo: los equipos de FACEIT del jugador; si no tiene, el equipo de su última partida.
    let equipo = null;
    const eq = (equipos && equipos.items) || [];
    if (eq.length) {
      const t = await fx(env, '/teams/' + eq[0].team_id).catch(() => null);
      if (t) equipo = {
        tipo: 'faceit', nombre: t.name, avatar: t.avatar || null,
        url: 'https://www.faceit.com/es/teams/' + t.team_id,
        jugadores: (t.members || []).map((m) => ({ id: m.user_id, nickname: m.nickname, avatar: m.avatar || null, nivel: num(m.skill_level), url: 'https://www.faceit.com/es/players/' + encodeURIComponent(m.nickname) })),
      };
    }
    if (!equipo && partidas[0] && partidas[0].id) {
      const m = await fx(env, '/matches/' + partidas[0].id).catch(() => null);
      const facciones = (m && m.teams) || {};
      for (const k of Object.keys(facciones)) {
        const f = facciones[k];
        if ((f.roster || []).some((r) => r.player_id === pid)) {
          equipo = {
            tipo: 'ultima_partida', nombre: f.name, avatar: f.avatar || null,
            url: partidas[0].url,
            jugadores: f.roster.map((r) => ({ id: r.player_id, nickname: r.nickname, avatar: r.avatar || null, nivel: num(r.game_skill_level), url: 'https://www.faceit.com/es/players/' + encodeURIComponent(r.nickname) })),
          };
          break;
        }
      }
    }
    return { jugador, estadisticas, partidas, equipo };
  });
}

// "En partida": último evento del webhook que incluya al jugador.
async function partidaActual(env, pid) {
  const r = await env.DB.prepare(
    "SELECT event_type, payload, created_at FROM faceit_webhook_events WHERE payload LIKE ? ORDER BY id DESC LIMIT 1"
  ).bind('%' + pid + '%').first();
  if (!r) return { estado: 'desconectado' };
  const activo = ['match_object_created', 'match_status_configuring', 'match_status_ready'].includes(r.event_type);
  const edadMin = (Date.now() - Date.parse(r.created_at.replace(' ', 'T') + 'Z')) / 60000;
  let p = {};
  try { p = JSON.parse(r.payload).payload || {}; } catch { /* sin payload */ }
  if (activo && edadMin < 120) {
    return {
      estado: r.event_type === 'match_status_ready' ? 'en_partida' : 'buscando',
      partida: p.id || null,
      cola: (p.entity && p.entity.name) || null,
      url: p.id ? 'https://www.faceit.com/es/cs2/room/' + p.id : null,
      desde: r.created_at,
    };
  }
  return { estado: 'desconectado', ultima_actividad: r.created_at };
}

// ---------------------------------------------------------------- Twitch / Kick
async function tokenApp(env, prov) {
  return cacheado('tok:' + prov, 3000_000, async () => {
    const url = prov === 'twitch' ? 'https://id.twitch.tv/oauth2/token' : 'https://id.kick.com/oauth/token';
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: prov === 'twitch' ? env.TWITCH_CLIENT_ID : env.KICK_CLIENT_ID,
      client_secret: prov === 'twitch' ? env.TWITCH_CLIENT_SECRET : env.KICK_CLIENT_SECRET,
    });
    const r = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('token_' + prov + '_' + r.status);
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new Error('token_' + prov);
    return j.access_token;
  });
}
async function directosTwitch(env, logins) {
  if (!logins.length || !env.TWITCH_CLIENT_SECRET) return [];
  const tk = await tokenApp(env, 'twitch');
  const q = logins.slice(0, 100).map((l) => 'user_login=' + encodeURIComponent(l)).join('&');
  const r = await fetch('https://api.twitch.tv/helix/streams?' + q, { headers: { Authorization: 'Bearer ' + tk, 'Client-Id': env.TWITCH_CLIENT_ID }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    if (r.status === 401) cache.delete('tok:twitch');
    throw new Error('twitch_' + r.status);
  }
  const j = await r.json().catch(() => ({}));
  const vivos = new Map((j.data || []).map((s) => [s.user_login.toLowerCase(), s]));
  return logins.map((l) => {
    const s = vivos.get(l);
    return {
      plataforma: 'twitch', canal: l, en_vivo: !!s,
      nombre: s ? s.user_name : l, titulo: s ? s.title : null, juego: s ? s.game_name : null,
      espectadores: s ? s.viewer_count : null, desde: s ? s.started_at : null,
      miniatura: s ? s.thumbnail_url.replace('{width}', '640').replace('{height}', '360') : null,
      url: 'https://www.twitch.tv/' + l,
    };
  });
}
async function directosKick(env, slugs) {
  if (!slugs.length || !env.KICK_CLIENT_SECRET) return [];
  const tk = await tokenApp(env, 'kick');
  const q = slugs.slice(0, 50).map((s) => 'slug=' + encodeURIComponent(s)).join('&');
  const r = await fetch('https://api.kick.com/public/v1/channels?' + q, { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    if (r.status === 401) cache.delete('tok:kick');
    throw new Error('kick_' + r.status);
  }
  const j = await r.json().catch(() => ({}));
  const por = new Map((j.data || []).map((c) => [String(c.slug).toLowerCase(), c]));
  return slugs.map((sl) => {
    const c = por.get(sl);
    const st = (c && c.stream) || {};
    return {
      plataforma: 'kick', canal: sl, en_vivo: !!st.is_live,
      nombre: sl, titulo: (c && c.stream_title) || null, juego: (c && c.category && c.category.name) || null,
      espectadores: st.is_live ? num(st.viewer_count) : null, desde: st.is_live ? st.start_time || null : null,
      miniatura: st.is_live ? st.thumbnail || null : null,
      url: 'https://kick.com/' + sl,
    };
  });
}

// Canales a vigilar: oficiales + los que cada usuario guardó/vinculó.
async function canalesVigilados(env) {
  const tw = new Set(lista(env.CANALES_TWITCH));
  const kk = new Set(lista(env.CANALES_KICK));
  const rs = await env.DB.prepare('SELECT twitch, kick FROM integ_canales').all();
  for (const r of rs.results || []) { if (r.twitch) tw.add(r.twitch.toLowerCase()); if (r.kick) kk.add(r.kick.toLowerCase()); }
  const lk = await env.DB.prepare("SELECT handle FROM vants_links WHERE platform='twitch'").all();
  for (const r of lk.results || []) if (r.handle) tw.add(String(r.handle).toLowerCase());
  return { twitch: [...tw], kick: [...kk] };
}

// ---------------------------------------------------------------- notificaciones
async function notificar(env, sub, tipo, titulo, cuerpo, url) {
  await env.DB.prepare('INSERT INTO integ_notificaciones (auth0_sub, tipo, titulo, cuerpo, url) VALUES (?, ?, ?, ?, ?)')
    .bind(sub, tipo, String(titulo).slice(0, 140), cuerpo ? String(cuerpo).slice(0, 400) : null, url || null).run();
}
async function discord(env, categoria, payload) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const c = await env.DB.prepare('SELECT channel_id FROM discord_channels WHERE category = ?').bind(categoria).first();
  if (!c) return;
  try {
    const r = await fetch('https://discord.com/api/v10/channels/' + c.channel_id + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error(JSON.stringify({ tipo: 'discord_bot_error', categoria, status: r.status }));
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'discord_bot_error', categoria, error: String((e && e.message) || e).slice(0, 120) }));
  }
}
async function estado(env, clave, valor) {
  if (valor === undefined) {
    const r = await env.DB.prepare('SELECT valor FROM integ_estado WHERE clave = ?').bind(clave).first();
    return r ? r.valor : null;
  }
  await env.DB.prepare('INSERT INTO integ_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').bind(clave, String(valor)).run();
}

// ---------------------------------------------------------------- cron
async function procesarFaceit(env) {
  let ultimo = Number(await estado(env, 'faceit_ultimo_evento'));
  if (!Number.isFinite(ultimo) || ultimo <= 0) {
    const m = await env.DB.prepare('SELECT COALESCE(MAX(id),0) m FROM faceit_webhook_events').first();
    await estado(env, 'faceit_ultimo_evento', m.m);
    return;
  }
  const evs = await env.DB.prepare('SELECT id, event_type, payload FROM faceit_webhook_events WHERE id > ? ORDER BY id LIMIT 50').bind(ultimo).all();
  const links = await env.DB.prepare("SELECT auth0_sub, handle, platform_user_id FROM vants_links WHERE platform='faceit' AND platform_user_id IS NOT NULL").all();
  const porFaceit = new Map((links.results || []).map((l) => [l.platform_user_id, l]));
  for (const e of evs.results || []) {
    ultimo = e.id;
    let p = {};
    try { p = JSON.parse(e.payload).payload || {}; } catch { continue; }
    const ids = new Set();
    for (const t of p.teams || []) for (const r of t.roster || []) ids.add(r.id);
    const url = p.id ? 'https://www.faceit.com/es/cs2/room/' + p.id : null;
    for (const id of ids) {
      const l = porFaceit.get(id);
      if (!l) continue;
      if (e.event_type === 'match_status_ready') {
        await notificar(env, l.auth0_sub, 'faceit', 'Tu partida de FACEIT está lista', (p.entity && p.entity.name) || 'CS2', url);
      } else if (e.event_type === 'match_status_finished') {
        let res = 'Partida terminada';
        try {
          const m = await fx(env, '/matches/' + p.id);
          const fac = Object.keys(m.teams || {}).find((k) => (m.teams[k].roster || []).some((r) => r.player_id === id));
          const sc = (m.results && m.results.score) || {};
          const gano = m.results && m.results.winner === fac;
          const otro = Object.keys(sc).find((k) => k !== fac);
          res = (gano ? 'Victoria' : 'Derrota') + (fac && otro ? ' ' + sc[fac] + '-' + sc[otro] : '');
        } catch { /* sin detalle */ }
        await notificar(env, l.auth0_sub, 'faceit', 'FACEIT · ' + res, (p.entity && p.entity.name) || 'CS2', url);
        await discord(env, 'resultados', { embeds: [{ title: l.handle + ' · ' + res, description: (p.entity && p.entity.name) || 'CS2', url, color: res.startsWith('Victoria') ? 0x2ecc71 : 0xe74c3c, footer: { text: 'FACEIT · VANTS' } }] });
      } else if (e.event_type === 'match_status_cancelled' || e.event_type === 'match_status_aborted') {
        await notificar(env, l.auth0_sub, 'faceit', 'Partida de FACEIT cancelada', null, url);
      }
    }
  }
  await estado(env, 'faceit_ultimo_evento', ultimo);
}

async function revisarDirectos(env) {
  const c = await canalesVigilados(env);
  const todos = [...(await directosTwitch(env, c.twitch).catch(() => [])), ...(await directosKick(env, c.kick).catch(() => []))];
  for (const d of todos) {
    const prev = await env.DB.prepare('SELECT en_vivo FROM integ_directos WHERE plataforma = ? AND canal = ?').bind(d.plataforma, d.canal).first();
    await env.DB.prepare(
      `INSERT INTO integ_directos (plataforma, canal, nombre, en_vivo, titulo, juego, espectadores, miniatura, url, desde, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(plataforma, canal) DO UPDATE SET nombre=excluded.nombre, en_vivo=excluded.en_vivo, titulo=excluded.titulo, juego=excluded.juego,
         espectadores=excluded.espectadores, miniatura=excluded.miniatura, url=excluded.url, desde=excluded.desde, actualizado=excluded.actualizado`
    ).bind(d.plataforma, d.canal, d.nombre, d.en_vivo ? 1 : 0, d.titulo, d.juego, d.espectadores, d.miniatura, d.url, d.desde).run();
    if (d.en_vivo && !(prev && prev.en_vivo)) {
      const plat = d.plataforma === 'twitch' ? 'Twitch' : 'Kick';
      await notificar(env, null, 'directo', d.nombre + ' está en directo en ' + plat, d.titulo || d.juego || null, d.url);
      await discord(env, 'directos', {
        content: '🔴 **' + d.nombre + '** está en directo en ' + plat + ' — ' + d.url,
        embeds: [{ title: d.titulo || d.nombre, url: d.url, description: d.juego || '', color: d.plataforma === 'twitch' ? 0x9146ff : 0x53fc18, image: d.miniatura ? { url: d.miniatura } : undefined }],
      });
    }
  }
}

// ---------------------------------------------------------------- rutas
async function rutas(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (p === '/' || p === '/salud') {
    return json({
      ok: true, servicio: 'vants-integraciones',
      claves: {
        faceit: !!env.FACEIT_API_KEY, twitch: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
        kick: !!(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET), discord: !!env.DISCORD_BOT_TOKEN, db: !!env.DB,
        epic: !!(env.EPIC_CLIENT_ID && env.EPIC_CLIENT_SECRET), fortnite: !!env.FORTNITE_API_KEY,
        webhooks_discord: ['REGISTROS', 'COMUNIDAD', 'B2B', 'TICKETS'].filter((k) => env['DISCORD_WEBHOOK_' + k]).length,
      },
    });
  }

  // 1) CANAL PC EXCLUSIVO (VANTSGAMES/banter -> Windows .exe). Jamás mezcla binarios móviles.
  if (p === '/descargas/vants-pc/latest' && (m === 'GET' || m === 'HEAD')) {
    const rel = await fetch('https://api.github.com/repos/VANTSGAMES/banter/releases/latest', {
      headers: { 'User-Agent': 'VANTS-Store-Proxy/1.0', Accept: 'application/vnd.github+json' },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const exeAsset = rel && Array.isArray(rel.assets)
      ? rel.assets.find((a) => /^VANTS-Setup-\d+\.\d+\.\d+\.exe$/i.test(a.name || ''))
      : null;
    const target = (exeAsset && exeAsset.browser_download_url) || 'https://github.com/VANTSGAMES/banter/releases/latest';
    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        'cache-control': 'public, max-age=300',
        'x-vants-channel': 'pc',
        'x-vants-repo': 'VANTSGAMES/banter',
      },
    });
  }

  // Descarga directa sin redirección 302 del instalador VANTS PC (requerido por Microsoft Store Win32).
  const dlMatch = p.match(/^\/descargas\/vants-pc\/(\d+\.\d+\.\d+)\/(VANTS-(?:Setup|Install)(?:-\d+\.\d+\.\d+)?\.exe)$/);
  if (dlMatch && (m === 'GET' || m === 'HEAD')) {
    const [, ver, file] = dlMatch;
    if (file !== `VANTS-Setup-${ver}.exe` && file !== `VANTS-Install-${ver}.exe` && file !== 'VANTS-Install.exe') {
      return new Response('not found', { status: 404 });
    }
    const ghUrl = `https://github.com/VANTSGAMES/banter/releases/download/v${ver}/${file}`;
    const upHeaders = { 'User-Agent': 'VANTS-Store-Proxy/1.0' };
    const range = req.headers.get('range');
    if (range) upHeaders['Range'] = range;
    const up = await fetch(ghUrl, { method: m, headers: upHeaders, redirect: 'follow' });
    if (!up.ok && up.status !== 206) return new Response('not found', { status: up.status === 404 ? 404 : 502 });
    const out = new Headers({
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${file}"`,
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
      'x-vants-channel': 'pc',
      'x-vants-repo': 'VANTSGAMES/banter',
    });
    for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const v = up.headers.get(k);
      if (v) out.set(k, v);
    }
    return new Response(m === 'HEAD' ? null : up.body, { status: up.status, headers: out });
  }

  // 2) CANAL MÓVIL EXCLUSIVO (VANTSGAMES/vantsgames-web -> Android .apk). Jamás lee releases de PC (banter).
  const dlMovilVer = p.match(/^\/descargas\/vants-movil\/(\d+\.\d+\.\d+)\/(VANTSMovil(?:-\d+\.\d+\.\d+)?\.apk)$/);
  if (
    (p === '/VANTSMovil.apk' ||
      p === '/descargas/vants-movil/VANTSMovil.apk' ||
      p === '/descargas/vants-movil/latest' ||
      dlMovilVer) &&
    (m === 'GET' || m === 'HEAD')
  ) {
    const upHeaders = { 'User-Agent': 'VANTS-Mobile-Proxy/1.0' };
    const range = req.headers.get('range');
    if (range) upHeaders['Range'] = range;

    let fileName = 'VANTSMovil.apk';
    const candidateUrls = [];
    if (dlMovilVer) {
      const [, verM, fileM] = dlMovilVer;
      fileName = fileM;
      candidateUrls.push(`https://github.com/VANTSGAMES/vantsgames-web/releases/download/movil-v${verM}/${fileM}`);
      candidateUrls.push(`https://github.com/VANTSGAMES/vantsgames-web/releases/download/v${verM}/${fileM}`);
    } else {
      candidateUrls.push('https://github.com/VANTSGAMES/vantsgames-web/releases/latest/download/VANTSMovil.apk');
    }

    let up = null;
    for (const candidate of candidateUrls) {
      const res = await fetch(candidate, { method: m, headers: upHeaders, redirect: 'follow' });
      if (res.ok || res.status === 206) {
        up = res;
        break;
      }
    }

    if (!up && !dlMovilVer) {
      const rels = await fetch('https://api.github.com/repos/VANTSGAMES/vantsgames-web/releases?per_page=8', {
        headers: { 'User-Agent': 'VANTS-Mobile-Proxy/1.0', Accept: 'application/vnd.github+json' },
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      for (const rel of Array.isArray(rels) ? rels : []) {
        if (rel.draft) continue;
        const apkAsset = (rel.assets || []).find((a) => /^VANTSMovil(?:-[\w.-]+)?\.apk$/i.test(a.name || ''));
        if (apkAsset && apkAsset.browser_download_url) {
          const res = await fetch(apkAsset.browser_download_url, { method: m, headers: upHeaders, redirect: 'follow' });
          if (res.ok || res.status === 206) {
            up = res;
            break;
          }
        }
      }
    }

    if (!up) return new Response('not found', { status: 404 });
    const out = new Headers({
      'content-type': 'application/vnd.android.package-archive',
      'content-disposition': `attachment; filename="${fileName}"`,
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
      'x-vants-channel': 'movil',
      'x-vants-repo': 'VANTSGAMES/vantsgames-web',
    });
    for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const v = up.headers.get(k);
      if (v) out.set(k, v);
    }
    return new Response(m === 'HEAD' ? null : up.body, { status: up.status, headers: out });
  }

  if (p === '/directos' && m === 'GET') {
    const rs = await env.DB.prepare('SELECT plataforma, canal, nombre, en_vivo, titulo, juego, espectadores, miniatura, url, desde, actualizado FROM integ_directos ORDER BY en_vivo DESC, espectadores DESC').all();
    return json({ ok: true, directos: (rs.results || []).map((r) => ({ ...r, en_vivo: !!r.en_vivo })) }, 200, { 'Cache-Control': 'public, max-age=30' });
  }

  // Equipos de FACEIT de los jugadores VANTS (Circuito → Equipos): los que
  // vincularon a mano en su perfil + los equipos de FACEIT de cada cuenta vinculada.
  if (p === '/equipos-faceit' && m === 'GET') {
    const lista = await cacheado('eqfc', 300_000, async () => {
      const ids = new Map();
      const man = await env.DB.prepare('SELECT auth0_sub, team_id FROM integ_faceit_equipo').all().catch(() => ({ results: [] }));
      for (const r of man.results || []) if (r.team_id && !ids.has(r.team_id)) ids.set(r.team_id, r.auth0_sub);
      const lk = await env.DB.prepare("SELECT auth0_sub, platform_user_id FROM vants_links WHERE platform='faceit' AND platform_user_id IS NOT NULL").all().catch(() => ({ results: [] }));
      const vistos = new Set();
      for (const l of (lk.results || []).slice(0, 40)) {
        if (vistos.has(l.platform_user_id)) continue;
        vistos.add(l.platform_user_id);
        const t = await cacheado('fpt:' + l.platform_user_id, 600_000, () => fx(env, '/players/' + l.platform_user_id + '/teams?limit=5').catch(() => null));
        for (const it of (t && t.items) || []) if (it.team_id && !ids.has(it.team_id)) ids.set(it.team_id, l.auth0_sub);
      }
      const equipos = [];
      for (const id of [...ids.keys()].slice(0, 24)) {
        const eq = await equipoFaceit(env, id, { cacheado, fx }, []).catch(() => null);
        if (eq) { const { partidas, ...resto } = eq; equipos.push(resto); }
      }
      return equipos;
    });
    return json({ ok: true, equipos: lista }, 200, { 'Cache-Control': 'public, max-age=120' });
  }

  // Perfil FACEIT público por id (para fichas de otros jugadores)
  if (p === '/faceit/jugador' && m === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ ok: false, error: 'id_invalido' }, 400);
    const f = await perfilFaceit(env, id);
    if (!f) return json({ ok: false, error: 'no_encontrado' }, 404);
    return json({ ok: true, ...f, actual: await partidaActual(env, id) });
  }

  // Escritura comunitaria: exige cuenta con correo verificado (Términos §2:
  // sin verificación no hay rol ni permisos de interacción comunitaria).
  const ESCRITURA_COMUNIDAD = ['/torneos/crear', '/clips', '/clips/subir', '/clips/borrar', '/clips/editar', '/sugerencia', '/soporte/ticket'];
  if (m === 'POST' && ESCRITURA_COMUNIDAD.includes(p)) {
    const c = await usuarioClaims(req, env).catch(() => null);
    if (c && c.email_verified === false) {
      return json({ ok: false, error: 'cuenta_no_verificada', detalle: 'Verifica tu correo electrónico para participar en la comunidad.' }, 403);
    }
  }

  // VANTS Identity: Google OIDC, Email OTP, JWKS y rotación de sesiones (/auth/*).
  const ra = await rutasAuth(req, env, url, p, m, { json, usuario, usuarioClaims });
  if (ra) return ra;

  // Protocolo de comunicaciones (webhooks Discord + alianzas B2B + soporte).
  const rm = await rutasComms(req, env, url, p, m, { json, usuario, usuarioClaims, notificar });
  if (rm) return rm;

  // Epic Games / Fortnite (vinculación OAuth y estadísticas)
  const re = await rutasEpic(req, env, url, p, m, { json, cacheado, usuario });
  if (re) return re;

  // Optimización SEO de clips / Shorts vía vidIQ MCP
  const rseo = await rutasVidiqSeo(req, env, url, p, m, { json, usuarioClaims });
  if (rseo) return rseo;

  // Clips, foto de equipo y membresía
  const rx = await rutasExtras(req, env, url, p, m, { json, cacheado, usuario });
  if (rx) return rx;

  // 1000 logros FACEIT/VALORANT, Riot ID, Mi progreso y equipo de FACEIT
  const rj = await rutasJuegos(req, env, url, p, m, { json, cacheado, usuario, fx, perfilFaceit });
  if (rj) return rj;

  // Ranking, equipos, eventos, logros, inscripciones y publicación (owner)
  // Fase 5: Eventos y Showmatches con RSVP, lista de espera y check-in
  const rev = await rutasEventosRsvp(req, env, url, p, m, { json, usuarioClaims });
  if (rev) return rev;
  for (const fn of [rutasComunidadLfg, rutasComunidadForo, rutasComunidadMisiones, rutasComunidadVotaciones, rutasGooglePro, rutasSkilling]) {
    const r = await fn(req, env, url, p, m, { json, usuarioClaims });
    if (r) return r;
  }

  const rc = await rutasComunidad(req, env, url, p, m, { json, cacheado, usuario, usuarioClaims, perfilFaceit, notificar, discord });
  if (rc) return rc;

  // ---- privadas (Auth0)
  const sub = await usuario(req, env);

  if (p === '/yo' && m === 'GET') {
    const links = await env.DB.prepare('SELECT platform, handle, platform_user_id FROM vants_links WHERE auth0_sub = ?').bind(sub).all();
    const lk = Object.fromEntries((links.results || []).map((l) => [l.platform, l]));
    const can = (await env.DB.prepare('SELECT twitch, kick FROM integ_canales WHERE auth0_sub = ?').bind(sub).first()) || {};
    const twitch = (can.twitch || (lk.twitch && lk.twitch.handle) || '').toLowerCase();
    const kick = (can.kick || '').toLowerCase();
    let faceit = null, actual = null, errorFaceit = null;
    if (lk.faceit && lk.faceit.platform_user_id) {
      try {
        faceit = await perfilFaceit(env, lk.faceit.platform_user_id);
        if (faceit) await guardarRanking(env, sub, faceit).catch(() => null);
        // Equipo de FACEIT vinculado por enlace (tiene prioridad sobre el detectado)
        const fe = await env.DB.prepare('SELECT team_id FROM integ_faceit_equipo WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
        if (faceit && fe && fe.team_id) {
          const eq = await equipoFaceit(env, fe.team_id, { cacheado, fx }, faceit.partidas).catch(() => null);
          if (eq) faceit = { ...faceit, equipo: eq };
        }
        actual = await partidaActual(env, lk.faceit.platform_user_id);
      } catch (e) { errorFaceit = String(e.message || e); }
    }
    const directos = [
      ...(twitch ? await cacheado('tw:' + twitch, 60_000, () => directosTwitch(env, [twitch])).catch(() => []) : []),
      ...(kick ? await cacheado('kk:' + kick, 60_000, () => directosKick(env, [kick])).catch(() => []) : []),
    ];
    return json({ ok: true, faceit, actual, error_faceit: errorFaceit, faceit_vinculado: !!lk.faceit, canales: { twitch: twitch || null, kick: kick || null }, directos });
  }

  if (p === '/canales' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const limpio = (v) => { const s = String(v || '').trim().replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com)\//i, '').replace(/\/.*$/, '').toLowerCase(); return s && /^[a-z0-9_]{2,25}$/.test(s) ? s : null; };
    const tw = limpio(b.twitch), kk = limpio(b.kick);
    if ((b.twitch && !tw) || (b.kick && !kk)) return json({ ok: false, error: 'canal_invalido' }, 400);
    await env.DB.prepare("INSERT INTO integ_canales (auth0_sub, twitch, kick, actualizado) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(auth0_sub) DO UPDATE SET twitch=excluded.twitch, kick=excluded.kick, actualizado=excluded.actualizado").bind(sub, tw, kk).run();
    return json({ ok: true, twitch: tw, kick: kk });
  }

  if (p === '/notificaciones' && m === 'GET') {
    const l = await env.DB.prepare('SELECT leido_hasta FROM integ_notif_lectura WHERE auth0_sub = ?').bind(sub).first();
    const leido = (l && l.leido_hasta) || '1970-01-01 00:00:00';
    const rs = await env.DB.prepare('SELECT id, tipo, titulo, cuerpo, url, creada FROM integ_notificaciones WHERE auth0_sub = ? OR auth0_sub IS NULL ORDER BY id DESC LIMIT 30').bind(sub).all();
    const items = (rs.results || []).map((r) => ({ ...r, leida: r.creada <= leido }));
    return json({ ok: true, sin_leer: items.filter((i) => !i.leida).length, notificaciones: items });
  }
  if (p === '/notificaciones/leer' && m === 'POST') {
    await env.DB.prepare("INSERT INTO integ_notif_lectura (auth0_sub, leido_hasta) VALUES (?, datetime('now')) ON CONFLICT(auth0_sub) DO UPDATE SET leido_hasta = excluded.leido_hasta").bind(sub).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'no_encontrado' }, 404);
}

async function notificarPagerDuty(env, summary, dedupKey = 'vants-integraciones-error', details = {}) {
  const key = String((env && env.PAGERDUTY_ROUTING_KEY) || '').trim();
  const ddKey = String((env && env.DD_API_KEY) || '').trim();
  const tasks = [];
  if (key) {
    tasks.push(
      fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: key,
          event_action: 'trigger',
          dedup_key: dedupKey,
          payload: {
            summary: String(summary).slice(0, 1024),
            source: 'int.vants.cc (vants-integraciones Cloudflare Worker)',
            severity: 'error',
            custom_details: details,
          },
        }),
      }).catch(() => {}),
    );
  }
  if (ddKey) {
    const site = String((env && env.DD_SITE) || 'datadoghq.com').trim();
    tasks.push(
      fetch(`https://http-intake.logs.${site}/api/v2/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': ddKey,
        },
        body: JSON.stringify([
          {
            ddsource: 'cloudflare-worker',
            ddtags: 'env:production,service:vants-integraciones,domain:int.vants.cc',
            hostname: 'int.vants.cc',
            service: 'vants-integraciones',
            status: 'error',
            message: String(summary).slice(0, 1024),
            dedup_key: dedupKey,
            details,
          },
        ]),
      }).catch(() => {}),
    );
  }
  if (tasks.length) await Promise.all(tasks);
}

export default {
  async fetch(req, env, ctx) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    let res;
    try {
      res = await rutas(req, env, url);
    } catch (e) {
      const msg = String((e && e.message) || e);
      const auth = /^(sin_sesion|jwt_)/.test(msg);
      if (!auth) {
        console.error(JSON.stringify({ tipo: 'integ_error', ruta: url.pathname, error: msg }));
        const p = notificarPagerDuty(env, `[vants-integraciones] Error en ${url.pathname}: ${msg}`, 'vants-int-' + url.pathname, {
          ruta: url.pathname,
          metodo: req.method,
          error: msg,
        });
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
      }
      res = json({ ok: false, error: msg }, auth ? 401 : 502);
    }
    // Response.redirect() trae cabeceras inmutables: se copia antes de añadir CORS.
    res = new Response(res.body, res);
    const keepWildcard = res.headers.get('access-control-allow-origin') === '*';
    for (const [k, v] of Object.entries(h)) {
      if (keepWildcard && (k === 'Access-Control-Allow-Origin' || k === 'Access-Control-Allow-Credentials')) continue;
      res.headers.set(k, v);
    }
    return res;
  },
  async scheduled(_ev, env, ctx) {
    ctx.waitUntil((async () => {
      try { await procesarFaceit(env); } catch (e) { console.error('cron_faceit', String(e)); await notificarPagerDuty(env, `[vants-integraciones] Fallo cron_faceit: ${String(e)}`, 'vants-int-cron-faceit'); }
      try { await revisarDirectos(env); } catch (e) { console.error('cron_directos', String(e)); await notificarPagerDuty(env, `[vants-integraciones] Fallo cron_directos: ${String(e)}`, 'vants-int-cron-directos'); }
      try { await refrescarRanking(env, perfilFaceit, 15); } catch (e) { console.error('cron_ranking', String(e)); await notificarPagerDuty(env, `[vants-integraciones] Fallo cron_ranking: ${String(e)}`, 'vants-int-cron-ranking'); }
    })());
  },
};
