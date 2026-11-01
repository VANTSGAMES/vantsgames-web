import type { Express, Request, Response } from "express";
import type { Server } from "node:http";

/**
 * Proxy de desarrollo/preview hacia la API de Vantsgames (Cloudflare Worker).
 * La web no guarda datos: todo se lee y escribe en el Worker y en D1.
 * En Cloudflare este papel lo cumple worker/index.ts.
 */
const API_ORIGIN = (process.env.VANTS_API_ORIGIN || "https://vantscc-preview.vants.workers.dev").replace(/\/$/, "");
const FN_ORIGIN = (process.env.VANTS_FN_ORIGIN || "https://vants-functions.vants.workers.dev").replace(/\/$/, "");
const UA_FALLBACK = "Mozilla/5.0 (compatible; VantsgamesWeb/1.0; +https://github.com/VANTSGAMES/vantsgames-web)";

async function forward(req: Request, res: Response, target: string) {
  const headers: Record<string, string> = {
    accept: String(req.headers.accept || "application/json"),
    "user-agent": /^Mozilla\//.test(String(req.headers["user-agent"] || "")) ? String(req.headers["user-agent"]) : UA_FALLBACK,
  };
  if (req.headers.authorization) headers.authorization = String(req.headers.authorization);
  // Los GET públicos se piden servidor a servidor (sin Origin). Las escrituras
  // conservan el Origin del navegador: el Worker de Vantsgames lo valida contra
  // su lista SITE_ORIGINS, que debe incluir el dominio de esta web.
  if (req.headers.origin && !["GET", "HEAD"].includes(req.method)) headers.origin = String(req.headers.origin);
  const init: RequestInit = { method: req.method, headers };
  if (!["GET", "HEAD"].includes(req.method)) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(req.body ?? {});
  }
  try {
    const r = await fetch(target, init);
    const body = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.setHeader("content-type", r.headers.get("content-type") || "application/json");
    res.setHeader("cache-control", "no-store");
    res.send(body);
  } catch (e) {
    console.error("[proxy]", target, (e as Error).message);
    res.status(502).json({ ok: false, error: "api_no_disponible" });
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use("/fn", (req, res) => forward(req, res, FN_ORIGIN + "/fn" + req.url));
  app.use("/api", (req, res) => forward(req, res, API_ORIGIN + "/api" + req.url));
  return httpServer;
}
