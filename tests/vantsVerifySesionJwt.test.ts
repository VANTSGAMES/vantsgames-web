import test from "node:test";
import assert from "node:assert/strict";
import { parchearVantsWorker } from "../script/ci/parchear-auth-dual.mjs";

/**
 * verifySesionJwt es el segundo verificador de sesión del Worker `vants` (además de infoDeSesion):
 * protege /api/account/perfil, /api/account/progreso, /api/valorant/rango y los clips destacados.
 * Antes solo aceptaba el emisor de Auth0, así que las sesiones de VANTS Identity (el único login
 * que ofrece hoy la web) recibían 401 `sin_sesion` al guardar el nombre público.
 */

// Espacio mínimo del Worker en vivo tal como lo publica el despliegue: los bloques que el
// parche localiza (infoDeSesion, gancho de fetch) y el bloque real de verifySesionJwt.
const BLOQUE_LIVE = `var AUTH0_TENANT = "vants.eu.auth0.com";
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
var JWKS_TTL_MS2 = 60 * 6e4;
var jwksCache = { at: 0, keys: null };
async function verifySesionJwt(request, env) {
  const authz = request.headers.get("authorization") || "";
  const token = authz.replace(/^Bearer\\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let head, payload;
  try {
    head = JSON.parse(b64ToUtf8(parts[0]));
    payload = JSON.parse(b64ToUtf8(parts[1]));
  } catch (e) {
    return null;
  }
  if (!payload || !payload.sub) return null;
  if (payload.exp && Date.now() / 1e3 > payload.exp + 30) return null;
  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;
  if (!head || head.alg !== "RS256" || !head.kid) return null;
  try {
    const r = await fetch("https://" + AUTH0_TENANT + "/.well-known/jwks.json");
    if (!r.ok) return null;
    return { sub: String(payload.sub) };
  } catch (e) {
    return null;
  }
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

const b64u = (o: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: Record<string, unknown>, head: Record<string, unknown> = { alg: "RS256", kid: "vants-rs256-1" }) =>
  `${b64u(head)}.${b64u(payload)}.firma`;
const ahora = () => Math.floor(Date.now() / 1e3);
const SUB = "google-oauth2|109876543210";

async function cargar(origen: string) {
  const fn = origen.match(/async function verifySesionJwt\(request, env\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "no se encontró verifySesionJwt en el Worker");
  const src = `
var AUTH0_TENANT = "vants.eu.auth0.com";
var AUTH_HEADER = "Authorization";
var JWKS_TTL_MS2 = 60 * 6e4;
var jwksCache = { at: 0, keys: null };
var _vantsInt = null;
export function setBinding(x) { _vantsInt = x; }
function b64ToUtf8(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
}
${fn[0]}
export { verifySesionJwt };
`;
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}

/** El Worker en vivo usa LF; un checkout de Windows puede tener CRLF. Devuelve el fixture con el fin de línea del propio módulo de parches. */
function fixture(): string {
  for (const eol of ["\n", "\r\n"]) {
    const f = BLOQUE_LIVE.replace(/\n/g, eol);
    try {
      parchearVantsWorker(f);
      return f;
    } catch {}
  }
  throw new Error("no se pudo aplicar el parche al fixture del Worker");
}
const EOL = fixture().includes("\r\n") ? "\r\n" : "\n";
const LINEA = '  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;' + EOL;

function peticion(token: string) {
  return { headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? "Bearer " + token : null) } };
}

test("antes del parche, verifySesionJwt rechaza las sesiones de VANTS Identity (causa del 401 sin_sesion)", async () => {
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
  try {
    const m = await cargar(fixture());
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://vants.cc", exp: ahora() + 3600 })), {}), null);
  } finally {
    globalThis.fetch = fetchReal;
  }
});

test("verifySesionJwt parcheado acepta sesiones de VANTS Identity vía VANTS_INT /auth/me", async () => {
  const fetchReal = globalThis.fetch;
  let auth0 = 0;
  globalThis.fetch = (async () => {
    auth0++;
    return { ok: false };
  }) as unknown as typeof fetch;
  try {
    const m = await cargar(parchearVantsWorker(fixture()));
    let recibido: { url: string; auth: string | null } | null = null;
    m.setBinding({
      // El Worker pasa un Request (así lo documentan los Service Bindings).
      fetch: async (req: Request) => {
        recibido = { url: req.url, auth: req.headers.get("authorization") };
        return { ok: true, json: async () => ({ ok: true, user: { sub: SUB, email: "jugador@vants.cc" } }) };
      },
    });
    const token = jwt({ sub: SUB, iss: "https://vants.cc", aud: "https://api.vants.app", exp: ahora() + 3600 });
    assert.deepEqual(await m.verifySesionJwt(peticion(token), {}), { sub: SUB });
    assert.deepEqual(recibido, { url: "https://vants.cc/auth/me", auth: "Bearer " + token });
    assert.equal(auth0, 0, "no debe consultar Auth0 para un token de VANTS");

    // Emisor con barra final (se normaliza).
    m.setBinding({ fetch: async () => ({ ok: true, json: async () => ({ ok: true, user: { sub: SUB } }) }) });
    assert.deepEqual(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://vants.cc/", exp: ahora() + 3600 })), {}), { sub: SUB });
  } finally {
    globalThis.fetch = fetchReal;
  }
});

test("verifySesionJwt parcheado sigue rechazando tokens inválidos y conserva la ruta de Auth0", async () => {
  const fetchReal = globalThis.fetch;
  let auth0 = 0;
  globalThis.fetch = (async () => {
    auth0++;
    return { ok: false };
  }) as unknown as typeof fetch;
  try {
    const m = await cargar(parchearVantsWorker(fixture()));
    const binder = {
      fetch: async () => ({ ok: true, json: async () => ({ ok: true, user: { sub: SUB } }) }),
    };
    const vivo = jwt({ sub: SUB, iss: "https://vants.cc", exp: ahora() + 3600 });

    // Token de VANTS caducado: no llega a consultar al emisor.
    m.setBinding({ fetch: async () => { throw new Error("no debe llamarse"); } });
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://vants.cc", exp: ahora() - 120 })), {}), null);

    // Sin Service Binding (p. ej. despliegue sin VANTS_INT) no se acepta por defecto.
    m.setBinding(null);
    assert.equal(await m.verifySesionJwt(peticion(vivo), {}), null);

    // El emisor rechaza el token (firma/caducidad/audiencia): sin sesión.
    m.setBinding({ fetch: async () => ({ ok: false, json: async () => ({ ok: false }) }) });
    assert.equal(await m.verifySesionJwt(peticion(vivo), {}), null);

    // Algoritmo distinto de RS256 o sin kid: sin sesión.
    m.setBinding(binder);
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://vants.cc", exp: ahora() + 3600 }, { alg: "HS256", kid: "x" })), {}), null);
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://vants.cc", exp: ahora() + 3600 }, { alg: "RS256" })), {}), null);

    // Emisor desconocido: sin sesión y sin consultar a nadie.
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: SUB, iss: "https://otro.es/", exp: ahora() + 3600 })), {}), null);
    assert.equal(auth0, 0);

    // Token de Auth0: sigue la ruta original (JWKS de Auth0), sin pasar por VANTS_INT.
    m.setBinding({ fetch: async () => { throw new Error("un token de Auth0 no debe ir a VANTS_INT"); } });
    assert.equal(await m.verifySesionJwt(peticion(jwt({ sub: "auth0|abc", iss: "https://vants.eu.auth0.com/", exp: ahora() + 3600 })), {}), null);
    assert.equal(auth0, 1);

    // Cabecera ausente o token mal formado.
    assert.equal(await m.verifySesionJwt(peticion(""), {}), null);
    assert.equal(await m.verifySesionJwt(peticion("abc.def"), {}), null);
  } finally {
    globalThis.fetch = fetchReal;
  }
});

test("el parche de verifySesionJwt exige que la línea del emisor exista exactamente una vez", () => {
  const base = fixture();
  const sinLinea = base.replace(LINEA, "");
  assert.notEqual(sinLinea, base);
  assert.throws(() => parchearVantsWorker(sinLinea), /emisor \(iss\)/);
  const yaParcheado = parchearVantsWorker(parchearVantsWorker(base) + LINEA);
  assert.equal(yaParcheado.split("VANTS_AUTH_DUAL_V2").length - 1, 1, "idempotente: no duplica el bloque");
  const doble = base.replace(LINEA, LINEA + LINEA);
  assert.throws(() => parchearVantsWorker(doble), /encontradas 2/);
});
