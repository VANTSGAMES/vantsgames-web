// VANTS · Epic Games / Fortnite
// -----------------------------------------------------------------------------
// Vinculación oficial con Epic Account Services (OAuth 2.0, scope basic_profile)
// y estadísticas de Fortnite (Battle Royale) vía fortnite-api.com.
//
//   POST /epic/inicio        (Auth0) → { url } de autorización de Epic
//   GET  /epic/callback      (Epic redirige aquí) → guarda accountId y vuelve a /perfil/cuentas
//   GET  /epic/yo            (Auth0) → cuenta vinculada + estadísticas
//   POST /epic/desvincular   (Auth0)
//   GET  /epic/jugador?sub=  (pública) → cuenta + estadísticas para el perfil público
//
// Variables: EPIC_CLIENT_ID. Secretos: EPIC_CLIENT_SECRET, FORTNITE_API_KEY (opcional).
// URL de retorno que hay que registrar en el Epic Developer Portal:
//   https://vants-integraciones.vants.workers.dev/epic/callback

const AUTORIZAR = 'https://www.epicgames.com/id/authorize';
const TOKEN = 'https://api.epicgames.dev/epic/oauth/v2/token';
const CUENTAS = 'https://api.epicgames.dev/epic/id/v2/accounts';
const STATS = 'https://fortnite-api.com/v2/stats/br/v2/';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desB64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); };

async function firma(env, datos) {
  const k = await crypto.subtle.importKey('raw', enc.encode('epic-state:' + env.EPIC_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(datos)));
}
async function crearState(env, sub) {
  const datos = b64u(enc.encode(JSON.stringify({ s: sub, e: Date.now() + 10 * 60_000, n: crypto.randomUUID() })));
  return datos + '.' + (await firma(env, datos));
}
async function leerState(env, st) {
  const [datos, f] = String(st || '').split('.');
  if (!datos || !f || f !== (await firma(env, datos))) return null;
  const o = JSON.parse(desB64u(datos));
  return o.e > Date.now() ? o.s : null;
}

// Redirect URI fijo (debe coincidir EXACTAMENTE con el registrado en el Epic
// Developer Portal). Se puede sobreescribir con la variable EPIC_REDIRECT_URI.
const callbackUrl = (env, url) => env.EPIC_REDIRECT_URI || (url.origin + '/epic/callback');
const volver = (env, q) => Response.redirect((env.SITE_URL || 'https://vants.vants.workers.dev') + '/perfil/cuentas?' + q, 302);

function resumen(d) {
  const s = d && d.stats && d.stats.all && d.stats.all.overall;
  const bp = d && d.battlePass;
  if (!s) return null;
  return {
    victorias: s.wins ?? null, partidas: s.matches ?? null, kills: s.kills ?? null,
    kd: s.kd ?? null, winrate: s.winRate ?? null, top10: s.top10 ?? null,
    nivel_pase: bp ? bp.level : null, minutos: s.minutesPlayed ?? null,
  };
}

const cacheLocal = new Map();
async function cacheLocalFn(clave, ms, fn) {
  const c = cacheLocal.get(clave);
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  if (cacheLocal.size > 300) cacheLocal.clear();
  cacheLocal.set(clave, { at: Date.now(), v });
  return v;
}

async function estadisticas(env, accountId, cacheado = cacheLocalFn) {
  if (!env.FORTNITE_API_KEY) return { stats: null, error_stats: 'sin_clave' };
  return cacheado('fn:' + accountId, 10 * 60_000, async () => {
    const r = await fetch(STATS + encodeURIComponent(accountId), { headers: { Authorization: env.FORTNITE_API_KEY }, signal: AbortSignal.timeout(9000) });
    if (r.status === 403) return { stats: null, error_stats: 'privadas' };
    if (r.status === 404) return { stats: null, error_stats: 'sin_partidas' };
    if (!r.ok) return { stats: null, error_stats: 'fortnite_' + r.status };
    const j = await r.json();
    return { stats: resumen(j.data), error_stats: null };
  });
}

async function cuenta(env, sub, cacheado) {
  const c = await env.DB.prepare('SELECT account_id, display_name, desde FROM integ_epic WHERE auth0_sub = ?').bind(sub).first();
  if (!c) return { vinculada: false };
  return { vinculada: true, account_id: c.account_id, nombre: c.display_name, desde: c.desde, ...(await estadisticas(env, c.account_id, cacheado)) };
}

// Para la ficha pública /u/<pid>: la primera cuenta de Epic de cualquiera de sus subs.
export async function fortnitePublico(env, subs) {
  if (!subs || !subs.length) return null;
  const c = await env.DB.prepare(`SELECT account_id, display_name FROM integ_epic WHERE auth0_sub IN (${subs.map(() => '?').join(',')}) ORDER BY actualizado DESC LIMIT 1`).bind(...subs).first().catch(() => null);
  if (!c) return null;
  const st = await estadisticas(env, c.account_id).catch(() => ({ stats: null, error_stats: 'error' }));
  return { nombre: c.display_name, ...st };
}

export async function rutasEpic(req, env, url, p, m, { json, cacheado, usuario }) {
  if (!p.startsWith('/epic/')) return null;

  if (p === '/epic/callback' && m === 'GET') {
    if (url.searchParams.get('error')) return volver(env, 'linkerr=epic_cancelado');
    const sub = await leerState(env, url.searchParams.get('state')).catch(() => null);
    if (!sub) return volver(env, 'linkerr=epic_state');
    const code = url.searchParams.get('code');
    if (!code) return volver(env, 'linkerr=epic_sin_codigo');
    const redirect = callbackUrl(env, url);
    const r = await fetch(TOKEN, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(env.EPIC_CLIENT_ID + ':' + env.EPIC_CLIENT_SECRET), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    });
    const t = await r.json().catch(() => ({}));
    if (!r.ok || !t.account_id) {
      // El motivo real del fallo viaja en el código: intercambio_epic_<status>_<errorCode>
      const motivo = String(t.errorCode || t.error || 'desconocido').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
      console.error(JSON.stringify({ tipo: 'epic_token', status: r.status, error: t.errorCode || t.error, desc: t.errorDescription || t.errorMessage || null, redirect }));
      return volver(env, 'linkerr=intercambio_epic_' + r.status + '_' + motivo);
    }
    let nombre = null;
    try {
      const a = await fetch(CUENTAS + '?accountId=' + encodeURIComponent(t.account_id), { headers: { Authorization: 'Bearer ' + t.access_token } });
      const lista = await a.json();
      nombre = (Array.isArray(lista) && lista[0] && lista[0].displayName) || null;
    } catch { /* el nombre es opcional */ }
    const otro = await env.DB.prepare('SELECT auth0_sub FROM integ_epic WHERE account_id = ?').bind(t.account_id).first();
    if (otro && otro.auth0_sub !== sub) return volver(env, 'linkerr=epic_ya_vinculada');
    await env.DB.prepare("INSERT INTO integ_epic (auth0_sub, account_id, display_name) VALUES (?, ?, ?) ON CONFLICT(auth0_sub) DO UPDATE SET account_id=excluded.account_id, display_name=excluded.display_name, actualizado=datetime('now')")
      .bind(sub, t.account_id, nombre).run();
    // No guardamos el token: solo hace falta el accountId. Se revoca en Epic.
    fetch('https://api.epicgames.dev/epic/oauth/v2/revoke', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(env.EPIC_CLIENT_ID + ':' + env.EPIC_CLIENT_SECRET), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.access_token }),
    }).catch(() => {});
    return volver(env, 'linked=epic');
  }

  if (p === '/epic/jugador' && m === 'GET') {
    const sub = url.searchParams.get('sub') || '';
    if (!sub || sub.length > 128) return json({ ok: false, error: 'sub_invalido' }, 400);
    return json({ ok: true, ...(await cuenta(env, sub, cacheado)) }, 200, { 'Cache-Control': 'public, max-age=120' });
  }

  const sub = await usuario(req, env);

  if (p === '/epic/inicio' && m === 'POST') {
    if (!env.EPIC_CLIENT_ID || !env.EPIC_CLIENT_SECRET) return json({ ok: false, error: 'epic_sin_configurar' }, 503);
    const q = new URLSearchParams({ client_id: env.EPIC_CLIENT_ID, redirect_uri: callbackUrl(env, url), response_type: 'code', scope: 'basic_profile', state: await crearState(env, sub) });
    return json({ ok: true, url: AUTORIZAR + '?' + q });
  }
  if (p === '/epic/yo' && m === 'GET') return json({ ok: true, ...(await cuenta(env, sub, cacheado)) });
  if (p === '/epic/diagnostico' && m === 'GET') {
    // Diagnóstico OAuth: la URL que hay que registrar EXACTA en el Epic Dev Portal
    // y el estado de las credenciales, para eliminar los 400 de un vistazo.
    const redirect = callbackUrl(env, url);
    return json({
      ok: true,
      redirect_uri: redirect,
      registrar_en_portal: redirect,
      client_id: env.EPIC_CLIENT_ID ? String(env.EPIC_CLIENT_ID).slice(0, 8) + '…' : null,
      client_secret: env.EPIC_CLIENT_SECRET ? 'presente' : 'FALTA',
      instrucciones: 'En dev.epicgames.com → Epic Account Services → tu cliente → Redirect URLs, añade EXACTAMENTE: ' + redirect + ' . Si el error es invalid_client, regenera el Client Secret y actualiza el secret EPIC_CLIENT_SECRET.',
    });
  }
  if (p === '/epic/desvincular' && m === 'POST') {
    await env.DB.prepare('DELETE FROM integ_epic WHERE auth0_sub = ?').bind(sub).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'no_encontrado' }, 404);
}
