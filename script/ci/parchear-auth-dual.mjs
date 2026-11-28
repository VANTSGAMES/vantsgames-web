// Parches idempotentes de Fase 2 (VANTS Identity · verificación dual sin cortes)
// para los Workers live `vants` y `vants-functions`.
//
// - `parchearVantsWorker(src)`:
//     1) Proxy first-party `/auth/*` -> Service Binding `env.VANTS_INT` (`vants-integraciones`)
//        para que las cookies HttpOnly viajen first-party en `https://vants.cc/auth/*` sin error 1042.
//     2) Verificación dual en `infoDeSesion(token)`: intenta primero `VANTS_INT /auth/me`
//        (valida VANTS Identity RS256 y Auth0) y conserva fallback a Auth0 `/userinfo`.
//     3) Verificación dual en `verifySesionJwt(request, env)` (VANTS_AUTH_DUAL_V2): el segundo
//        verificador del Worker (`/api/account/perfil`, `/api/account/progreso`,
//        clips destacados) también acepta sesiones de VANTS Identity.
//     4) Cumplimiento Riot Games (`VANTS_RIOT_COMPLIANCE_V1`): elimina rutas, cachés y scraping
//        no oficiales de VALORANT/GPR del Worker live `vants`.
//
// - `parchearVantsFunctions(src)`:
//     1) Actualiza los 3 verificadores JWT de `vants-functions` (`validarJWT` de linker,
//        `validarJwt` y `validarJWT2` de stripe-checkout) para aceptar tanto
//        `https://vants.cc` (vía `https://vants.cc/auth/.well-known/jwks.json`) como Auth0.
//     2) Cumplimiento Riot Games (`VANTS_FN_RIOT_OPTOUT_V1`): nota de revisión RSO y borrado
//        inmediato de cachés de VALORANT en D1 al desvincular Riot (opt-out).
//
// Uso CLI:
//   node script/ci/parchear-auth-dual.mjs --vants path/to/worker.js
//   node script/ci/parchear-auth-dual.mjs --functions path/to/worker.js

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VANTS_ISSUER = "https://vants.cc";
const VANTS_JWKS_URL = "https://vants.cc/auth/.well-known/jwks.json";

/** Elimina un bloque `if (...) { ... }` balanceado comenzando en `marker` (que termina en `{`). */
function removeBalancedBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return src;
  let i = start + marker.length - 1;
  let depth = 0;
  let quote = null;
  let esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    const nx = src[i + 1];
    if (quote) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "/" && nx === "/") {
      const nl = src.indexOf("\n", i + 2);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (ch === "/" && nx === "*") {
      const endC = src.indexOf("*/", i + 2);
      i = endC < 0 ? src.length : endC + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        if (src[end] === "\r") end++;
        if (src[end] === "\n") end++;
        return src.slice(0, start) + src.slice(end);
      }
    }
  }
  return src;
}

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

  // 5) CSP style-src para Google Identity Services y connect-src para WebSocket wss://vants.cc
  if (!c.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com;")) {
    c = c.replace(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com;",
    );
  }
  if (!c.includes("connect-src 'self' https: wss://vants.cc;")) {
    c = c.replace(
      "connect-src 'self' https:;",
      "connect-src 'self' https: wss://vants.cc;",
    );
  }

  // 6) Verificación dual en `verifySesionJwt(request, env)`.
  //    Este verificador (distinto de infoDeSesion) protege /api/account/perfil (nick y
  //    vínculos de la ficha), /api/account/progreso y la publicación
  //    de clips destacados. Solo aceptaba `iss` de Auth0, así que toda sesión iniciada con
  //    VANTS Identity (Google OIDC o código de correo) recibía 401 `sin_sesion` al guardar.
  //    Ahora los tokens emitidos por VANTS (RS256, kid) se validan con el propio emisor a
  //    través del Service Binding (VANTS_INT /auth/me), que ya verifica firma, exp y aud.
  if (!c.includes("/* VANTS_AUTH_DUAL_V2 */")) {
    const OLD_ISS = `  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;`;
    const NEW_ISS = `  /* VANTS_AUTH_DUAL_V2 */
  const __issV = String(payload.iss || "").replace(/\\/+$/, "");
  if (__issV === "${VANTS_ISSUER}") {
    if (!head || head.alg !== "RS256" || !head.kid || !_vantsInt) return null;
    try {
      const __meV = await _vantsInt.fetch(new Request("${VANTS_ISSUER}/auth/me", {
        headers: { [AUTH_HEADER]: "Bearer " + token }
      }));
      if (!__meV.ok) return null;
      const __dV = await __meV.json().catch(() => null);
      return __dV && __dV.ok && __dV.user && __dV.user.sub ? { sub: String(__dV.user.sub) } : null;
    } catch (eV) {
      return null;
    }
  }
  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;`;
    if (c.split(OLD_ISS).length !== 2) {
      throw new Error(
        "vants: línea de emisor (iss) de verifySesionJwt esperada exactamente una vez, encontradas " +
          (c.split(OLD_ISS).length - 1),
      );
    }
    c = c.replace(OLD_ISS, NEW_ISS);
  }

  // 6b) `infoDeSesion` (V1) pasa un `Request` con la cabecera al Service Binding: los bindings
  //     documentan `fetch(request)`; así no depende de que acepten `fetch(url, init)`.
  //     El cierre de la llamada original (`});`) se conserva: el segundo argumento es el mismo init.
  const OLD_CALL_V1 = `      const me = await _vantsInt.fetch("${VANTS_ISSUER}/auth/me", {`;
  const NEW_CALL_V1 = `      const me = await _vantsInt.fetch(new Request("${VANTS_ISSUER}/auth/me", { headers: { [AUTH_HEADER]: "Bearer " + token } }), {`;
  if (c.includes(OLD_CALL_V1)) c = c.split(OLD_CALL_V1).join(NEW_CALL_V1);

  // 7) Evitar falsos 429 (Too Many Requests) al cargar assets estáticos, chunks lazy de React
  //    y rutas SPA públicas (GET/HEAD que no sean /api/* ni rutas sensibles .env/.php/wp-*).
  if (!c.includes("/* VANTS_STATIC_NORATELIMIT_V1 */")) {
    const TARGET_CALL = `      const __r301 = await fetchWorker(__reqV, env, ctx);`;
    const REPLACED_CALL = `      /* VANTS_STATIC_NORATELIMIT_V1 */
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        !/\\.(env|php|sql|bak|git|ini|yml|yaml|log|sh)$/i.test(__redir301.pathname) &&
        !/^\\/(wp-|xmlrpc|phpmyadmin|cgi-bin|admin\\.php)/i.test(__redir301.pathname) &&
        !__redir301.pathname.startsWith("/api/")
      ) {
        const __hStatic = new Headers(__reqV.headers);
        __hStatic.set("cf-connecting-ip", "static:" + __redir301.pathname + ":" + Math.floor(Math.random() * 100000));
        __reqV = new Request(__reqV, { headers: __hStatic });
      }
      const __r301 = await fetchWorker(__reqV, env, ctx);`;
    if (c.includes(TARGET_CALL)) {
      c = c.replace(TARGET_CALL, REPLACED_CALL);
    }
  }

  // 8) Fallback limpio 200 cuando /api/clips/featured devuelve 502 vitrina_no_disponible.
  if (!c.includes("/* VANTS_CLIPS_FEATURED_FALLBACK_V1 */")) {
    const TARGET_CALL2 = `      const __r301 = await fetchWorker(__reqV, env, ctx);`;
    const REPLACED_CALL2 = `      const __r301 = await fetchWorker(__reqV, env, ctx);
      /* VANTS_CLIPS_FEATURED_FALLBACK_V1 */
      if (__r301 && __r301.status >= 500 && __redir301.pathname === "/api/clips/featured" && request.method === "GET") {
        return new Response(JSON.stringify({ ok: true, clips: [] }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }`;
    if (c.includes(TARGET_CALL2)) {
      c = c.replace(TARGET_CALL2, REPLACED_CALL2);
    }
  }

  // 9) Soporte CORS nativo para la app móvil/tablet Capacitor (Android https://localhost y iOS capacitor://localhost)
  //    para que todas las rutas /api/* funcionen 100% dentro de la aplicación sin "Origen no permitido".
  if (!c.includes("/* VANTS_NATIVE_CORS_V1 */")) {
    const TARGET_CORS_PRE = `    // 2. Activar Sitemap para Google y rutas de Kick`;
    const REPLACED_CORS_PRE = `    /* VANTS_NATIVE_CORS_V1 */
    const __natOrigin = (request.headers.get("origin") || "").trim();
    const __isNatOrigin =
      __natOrigin === "https://localhost" ||
      __natOrigin === "capacitor://localhost" ||
      __natOrigin === "ionic://localhost" ||
      /^http:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(__natOrigin);
    if (__isNatOrigin && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": __natOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type, accept",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    // 2. Activar Sitemap para Google y rutas de Kick`;
    if (c.includes(TARGET_CORS_PRE)) {
      c = c.replace(TARGET_CORS_PRE, REPLACED_CORS_PRE);
    }

    const TARGET_CORS_CALL = `      const __r301 = await fetchWorker(__reqV, env, ctx);`;
    const REPLACED_CORS_CALL = `      if (
        __isNatOrigin &&
        (request.method === "GET" ||
          request.method === "HEAD" ||
          /^Bearer\\s+\\S+/i.test(request.headers.get("authorization") || ""))
      ) {
        const __hNat = new Headers(__reqV.headers);
        __hNat.set("origin", "${VANTS_ISSUER}");
        __reqV = new Request(__reqV, { headers: __hNat });
      }
      let __r301 = await fetchWorker(__reqV, env, ctx);
      if (__isNatOrigin && __r301) {
        __r301 = new Response(__r301.body, __r301);
        __r301.headers.set("Access-Control-Allow-Origin", __natOrigin);
        __r301.headers.set("Vary", "Origin");
      }`;
    if (c.includes(TARGET_CORS_CALL)) {
      c = c.replace(TARGET_CORS_CALL, REPLACED_CORS_CALL);
    }
  }

  // 10) Separación estricta de descargas Móvil (vantsgames-web) vs PC (banter):
  //     /VANTSMovil.apk y /descargas/vants-movil/* sirven exclusivamente VANTS Movil desde este repo,
  //     mientras que /descargas/vants-pc/* sirve exclusivamente VANTS PC desde VANTSGAMES/banter.
  if (!c.includes("/* VANTS_DOWNLOADS_SPLIT_V1 */")) {
    const TARGET_DL = `    // 2. Activar Sitemap para Google y rutas de Kick`;
    const REPLACED_DL = `    /* VANTS_DOWNLOADS_SPLIT_V1 */
    if (
      _vantsInt &&
      (request.method === "GET" || request.method === "HEAD") &&
      (__redir301.pathname === "/VANTSMovil.apk" ||
        __redir301.pathname.startsWith("/descargas/vants-movil") ||
        __redir301.pathname.startsWith("/descargas/vants-pc"))
    ) {
      return _vantsInt.fetch(request);
    }

    // 2. Activar Sitemap para Google y rutas de Kick`;
    if (c.includes(TARGET_DL)) {
      c = c.replace(TARGET_DL, REPLACED_DL);
    }
  }

  // 11) Absorbe #5 (riot.txt) y #6 (googlec8812910616d7748.html) y cierra /kick/webhook (410 Gone)
  if (!c.includes("/* VANTS_SEO_KICK_ABSORB_V1 */")) {
    const OLD_ROBOTS = `  if (path === "/robots.txt") {
    return new Response(generarRobots(), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
    });
  }`;
    const NEW_ROBOTS = `  if (path === "/robots.txt") {
    return new Response(generarRobots(), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
    });
  }
  /* VANTS_SEO_KICK_ABSORB_V1 */
  if (path === "/riot.txt") {
    return new Response("383dea30-3123-4203-b2f8-367829724230", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" }
    });
  }
  if (path === "/googlec8812910616d7748.html") {
    return new Response("google-site-verification: googlec8812910616d7748.html", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
    });
  }`;
    if (c.includes(OLD_ROBOTS)) {
      c = c.replace(OLD_ROBOTS, NEW_ROBOTS);
    }

    const OLD_KICK_WEBHOOK = `  if (path === "/kick/webhook" && request.method === "POST") {
    try {
      const payload = await request.json();
      const eventType = request.headers.get("Kick-Event-Type") || payload.event || payload.type || payload.event_type;
      const isLive = eventType === "livestream.status.updated" ? payload.is_live === true : (eventType === "stream.online" || eventType === "live");
      if (isLive && DISCORD_WEBHOOK) {
        const channelName = payload.broadcaster?.username || payload.channel?.name || payload.user?.username || "Un creador de VANTS";
        const streamTitle = payload.livestream?.session_title || payload.title || "Transmitiendo en directo en el circuito VANTS";
        await fetch(DISCORD_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: \`🚀 **¡DIRECTO ACTIVO EN VANTS!** 🚀\\n\\n**\${channelName}** está en vivo en Kick: *\${streamTitle}*\\n👉 https://kick.com/\${channelName}\`
          })
        });
      }
      return new Response("OK", { status: 200 });
    } catch (err) {
      return new Response("Error en webhook: " + err.message, { status: 500 });
    }
  }`;
    const NEW_KICK_WEBHOOK = `  if (path === "/kick/webhook") {
    return new Response("Webhook movido a https://bot.vants.cc/kick", { status: 410 });
  }`;
    if (c.includes(OLD_KICK_WEBHOOK)) {
      c = c.replace(OLD_KICK_WEBHOOK, NEW_KICK_WEBHOOK);
    }
  }

  // 12) Proxy /api/ai y /api/ai/* -> Service Binding VANTS_INT (vants-integraciones /ai/*)
  if (!c.includes("/* VANTS_AI_CORE_PROXY_V1 */")) {
    const AI_PROXY = `    /* VANTS_AI_CORE_PROXY_V1 */
    if (
      _vantsInt &&
      (__redir301.pathname === "/api/ai" || __redir301.pathname.startsWith("/api/ai/"))
    ) {
      const __aiUrl = new URL(request.url);
      __aiUrl.pathname = __redir301.pathname.replace(/^\\/api/, "");
      return _vantsInt.fetch(new Request(__aiUrl.toString(), request));
    }`;
    const ANCHOR_OIDC = `        __redir301.pathname === "/maps/config")
    ) {
      return _vantsInt.fetch(request);
    }`;
    const ANCHOR_FALLBACK = `    // 2. Activar Sitemap para Google y rutas de Kick`;
    if (c.includes(ANCHOR_OIDC)) {
      c = c.replace(ANCHOR_OIDC, ANCHOR_OIDC + "\n\n" + AI_PROXY);
    } else if (c.includes(ANCHOR_FALLBACK)) {
      c = c.replace(ANCHOR_FALLBACK, AI_PROXY + "\n\n" + ANCHOR_FALLBACK);
    } else {
      throw new Error("vants: ancla para VANTS_AI_CORE_PROXY_V1 no encontrada");
    }
  }

  // 13) Cumplimiento Riot Games Developer Policies (App ID 907444):
  //     Elimina los handlers /api/valorant/rango, /api/valorant/esports, /api/gpr,
  //     parseGprHtml, handleGpr, sus cachés/variables y sus rutas en OPTIONS.
  if (!c.includes("/* VANTS_RIOT_COMPLIANCE_V1 */")) {
    // 13a) Cachés y constantes exclusivas de rutas eliminadas
    c = c.replace(
      /^var (?:ESPORTS_TTL_MS|esportsCache|GPR_TTL_MS|gprCache|rlEsports|rlGpr|valoCacheMod|REGIONES_VALORANT|LIMIT_ESPORTS|LIMIT_GPR)\b[^\n]*\r?\n/gm,
      "",
    );

    // 13b) Bloque GPR (GPR_PAGE_URL, GPR_LEAGUES, parseGprHtml, handleGpr)
    const idxGprUrl = c.indexOf("var GPR_PAGE_URL =");
    const idxFetchWorker = c.indexOf("async function fetchWorker(");
    if (idxGprUrl >= 0 && idxFetchWorker > idxGprUrl) {
      c = c.slice(0, idxGprUrl) + c.slice(idxFetchWorker);
    }

    // 13c) Rutas en OPTIONS (isGetApi)
    c = c.replace(/url\.pathname === "\/api\/(?:valorant\/esports|valorant\/rango|gpr)" \|\| /g, "");
    c = c.replace(/ \|\| url\.pathname === "\/api\/(?:valorant\/esports|valorant\/rango|gpr)"/g, "");

    // 13d) Handlers /api/valorant/esports, /api/valorant/rango y /api/gpr
    c = removeBalancedBlock(c, '  if (url.pathname === "/api/valorant/esports") {');
    c = removeBalancedBlock(c, '  if (url.pathname === "/api/valorant/rango") {');
    c = removeBalancedBlock(c, '  if (url.pathname === "/api/gpr") {');

    // 13e) Sello idempotente
    if (c.includes("async function fetchWorker(")) {
      c = c.replace("async function fetchWorker(", "/* VANTS_RIOT_COMPLIANCE_V1 */\nasync function fetchWorker(");
    } else {
      c = "/* VANTS_RIOT_COMPLIANCE_V1 */\n" + c;
    }
  }

  // 14) Proxy WebSocket y estado para SalaTorneo en vivo (/api/torneos-live/sala/:id/ws y /estado)
  //     hacia Service Binding `env.TORNEOS_REALTIME` (`vants-recursos`) con identidad y rol verificados.
  if (!c.includes("/* VANTS_TORNEOS_LIVE_PROXY_V1 */")) {
    const LIVE_PROXY = `    /* VANTS_TORNEOS_LIVE_PROXY_V1 */
    const __salaMatch = __redir301.pathname.match(/^\\/api\\/torneos-live\\/sala\\/([a-z0-9_-]{1,64})\\/(ws|estado)$/i);
    if (__salaMatch) {
      if (!env || !env.TORNEOS_REALTIME) {
        return new Response(JSON.stringify({ ok: false, error: "torneos_realtime_no_vinculado" }), {
          status: 503,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      const __tid = __salaMatch[1];
      const __op = __salaMatch[2].toLowerCase();
      const __salaUrl = new URL(request.url);
      __salaUrl.pathname = "/sala/" + encodeURIComponent(__tid) + "/" + __op;

      if (__op === "estado") {
        return env.TORNEOS_REALTIME.fetch(new Request(__salaUrl.toString(), { method: "GET" }));
      }

      const __authHdr = (request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "").trim();
      const __tok = __authHdr || (__salaUrl.searchParams.get("token") || "").trim();
      __salaUrl.searchParams.delete("token");

      let __nick = "espectador-" + Math.floor(1000 + Math.random() * 9000);
      let __role = "spectator";
      if (__tok) {
        try {
          const __u = await infoDeSesion(__tok);
          if (__u && __u.sub) {
            __role = "player";
            let __pNick = null;
            let __pRole = null;
            if (env.DB) {
              const [__pp, __pl] = await Promise.all([
                env.DB.prepare("SELECT nickname FROM perfiles_publicos WHERE auth0_sub = ? LIMIT 1").bind(__u.sub).first().catch(() => null),
                env.DB.prepare("SELECT display_name, username, role FROM players WHERE auth0_sub = ? LIMIT 1").bind(__u.sub).first().catch(() => null)
              ]);
              __pNick = (__pp && __pp.nickname) || (__pl && (__pl.display_name || __pl.username)) || null;
              __pRole = __pl && __pl.role ? String(__pl.role).toLowerCase() : null;
            }
            if (__pRole === "owner" || __pRole === "staff" || __pRole === "admin") __role = "staff";
            __nick = String(__pNick || __u.nickname || __u.name || "jugador").replace(/[^\\p{L}\\p{N}_ .#-]/gu, "").trim().slice(0, 24) || "jugador";
          }
        } catch (eWs) {}
      }

      const __wsH = new Headers(request.headers);
      __wsH.delete("x-vants-nick");
      __wsH.delete("x-vants-role");
      __wsH.delete("x-vants-torneo-id");
      __wsH.delete("x-vants-proxy-secret");
      __wsH.set("x-vants-nick", __nick);
      __wsH.set("x-vants-role", __role);
      __wsH.set("x-vants-torneo-id", __tid);
      if (env.VANTS_INTERNAL_SECRET) __wsH.set("x-vants-proxy-secret", env.VANTS_INTERNAL_SECRET);
      return env.TORNEOS_REALTIME.fetch(new Request(__salaUrl.toString(), { method: request.method, headers: __wsH }));
    }`;
    const ANCHOR_AI = `      return _vantsInt.fetch(new Request(__aiUrl.toString(), request));
    }`;
    const ANCHOR_FALLBACK2 = `    // 2. Activar Sitemap para Google y rutas de Kick`;
    if (c.includes(ANCHOR_AI)) {
      c = c.replace(ANCHOR_AI, ANCHOR_AI + "\n\n" + LIVE_PROXY);
    } else if (c.includes(ANCHOR_FALLBACK2)) {
      c = c.replace(ANCHOR_FALLBACK2, LIVE_PROXY + "\n\n" + ANCHOR_FALLBACK2);
    } else {
      throw new Error("vants: ancla para VANTS_TORNEOS_LIVE_PROXY_V1 no encontrada");
    }
  }

  // 15) Puerta Anti-Cheat Sentinel (vants_bans -> 403 cuenta_bloqueada_anticheat,
  //     ac_obligatorio = 1 -> 403 anticheat_requerido, badge x-vants-ac desde vants_ac_heartbeats)
  //     + proxy first-party /api/formularios/* -> env.VANTS_INT (/formularios/*).
  if (!c.includes("/* VANTS_SENTINEL_AC_GATE_V1 */")) {
    const OLD_WS_HDR = `      const __wsH = new Headers(request.headers);
      __wsH.delete("x-vants-nick");
      __wsH.delete("x-vants-role");
      __wsH.delete("x-vants-torneo-id");
      __wsH.delete("x-vants-proxy-secret");
      __wsH.set("x-vants-nick", __nick);
      __wsH.set("x-vants-role", __role);
      __wsH.set("x-vants-torneo-id", __tid);
      if (env.VANTS_INTERNAL_SECRET) __wsH.set("x-vants-proxy-secret", env.VANTS_INTERNAL_SECRET);
      return env.TORNEOS_REALTIME.fetch(new Request(__salaUrl.toString(), { method: request.method, headers: __wsH }));
    }`;
    const NEW_WS_HDR = `      /* VANTS_SENTINEL_AC_GATE_V1 */
      let __subWs = "";
      let __acWs = "none";
      if (__tok && env.DB) {
        try {
          const __uAc = await infoDeSesion(__tok);
          if (__uAc && __uAc.sub) {
            __subWs = String(__uAc.sub);
            const [__banWs, __hbWs] = await Promise.all([
              env.DB.prepare("SELECT id, motivo FROM vants_bans WHERE activo = 1 AND user_sub = ? LIMIT 1").bind(__subWs).first().catch(() => null),
              env.DB.prepare("SELECT vanguard_on, faceit_ac_on FROM vants_ac_heartbeats WHERE user_sub = ? AND expires_at > ? LIMIT 1").bind(__subWs, Date.now()).first().catch(() => null)
            ]);
            if (__banWs) {
              return new Response(JSON.stringify({ ok: false, error: "cuenta_bloqueada_anticheat", motivo: __banWs.motivo || "Cuenta bloqueada por VANTS Sentinel" }), {
                status: 403,
                headers: { "content-type": "application/json; charset=utf-8" }
              });
            }
            if (__hbWs) {
              const __vOn = Number(__hbWs.vanguard_on) === 1;
              const __fOn = Number(__hbWs.faceit_ac_on) === 1;
              __acWs = __vOn && __fOn ? "both" : __vOn ? "vanguard" : __fOn ? "faceit" : "pc";
            }
          }
        } catch (eAc) {}
      }
      if (__role !== "staff" && env.DB) {
        const __tAc = await env.DB.prepare("SELECT game_slug, ac_obligatorio FROM pt_torneos WHERE slug = ? OR id = ? LIMIT 1").bind(__tid, __tid).first().catch(() => null);
        if (__tAc && Number(__tAc.ac_obligatorio) === 1) {
          const __gAc = String(__tAc.game_slug || "").toLowerCase();
          const __reqAc = __gAc === "valorant" ? "vanguard" : __gAc === "cs2" ? "faceit" : "any";
          const __okAc = __reqAc === "vanguard" ? (__acWs === "vanguard" || __acWs === "both") : __reqAc === "faceit" ? (__acWs === "faceit" || __acWs === "both") : (__acWs === "vanguard" || __acWs === "faceit" || __acWs === "both");
          if (!__okAc) {
            return new Response(JSON.stringify({ ok: false, error: "anticheat_requerido", juego: __gAc || null, requiere: __reqAc }), {
              status: 403,
              headers: { "content-type": "application/json; charset=utf-8" }
            });
          }
        }
      }
      const __wsH = new Headers(request.headers);
      __wsH.delete("x-vants-nick");
      __wsH.delete("x-vants-role");
      __wsH.delete("x-vants-torneo-id");
      __wsH.delete("x-vants-proxy-secret");
      __wsH.delete("x-vants-user-sub");
      __wsH.delete("x-vants-ac");
      __wsH.set("x-vants-nick", __nick);
      __wsH.set("x-vants-role", __role);
      __wsH.set("x-vants-torneo-id", __tid);
      __wsH.set("x-vants-ac", __acWs);
      if (__subWs) __wsH.set("x-vants-user-sub", __subWs);
      if (env.VANTS_INTERNAL_SECRET) __wsH.set("x-vants-proxy-secret", env.VANTS_INTERNAL_SECRET);
      return env.TORNEOS_REALTIME.fetch(new Request(__salaUrl.toString(), { method: request.method, headers: __wsH }));
    }

    if (request.method === "POST" && __redir301.pathname === "/api/torneos/inscribir" && env && env.DB) {
      const __insTok = (request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "").trim();
      if (__insTok) {
        try {
          const __uIns = await infoDeSesion(__insTok);
          if (__uIns && __uIns.sub) {
            const __banIns = await env.DB.prepare("SELECT id, motivo FROM vants_bans WHERE activo = 1 AND user_sub = ? LIMIT 1").bind(__uIns.sub).first().catch(() => null);
            if (__banIns) {
              return new Response(JSON.stringify({ ok: false, error: "cuenta_bloqueada_anticheat", motivo: __banIns.motivo || "Cuenta bloqueada por VANTS Sentinel" }), {
                status: 403,
                headers: { "content-type": "application/json; charset=utf-8" }
              });
            }
          }
        } catch (eIns) {}
      }
    }

    if (_vantsInt && (__redir301.pathname === "/api/formularios" || __redir301.pathname.startsWith("/api/formularios/"))) {
      const __fUrl = new URL(request.url);
      __fUrl.pathname = __redir301.pathname.replace(/^\\/api/, "");
      return _vantsInt.fetch(new Request(__fUrl.toString(), request));
    }`;
    if (c.includes(OLD_WS_HDR)) {
      c = c.replace(OLD_WS_HDR, NEW_WS_HDR);
    } else {
      throw new Error("vants: bloque VANTS_TORNEOS_LIVE_PROXY_V1 esperado para VANTS_SENTINEL_AC_GATE_V1 no encontrado");
    }
  }

  // 16) Exponer `ac_obligatorio` (0/1) desde `pt_torneos` en GET /api/tournaments y /api/tournaments/:slug
  if (!c.includes("/* VANTS_TOURNAMENT_AC_FIELD_V1 */")) {
    const ANCHOR_R301 = `      let __r301 = await fetchWorker(__reqV, env, ctx);`;
    const ENRICH_AC = `${ANCHOR_R301}
      /* VANTS_TOURNAMENT_AC_FIELD_V1 */
      if (
        request.method === "GET" &&
        env && env.DB &&
        __r301 && __r301.ok &&
        (__redir301.pathname === "/api/tournaments" || __redir301.pathname.startsWith("/api/tournaments/")) &&
        (__r301.headers.get("content-type") || "").includes("application/json")
      ) {
        try {
          const __tBody = await __r301.clone().json();
          const __acRows = await env.DB.prepare("SELECT slug FROM pt_torneos WHERE ac_obligatorio = 1").all().catch(() => null);
          const __acSet = new Set(((__acRows && __acRows.results) || []).map((r) => String(r.slug)));
          if (__tBody && __tBody.data) {
            if (Array.isArray(__tBody.data.items)) {
              for (const __it of __tBody.data.items) {
                if (__it && __it.slug) __it.ac_obligatorio = __acSet.has(String(__it.slug)) ? 1 : 0;
              }
            } else if (__tBody.data.slug) {
              __tBody.data.ac_obligatorio = __acSet.has(String(__tBody.data.slug)) ? 1 : 0;
            }
            const __nh = new Headers(__r301.headers);
            __nh.delete("content-length");
            return new Response(JSON.stringify(__tBody), { status: __r301.status, headers: __nh });
          }
        } catch (eTac) {}
      }`;
    if (c.includes(ANCHOR_R301)) {
      c = c.replace(ANCHOR_R301, ENRICH_AC);
    }
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
  if (!c.includes("/* VANTS_FN_DUAL_2 */") && c.includes("async function jwks2(f, dominio)")) {
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

  // 4) Linker VANTS_SITE_URL + env, Stripe Checkout configStripe(env) + USD, Stripe Webhook secret/expiresAt ISO, y limpieza de los 4 módulos obsoletos
  if (!c.includes("/* VANTS_FN_STRIPE_ENV_V1 */")) {
    // 4a) Linker: fallback https://vants.cc y actualización desde env en handler(req, env)
    c = c.replace(
      'var APP_URL = (process.env.VANTS_SITE_URL ?? "https://feispla.github.io/Vants").replace(/\\/$/, "");',
      '/* VANTS_FN_STRIPE_ENV_V1 */\nvar APP_URL = (process.env.VANTS_SITE_URL ?? "https://vants.cc").replace(/\\/$/, "");',
    );
    const OLD_LINKER_HANDLER = `async function handler(req, env) {
  if (env && env.DB) pool = crearSql(env.DB);`;
    const NEW_LINKER_HANDLER = `async function handler(req, env) {
  if (env) {
    APP_URL = String(env.VANTS_SITE_URL || process.env.VANTS_SITE_URL || "https://vants.cc").replace(/\\/$/, "");
    if (env.LINKER_URL) URL_API = String(env.LINKER_URL).replace(/\\/$/, "");
    if (env.AUTH0_DOMAIN) AUTH0_DOMAIN = String(env.AUTH0_DOMAIN).replace(/^https?:\\/\\//, "");
    if (env.AUTH0_AUDIENCE) AUTH0_AUDIENCE = String(env.AUTH0_AUDIENCE);
  }
  if (env && env.DB) pool = crearSql(env.DB);`;
    if (c.includes(OLD_LINKER_HANDLER)) {
      c = c.replace(OLD_LINKER_HANDLER, NEW_LINKER_HANDLER);
    }

    // 4b) Stripe Checkout: configStripe(env), retornoSeguro2(return_to, appUrl), stripeCrearSesion(params, secretKey), crearCheckout(sub, email, body, cfg), currency = "usd"
    c = c.replace(
      'var APP_URL2 = (process.env.VANTS_SITE_URL ?? "https://feispla.github.io/Vants").replace(/\\/$/, "");',
      'var APP_URL2 = (process.env.VANTS_SITE_URL ?? "https://vants.cc").replace(/\\/$/, "");',
    );
    const OLD_CHECKOUT = `function retornoSeguro2(return_to) {
  if (!return_to) return APP_URL2 + "/";
  try {
    const u = new URL(return_to);
    if (u.origin === APP_URL2 || u.origin === LOCAL_URL2) return u.origin + u.pathname;
  } catch {
  }
  return APP_URL2 + "/";
}
__name(retornoSeguro2, "retornoSeguro");
async function stripeCrearSesion(params) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params).toString()
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("stripe_" + r.status + (d?.error?.message ? ": " + d.error.message : ""));
  return d;
}
__name(stripeCrearSesion, "stripeCrearSesion");
async function crearCheckout(sub, email, body) {
  const plan = String(body?.plan ?? "");
  const period = plan === "fee" ? "one_time" : body?.period === "yr" ? "yr" : "mo";
  if (plan !== "fee" && plan !== "pase" && plan !== "pro" && plan !== "creator") {
    return json5({ error: "plan_desconocido", plan }, 400);
  }
  const return_to = retornoSeguro2(String(body?.return_to ?? ""));
  const exito = return_to + "?paid=" + encodeURIComponent(plan);
  const fallo = return_to + "?paid=cancel";
  const params = {
    mode: plan === "pase" || plan === "fee" ? "payment" : "subscription",
    success_url: exito,
    cancel_url: fallo,
    client_reference_id: sub,
    "metadata[app]": "vants-games",
    "metadata[plan]": plan,
    "metadata[period]": period,
    "line_items[0][quantity]": "1"
  };
  if (email) params["customer_email"] = email;
  if (params.mode === "subscription") {
    params["subscription_data[metadata][app]"] = "vants-games";
    params["subscription_data[metadata][plan]"] = plan;
    params["subscription_data[metadata][period]"] = period;
  }
  if (plan === "fee") {
    const cents = Math.round(Number(body?.fee_cents ?? 0));
    if (!Number.isFinite(cents) || cents < 50 || cents > 1e6) {
      return json5({ error: "fee_invalido", detalle: "El importe del fee esta fuera de rango" }, 400);
    }
    const nombre = "Fee de inscripci\\xF3n \\xB7 " + String(body?.name ?? "Torneo VANTS").slice(0, 80);
    params["line_items[0][price_data][currency]"] = "eur";
    params["line_items[0][price_data][unit_amount]"] = String(cents);
    params["line_items[0][price_data][tax_behavior]"] = "inclusive";
    params["line_items[0][price_data][product_data][name]"] = nombre;
    params["line_items[0][price_data][product_data][metadata][app]"] = "vants-games";
    params["line_items[0][price_data][product_data][metadata][plan]"] = "fee";
  } else {
    const precio = PRECIOS[plan + "_" + period] ?? PRECIOS[plan];
    if (!precio) return json5({ error: "precio_faltante", plan, period }, 500);
    params["line_items[0][price]"] = precio;
  }
  const sesion = await stripeCrearSesion(params);
  const url = sesion.url;
  if (!url) throw new Error("sin_url_checkout");
  return json5({ ok: true, url });
}
__name(crearCheckout, "crearCheckout");
async function handler3(req, env) {
  if (env && env.DB) pool3 = crearSql(env.DB);
  if (!pool3) return json5({ error: "d1_no_configurado: falta el binding DB" }, 500);
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/\\/$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors5 });
  if (ruta === "" || ruta === "/") {
    const estado = {
      _version: "v7-rk-live",
      _stripe_secret_key: STRIPE_SECRET_KEY ? /^(sk|rk)_live_/.test(STRIPE_SECRET_KEY) ? "ok (live, sk/rk)" : "cargada pero NO es live (revisar modo)" : "falta STRIPE_SECRET_KEY (clave live sk_live_ o rk_live_ con permiso Checkout Sessions: Write)",
      _vants_site_url: "ok (" + APP_URL2 + ")",
      _tabla: "purchases + entitlements (migracion 05-pagos.sql)"
    };
    for (const [k, v] of Object.entries(PRECIOS)) estado["precio " + k] = v ? "ok (" + v.slice(0, 12) + "\\u2026)" : "falta";
    return json5({ ok: true, function: "stripe-checkout", estado });
  }
  if (ruta === "/api/checkout/start" && req.method === "POST") {
    if (!STRIPE_SECRET_KEY) {
      return json5({ error: "falta_clave", env: "STRIPE_SECRET_KEY", nota: "Cargar la clave live sk_live_... en las variables de esta funcion" }, 500);
    }
    try {
      const auth = req.headers.get("authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return json5({ error: "sin_sesion" }, 401);
      const { sub, email } = await validarJWT2(auth.slice(7));
      const body = await req.json().catch(() => ({}));
      return await crearCheckout(sub, email, body);
    } catch (e) {`;

    const NEW_CHECKOUT = `function configStripe(env) {
  return {
    secretKey: env?.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "",
    appUrl: String(env?.VANTS_SITE_URL || process.env.VANTS_SITE_URL || "https://vants.cc").replace(/\\/$/, ""),
    precios: {
      pro_mo: env?.STRIPE_PRICE_PRO_MO || process.env.STRIPE_PRICE_PRO_MO || "price_1UQbuSEamHVhBbtrZvi0ck4v",
      pro_yr: env?.STRIPE_PRICE_PRO_YR || process.env.STRIPE_PRICE_PRO_YR || "price_1UQbuSEamHVhBbtroeerOl5q",
      creator_mo: env?.STRIPE_PRICE_CREATOR_MO || process.env.STRIPE_PRICE_CREATOR_MO || "price_1UQbuSEamHVhBbtrYT9nich8",
      creator_yr: env?.STRIPE_PRICE_CREATOR_YR || process.env.STRIPE_PRICE_CREATOR_YR || "price_1UQbuSEamHVhBbtr699fCPMX",
      pase: env?.STRIPE_PRICE_PASE || process.env.STRIPE_PRICE_PASE || "price_1UQbuSEamHVhBbtrzOfVkmPs"
    }
  };
}
__name(configStripe, "configStripe");
function retornoSeguro2(return_to, appUrl = APP_URL2) {
  if (!return_to) return appUrl + "/";
  try {
    const u = new URL(return_to);
    if (u.origin === appUrl || u.origin === LOCAL_URL2) return u.origin + u.pathname;
  } catch {
  }
  return appUrl + "/";
}
__name(retornoSeguro2, "retornoSeguro");
async function stripeCrearSesion(params, secretKey = STRIPE_SECRET_KEY) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secretKey,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params).toString()
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("stripe_" + r.status + (d?.error?.message ? ": " + d.error.message : ""));
  return d;
}
__name(stripeCrearSesion, "stripeCrearSesion");
async function crearCheckout(sub, email, body, cfg = configStripe({})) {
  const plan = String(body?.plan ?? "");
  const period = plan === "fee" ? "one_time" : body?.period === "yr" ? "yr" : "mo";
  if (plan !== "fee" && plan !== "pase" && plan !== "pro" && plan !== "creator") {
    return json5({ error: "plan_desconocido", plan }, 400);
  }
  const return_to = retornoSeguro2(String(body?.return_to ?? ""), cfg.appUrl);
  const exito = return_to + "?paid=" + encodeURIComponent(plan);
  const fallo = return_to + "?paid=cancel";
  const params = {
    mode: plan === "pase" || plan === "fee" ? "payment" : "subscription",
    success_url: exito,
    cancel_url: fallo,
    client_reference_id: sub,
    "metadata[app]": "vants-games",
    "metadata[plan]": plan,
    "metadata[period]": period,
    "line_items[0][quantity]": "1"
  };
  if (email) params["customer_email"] = email;
  if (params.mode === "subscription") {
    params["subscription_data[metadata][app]"] = "vants-games";
    params["subscription_data[metadata][plan]"] = plan;
    params["subscription_data[metadata][period]"] = period;
  }
  if (plan === "fee") {
    const cents = Math.round(Number(body?.fee_cents ?? 0));
    if (!Number.isFinite(cents) || cents < 50 || cents > 1e6) {
      return json5({ error: "fee_invalido", detalle: "El importe del fee esta fuera de rango" }, 400);
    }
    const nombre = "Fee de inscripci\\xF3n \\xB7 " + String(body?.name ?? "Torneo VANTS").slice(0, 80);
    params["line_items[0][price_data][currency]"] = "usd";
    params["line_items[0][price_data][unit_amount]"] = String(cents);
    params["line_items[0][price_data][tax_behavior]"] = "inclusive";
    params["line_items[0][price_data][product_data][name]"] = nombre;
    params["line_items[0][price_data][product_data][metadata][app]"] = "vants-games";
    params["line_items[0][price_data][product_data][metadata][plan]"] = "fee";
  } else {
    const precio = cfg.precios[plan + "_" + period] ?? cfg.precios[plan];
    if (!precio) return json5({ error: "precio_faltante", plan, period }, 500);
    params["line_items[0][price]"] = precio;
  }
  const sesion = await stripeCrearSesion(params, cfg.secretKey);
  const url = sesion.url;
  if (!url) throw new Error("sin_url_checkout");
  return json5({ ok: true, url });
}
__name(crearCheckout, "crearCheckout");
async function handler3(req, env) {
  if (env && env.DB) pool3 = crearSql(env.DB);
  if (!pool3) return json5({ error: "d1_no_configurado: falta el binding DB" }, 500);
  const cfg = configStripe(env);
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/\\/$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors5 });
  if (ruta === "" || ruta === "/") {
    const estado = {
      _version: "v7-rk-live",
      _stripe_secret_key: cfg.secretKey ? /^(sk|rk)_live_/.test(cfg.secretKey) ? "ok (live, sk/rk)" : "cargada pero NO es live (revisar modo)" : "falta STRIPE_SECRET_KEY (clave live sk_live_ o rk_live_ con permiso Checkout Sessions: Write)",
      _vants_site_url: "ok (" + cfg.appUrl + ")",
      _tabla: "purchases + entitlements (migracion 05-pagos.sql)"
    };
    for (const [k, v] of Object.entries(cfg.precios)) estado["precio " + k] = v ? "ok (" + v.slice(0, 12) + "\\u2026)" : "falta";
    return json5({ ok: true, function: "stripe-checkout", estado });
  }
  if (ruta === "/api/checkout/start" && req.method === "POST") {
    if (!cfg.secretKey) {
      return json5({ error: "falta_clave", env: "STRIPE_SECRET_KEY", nota: "Cargar la clave live sk_live_... en las variables de esta funcion" }, 500);
    }
    try {
      const auth = req.headers.get("authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return json5({ error: "sin_sesion" }, 401);
      const { sub, email } = await validarJWT2(auth.slice(7));
      const body = await req.json().catch(() => ({}));
      return await crearCheckout(sub, email, body, cfg);
    } catch (e) {`;
    if (c.includes(OLD_CHECKOUT)) {
      c = c.replace(OLD_CHECKOUT, NEW_CHECKOUT);
    }

    // 4c) Stripe Webhook: verificarFirma2(payload, header, secret), expiresAt.toISOString(), webhookSecret desde env
    const OLD_FIRMA2 = `function verificarFirma2(payload, header) {
  if (!header) return { ok: false, motivo: "sin_firma" };
  let t = "";
  const v1s = [];
  for (const parte of header.split(",")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return { ok: false, motivo: "firma_malformada" };
  const edad = Math.abs(Date.now() / 1e3 - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return { ok: false, motivo: "timestamp_viejo" };
  const esperado = crypto4.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(t + "." + payload).digest();
  for (const v of v1s) {
    const recibido = Buffer.from(v, "hex");
    if (recibido.length === esperado.length && crypto4.timingSafeEqual(esperado, recibido)) return { ok: true };
  }
  return { ok: false, motivo: "firma_invalida" };
}`;
    const NEW_FIRMA2 = `function verificarFirma2(payload, header, secret) {
  if (!header) return { ok: false, motivo: "sin_firma" };
  let t = "";
  const v1s = [];
  for (const parte of header.split(",")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return { ok: false, motivo: "firma_malformada" };
  const edad = Math.abs(Date.now() / 1e3 - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return { ok: false, motivo: "timestamp_viejo" };
  const esperado = crypto4.createHmac("sha256", secret).update(t + "." + payload).digest();
  for (const v of v1s) {
    const recibido = Buffer.from(v, "hex");
    if (recibido.length === esperado.length && crypto4.timingSafeEqual(esperado, recibido)) return { ok: true };
  }
  return { ok: false, motivo: "firma_invalida" };
}`;
    if (c.includes(OLD_FIRMA2)) {
      c = c.replace(OLD_FIRMA2, NEW_FIRMA2);
    }

    c = c.replace(
      'const expiresAt = period === "one_time" ? null : sumaVencimiento(now, period);',
      'const expiresAt = period === "one_time" ? null : sumaVencimiento(now, period).toISOString();',
    );

    const OLD_HANDLER4 = `  if (req.method !== "POST") return json6({ error: "method_not_allowed" }, 405);
  if (!STRIPE_WEBHOOK_SECRET) {
    return json6({ error: "falta_webhook_secret", env: "STRIPE_WEBHOOK_SECRET" }, 503);
  }
  try {
    const signature = req.headers.get("stripe-signature") ?? "";
    const payload = await req.text();
    const firma = verificarFirma2(payload, signature);`;
    const NEW_HANDLER4 = `  if (req.method !== "POST") return json6({ error: "method_not_allowed" }, 405);
  const webhookSecret = env?.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    return json6({ error: "falta_webhook_secret", env: "STRIPE_WEBHOOK_SECRET" }, 503);
  }
  try {
    const signature = req.headers.get("stripe-signature") ?? "";
    const payload = await req.text();
    const firma = verificarFirma2(payload, signature, webhookSecret);`;
    if (c.includes(OLD_HANDLER4)) {
      c = c.replace(OLD_HANDLER4, NEW_HANDLER4);
    }

    // 4d) Eliminar los 4 módulos obsoletos (vantsdata, vantsbot, discord-notify, supervisor) y dejar las 4 funciones vivas en FUNCIONES
    const idxVantsdata = c.indexOf("// functions/vantsdata/index.ts");
    const idxMm = c.indexOf("// functions/mm/index.ts");
    if (idxVantsdata > 0 && idxMm > idxVantsdata) {
      c = c.slice(0, idxVantsdata) + c.slice(idxMm);
    }
    const idxDiscordNotify = c.indexOf("// functions/discord-notify/index.ts");
    const idxWorkerJs = c.indexOf("// worker.js");
    if (idxDiscordNotify > 0 && idxWorkerJs > idxDiscordNotify) {
      c = c.slice(0, idxDiscordNotify) + c.slice(idxWorkerJs);
    }

    const OLD_FUNCIONES = `var FUNCIONES = {
  linker: handler,
  vantsdata: handler2,
  vantsbot: vantsbot_default,
  mm: mm_default,
  "stripe-checkout": handler3,
  "stripe-webhook": handler4,
  "discord-notify": handler5,
  supervisor: handler6
};`;
    const NEW_FUNCIONES = `var FUNCIONES = {
  linker: handler,
  mm: mm_default,
  "stripe-checkout": handler3,
  "stripe-webhook": handler4
};`;
    if (c.includes(OLD_FUNCIONES)) {
      c = c.replace(OLD_FUNCIONES, NEW_FUNCIONES);
    }
  }

  // 5) Cumplimiento Riot Games RSO (App ID 907444):
  //    Actualiza el mensaje de estado RSO y purga todas las cachés/datos de VALORANT en D1 al desvincular (opt-out).
  if (!c.includes("/* VANTS_FN_RIOT_OPTOUT_V1 */")) {
    c = c.replace(
      'nota: "Riot RSO: las apps generales obtienen el puuid; el Nick#TAG llega cuando Riot afilia la app",',
      'nota: "Conexi\\u00f3n oficial con Riot Sign On en revisi\\u00f3n",',
    );
    const OLD_UNLINK = `      const r = await pool.query("DELETE FROM vants_links WHERE auth0_sub = $1 AND platform = $2", [sub, plataforma]);
      return json({ ok: true, plataforma, borrados: r.rowCount });`;
    const NEW_UNLINK = `      const r = await pool.query("DELETE FROM vants_links WHERE auth0_sub = $1 AND platform = $2", [sub, plataforma]);
      /* VANTS_FN_RIOT_OPTOUT_V1 */
      if (plataforma === "riot") {
        await pool.query("DELETE FROM integ_riot WHERE auth0_sub = $1", [sub]).catch(() => {});
        await pool.query("DELETE FROM integ_logros_ok WHERE auth0_sub = $1 AND code LIKE 'v.%'", [sub]).catch(() => {});
        await pool.query("DELETE FROM user_game_accounts WHERE user_id = $1 AND game = 'riot'", [sub]).catch(() => {});
        try {
          const { rows: pRows } = await pool.query("SELECT id, stats FROM players WHERE auth0_sub = $1", [sub]);
          for (const pr of pRows || []) {
            if (!pr?.stats) continue;
            try {
              const stObj = JSON.parse(pr.stats);
              if (stObj && typeof stObj === "object" && "valorant" in stObj) {
                delete stObj.valorant;
                await pool.query("UPDATE players SET stats = $1 WHERE id = $2", [JSON.stringify(stObj), pr.id]).catch(() => {});
              }
            } catch {}
          }
        } catch {}
      }
      return json({ ok: true, plataforma, borrados: r.rowCount, datos_eliminados: plataforma === "riot" });`;
    if (c.includes(OLD_UNLINK)) {
      c = c.replace(OLD_UNLINK, NEW_UNLINK);
    } else {
      c = "/* VANTS_FN_RIOT_OPTOUT_V1 */\n" + c;
    }
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
