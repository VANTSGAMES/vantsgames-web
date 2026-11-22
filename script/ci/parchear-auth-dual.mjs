// Parches idempotentes de Fase 2 (VANTS Identity · verificación dual sin cortes)
// para los Workers live `vants` y `vants-functions`.
//
// - `parchearVantsWorker(src)`:
//     1) Proxy first-party `/auth/*` -> Service Binding `env.VANTS_INT` (`vants-integraciones`)
//        para que las cookies HttpOnly viajen first-party en `https://vants.cc/auth/*` sin error 1042.
//     2) Verificación dual en `infoDeSesion(token)`: intenta primero `VANTS_INT /auth/me`
//        (valida VANTS Identity RS256 y Auth0) y conserva fallback a Auth0 `/userinfo`.
//
// - `parchearVantsFunctions(src)`:
//     Actualiza los 3 verificadores JWT de `vants-functions` (`validarJWT` de linker,
//     `validarJwt` y `validarJWT2` de stripe-checkout) para aceptar tanto
//     `https://vants.cc` (vía `https://vants.cc/auth/.well-known/jwks.json`) como Auth0.
//
// Uso CLI:
//   node script/ci/parchear-auth-dual.mjs --vants path/to/worker.js
//   node script/ci/parchear-auth-dual.mjs --functions path/to/worker.js

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VANTS_ISSUER = "https://vants.cc";
const VANTS_JWKS_URL = "https://vants.cc/auth/.well-known/jwks.json";

export function parchearVantsWorker(src) {
  let c = String(src);

  // 1) Verificación dual en infoDeSesion(token)
  if (!c.includes("/* VANTS_AUTH_DUAL_V1 */")) {
    const OLD_INFO = `var AUTH0_TENANT = "vants.eu.auth0.com";
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
}`;
    const NEW_INFO = `var AUTH0_TENANT = "vants.eu.auth0.com";
var _vantsInt = null;
/* VANTS_AUTH_DUAL_V1 */
async function infoDeSesion(token) {
  if (!token) return null;
  if (_vantsInt && String(token).split(".").length === 3) {
    try {
      const me = await _vantsInt.fetch("https://vants.cc/auth/me", {
        headers: { [AUTH_HEADER]: "Bearer " + token }
      });
      if (me.ok) {
        const d = await me.json().catch(() => null);
        if (d && d.ok && d.user && d.user.sub) return d.user;
      }
    } catch (eV) {}
  }
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
}`;
    if (!c.includes(OLD_INFO)) {
      throw new Error("vants: bloque infoDeSesion esperado no encontrado");
    }
    c = c.replace(OLD_INFO, NEW_INFO);
  }

  // 2) Proxy first-party /auth/* -> env.VANTS_INT + captura de _vantsInt
  if (!c.includes("/* VANTS_AUTH_PROXY_V1 */")) {
    const OLD_FETCH_HOOK = `    // 2. Activar Sitemap para Google y rutas de Kick
    const rInicial = await manejarRutasSeoYKick(request, env);
    if (rInicial) return rInicial;`;
    const NEW_FETCH_HOOK = `    /* VANTS_AUTH_PROXY_V1 */
    _vantsInt = env && env.VANTS_INT ? env.VANTS_INT : null;
    if (__redir301.pathname.startsWith("/auth/") && _vantsInt) {
      return _vantsInt.fetch(request);
    }

    // 2. Activar Sitemap para Google y rutas de Kick
    const rInicial = await manejarRutasSeoYKick(request, env);
    if (rInicial) return rInicial;`;
    if (!c.includes(OLD_FETCH_HOOK)) {
      throw new Error("vants: bloque fetch esperado no encontrado para proxy /auth/*");
    }
    c = c.replace(OLD_FETCH_HOOK, NEW_FETCH_HOOK);
  }

  // 3) Evita 403 "Bloqueado" a verificadores automáticos de dominio (Epic Games Brand Review,
  //    Google, Stripe, Java/Go/Python/curl/UA vacío) en GET/HEAD de páginas públicas legítimas,
  //    manteniendo bloqueados los escáneres de rutas sensibles (.env, .php, wp-*, etc.).
  if (!c.includes("/* VANTS_UA_VERIFIER_V1 */")) {
    const OLD_CALL = `      const __r301 = await fetchWorker(request, env, ctx);`;
    const NEW_CALL = `      /* VANTS_UA_VERIFIER_V1 */
      let __reqV = request;
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        !/\\.(env|php|sql|bak|git|ini|yml|yaml|log|sh)$/i.test(__redir301.pathname) &&
        !/^\\/(wp-|xmlrpc|phpmyadmin|cgi-bin|admin\\.php)/i.test(__redir301.pathname)
      ) {
        const __ua = (request.headers.get("user-agent") || "").trim();
        if (!__ua || /(curl|wget|python|java|go-http-client|apache-httpclient|okhttp|httpunit|libwww|lwp|urllib|aiohttp|httpx|undici)/i.test(__ua)) {
          const __h = new Headers(request.headers);
          __h.set("user-agent", "Mozilla/5.0 (compatible; VANTSVerifier/1.0; +https://vants.cc)");
          __reqV = new Request(request, { headers: __h });
        }
      }
      const __r301 = await fetchWorker(__reqV, env, ctx);`;
    if (c.includes(OLD_CALL)) {
      c = c.replace(OLD_CALL, NEW_CALL);
    }
  }

  // 4) Proxy estándar OpenID Connect Discovery (/.well-known/openid-configuration, /.well-known/jwks.json),
  //    Google Workspace Pro (/pro/*) y Google Maps Config (/maps/config) hacia env.VANTS_INT
  if (!c.includes("/* VANTS_WELL_KNOWN_OIDC_V1 */")) {
    const OLD_PROXY = `    if (__redir301.pathname.startsWith("/auth/") && _vantsInt) {
      return _vantsInt.fetch(request);
    }`;
    const NEW_PROXY = `    /* VANTS_WELL_KNOWN_OIDC_V1 */
    if (
      _vantsInt &&
      (__redir301.pathname.startsWith("/auth/") ||
        __redir301.pathname === "/.well-known/openid-configuration" ||
        __redir301.pathname === "/.well-known/jwks.json" ||
        __redir301.pathname.startsWith("/pro/") ||
        __redir301.pathname === "/maps/config")
    ) {
      return _vantsInt.fetch(request);
    }`;
    if (c.includes(OLD_PROXY)) {
      c = c.replace(OLD_PROXY, NEW_PROXY);
    }
  }

  // 5) CSP style-src para Google Identity Services (https://accounts.google.com/gsi/style)
  if (!c.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com;")) {
    c = c.replace(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com;",
    );
  }

  return c;
}

export function parchearVantsFunctions(src) {
  let c = String(src);

  // 1) Linker: jwks() + validarJWT(token)
  if (!c.includes("/* VANTS_FN_DUAL_1 */")) {
    const OLD_1 = `var jwksCache = null;
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
}`;
    const NEW_1 = `/* VANTS_FN_DUAL_1 */
var jwksCache = new Map();
async function jwks(url) {
  const u = url || ("https://" + AUTH0_DOMAIN + "/.well-known/jwks.json");
  const hit = jwksCache.get(u);
  if (hit && Date.now() - hit.t < 36e5) return hit.keys;
  const r = await fetch(u);
  const d = await j(r);
  if (!d?.keys) throw new Error("jwks");
  jwksCache.set(u, { keys: d.keys, t: Date.now() });
  return d.keys;
}
__name(jwks, "jwks");
var b64u = /* @__PURE__ */ __name((s) => Buffer.from(s, "base64url").toString("utf8"), "b64u");
async function validarJWT(token) {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("jwt_malo");
  const cab = JSON.parse(b64u(partes[0]));
  const cuerpo = JSON.parse(b64u(partes[1]));
  const issNorm = String(cuerpo.iss || "").replace(/\\/+$/, "");
  const auth0Iss = ("https://" + AUTH0_DOMAIN).replace(/\\/+$/, "");
  const jwksUrl = issNorm === "${VANTS_ISSUER}" ? "${VANTS_JWKS_URL}" : issNorm === auth0Iss ? ("https://" + AUTH0_DOMAIN + "/.well-known/jwks.json") : null;
  if (!jwksUrl) throw new Error("jwt_iss");
  const llave = (await jwks(jwksUrl)).find((k) => String(k.kid) === String(cab.kid));
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
  if (cuerpo.exp && cuerpo.exp * 1e3 < Date.now()) throw new Error("jwt_exp");
  if (AUTH0_AUDIENCE && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    const valeApi = auds.includes(AUTH0_AUDIENCE);
    const valeId = process.env.AUTH0_CLIENT_ID ? auds.includes(process.env.AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error("jwt_aud");
  }
  return String(cuerpo.sub);
}`;
    if (!c.includes(OLD_1)) throw new Error("vants-functions: bloque validarJWT (1) no encontrado");
    c = c.replace(OLD_1, NEW_1);
  }

  // 2) Módulo intermedio: jwks2() + validarJwt()
  if (!c.includes("/* VANTS_FN_DUAL_2 */")) {
    const OLD_2 = `async function jwks2(f, dominio) {
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
    const claves2 = await jwks2(dep.fetch, dominio);`;
    const NEW_2 = `/* VANTS_FN_DUAL_2 */
var jwksCache2Map = new Map();
async function jwks2(f, url) {
  const hit = jwksCache2Map.get(url);
  if (hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.claves;
  const r = await f(url, { signal: AbortSignal.timeout(8e3) });
  const j2 = await r.json().catch(() => null);
  if (!j2 || !Array.isArray(j2.keys)) throw new Error("jwks_invalido");
  jwksCache2Map.set(url, { at: Date.now(), claves: j2.keys });
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
  const issNorm = String(cuerpo.iss || "").replace(/\\/+$/, "");
  const jwksUrl = issNorm === "${VANTS_ISSUER}" ? "${VANTS_JWKS_URL}" : issNorm === \`https://\${dominio}\` ? \`https://\${dominio}/.well-known/jwks.json\` : null;
  if (!jwksUrl) return null;
  const aud = cuerpo.aud;
  const audOk = typeof aud === "string" ? aud === audience : Array.isArray(aud) ? aud.includes(audience) : false;
  if (!audOk) return null;
  if (typeof cuerpo.sub !== "string" || !cuerpo.sub) return null;
  try {
    const claves2 = await jwks2(dep.fetch, jwksUrl);`;
    if (!c.includes(OLD_2)) throw new Error("vants-functions: bloque validarJwt (2) no encontrado");
    c = c.replace(OLD_2, NEW_2);
  }

  // 3) Stripe Checkout: jwks3() + validarJWT2(token)
  if (!c.includes("/* VANTS_FN_DUAL_3 */")) {
    const OLD_3 = `var jwksCache3 = null;
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
    const NEW_3 = `/* VANTS_FN_DUAL_3 */
var jwksCache3 = new Map();
async function jwks3(url) {
  const u = url || ("https://" + AUTH0_DOMAIN2 + "/.well-known/jwks.json");
  const hit = jwksCache3.get(u);
  if (hit && Date.now() - hit.t < 36e5) return hit.keys;
  const r = await fetch(u);
  const d = await r.json().catch(() => null);
  if (!d?.keys) throw new Error("jwks");
  jwksCache3.set(u, { keys: d.keys, t: Date.now() });
  return d.keys;
}
__name(jwks3, "jwks");
var b64u2 = /* @__PURE__ */ __name((s) => Buffer.from(s, "base64url").toString("utf8"), "b64u");
async function validarJWT2(token) {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("jwt_malo");
  const cab = JSON.parse(b64u2(partes[0]));
  const cuerpo = JSON.parse(b64u2(partes[1]));
  const issNorm = String(cuerpo.iss || "").replace(/\\/+$/, "");
  const auth0Iss = ("https://" + AUTH0_DOMAIN2).replace(/\\/+$/, "");
  const jwksUrl = issNorm === "${VANTS_ISSUER}" ? "${VANTS_JWKS_URL}" : issNorm === auth0Iss ? ("https://" + AUTH0_DOMAIN2 + "/.well-known/jwks.json") : null;
  if (!jwksUrl) throw new Error("jwt_iss");
  const llave = (await jwks3(jwksUrl)).find((k) => String(k.kid) === String(cab.kid));
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
  if (cuerpo.exp && cuerpo.exp * 1e3 < Date.now()) throw new Error("jwt_exp");
  if (AUTH0_AUDIENCE2 && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    const valeApi = auds.includes(AUTH0_AUDIENCE2);
    const valeId = AUTH0_CLIENT_ID ? auds.includes(AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error("jwt_aud");
  }
  return { sub: String(cuerpo.sub), email: typeof cuerpo.email === "string" ? cuerpo.email : null };
}`;
    if (!c.includes(OLD_3)) throw new Error("vants-functions: bloque validarJWT2 (3) no encontrado");
    c = c.replace(OLD_3, NEW_3);
  }

  return c;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , mode, filePath] = process.argv;
  if (!filePath || (mode !== "--vants" && mode !== "--functions")) {
    console.error("Uso: node parchear-auth-dual.mjs --vants|--functions <worker.js>");
    process.exit(2);
  }
  const src = readFileSync(filePath, "utf8");
  const patched = mode === "--vants" ? parchearVantsWorker(src) : parchearVantsFunctions(src);
  writeFileSync(filePath, patched, "utf8");
  console.log(`Parche auth dual (${mode}) aplicado correctamente en ${filePath}`);
}
