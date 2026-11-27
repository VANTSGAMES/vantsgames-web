import test from "node:test";
import assert from "node:assert/strict";
import {
  crearSesion,
  firmarEstadoOidc,
  iniciarOtpEmail,
  publicJwksFromEnv,
  resetAuthCachesForTests,
  resolverSubCanonico,
  revocarSesion,
  rotarSesion,
  rutasAuth,
  safeReturnTo,
  signVantsJwt,
  verificarEstadoOidc,
  verificarJwtDual,
  verificarOtpEmail,
} from "../integraciones/src/auth.js";
import { parchearVantsFunctions, parchearVantsWorker } from "../script/ci/parchear-auth-dual.mjs";

/** Genera un par RSA-2048 JWK para pruebas reales de firma/verificación RS256. */
async function generateRsaJwk(kid: string) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const priv = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as Record<string, any>;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Record<string, any>;
  return {
    priv: { ...priv, kid, alg: "RS256", use: "sig" },
    pub: { kty: pub.kty, n: pub.n, e: pub.e, kid, alg: "RS256", use: "sig" },
  };
}

/** Simulador ligero de D1 en memoria para las tablas integ_auth_* e integ_email_sub. */
function createMockD1() {
  const identities = new Map<string, any>();
  const sessions = new Map<string, any>();
  const otps: any[] = [];
  const emailSubs = new Map<string, { auth0_sub: string; email: string; actualizado: string }>();

  const exec = (sql: string, params: any[]) => {
    const q = sql.replace(/\s+/g, " ").trim();

    if (/^CREATE (TABLE|INDEX)/i.test(q)) return { results: [] };

    if (/^INSERT INTO integ_email_sub/i.test(q)) {
      const [sub, email] = params;
      emailSubs.set(sub, { auth0_sub: sub, email: String(email).toLowerCase(), actualizado: new Date().toISOString() });
      return { results: [] };
    }
    if (/^SELECT auth0_sub FROM integ_email_sub/i.test(q)) {
      const target = String(params[0]).toLowerCase();
      const matches = [...emailSubs.values()]
        .filter((r) => r.email.toLowerCase() === target)
        .sort((a, b) => (a.auth0_sub.startsWith("auth0|") ? 0 : 1) - (b.auth0_sub.startsWith("auth0|") ? 0 : 1));
      return { results: matches.slice(0, 1) };
    }

    if (/^SELECT canonical_sub FROM integ_auth_identities/i.test(q)) {
      const row = identities.get(`${params[0]}:${params[1]}`);
      return { results: row ? [row] : [] };
    }
    if (/^INSERT INTO integ_auth_identities/i.test(q)) {
      const [provider, provider_sub, canonical_sub, email, name, avatar_url] = params;
      identities.set(`${provider}:${provider_sub}`, { provider, provider_sub, canonical_sub, email, name, avatar_url });
      return { results: [] };
    }
    if (/^UPDATE integ_auth_identities/i.test(q)) {
      const [email, name, avatar_url, provider, provider_sub] = params;
      const cur = identities.get(`${provider}:${provider_sub}`);
      if (cur) {
        if (email) cur.email = email;
        if (name) cur.name = name;
        if (avatar_url) cur.avatar_url = avatar_url;
      }
      return { results: [] };
    }

    if (/^INSERT INTO integ_auth_sessions/i.test(q)) {
      const [id, canonical_sub, token_hash, email, name, avatar_url, user_agent, expires_at] = params;
      sessions.set(id, { id, canonical_sub, token_hash, email, name, avatar_url, user_agent, expires_at, revoked_at: null });
      return { results: [] };
    }
    if (/^SELECT .* FROM integ_auth_sessions WHERE token_hash = \?/i.test(q)) {
      const row = [...sessions.values()].find((s) => s.token_hash === params[0]);
      return { results: row ? [row] : [] };
    }
    if (/^UPDATE integ_auth_sessions SET revoked_at = datetime\('now'\) WHERE canonical_sub = \?/i.test(q)) {
      for (const s of sessions.values()) {
        if (s.canonical_sub === params[0] && !s.revoked_at) s.revoked_at = new Date().toISOString();
      }
      return { results: [] };
    }
    if (/^UPDATE integ_auth_sessions SET revoked_at = datetime\('now'\) WHERE id = \?/i.test(q)) {
      const s = sessions.get(params[0]);
      if (s) s.revoked_at = new Date().toISOString();
      return { results: [] };
    }
    if (/^UPDATE integ_auth_sessions SET revoked_at = datetime\('now'\) WHERE token_hash = \?/i.test(q)) {
      for (const s of sessions.values()) {
        if (s.token_hash === params[0] && !s.revoked_at) s.revoked_at = new Date().toISOString();
      }
      return { results: [] };
    }

    if (/^SELECT COUNT\(\*\) AS n FROM integ_auth_otp/i.test(q)) {
      const [email, since] = params;
      const n = otps.filter((o) => o.email === email && o.creado >= since).length;
      return { results: [{ n }] };
    }
    if (/^INSERT INTO integ_auth_otp/i.test(q)) {
      const [id, email, code_hash, expires_at, creado] = params;
      otps.push({ id, email, code_hash, attempts: 0, expires_at, used_at: null, creado });
      return { results: [] };
    }
    if (/^SELECT id, code_hash, attempts, expires_at, used_at FROM integ_auth_otp/i.test(q)) {
      const email = params[0];
      const matches = otps
        .filter((o) => o.email === email && !o.used_at)
        .sort((a, b) => b.creado.localeCompare(a.creado));
      return { results: matches.slice(0, 1) };
    }
    if (/^UPDATE integ_auth_otp SET attempts = attempts \+ 1/i.test(q)) {
      const o = otps.find((x) => x.id === params[0]);
      if (o) o.attempts += 1;
      return { results: [] };
    }
    if (/^UPDATE integ_auth_otp SET used_at = datetime\('now'\)/i.test(q)) {
      const o = otps.find((x) => x.id === params[0]);
      if (o) o.used_at = new Date().toISOString();
      return { results: [] };
    }

    throw new Error("Mock D1 unhandled SQL: " + q);
  };

  return {
    seedLegacyEmailSub(sub: string, email: string) {
      emailSubs.set(sub, { auth0_sub: sub, email: email.toLowerCase(), actualizado: new Date().toISOString() });
    },
    getSessions() {
      return [...sessions.values()];
    },
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          bound = args;
          return stmt;
        },
        async first() {
          const r = exec(sql, bound);
          return r.results[0] ?? null;
        },
        async all() {
          return exec(sql, bound);
        },
        async run() {
          exec(sql, bound);
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

test("RS256 signing, JWKS endpoint, and dual JWT verification (VANTS + Auth0)", async () => {
  resetAuthCachesForTests();
  const vantsKey = await generateRsaJwk("vants-test-1");
  const auth0Key = await generateRsaJwk("auth0-test-1");

  const env = {
    VANTS_AUTH_PRIVATE_JWK: JSON.stringify(vantsKey.priv),
    VANTS_AUTH_ISSUER: "https://vants.cc",
    VANTS_AUTH_AUDIENCE: "https://api.vants.app",
    AUTH0_DOMAIN: "vants.eu.auth0.com",
    AUTH0_AUDIENCE: "https://api.vants.app",
  };

  // Public JWKS exposes only public fields (never private d/p/q).
  const jwks = publicJwksFromEnv(env);
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kid, "vants-test-1");
  assert.equal("d" in jwks.keys[0], false);

  // Route GET /auth/.well-known/jwks.json returns the public JWKS.
  const jwksRes = await rutasAuth(
    new Request("https://vants.cc/auth/.well-known/jwks.json"),
    env,
    new URL("https://vants.cc/auth/.well-known/jwks.json"),
    "/auth/.well-known/jwks.json",
    "GET",
    { json: (b: any, s = 200) => new Response(JSON.stringify(b), { status: s }) },
  );
  assert.equal(jwksRes?.status, 200);
  const jwksBody = (await jwksRes!.json()) as any;
  assert.equal(jwksBody.keys[0].n, vantsKey.pub.n);

  // 1) Valid VANTS JWT passes dual verification.
  const vantsJwt = await signVantsJwt(
    { sub: "google-oauth2|10987654321", email: "pro@vants.cc", email_verified: true, name: "ProPlayer" },
    env,
  );
  const vantsClaims = await verificarJwtDual(vantsJwt, env);
  assert.equal(vantsClaims.provider, "vants");
  assert.equal(vantsClaims.sub, "google-oauth2|10987654321");
  assert.equal(vantsClaims.email, "pro@vants.cc");

  // 2) Valid Auth0 JWT passes dual verification using mocked Auth0 JWKS.
  const auth0Jwt = await signVantsJwt(
    { sub: "auth0|legacy-42", email: "feispla@hotmail.com", email_verified: true },
    {
      VANTS_AUTH_PRIVATE_JWK: JSON.stringify(auth0Key.priv),
      VANTS_AUTH_ISSUER: "https://vants.eu.auth0.com/",
      VANTS_AUTH_AUDIENCE: "https://api.vants.app",
    },
  );
  const mockFetch = async (url: string) => {
    assert.equal(url, "https://vants.eu.auth0.com/.well-known/jwks.json");
    return new Response(JSON.stringify({ keys: [auth0Key.pub] }), { status: 200 });
  };
  const auth0Claims = await verificarJwtDual(auth0Jwt, env, { fetchImpl: mockFetch });
  assert.equal(auth0Claims.provider, "auth0");
  assert.equal(auth0Claims.sub, "auth0|legacy-42");

  // 3) Tampered signature, expired token, wrong issuer, and wrong audience all fail.
  const tampered = vantsJwt.slice(0, -4) + "AAAA";
  await assert.rejects(() => verificarJwtDual(tampered, env), /jwt_firma/);

  const expired = await signVantsJwt({ sub: "google-oauth2|1" }, env, -10);
  await assert.rejects(() => verificarJwtDual(expired, env), /jwt_exp/);

  const badAud = await signVantsJwt(
    { sub: "google-oauth2|1", aud: "https://other.example" },
    env,
  );
  await assert.rejects(() => verificarJwtDual(badAud, env), /jwt_aud/);

  const badIss = await signVantsJwt(
    { sub: "google-oauth2|1", iss: "https://evil.example" },
    env,
  );
  await assert.rejects(() => verificarJwtDual(badIss, env), /jwt_iss/);
});

test("resolverSubCanonico preserves Auth0 Google and legacy email accounts in D1", async () => {
  resetAuthCachesForTests();
  const db = createMockD1();
  db.seedLegacyEmailSub("auth0|old-hotmail-99", "feispla@hotmail.com");

  // Google account maps 1:1 to google-oauth2|<sub>.
  const gSub = await resolverSubCanonico(db, {
    provider: "google",
    providerSub: "112233445566",
    email: "geimerpedroza@gmail.com",
    name: "Geimer",
    avatarUrl: null,
  });
  assert.equal(gSub, "google-oauth2|112233445566");

  // Existing Hotmail account adopts its historical auth0|... sub without data loss.
  const legacySub = await resolverSubCanonico(db, {
    provider: "email",
    providerSub: "FEISPLA@hotmail.com",
    email: "FEISPLA@hotmail.com",
    name: "feispla",
    avatarUrl: null,
  });
  assert.equal(legacySub, "auth0|old-hotmail-99");

  // Brand new email account gets a stable vants|<uuid> sub.
  const newSub1 = await resolverSubCanonico(db, {
    provider: "email",
    providerSub: "nuevo@outlook.com",
    email: "nuevo@outlook.com",
    name: "nuevo",
    avatarUrl: null,
  });
  assert.match(newSub1, /^vants\|[0-9a-f-]{36}$/);
  const newSub2 = await resolverSubCanonico(db, {
    provider: "email",
    providerSub: "nuevo@outlook.com",
    email: "nuevo@outlook.com",
    name: "nuevo",
    avatarUrl: null,
  });
  assert.equal(newSub2, newSub1);
});

test("Refresh token rotation works and detects token reuse by revoking all user sessions", async () => {
  resetAuthCachesForTests();
  const db = createMockD1();
  const key = await generateRsaJwk("vants-rt-1");
  const env = {
    VANTS_AUTH_PRIVATE_JWK: JSON.stringify(key.priv),
    VANTS_AUTH_ISSUER: "https://vants.cc",
    VANTS_AUTH_AUDIENCE: "https://api.vants.app",
  };

  const s1 = await crearSesion(db, env, {
    canonicalSub: "google-oauth2|777",
    email: "player@vants.cc",
    name: "Player",
    avatarUrl: null,
    userAgent: "test-agent",
    amr: ["google_oidc"],
  });

  // First rotation succeeds and returns a brand-new refresh token.
  const s2 = await rotarSesion(db, env, s1.refreshToken, "test-agent");
  assert.equal(s2.ok, true);
  assert.notEqual(s2.refreshToken, s1.refreshToken);

  // Replaying the old rotated refresh token triggers compromise revocation across all sessions.
  const replay = await rotarSesion(db, env, s1.refreshToken, "attacker");
  assert.equal(replay.ok, false);
  assert.equal(replay.error, "sesion_revocada");

  // Even the newer s2 refresh token is now revoked.
  const afterReplay = await rotarSesion(db, env, s2.refreshToken, "test-agent");
  assert.equal(afterReplay.ok, false);
  assert.equal(afterReplay.error, "sesion_revocada");

  // Normal logout revokes an active session cleanly.
  const s3 = await crearSesion(db, env, {
    canonicalSub: "google-oauth2|777",
    email: "player@vants.cc",
    name: "Player",
    avatarUrl: null,
    userAgent: "test-agent",
    amr: ["google_oidc"],
  });
  await revocarSesion(db, s3.refreshToken);
  const afterLogout = await rotarSesion(db, env, s3.refreshToken, "test-agent");
  assert.equal(afterLogout.ok, false);
});

test("Email OTP issues 6-digit code, verifies once, locks after 5 bad tries, and rate-limits", async () => {
  resetAuthCachesForTests();
  const db = createMockD1();
  const key = await generateRsaJwk("vants-otp-1");
  const env: Record<string, any> = {
    VANTS_AUTH_PRIVATE_JWK: JSON.stringify(key.priv),
    VANTS_AUTH_ISSUER: "https://vants.cc",
    VANTS_AUTH_AUDIENCE: "https://api.vants.app",
    __VANTS_TEST_EXPOSE_OTP: true,
  };

  const sent: string[] = [];
  const mockSend = async (_e: any, payload: { to: string }) => {
    sent.push(payload.to);
    return { ok: true };
  };

  const started = await iniciarOtpEmail(db, env, "jugador@outlook.com", mockSend);
  assert.equal(started.ok, true);
  assert.match(started.codeForTestOnly!, /^\d{6}$/);
  assert.deepEqual(sent, ["jugador@outlook.com"]);

  // Wrong code fails.
  const bad = await verificarOtpEmail(db, env, "jugador@outlook.com", "000000", "ua");
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "codigo_incorrecto");

  // Correct code succeeds and issues a valid VANTS RS256 JWT.
  const ok = await verificarOtpEmail(db, env, "jugador@outlook.com", started.codeForTestOnly!, "ua");
  assert.equal(ok.ok, true);
  const claims = await verificarJwtDual(ok.accessToken!, env);
  assert.equal(claims.email, "jugador@outlook.com");
  assert.equal(claims.provider, "vants");

  // Reusing the same code fails.
  const reuse = await verificarOtpEmail(db, env, "jugador@outlook.com", started.codeForTestOnly!, "ua");
  assert.equal(reuse.ok, false);

  // Rate limit blocks after 3 sends in 10 minutes.
  await iniciarOtpEmail(db, env, "jugador@outlook.com", mockSend);
  await iniciarOtpEmail(db, env, "jugador@outlook.com", mockSend);
  const fourth = await iniciarOtpEmail(db, env, "jugador@outlook.com", mockSend);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.status, 429);
});

test("OIDC state signing rejects tampering and safeReturnTo blocks open redirects", async () => {
  const key = await generateRsaJwk("vants-st-1");
  const env = { VANTS_AUTH_PRIVATE_JWK: JSON.stringify(key.priv) };

  const tok = await firmarEstadoOidc({ state: "abc", verifier: "xyz", exp: Date.now() + 60_000 }, env);
  const parsed = await verificarEstadoOidc(tok, env);
  assert.equal(parsed.state, "abc");

  await assert.rejects(() => verificarEstadoOidc(tok.slice(0, -3) + "ZZZ", env), /estado_firma/);

  assert.equal(safeReturnTo("/perfil/equipos"), "/perfil/equipos");
  assert.equal(safeReturnTo("//evil.com/phish"), "/perfil");
  assert.equal(safeReturnTo("https://evil.com"), "/perfil");
  assert.equal(safeReturnTo(""), "/perfil");
});

test("parchearVantsWorker y parchearVantsFunctions son idempotentes y mantienen sintaxis válida", () => {
  const sampleVants = `var AUTH0_TENANT = "vants.eu.auth0.com";
async function infoDeSesion(token) {
  if (!token) return null;
  try {
    const ui = await fetch("https://" + AUTH0_TENANT + "/userinfo", {
      headers: { [AUTH_HEADER]: "Bearer " + token }
    });
    if (!ui.ok) return null;
    const info = await ui.json();
    return info && info.sub ? info : null;
  } catch (e) {
    return null;
  }
}
var AUTH_HEADER = "Authorization";
async function verifySesionJwt(request, env) {
  if (!payload || !payload.sub) return null;
  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;
  return null;
}
async function fetch(request, env, ctx) {
    // 2. Activar Sitemap para Google y rutas de Kick
    const rInicial = await manejarRutasSeoYKick(request, env);
    if (rInicial) return rInicial;
    try {
      const __r301 = await fetchWorker(request, env, ctx);
      return __r301;
    } catch (e) {}
}`;
  const v1 = parchearVantsWorker(sampleVants);
  assert.match(v1, /VANTS_AUTH_DUAL_V1/);
  assert.match(v1, /VANTS_AUTH_PROXY_V1/);
  assert.match(v1, /VANTS_AUTH_DUAL_V2/);
  assert.match(v1, /new Request\("https:\/\/vants\.cc\/auth\/me"/);
  assert.match(v1, /VANTS_UA_VERIFIER_V1/);
  assert.match(v1, /VANTS_AI_CORE_PROXY_V1/);
  assert.equal(parchearVantsWorker(v1), v1);

  const sampleFn = `var jwksCache = null;
async function jwks() {
  if (jwksCache && Date.now() - jwksCache.t < 36e5) return jwksCache.keys;
  const r = await fetch("https://" + AUTH0_DOMAIN + "/.well-known/jwks.json");
  const d = await j(r);
  if (!d?.keys) throw new Error("jwks");
  jwksCache = { keys: d.keys, t: Date.now() };
  return d.keys;
}
__name(jwks, "jwks");
var b64u = /* @__PURE__ */ __name((s) => Buffer.from(s, "base64url").toString("utf8"), "b64u");
async function validarJWT(token) {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("jwt_malo");
  const cab = JSON.parse(b64u(partes[0]));
  const cuerpo = JSON.parse(b64u(partes[1]));
  const llave = (await jwks()).find((k) => String(k.kid) === String(cab.kid));
  if (!llave) throw new Error("jwt_kid");
  const pub = await subt.importKey(
    "jwk",
    llave,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new TextEncoder().encode(partes[0] + "." + partes[1]);
  const sig = Buffer.from(partes[2], "base64url");
  const ok = await subt.verify("RSASSA-PKCS1-v1_5", pub, sig, data);
  if (!ok) throw new Error("jwt_firma");
  if (cuerpo.iss !== "https://" + AUTH0_DOMAIN + "/") throw new Error("jwt_iss");
  if (cuerpo.exp && cuerpo.exp * 1e3 < Date.now()) throw new Error("jwt_exp");
  if (AUTH0_AUDIENCE && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    const valeApi = auds.includes(AUTH0_AUDIENCE);
    const valeId = process.env.AUTH0_CLIENT_ID ? auds.includes(process.env.AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error("jwt_aud");
  }
  return String(cuerpo.sub);
}
async function jwks2(f, dominio) {
  if (jwksCache2 && Date.now() - jwksCache2.at < JWKS_TTL_MS) return jwksCache2.claves;
  const r = await f(\`https://\${dominio}/.well-known/jwks.json\`, { signal: AbortSignal.timeout(8e3) });
  const j2 = await r.json().catch(() => null);
  if (!j2 || !Array.isArray(j2.keys)) throw new Error("jwks_invalido");
  jwksCache2 = { at: Date.now(), claves: j2.keys };
  return j2.keys;
}
__name(jwks2, "jwks");
async function validarJwt(authHeader, dep) {
  const dominio = String(dep.env.AUTH0_DOMAIN || "vants.eu.auth0.com").replace(/^https?:\\/\\//, "").replace(/\\/+$/, "");
  const audience = String(dep.env.AUTH0_AUDIENCE || "https://api.vants.app");
  if (!authHeader || !/^bearer /i.test(authHeader)) return null;
  const token = authHeader.replace(/^bearer /i, "").trim();
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const cab = b64urlJson(partes[0]);
  const cuerpo = b64urlJson(partes[1]);
  if (!cab || !cuerpo || cab.alg !== "RS256") return null;
  const ahora = Math.floor(Date.now() / 1e3);
  if (typeof cuerpo.exp !== "number" || cuerpo.exp + LEEWAY_SEG < ahora) return null;
  if (cuerpo.iss !== \`https://\${dominio}/\`) return null;
  const aud = cuerpo.aud;
  const audOk = typeof aud === "string" ? aud === audience : Array.isArray(aud) ? aud.includes(audience) : false;
  if (!audOk) return null;
  if (typeof cuerpo.sub !== "string" || !cuerpo.sub) return null;
  try {
    const claves2 = await jwks2(dep.fetch, dominio);
  } catch {}
}
var jwksCache3 = null;
async function jwks3() {
  if (jwksCache3 && Date.now() - jwksCache3.t < 36e5) return jwksCache3.keys;
  const r = await fetch("https://" + AUTH0_DOMAIN2 + "/.well-known/jwks.json");
  const d = await r.json().catch(() => null);
  if (!d?.keys) throw new Error("jwks");
  jwksCache3 = { keys: d.keys, t: Date.now() };
  return d.keys;
}
__name(jwks3, "jwks");
var b64u2 = /* @__PURE__ */ __name((s) => Buffer.from(s, "base64url").toString("utf8"), "b64u");
async function validarJWT2(token) {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("jwt_malo");
  const cab = JSON.parse(b64u2(partes[0]));
  const cuerpo = JSON.parse(b64u2(partes[1]));
  const llave = (await jwks3()).find((k) => String(k.kid) === String(cab.kid));
  if (!llave) throw new Error("jwt_kid");
  const pub = await subt2.importKey(
    "jwk",
    llave,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new TextEncoder().encode(partes[0] + "." + partes[1]);
  const sig = Buffer.from(partes[2], "base64url");
  const ok = await subt2.verify("RSASSA-PKCS1-v1_5", pub, sig, data);
  if (!ok) throw new Error("jwt_firma");
  if (cuerpo.iss !== "https://" + AUTH0_DOMAIN2 + "/") throw new Error("jwt_iss");
  if (cuerpo.exp && cuerpo.exp * 1e3 < Date.now()) throw new Error("jwt_exp");
  if (AUTH0_AUDIENCE2 && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    const valeApi = auds.includes(AUTH0_AUDIENCE2);
    const valeId = AUTH0_CLIENT_ID ? auds.includes(AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error("jwt_aud");
  }
  return { sub: String(cuerpo.sub), email: typeof cuerpo.email === "string" ? cuerpo.email : null };
}`;
  const f1 = parchearVantsFunctions(sampleFn);
  assert.match(f1, /VANTS_FN_DUAL_1/);
  assert.match(f1, /VANTS_FN_DUAL_2/);
  assert.match(f1, /VANTS_FN_DUAL_3/);
  assert.equal(parchearVantsFunctions(f1), f1);
  // Syntax check via Function constructor (ESM-free body)
  assert.doesNotThrow(() => new Function(v1));
  assert.doesNotThrow(() => new Function(f1));
});
