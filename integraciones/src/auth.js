// VANTS · Integraciones · auth (VANTS Identity: Google OIDC + Email OTP + JWKS RS256)
// -----------------------------------------------------------------------------
// Emisor de sesiones propio en Cloudflare Workers + D1 diseñado para convivir
// con Auth0 (verificación dual) y migrar sin cortes ni pérdida de datos en D1.
//
// Secretos (wrangler secret put):
//   VANTS_AUTH_PRIVATE_JWK      clave privada RSA-2048 en formato JWK (con kid)
//   GOOGLE_OAUTH_CLIENT_SECRET  secreto del cliente OAuth en semiotic-ion-508913-r1
//   RESEND_API_KEY              (opcional, ya usado por email.js para OTP por correo)
//
// Variables (wrangler.toml):
//   VANTS_AUTH_ISSUER           "https://vants.cc"
//   GOOGLE_OAUTH_CLIENT_ID      "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com"
//   GOOGLE_OAUTH_REDIRECT_URI   "https://vants.cc/auth/google/callback"

import { asegurarEmail, enviarEmail, guardarEmailSub, plantillaEmail } from './email.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const ACCESS_TTL_SEC = 3600;             // 1 hora
const REFRESH_TTL_SEC = 30 * 24 * 3600;  // 30 días
const OIDC_STATE_TTL_SEC = 600;          // 10 min
const OTP_TTL_SEC = 600;                 // 10 min
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MAX = 3;

const COOKIE_RT = 'vants_rt';
const COOKIE_OIDC = 'vants_oidc';

const enc = new TextEncoder();
const dec = new TextDecoder();

const jwksRemoteCache = new Map(); // url -> { at, keys }
const googleAccessTokenCache = new Map(); // token -> { at, claims }
let tablasListas = false;

// ---------------------------------------------------------------- codificación
function bytesToB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64uToBytes(s) {
  let b = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

function jsonToB64u(obj) {
  return bytesToB64u(enc.encode(JSON.stringify(obj)));
}

function b64uToJson(s) {
  return JSON.parse(dec.decode(b64uToBytes(s)));
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function randomB64u(len = 32) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return bytesToB64u(b);
}

async function sha256Bytes(str) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

async function sha256Hex(str) {
  return bytesToHex(await sha256Bytes(str));
}

function timingSafeEqualStr(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

function normIssuer(iss) {
  return String(iss || '').trim().replace(/\/+$/, '');
}

export function safeReturnTo(raw) {
  const s = String(raw || '').trim();
  if (!s || !s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\r\n]/.test(s)) {
    return '/perfil';
  }
  return s.slice(0, 200);
}

// ---------------------------------------------------------------- cookies
function parseCookies(req) {
  const raw = req.headers.get('cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function formatCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function cookieOpts(env, maxAge) {
  const sameSite = env.VANTS_AUTH_COOKIE_SAMESITE || 'Lax';
  const path = env.VANTS_AUTH_COOKIE_PATH || '/';
  const secure = env.VANTS_AUTH_INSECURE_COOKIE === '1' ? false : true;
  return { path, maxAge, httpOnly: true, secure, sameSite };
}

// ---------------------------------------------------------------- D1 bootstrap
export async function asegurarAuth(db) {
  if (tablasListas) return;
  await asegurarEmail(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_auth_identities (
      provider TEXT NOT NULL,
      provider_sub TEXT NOT NULL,
      canonical_sub TEXT NOT NULL,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      creado TEXT NOT NULL DEFAULT (datetime('now')),
      ultimo_acceso TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, provider_sub)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_id_canonical ON integ_auth_identities(canonical_sub)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_auth_sessions (
      id TEXT PRIMARY KEY,
      canonical_sub TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_sess_sub ON integ_auth_sessions(canonical_sub)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_auth_otp (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_otp_email ON integ_auth_otp(email, creado DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_play_games_xp (
      canonical_sub TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      gamer_tag TEXT,
      title TEXT,
      current_level INTEGER,
      next_level INTEGER,
      current_xp_total INTEGER,
      level_min_xp INTEGER,
      level_max_xp INTEGER,
      avatar_url TEXT,
      actualizado TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);
  tablasListas = true;
}

export function resetAuthCachesForTests() {
  tablasListas = false;
  jwksRemoteCache.clear();
  googleAccessTokenCache.clear();
}

export function openidDiscoveryFromEnv(env) {
  const issuer = normIssuer((env && (env.VANTS_AUTH_ISSUER || env.SITE_URL)) || 'https://vants.cc');
  return {
    issuer,
    authorization_endpoint: `${issuer}/auth/google/start`,
    token_endpoint: `${issuer}/auth/refresh`,
    userinfo_endpoint: `${issuer}/auth/userinfo`,
    jwks_uri: `${issuer}/auth/.well-known/jwks.json`,
    end_session_endpoint: `${issuer}/auth/logout`,
    response_types_supported: ['code', 'id_token', 'token id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce',
      'email', 'email_verified', 'name', 'picture', 'amr',
    ],
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  };
}

// ---------------------------------------------------------------- Claves RS256 & JWKS
function parsePrivateJwk(env) {
  const raw = env && env.VANTS_AUTH_PRIVATE_JWK;
  if (!raw) throw new Error('vants_auth_no_configurado');
  const jwk = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e || !jwk.d) {
    throw new Error('vants_auth_jwk_invalida');
  }
  return jwk;
}

export function publicJwksFromEnv(env) {
  if (!env || !env.VANTS_AUTH_PRIVATE_JWK) return { keys: [] };
  const jwk = parsePrivateJwk(env);
  return {
    keys: [
      {
        kty: 'RSA',
        alg: 'RS256',
        use: 'sig',
        kid: jwk.kid || 'vants-rs256-1',
        n: jwk.n,
        e: jwk.e,
      },
    ],
  };
}

export async function signVantsJwt(claims, env, ttlSec = ACCESS_TTL_SEC) {
  const jwk = parsePrivateJwk(env);
  const kid = jwk.kid || 'vants-rs256-1';
  const now = Math.floor(Date.now() / 1000);
  const issuer = normIssuer(env.VANTS_AUTH_ISSUER || env.SITE_URL || 'https://vants.cc');
  const audience = env.VANTS_AUTH_AUDIENCE || env.AUTH0_AUDIENCE || 'https://api.vants.app';

  const header = { alg: 'RS256', typ: 'JWT', kid };
  const payload = {
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + ttlSec,
    ...claims,
  };

  const signingInput = `${jsonToB64u(header)}.${jsonToB64u(payload)}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  return `${signingInput}.${bytesToB64u(new Uint8Array(sig))}`;
}

async function fetchJwks(url, fetchImpl = fetch) {
  const cached = jwksRemoteCache.get(url);
  if (cached && Date.now() - cached.at < 3600_000) return cached.keys;
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error('jwks_fetch_' + r.status);
  const j = await r.json();
  const keys = Array.isArray(j.keys) ? j.keys : [];
  jwksRemoteCache.set(url, { at: Date.now(), keys });
  return keys;
}

async function verifyRs256WithKeys(partes, cab, keys) {
  if (cab.alg !== 'RS256') throw new Error('jwt_alg');
  const llave = keys.find((k) => (k.kid ? cab.kid && k.kid === cab.kid : true));
  if (!llave) throw new Error('jwt_kid');
  const pub = await crypto.subtle.importKey(
    'jwk',
    llave,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    pub,
    b64uToBytes(partes[2]),
    enc.encode(partes[0] + '.' + partes[1]),
  );
  if (!ok) throw new Error('jwt_firma');
}

/**
 * Verificación universal de sesión:
 *  1) JWT RS256 propio de VANTS Identity (iss = VANTS_AUTH_ISSUER)
 *  2) ID Token RS256 de Google OpenID Connect (iss = https://accounts.google.com)
 *  3) JWT RS256 de Auth0 (iss = https://<AUTH0_DOMAIN>/)
 *  4) Access Token OAuth 2.0 de Google Identity Services / Google Workspace (ya29.*)
 */
export async function verificarJwtDual(token, env, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const rawToken = String(token || '').trim();
  if (!rawToken) throw new Error('jwt_malo');
  const partes = rawToken.split('.');

  // Token opaco OAuth 2.0 de Google Identity Services (p. ej. ya29.*)
  if (partes.length !== 3) {
    if (!rawToken.startsWith('ya29.') && rawToken.length < 20) {
      throw new Error('jwt_malo');
    }
    const cached = googleAccessTokenCache.get(rawToken);
    if (cached && Date.now() - cached.at < 60_000) {
      return cached.claims;
    }
    // Validar aud/azp contra GOOGLE_OAUTH_CLIENT_ID para evitar tokens de otras apps.
    if (env && env.GOOGLE_OAUTH_CLIENT_ID) {
      const ti = await fetchImpl('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(rawToken), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!ti.ok) throw new Error('jwt_malo');
      const tiJson = await ti.json().catch(() => null);
      const tokenAud = tiJson && (tiJson.aud || tiJson.azp);
      if (!tokenAud || tokenAud !== env.GOOGLE_OAUTH_CLIENT_ID) throw new Error('jwt_aud');
    }
    const r = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${rawToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('jwt_malo');
    const info = await r.json().catch(() => null);
    if (!info || !info.sub) throw new Error('jwt_sub');
    if (info.email && info.email_verified === false) throw new Error('google_email_no_verificado');
    const rawSub = String(info.sub);
    const claims = {
      sub: rawSub.startsWith('google-oauth2|') ? rawSub : `google-oauth2|${rawSub}`,
      email: typeof info.email === 'string' && info.email ? info.email.toLowerCase() : null,
      email_verified: info.email_verified !== false,
      name: typeof info.name === 'string' && info.name ? info.name : null,
      picture: typeof info.picture === 'string' && info.picture ? info.picture : null,
      provider: 'google',
    };
    if (googleAccessTokenCache.size > 500) googleAccessTokenCache.clear();
    googleAccessTokenCache.set(rawToken, { at: Date.now(), claims });
    return claims;
  }

  let cab, cuerpo;
  try {
    cab = b64uToJson(partes[0]);
    cuerpo = b64uToJson(partes[1]);
  } catch {
    throw new Error('jwt_malo');
  }

  const iss = normIssuer(cuerpo.iss);
  const vantsIss = normIssuer(env.VANTS_AUTH_ISSUER || env.SITE_URL || 'https://vants.cc');
  const auth0Domain = String(env.AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const auth0Iss = auth0Domain ? normIssuer('https://' + auth0Domain) : '';

  let provider = null;
  let keys = [];

  if (iss && iss === vantsIss) {
    provider = 'vants';
    if (env.VANTS_AUTH_PRIVATE_JWK) {
      keys = publicJwksFromEnv(env).keys;
    } else if (env.VANTS_AUTH_JWKS_URL) {
      keys = await fetchJwks(env.VANTS_AUTH_JWKS_URL, fetchImpl);
    } else {
      throw new Error('jwt_kid');
    }
  } else if (iss === 'https://accounts.google.com' || iss === 'accounts.google.com') {
    provider = 'google';
    keys = await fetchJwks(GOOGLE_JWKS_URL, fetchImpl);
  } else if (auth0Iss && iss === auth0Iss) {
    provider = 'auth0';
    keys = await fetchJwks(`https://${auth0Domain}/.well-known/jwks.json`, fetchImpl);
  } else {
    throw new Error('jwt_iss');
  }

  await verifyRs256WithKeys(partes, cab, keys);

  if (!cuerpo.exp || cuerpo.exp * 1000 < Date.now()) throw new Error('jwt_exp');

  const expectedAud = provider === 'vants'
    ? (env.VANTS_AUTH_AUDIENCE || env.AUTH0_AUDIENCE || 'https://api.vants.app')
    : provider === 'google'
      ? env.GOOGLE_OAUTH_CLIENT_ID
      : env.AUTH0_AUDIENCE;
  if (expectedAud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    if (!auds.includes(expectedAud)) throw new Error('jwt_aud');
  }

  if (!cuerpo.sub) throw new Error('jwt_sub');
  const rawSub = String(cuerpo.sub);
  const canonicalSub = provider === 'google' && !rawSub.startsWith('google-oauth2|')
    ? `google-oauth2|${rawSub}`
    : rawSub;

  return {
    sub: canonicalSub,
    email: typeof cuerpo.email === 'string' && cuerpo.email ? cuerpo.email : null,
    email_verified: cuerpo.email_verified !== false,
    name: typeof cuerpo.name === 'string' && cuerpo.name ? cuerpo.name : null,
    picture: typeof cuerpo.picture === 'string' && cuerpo.picture ? cuerpo.picture : null,
    provider,
  };
}

export async function verificarGoogleIdToken(idToken, expectedClientId, expectedNonce, fetchImpl = fetch) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('google_id_token_malo');
  const cab = b64uToJson(partes[0]);
  const cuerpo = b64uToJson(partes[1]);
  const iss = normIssuer(cuerpo.iss);
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new Error('google_iss_invalido');
  }
  const keys = await fetchJwks(GOOGLE_JWKS_URL, fetchImpl);
  await verifyRs256WithKeys(partes, cab, keys);

  if (!cuerpo.exp || cuerpo.exp * 1000 < Date.now()) throw new Error('google_token_expirado');
  if (cuerpo.aud !== expectedClientId) throw new Error('google_aud_invalido');
  if (expectedNonce && cuerpo.nonce !== expectedNonce) throw new Error('google_nonce_invalido');
  if (!cuerpo.sub) throw new Error('google_sin_sub');
  if (cuerpo.email && cuerpo.email_verified === false) throw new Error('google_email_no_verificado');

  return {
    sub: String(cuerpo.sub),
    email: cuerpo.email ? String(cuerpo.email).toLowerCase() : null,
    name: cuerpo.name ? String(cuerpo.name) : null,
    picture: cuerpo.picture ? String(cuerpo.picture) : null,
    authTime: typeof cuerpo.auth_time === 'number' ? cuerpo.auth_time : Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------- cookie firmada OIDC state
async function hmacSecretKey(env) {
  const seed = (env.GOOGLE_OAUTH_CLIENT_SECRET || '') + '|' + (env.VANTS_AUTH_PRIVATE_JWK || '');
  if (!seed || seed === '|') throw new Error('vants_auth_no_configurado');
  const raw = await sha256Bytes('vants-oidc-state:' + seed);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function firmarEstadoOidc(data, env) {
  const body = jsonToB64u(data);
  const key = await hmacSecretKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${bytesToB64u(new Uint8Array(sig))}`;
}

export async function verificarEstadoOidc(token, env) {
  const idx = String(token || '').indexOf('.');
  if (idx <= 0) throw new Error('estado_invalido');
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const key = await hmacSecretKey(env);
  const ok = await crypto.subtle.verify('HMAC', key, b64uToBytes(sig), enc.encode(body));
  if (!ok) throw new Error('estado_firma');
  const data = b64uToJson(body);
  if (!data.exp || data.exp < Date.now()) throw new Error('estado_expirado');
  return data;
}

// ---------------------------------------------------------------- identidad canónica & sesiones
async function sincronizarPerfilInicial(db, canonicalSub, { email, name, avatarUrl }) {
  try {
    const nick = String(name || (email ? String(email).split('@')[0] : '') || '').trim().slice(0, 40);
    if (nick) {
      await db
        .prepare(
          "INSERT INTO perfiles_publicos (auth0_sub, nickname, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(auth0_sub) DO UPDATE SET nickname = COALESCE(perfiles_publicos.nickname, excluded.nickname)",
        )
        .bind(canonicalSub, nick)
        .run()
        .catch(() => null);
    }
    if (avatarUrl && /^https:\/\//.test(avatarUrl) && !/cdn\.auth0\.com|gravatar\.com/.test(avatarUrl)) {
      const pid = (await sha256Hex(canonicalSub)).slice(0, 16);
      await db
        .prepare(
          "INSERT OR IGNORE INTO integ_foto (pid, mime, datos, url, actualizado) VALUES (?, NULL, NULL, ?, datetime('now'))",
        )
        .bind(pid, avatarUrl)
        .run()
        .catch(() => null);
    }
  } catch {
    // Ignorar en entornos de test con mock parcial de D1
  }
}

export async function resolverSubCanonico(db, { provider, providerSub, email, name, avatarUrl }) {
  await asegurarAuth(db);
  const normEmail = email ? String(email).trim().toLowerCase() : null;
  const pSub = provider === 'email' ? normEmail : String(providerSub).trim();

  const existing = await db
    .prepare('SELECT canonical_sub FROM integ_auth_identities WHERE provider = ? AND provider_sub = ?')
    .bind(provider, pSub)
    .first();

  if (existing && existing.canonical_sub) {
    await db
      .prepare("UPDATE integ_auth_identities SET email = COALESCE(?, email), name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), ultimo_acceso = datetime('now') WHERE provider = ? AND provider_sub = ?")
      .bind(normEmail, name || null, avatarUrl || null, provider, pSub)
      .run();
    if (normEmail) await guardarEmailSub(db, existing.canonical_sub, normEmail);
    await sincronizarPerfilInicial(db, existing.canonical_sub, { email: normEmail, name, avatarUrl });
    return existing.canonical_sub;
  }

  let canonicalSub;
  if (provider === 'google') {
    // Coincide 1:1 con el auth0_sub histórico de los usuarios de Google en vants-db.
    canonicalSub = 'google-oauth2|' + pSub;
  } else {
    // Reutiliza cuenta Auth0 previa si este correo ya existía en integ_email_sub.
    const legacy = normEmail
      ? await db
          .prepare("SELECT auth0_sub FROM integ_email_sub WHERE LOWER(email) = ? ORDER BY CASE WHEN auth0_sub LIKE 'auth0|%' THEN 0 ELSE 1 END, actualizado DESC LIMIT 1")
          .bind(normEmail)
          .first()
          .catch(() => null)
      : null;
    canonicalSub = (legacy && legacy.auth0_sub) || ('vants|' + crypto.randomUUID());
  }

  await db
    .prepare("INSERT INTO integ_auth_identities (provider, provider_sub, canonical_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(provider, pSub, canonicalSub, normEmail, name || null, avatarUrl || null)
    .run();

  if (normEmail) await guardarEmailSub(db, canonicalSub, normEmail);
  await sincronizarPerfilInicial(db, canonicalSub, { email: normEmail, name, avatarUrl });
  return canonicalSub;
}

export async function crearSesion(db, env, { canonicalSub, email, name, avatarUrl, userAgent, amr }) {
  await asegurarAuth(db);
  const sessionId = crypto.randomUUID();
  const refreshToken = randomB64u(32);
  const tokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString();

  await db
    .prepare('INSERT INTO integ_auth_sessions (id, canonical_sub, token_hash, email, name, avatar_url, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(sessionId, canonicalSub, tokenHash, email || null, name || null, avatarUrl || null, (userAgent || '').slice(0, 180) || null, expiresAt)
    .run();

  const accessToken = await signVantsJwt(
    {
      sub: canonicalSub,
      email: email || undefined,
      email_verified: Boolean(email),
      name: name || undefined,
      picture: avatarUrl || undefined,
      auth_time: Math.floor(Date.now() / 1000),
      amr: amr || ['pwd'],
    },
    env,
  );

  return {
    sessionId,
    refreshToken,
    accessToken,
    expiresIn: ACCESS_TTL_SEC,
    user: {
      sub: canonicalSub,
      email: email || null,
      name: name || (email ? email.split('@')[0] : 'Jugador'),
      picture: avatarUrl || null,
    },
  };
}

export async function rotarSesion(db, env, refreshToken, userAgent) {
  await asegurarAuth(db);
  if (!refreshToken) return { ok: false, error: 'sin_sesion', status: 401 };
  const tokenHash = await sha256Hex(refreshToken);
  const row = await db
    .prepare('SELECT id, canonical_sub, email, name, avatar_url, expires_at, revoked_at FROM integ_auth_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first();

  if (!row) return { ok: false, error: 'sesion_invalida', status: 401 };

  // Detección de reutilización: si un token ya rotado/revocado vuelve a enviarse,
  // revocamos todas las sesiones del usuario como medida preventiva.
  if (row.revoked_at) {
    await db
      .prepare("UPDATE integ_auth_sessions SET revoked_at = datetime('now') WHERE canonical_sub = ? AND revoked_at IS NULL")
      .bind(row.canonical_sub)
      .run();
    return { ok: false, error: 'sesion_revocada', status: 401 };
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    await db
      .prepare("UPDATE integ_auth_sessions SET revoked_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run();
    return { ok: false, error: 'sesion_expirada', status: 401 };
  }

  await db
    .prepare("UPDATE integ_auth_sessions SET revoked_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  const next = await crearSesion(db, env, {
    canonicalSub: row.canonical_sub,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    userAgent,
    amr: ['rt'],
  });
  return { ok: true, ...next };
}

export async function revocarSesion(db, refreshToken) {
  if (!refreshToken) return;
  await asegurarAuth(db);
  const tokenHash = await sha256Hex(refreshToken);
  await db
    .prepare("UPDATE integ_auth_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(tokenHash)
    .run();
}

// ---------------------------------------------------------------- Email OTP (6 dígitos)
function generarCodigoOtp6() {
  // Rejection sampling para distribución uniforme en [0, 999999].
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  let v;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return String(v % 1_000_000).padStart(6, '0');
}

async function otpHash(email, code, env) {
  const pepper = (env && env.VANTS_AUTH_PRIVATE_JWK) ? await sha256Hex(String(env.VANTS_AUTH_PRIVATE_JWK)) : 'vants-otp';
  return sha256Hex(`${email}:${code}:${pepper}`);
}

export async function iniciarOtpEmail(db, env, rawEmail, sendFn = enviarEmail) {
  await asegurarAuth(db);
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) {
    return { ok: false, status: 400, error: 'email_invalido' };
  }

  const since = new Date(Date.now() - OTP_TTL_SEC * 1000).toISOString();
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM integ_auth_otp WHERE email = ? AND creado >= ?')
    .bind(email, since)
    .first();
  if (recent && Number(recent.n) >= OTP_RATE_LIMIT_MAX) {
    return { ok: false, status: 429, error: 'demasiados_intentos' };
  }

  const code = generarCodigoOtp6();
  const hash = await otpHash(email, code, env);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString();
  const nowIso = new Date().toISOString();

  await db
    .prepare('INSERT INTO integ_auth_otp (id, email, code_hash, attempts, expires_at, creado) VALUES (?, ?, ?, 0, ?, ?)')
    .bind(id, email, hash, expiresAt, nowIso)
    .run();

  const html = plantillaEmail({
    titulo: 'Tu código de acceso a VANTS',
    saludo: 'Introduce este código de 6 dígitos para iniciar sesión:',
    parrafos: [
      'Este código caduca en 10 minutos y solo sirve una vez. Si no solicitaste entrar en VANTS GAMES, puedes ignorar este correo.',
    ],
    datos: [
      ['Código', code],
      ['Validez', '10 minutos'],
    ],
    planes: false,
    base: env.SITE_URL || 'https://vants.cc',
  });

  const sent = await sendFn(env, { to: email, asunto: `${code} · Tu código de acceso a VANTS GAMES`, html });
  if (sent && sent.omitido) {
    return { ok: false, status: 503, error: 'email_no_configurado' };
  }
  if (!sent || !sent.ok) {
    return { ok: false, status: 502, error: 'email_error' };
  }
  return { ok: true, id, codeForTestOnly: env.__VANTS_TEST_EXPOSE_OTP ? code : undefined };
}

export async function verificarOtpEmail(db, env, rawEmail, rawCode, userAgent) {
  await asegurarAuth(db);
  const email = String(rawEmail || '').trim().toLowerCase();
  const code = String(rawCode || '').trim().replace(/\s+/g, '');
  if (!email || !/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: 'codigo_invalido' };
  }

  const row = await db
    .prepare('SELECT id, code_hash, attempts, expires_at, used_at FROM integ_auth_otp WHERE email = ? AND used_at IS NULL ORDER BY creado DESC LIMIT 1')
    .bind(email)
    .first();

  if (!row) return { ok: false, status: 401, error: 'codigo_invalido' };
  if (Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false, status: 401, error: 'codigo_expirado' };
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: 'demasiados_intentos' };
  }

  await db
    .prepare('UPDATE integ_auth_otp SET attempts = attempts + 1 WHERE id = ?')
    .bind(row.id)
    .run();

  const expected = await otpHash(email, code, env);
  if (!timingSafeEqualStr(row.code_hash, expected)) {
    return { ok: false, status: 401, error: 'codigo_incorrecto' };
  }

  await db
    .prepare("UPDATE integ_auth_otp SET used_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  const canonicalSub = await resolverSubCanonico(db, {
    provider: 'email',
    providerSub: email,
    email,
    name: email.split('@')[0],
    avatarUrl: null,
  });

  const session = await crearSesion(db, env, {
    canonicalSub,
    email,
    name: email.split('@')[0],
    avatarUrl: null,
    userAgent,
    amr: ['otp'],
  });

  return { ok: true, ...session };
}

// ---------------------------------------------------------------- Router /auth/* y /.well-known/*
export async function rutasAuth(req, env, url, p, m, H) {
  const isWellKnownOidc =
    p === '/.well-known/openid-configuration' ||
    p === '/auth/.well-known/openid-configuration';
  const isWellKnownJwks =
    p === '/.well-known/jwks.json' ||
    p === '/auth/.well-known/jwks.json';

  if (!p.startsWith('/auth/') && !isWellKnownOidc && !isWellKnownJwks) return null;

  if (isWellKnownOidc && (m === 'GET' || m === 'HEAD')) {
    return new Response(m === 'HEAD' ? null : JSON.stringify(openidDiscoveryFromEnv(env)), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    });
  }

  if (isWellKnownJwks && (m === 'GET' || m === 'HEAD')) {
    return new Response(m === 'HEAD' ? null : JSON.stringify(publicJwksFromEnv(env)), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    });
  }

  if (p === '/auth/userinfo' && (m === 'GET' || m === 'POST')) {
    try {
      const claims = await H.usuarioClaims(req, env);
      return new Response(
        JSON.stringify({
          sub: claims.sub,
          email: claims.email || undefined,
          email_verified: claims.email_verified !== false,
          name: claims.name || undefined,
          picture: claims.picture || undefined,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
          },
        },
      );
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Token inválido o ausente' }), {
        status: 401,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'www-authenticate': 'Bearer error="invalid_token"',
          'access-control-allow-origin': '*',
        },
      });
    }
  }

  if (p === '/auth/me' && m === 'GET') {
    const claims = await H.usuarioClaims(req, env);
    return H.json({ ok: true, user: claims });
  }

  if (p === '/auth/google/start' && m === 'GET') {
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI || ((env.SITE_URL || 'https://vants.cc').replace(/\/$/, '') + '/auth/google/callback');
    if (!clientId || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.VANTS_AUTH_PRIVATE_JWK) {
      return H.json({ ok: false, error: 'vants_auth_no_configurado' }, 503);
    }

    const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
    const nativeApp = url.searchParams.get('native') === '1';
    const state = randomB64u(24);
    const verifier = randomB64u(32);
    const challenge = bytesToB64u(await sha256Bytes(verifier));
    const nonce = randomB64u(16);

    const signedState = await firmarEstadoOidc(
      { state, verifier, nonce, returnTo, native: nativeApp, exp: Date.now() + OIDC_STATE_TTL_SEC * 1000 },
      env,
    );

    const gUrl = new URL(GOOGLE_AUTH_URL);
    gUrl.searchParams.set('client_id', clientId);
    gUrl.searchParams.set('redirect_uri', redirectUri);
    gUrl.searchParams.set('response_type', 'code');
    gUrl.searchParams.set('scope', 'openid email profile');
    gUrl.searchParams.set('state', state);
    gUrl.searchParams.set('nonce', nonce);
    gUrl.searchParams.set('code_challenge', challenge);
    gUrl.searchParams.set('code_challenge_method', 'S256');
    gUrl.searchParams.set('prompt', 'select_account');

    return new Response(null, {
      status: 302,
      headers: {
        location: gUrl.toString(),
        'set-cookie': formatCookie(COOKIE_OIDC, signedState, cookieOpts(env, OIDC_STATE_TTL_SEC)),
        'cache-control': 'no-store',
      },
    });
  }

  if (p === '/auth/google/callback' && m === 'GET') {
    const siteBase = (env.SITE_URL || 'https://vants.cc').replace(/\/$/, '');
    const failRedirect = (reason) => new Response(null, {
      status: 302,
      headers: {
        location: `${siteBase}/entrar?auth_error=${encodeURIComponent(reason)}`,
        'set-cookie': formatCookie(COOKIE_OIDC, '', cookieOpts(env, 0)),
        'cache-control': 'no-store',
      },
    });

    const errParam = url.searchParams.get('error');
    if (errParam) return failRedirect(errParam);

    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const cookies = parseCookies(req);
    if (!code || !stateParam || !cookies[COOKIE_OIDC]) return failRedirect('estado_invalido');

    let st;
    try {
      st = await verificarEstadoOidc(cookies[COOKIE_OIDC], env);
    } catch {
      return failRedirect('estado_invalido');
    }
    if (!timingSafeEqualStr(st.state, stateParam)) return failRedirect('estado_mismatch');

    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI || (siteBase + '/auth/google/callback');

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: st.verifier,
      }),
    });
    if (!tokenRes.ok) return failRedirect('intercambio_google');
    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenJson || !tokenJson.id_token) return failRedirect('sin_id_token');

    let gUser;
    try {
      gUser = await verificarGoogleIdToken(tokenJson.id_token, clientId, st.nonce);
    } catch (e) {
      return failRedirect(String((e && e.message) || 'id_token_invalido'));
    }

    const canonicalSub = await resolverSubCanonico(env.DB, {
      provider: 'google',
      providerSub: gUser.sub,
      email: gUser.email,
      name: gUser.name,
      avatarUrl: gUser.picture,
    });

    const session = await crearSesion(env.DB, env, {
      canonicalSub,
      email: gUser.email,
      name: gUser.name,
      avatarUrl: gUser.picture,
      userAgent: req.headers.get('user-agent') || '',
      amr: ['google_oidc'],
    });

    if (st && st.native) {
      const appCallback =
        'cc.vants.app://auth-callback?rt=' +
        encodeURIComponent(session.refreshToken) +
        '&returnTo=' +
        encodeURIComponent(safeReturnTo(st.returnTo));
      const nativeHeaders = new Headers({
        location: appCallback,
        'cache-control': 'no-store',
      });
      nativeHeaders.append('set-cookie', formatCookie(COOKIE_OIDC, '', cookieOpts(env, 0)));
      return new Response(null, { status: 302, headers: nativeHeaders });
    }

    const headers = new Headers({
      location: siteBase + safeReturnTo(st.returnTo),
      'cache-control': 'no-store',
    });
    headers.append('set-cookie', formatCookie(COOKIE_OIDC, '', cookieOpts(env, 0)));
    headers.append('set-cookie', formatCookie(COOKIE_RT, session.refreshToken, cookieOpts(env, REFRESH_TTL_SEC)));

    return new Response(null, { status: 302, headers });
  }

  if (p === '/auth/playgames/xp' && m === 'GET') {
    const claims = await H.usuarioClaims(req, env);
    await asegurarAuth(env.DB);
    const row = await env.DB
      .prepare('SELECT player_id, gamer_tag, title, current_level, next_level, current_xp_total, level_min_xp, level_max_xp, avatar_url, actualizado FROM integ_play_games_xp WHERE canonical_sub = ?')
      .bind(claims.sub)
      .first()
      .catch(() => null);
    return H.json({ ok: true, playGames: row || null });
  }

  if (p === '/auth/playgames/xp' && m === 'DELETE') {
    const claims = await H.usuarioClaims(req, env);
    await asegurarAuth(env.DB);
    await env.DB
      .prepare('DELETE FROM integ_play_games_xp WHERE canonical_sub = ?')
      .bind(claims.sub)
      .run()
      .catch(() => null);
    return H.json({ ok: true, deleted: true });
  }

  if (p === '/auth/playgames/xp' && m === 'POST') {
    const claims = await H.usuarioClaims(req, env);
    const b = await req.json().catch(() => ({}));
    const playerId = String(b.playerId || '').trim().slice(0, 80);
    if (!playerId) return H.json({ ok: false, error: 'player_id_requerido' }, 400);
    await asegurarAuth(env.DB);
    const gamerTag = b.displayName ? String(b.displayName).trim().slice(0, 60) : null;
    const title = b.title ? String(b.title).trim().slice(0, 80) : null;
    const currentLevel = Number.isFinite(Number(b.currentLevel)) ? Number(b.currentLevel) : null;
    const nextLevel = Number.isFinite(Number(b.nextLevel)) ? Number(b.nextLevel) : null;
    const currentXpTotal = Number.isFinite(Number(b.currentXpTotal)) ? Number(b.currentXpTotal) : null;
    const levelMinXp = Number.isFinite(Number(b.levelMinXp)) ? Number(b.levelMinXp) : null;
    const levelMaxXp = Number.isFinite(Number(b.levelMaxXp)) ? Number(b.levelMaxXp) : null;
    const avatarUrl = b.avatarUrl && /^https:\/\//.test(String(b.avatarUrl)) ? String(b.avatarUrl).slice(0, 400) : null;
    await env.DB
      .prepare(
        `INSERT INTO integ_play_games_xp (canonical_sub, player_id, gamer_tag, title, current_level, next_level, current_xp_total, level_min_xp, level_max_xp, avatar_url, actualizado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(canonical_sub) DO UPDATE SET
           player_id = excluded.player_id,
           gamer_tag = COALESCE(excluded.gamer_tag, integ_play_games_xp.gamer_tag),
           title = COALESCE(excluded.title, integ_play_games_xp.title),
           current_level = COALESCE(excluded.current_level, integ_play_games_xp.current_level),
           next_level = COALESCE(excluded.next_level, integ_play_games_xp.next_level),
           current_xp_total = COALESCE(excluded.current_xp_total, integ_play_games_xp.current_xp_total),
           level_min_xp = COALESCE(excluded.level_min_xp, integ_play_games_xp.level_min_xp),
           level_max_xp = COALESCE(excluded.level_max_xp, integ_play_games_xp.level_max_xp),
           avatar_url = COALESCE(excluded.avatar_url, integ_play_games_xp.avatar_url),
           actualizado = datetime('now')`,
      )
      .bind(claims.sub, playerId, gamerTag, title, currentLevel, nextLevel, currentXpTotal, levelMinXp, levelMaxXp, avatarUrl)
      .run()
      .catch(() => null);
    return H.json({
      ok: true,
      playGames: {
        player_id: playerId,
        gamer_tag: gamerTag,
        title,
        current_level: currentLevel,
        next_level: nextLevel,
        current_xp_total: currentXpTotal,
        level_min_xp: levelMinXp,
        level_max_xp: levelMaxXp,
      },
    });
  }

  // Intercambio 100% in-app para Google Play Games Services v2 / Google Sign-In nativo / GIS
  if (p === '/auth/playgames/exchange' && m === 'POST') {
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.VANTS_AUTH_PRIVATE_JWK) {
      return H.json({ ok: false, error: 'vants_auth_no_configurado' }, 503);
    }
    const b = await req.json().catch(() => ({}));
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    let gUser = null;

    if (b.serverAuthCode && env.GOOGLE_OAUTH_CLIENT_SECRET) {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(b.serverAuthCode).trim(),
          client_id: clientId,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          redirect_uri: '',
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        return H.json({ ok: false, error: 'intercambio_google' }, 401);
      }
      const tokenJson = await tokenRes.json().catch(() => null);
      if (tokenJson && tokenJson.id_token) {
        try {
          gUser = await verificarGoogleIdToken(tokenJson.id_token, clientId, null);
        } catch (e) {
          return H.json({ ok: false, error: String((e && e.message) || 'id_token_invalido') }, 401);
        }
      } else if (tokenJson && tokenJson.access_token) {
        try {
          const c = await verificarJwtDual(tokenJson.access_token, env);
          gUser = {
            sub: String(c.sub).replace(/^google-oauth2\|/, ''),
            email: c.email,
            name: c.name,
            picture: c.picture,
          };
        } catch (e) {
          return H.json({ ok: false, error: String((e && e.message) || 'access_token_invalido') }, 401);
        }
      }
    } else if (b.idToken) {
      try {
        gUser = await verificarGoogleIdToken(String(b.idToken).trim(), clientId, null);
      } catch (e) {
        return H.json({ ok: false, error: String((e && e.message) || 'id_token_invalido') }, 401);
      }
    } else if (b.accessToken) {
      try {
        const c = await verificarJwtDual(String(b.accessToken).trim(), env);
        gUser = {
          sub: String(c.sub).replace(/^google-oauth2\|/, ''),
          email: c.email,
          name: c.name,
          picture: c.picture,
        };
      } catch (e) {
        return H.json({ ok: false, error: String((e && e.message) || 'access_token_invalido') }, 401);
      }
    } else {
      return H.json({ ok: false, error: 'credencial_requerida' }, 400);
    }

    if (!gUser || !gUser.sub) {
      return H.json({ ok: false, error: 'google_sin_sub' }, 401);
    }

    const displayName = b.displayName ? String(b.displayName).trim().slice(0, 60) : gUser.name;
    const avatarUrl = gUser.picture || (b.avatarUrl && /^https:\/\//.test(String(b.avatarUrl)) ? String(b.avatarUrl) : null);

    const canonicalSub = await resolverSubCanonico(env.DB, {
      provider: 'google',
      providerSub: gUser.sub,
      email: gUser.email,
      name: displayName || gUser.name,
      avatarUrl,
    });

    if (b.playerId) {
      const playerId = String(b.playerId).trim().slice(0, 80);
      const title = b.title ? String(b.title).trim().slice(0, 80) : null;
      const currentLevel = Number.isFinite(Number(b.currentLevel)) ? Number(b.currentLevel) : null;
      const nextLevel = Number.isFinite(Number(b.nextLevel)) ? Number(b.nextLevel) : null;
      const currentXpTotal = Number.isFinite(Number(b.currentXpTotal)) ? Number(b.currentXpTotal) : null;
      const levelMinXp = Number.isFinite(Number(b.levelMinXp)) ? Number(b.levelMinXp) : null;
      const levelMaxXp = Number.isFinite(Number(b.levelMaxXp)) ? Number(b.levelMaxXp) : null;
      await env.DB
        .prepare(
          `INSERT INTO integ_play_games_xp (canonical_sub, player_id, gamer_tag, title, current_level, next_level, current_xp_total, level_min_xp, level_max_xp, avatar_url, actualizado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(canonical_sub) DO UPDATE SET
             player_id = excluded.player_id,
             gamer_tag = COALESCE(excluded.gamer_tag, integ_play_games_xp.gamer_tag),
             title = COALESCE(excluded.title, integ_play_games_xp.title),
             current_level = COALESCE(excluded.current_level, integ_play_games_xp.current_level),
             next_level = COALESCE(excluded.next_level, integ_play_games_xp.next_level),
             current_xp_total = COALESCE(excluded.current_xp_total, integ_play_games_xp.current_xp_total),
             level_min_xp = COALESCE(excluded.level_min_xp, integ_play_games_xp.level_min_xp),
             level_max_xp = COALESCE(excluded.level_max_xp, integ_play_games_xp.level_max_xp),
             avatar_url = COALESCE(excluded.avatar_url, integ_play_games_xp.avatar_url),
             actualizado = datetime('now')`,
        )
        .bind(canonicalSub, playerId, displayName || null, title, currentLevel, nextLevel, currentXpTotal, levelMinXp, levelMaxXp, avatarUrl)
        .run()
        .catch(() => null);
    }

    const session = await crearSesion(env.DB, env, {
      canonicalSub,
      email: gUser.email,
      name: displayName || gUser.name,
      avatarUrl,
      userAgent: req.headers.get('user-agent') || '',
      amr: ['play_games'],
    });

    return new Response(
      JSON.stringify({
        ok: true,
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        expires_in: session.expiresIn,
        user: session.user,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': formatCookie(COOKIE_RT, session.refreshToken, cookieOpts(env, REFRESH_TTL_SEC)),
        },
      },
    );
  }

  if (p === '/auth/email/start' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const r = await iniciarOtpEmail(env.DB, env, b.email);
    if (!r.ok) return H.json({ ok: false, error: r.error }, r.status);
    return H.json({ ok: true, enviado: true });
  }

  if (p === '/auth/email/verify' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const r = await verificarOtpEmail(env.DB, env, b.email, b.code, req.headers.get('user-agent') || '');
    if (!r.ok) return H.json({ ok: false, error: r.error }, r.status);
    return new Response(
      JSON.stringify({
        ok: true,
        access_token: r.accessToken,
        refresh_token: r.refreshToken,
        expires_in: r.expiresIn,
        user: r.user,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': formatCookie(COOKIE_RT, r.refreshToken, cookieOpts(env, REFRESH_TTL_SEC)),
        },
      },
    );
  }

  if (p === '/auth/refresh' && m === 'POST') {
    const cookies = parseCookies(req);
    const b = await req.json().catch(() => ({}));
    const rt = cookies[COOKIE_RT] || (b && typeof b.refresh_token === 'string' ? b.refresh_token.trim() : '');
    const r = await rotarSesion(env.DB, env, rt, req.headers.get('user-agent') || '');
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: r.error }), {
        status: r.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': formatCookie(COOKIE_RT, '', cookieOpts(env, 0)),
        },
      });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        access_token: r.accessToken,
        refresh_token: r.refreshToken,
        expires_in: r.expiresIn,
        user: r.user,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': formatCookie(COOKIE_RT, r.refreshToken, cookieOpts(env, REFRESH_TTL_SEC)),
        },
      },
    );
  }

  if (p === '/auth/logout' && m === 'POST') {
    const cookies = parseCookies(req);
    const b = await req.json().catch(() => ({}));
    const rt = cookies[COOKIE_RT] || (b && typeof b.refresh_token === 'string' ? b.refresh_token.trim() : '');
    await revocarSesion(env.DB, rt).catch(() => null);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': formatCookie(COOKIE_RT, '', cookieOpts(env, 0)),
      },
    });
  }

  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}
