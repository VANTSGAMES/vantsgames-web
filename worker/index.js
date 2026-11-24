/**
 * Worker de PREVIEW de la web pública (vantsgames-web-preview).
 * - Sirve los estáticos embebidos (generados por worker/build.mjs en worker/assets.js).
 * - Reenvía /api/* al Worker de API de preview y /fn/* a vants-functions mediante service bindings.
 * No guarda datos ni credenciales.
 */
import { ASSETS } from "./assets.js";

const API_HOST = "https://vantscc-preview.vants.workers.dev";
const FN_HOST = "https://fn.vants.cc";
const UA = "Mozilla/5.0 (compatible; VantsgamesWeb/1.0; +https://github.com/VANTSGAMES/vantsgames-web)";

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "permissions-policy": "camera=(), microphone=(self), geolocation=(self)",
};

async function proxy(req, binding, host, path) {
  const h = new Headers();
  h.set("accept", req.headers.get("accept") || "application/json");
  const ua = req.headers.get("user-agent") || "";
  h.set("user-agent", ua.startsWith("Mozilla/") ? ua : UA);
  const auth = req.headers.get("authorization");
  if (auth) h.set("authorization", auth);
  const write = !["GET", "HEAD"].includes(req.method);
  if (write) {
    const o = req.headers.get("origin");
    if (o) h.set("origin", o);
    h.set("content-type", req.headers.get("content-type") || "application/json");
  }
  const init = { method: req.method, headers: h, body: write ? await req.arrayBuffer() : undefined };
  const target = new Request(host + path, init);
  try {
    const r = binding ? await binding.fetch(target) : await fetch(target);
    const out = new Headers({ "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" });
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) {
    return Response.json({ ok: false, error: "api_no_disponible" }, { status: 502 });
  }
}

function asset(path) {
  const a = ASSETS[path];
  if (!a) return null;
  const immutable = path.startsWith("/assets/");
  return new Response(Uint8Array.from(atob(a.b), (c) => c.charCodeAt(0)), {
    headers: { "content-type": a.t, "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300", ...SECURITY },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p.startsWith("/api/")) return proxy(req, env.API, API_HOST, p + url.search);
    if (p.startsWith("/fn/")) return proxy(req, env.FN, FN_HOST, p + url.search);
    const hit = asset(p === "/" ? "/index.html" : p);
    if (hit) return hit;
    if (/\.[a-z0-9]{2,5}$/i.test(p)) return new Response("No encontrado", { status: 404 });
    return asset("/index.html"); // SPA: el router del cliente resuelve la ruta
  },
};
