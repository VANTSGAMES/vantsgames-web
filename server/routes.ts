import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { requireAuth, type AuthRequest } from "../src/middleware/auth.ts";
import {
  createTacticalNote,
  createTournamentBookmark,
  createWorkspaceLink,
  deleteTacticalNote,
  deleteTournamentBookmark,
  deleteWorkspaceLink,
  getOrCreateUser,
  listTacticalNotesByUid,
  listTournamentBookmarksByUid,
  listWorkspaceLinksByUid,
  updateUserPreferences,
} from "../src/db/users.ts";
import { registerGeminiRoutes } from "./gemini.ts";

/**
 * Proxy de desarrollo/preview hacia la API de Vantsgames (Cloudflare Worker)
 * + endpoints /api/pro/* respaldados por Cloud SQL (PostgreSQL) y Firebase Auth.
 */
const API_ORIGIN = (process.env.VANTS_API_ORIGIN || "https://vantscc-preview.vants.workers.dev").replace(/\/$/, "");
const FN_ORIGIN = (process.env.VANTS_FN_ORIGIN || "https://vants-functions.vants.workers.dev").replace(/\/$/, "");
const UA_FALLBACK = "Mozilla/5.0 (compatible; VantsgamesWeb/1.0; +https://github.com/VANTSGAMES/vantsgames-web)";

const VALID_SERVICES = new Set([
  "drive",
  "docs",
  "sheets",
  "slides",
  "calendar",
  "meet",
  "tasks",
  "forms",
  "gmail",
  "chat",
]);

async function forward(req: Request, res: Response, target: string) {
  const headers: Record<string, string> = {
    accept: String(req.headers.accept || "application/json"),
    "user-agent": /^Mozilla\//.test(String(req.headers["user-agent"] || "")) ? String(req.headers["user-agent"]) : UA_FALLBACK,
  };
  if (req.headers.authorization) headers.authorization = String(req.headers.authorization);
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

async function resolveDbUser(req: AuthRequest) {
  const uid = req.user?.uid;
  const email = req.user?.email || `${uid}@users.vants.cc`;
  if (!uid) throw new Error("Usuario no autenticado.");
  return getOrCreateUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------------- VANTS Pro API (Cloud SQL + Firebase Auth) ----------------
  app.get("/api/pro/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const [notes, links, bookmarks] = await Promise.all([
        listTacticalNotesByUid(user.uid),
        listWorkspaceLinksByUid(user.uid),
        listTournamentBookmarksByUid(user.uid),
      ]);
      res.json({
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoUrl: user.photoUrl,
          preferredGame: user.preferredGame,
        },
        counts: {
          notes: notes.length,
          workspaceLinks: links.length,
          bookmarks: bookmarks.length,
        },
      });
    } catch (error: any) {
      console.error("GET /api/pro/me failed:", error);
      res.status(500).json({ error: error.message || "Error al cargar el perfil Pro." });
    }
  });

  app.patch("/api/pro/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const preferredGame =
        typeof req.body?.preferredGame === "string" ? req.body.preferredGame.trim().slice(0, 40) : undefined;
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 80) : undefined;
      const updated = await updateUserPreferences(user.uid, { preferredGame, displayName });
      res.json({ user: updated });
    } catch (error: any) {
      console.error("PATCH /api/pro/me failed:", error);
      res.status(500).json({ error: error.message || "Error al actualizar preferencias." });
    }
  });

  app.get("/api/pro/notes", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const notes = await listTacticalNotesByUid(user.uid);
      res.json({ notes });
    } catch (error: any) {
      console.error("GET /api/pro/notes failed:", error);
      res.status(500).json({ error: error.message || "Error al obtener las notas." });
    }
  });

  app.post("/api/pro/notes", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const title = String(req.body?.title || "").trim().slice(0, 140);
      const content = String(req.body?.content || "").trim().slice(0, 4000);
      const gameSlug = typeof req.body?.gameSlug === "string" ? req.body.gameSlug.trim().slice(0, 40) : null;
      const category = typeof req.body?.category === "string" ? req.body.category.trim().slice(0, 40) : "estrategia";
      if (title.length < 2 || content.length < 2) {
        return res.status(400).json({ error: "Título y contenido son obligatorios (mín. 2 caracteres)." });
      }
      const note = await createTacticalNote(user.id, { title, content, gameSlug, category });
      res.status(201).json({ note });
    } catch (error: any) {
      console.error("POST /api/pro/notes failed:", error);
      res.status(500).json({ error: error.message || "Error al crear la nota." });
    }
  });

  app.delete("/api/pro/notes/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID inválido." });
      const ok = await deleteTacticalNote(user.id, id);
      if (!ok) return res.status(404).json({ error: "Nota no encontrada." });
      res.json({ deleted: true, id });
    } catch (error: any) {
      console.error("DELETE /api/pro/notes/:id failed:", error);
      res.status(500).json({ error: error.message || "Error al eliminar la nota." });
    }
  });

  app.get("/api/pro/workspace-links", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const links = await listWorkspaceLinksByUid(user.uid);
      res.json({ links });
    } catch (error: any) {
      console.error("GET /api/pro/workspace-links failed:", error);
      res.status(500).json({ error: error.message || "Error al listar recursos." });
    }
  });

  app.post("/api/pro/workspace-links", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const service = String(req.body?.service || "").trim().toLowerCase();
      const resourceId = String(req.body?.resourceId || "").trim().slice(0, 255);
      const title = String(req.body?.title || "").trim().slice(0, 200);
      const url = typeof req.body?.url === "string" ? req.body.url.trim().slice(0, 1000) : null;
      const gameSlug = typeof req.body?.gameSlug === "string" ? req.body.gameSlug.trim().slice(0, 40) : null;
      const metadataJson =
        req.body?.metadata && typeof req.body.metadata === "object"
          ? JSON.stringify(req.body.metadata).slice(0, 2000)
          : null;

      if (!VALID_SERVICES.has(service) || !resourceId || !title) {
        return res.status(400).json({ error: "Datos de recurso Workspace inválidos." });
      }
      const link = await createWorkspaceLink(user.id, {
        service,
        resourceId,
        title,
        url,
        gameSlug,
        metadataJson,
      });
      res.status(201).json({ link });
    } catch (error: any) {
      console.error("POST /api/pro/workspace-links failed:", error);
      res.status(500).json({ error: error.message || "Error al guardar el recurso." });
    }
  });

  app.delete("/api/pro/workspace-links/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID inválido." });
      const ok = await deleteWorkspaceLink(user.id, id);
      if (!ok) return res.status(404).json({ error: "Recurso no encontrado." });
      res.json({ deleted: true, id });
    } catch (error: any) {
      console.error("DELETE /api/pro/workspace-links/:id failed:", error);
      res.status(500).json({ error: error.message || "Error al eliminar el recurso." });
    }
  });

  app.get("/api/pro/bookmarks", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const bookmarks = await listTournamentBookmarksByUid(user.uid);
      res.json({ bookmarks });
    } catch (error: any) {
      console.error("GET /api/pro/bookmarks failed:", error);
      res.status(500).json({ error: error.message || "Error al listar torneos guardados." });
    }
  });

  app.post("/api/pro/bookmarks", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const tournamentSlug = String(req.body?.tournamentSlug || "").trim().slice(0, 140);
      const tournamentName = String(req.body?.tournamentName || "").trim().slice(0, 200);
      const gameSlug = typeof req.body?.gameSlug === "string" ? req.body.gameSlug.trim().slice(0, 40) : null;
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null;
      if (!tournamentSlug || !tournamentName) {
        return res.status(400).json({ error: "Slug y nombre del torneo son obligatorios." });
      }
      const bookmark = await createTournamentBookmark(user.id, {
        tournamentSlug,
        tournamentName,
        gameSlug,
        notes,
      });
      res.status(201).json({ bookmark });
    } catch (error: any) {
      console.error("POST /api/pro/bookmarks failed:", error);
      res.status(500).json({ error: error.message || "Error al guardar el torneo." });
    }
  });

  app.delete("/api/pro/bookmarks/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = await resolveDbUser(req);
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID inválido." });
      const ok = await deleteTournamentBookmark(user.id, id);
      if (!ok) return res.status(404).json({ error: "Torneo guardado no encontrado." });
      res.json({ deleted: true, id });
    } catch (error: any) {
      console.error("DELETE /api/pro/bookmarks/:id failed:", error);
      res.status(500).json({ error: error.message || "Error al eliminar el torneo guardado." });
    }
  });

  // ---------------- VANTS AI Studio (Server-side Gemini API) ----------------
  registerGeminiRoutes(app);

  // ---------------- Google Maps Platform runtime key (public browser key) ----------------
  app.get("/api/maps/config", (_req: Request, res: Response) => {
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
    res.setHeader("cache-control", "no-store");
    res.json({ apiKey });
  });

  // ---------------- Proxy hacia Workers de VANTS ----------------
  app.use("/fn", (req, res) => forward(req, res, FN_ORIGIN + "/fn" + req.url));
  app.use("/api", (req, res) => forward(req, res, API_ORIGIN + "/api" + req.url));
  return httpServer;
}
