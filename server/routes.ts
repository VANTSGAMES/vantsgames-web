import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { optionalAuth, requireAuth, type AuthRequest } from "../src/middleware/auth.ts";
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
import {
  createLfgApplication,
  createLfgListing,
  deleteLfgListingOwned,
  listActiveLfgListings,
  listLfgApplicationsForOwner,
  resolveCommunityUser,
  updateLfgApplicationStatusOwned,
} from "../src/db/communityLfg.ts";
import {
  createForumComment,
  createForumPost,
  deleteForumCommentAuthorized,
  deleteForumPostAuthorized,
  isCommunityModerator,
  listForumComments,
  listForumPosts,
  moderateForumPost,
  toggleForumReaction,
} from "../src/db/communityForum.ts";
import {
  claimMissionReward,
  getWeeklyMissionsOverview,
  recordMissionProgress,
} from "../src/db/communityMissions.ts";
import {
  castPollVote,
  createCustomPoll,
  getVotingOverview,
  resolvePickemMatch,
  submitPickemPrediction,
  updatePollStatus,
} from "../src/db/communityVoting.ts";
import {
  cancelEventRsvp,
  createCommunityEvent,
  getEventsOverview,
  toggleEventCheckIn,
  updateCommunityEventStatus,
  upsertEventRsvp,
} from "../src/db/communityEvents.ts";
import { validateLfgApplication, validateLfgDraft } from "../client/src/lib/lfgHelpers.ts";
import {
  isValidForumReaction,
  validateForumCommentDraft,
  validateForumPostDraft,
} from "../client/src/lib/forumHelpers.ts";
import { validateMissionProgressNote } from "../client/src/lib/missionsHelpers.ts";
import { validateCustomPollDraft } from "../client/src/lib/votingHelpers.ts";
import { validateEventDraft, validateRsvpRoleNote } from "../client/src/lib/eventsHelpers.ts";

/**
 * Proxy de desarrollo/preview hacia la API de Vantsgames (Cloudflare Worker)
 * + endpoints /api/pro/* respaldados por Cloud SQL (PostgreSQL) y Google OAuth 2.0.
 */
const API_ORIGIN = (process.env.VANTS_API_ORIGIN || "https://vants.cc").replace(/\/$/, "");
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
  // ---------------- VANTS Pro API (Cloud SQL + Google OAuth 2.0) ----------------
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

  // ---------------- Comunidad · Fase 1: Buscador LFG / LFT / Scrims ----------------
  app.get("/api/community/lfg", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const gameSlug = typeof req.query.game === "string" ? req.query.game.trim().toLowerCase() : "";
      const type = typeof req.query.type === "string" ? req.query.type.trim().toLowerCase() : "";
      const region = typeof req.query.region === "string" ? req.query.region.trim().toUpperCase() : "";

      let viewerUserId: number | null = null;
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const listings = await listActiveLfgListings({
        gameSlug: gameSlug || undefined,
        type: type || undefined,
        region: region || undefined,
        viewerUserId,
      });
      res.json({ listings });
    } catch (error: any) {
      console.error("GET /api/community/lfg failed:", error);
      res.status(500).json({ error: "No se pudieron cargar los anuncios de equipo y scrims." });
    }
  });

  app.post("/api/community/lfg", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para publicar." });

      const validation = validateLfgDraft({
        type: req.body?.type,
        gameSlug: req.body?.gameSlug,
        title: req.body?.title,
        teamName: req.body?.teamName,
        roleNeeded: req.body?.roleNeeded,
        rankLevel: req.body?.rankLevel,
        schedule: req.body?.schedule,
        region: req.body?.region,
        slotsOpen: req.body?.slotsOpen,
        contact: req.body?.contact,
        notes: req.body?.notes,
      });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const authorNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const created = await createLfgListing({
        userId: user.id,
        authorNick,
        ...validation.data,
      });

      res.status(201).json({
        listing: {
          ...created,
          applicationsCount: 0,
          isOwner: true,
          hasApplied: false,
        },
      });
    } catch (error: any) {
      console.error("POST /api/community/lfg failed:", error);
      res.status(500).json({ error: "No se pudo publicar el anuncio." });
    }
  });

  app.delete("/api/community/lfg/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID de anuncio inválido." });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const ok = await deleteLfgListingOwned(user.id, id);
      if (!ok) return res.status(404).json({ error: "Anuncio no encontrado o sin permisos." });
      res.json({ deleted: true, id });
    } catch (error: any) {
      console.error("DELETE /api/community/lfg/:id failed:", error);
      res.status(500).json({ error: "No se pudo eliminar el anuncio." });
    }
  });

  app.post("/api/community/lfg/:id/apply", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para enviar una solicitud." });
      const listingId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        return res.status(400).json({ error: "ID de anuncio inválido." });
      }

      const validation = validateLfgApplication({
        role: req.body?.role,
        contact: req.body?.contact,
        message: req.body?.message,
      });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const applicantNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await createLfgApplication({
        listingId,
        applicantUserId: user.id,
        applicantNick,
        ...validation.data,
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.status(201).json({ application: result.application });
    } catch (error: any) {
      console.error("POST /api/community/lfg/:id/apply failed:", error);
      res.status(500).json({ error: "No se pudo enviar la solicitud." });
    }
  });

  app.get("/api/community/lfg/:id/applications", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para ver solicitudes." });
      const listingId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        return res.status(400).json({ error: "ID de anuncio inválido." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await listLfgApplicationsForOwner(user.id, listingId);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ applications: result.applications });
    } catch (error: any) {
      console.error("GET /api/community/lfg/:id/applications failed:", error);
      res.status(500).json({ error: "No se pudieron cargar las solicitudes." });
    }
  });

  app.patch("/api/community/lfg/applications/:appId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para responder solicitudes." });
      const appId = Number.parseInt(String(req.params.appId), 10);
      if (!Number.isFinite(appId) || appId <= 0) {
        return res.status(400).json({ error: "ID de solicitud inválido." });
      }

      const status = String(req.body?.status || "").trim().toLowerCase();
      if (status !== "accepted" && status !== "declined") {
        return res.status(400).json({ error: "Estado inválido. Usa 'accepted' o 'declined'." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await updateLfgApplicationStatusOwned(user.id, appId, status);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ application: result.application });
    } catch (error: any) {
      console.error("PATCH /api/community/lfg/applications/:appId failed:", error);
      res.status(500).json({ error: "No se pudo actualizar la solicitud." });
    }
  });

  // ---------------- Comunidad · Fase 2: Muro / Foro por videojuego ----------------
  app.get("/api/community/forum", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const gameSlug = typeof req.query.game === "string" ? req.query.game.trim().toLowerCase() : "";
      const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";

      let viewerUserId: number | null = null;
      const viewerIsModerator = isCommunityModerator(req.user?.email);
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const posts = await listForumPosts({
        gameSlug: gameSlug || undefined,
        category: category || undefined,
        viewerUserId,
        viewerIsModerator,
      });

      res.json({
        posts,
        viewer: { isModerator: viewerIsModerator },
      });
    } catch (error: any) {
      console.error("GET /api/community/forum failed:", error);
      res.status(500).json({ error: "No se pudieron cargar las publicaciones del muro." });
    }
  });

  app.post("/api/community/forum", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para publicar en el muro." });

      const validation = validateForumPostDraft({
        gameSlug: req.body?.gameSlug,
        category: req.body?.category,
        title: req.body?.title,
        body: req.body?.body,
      });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const authorNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const post = await createForumPost({
        userId: user.id,
        authorNick,
        ...validation.data,
        isModerator: isCommunityModerator(req.user?.email),
      });

      res.status(201).json({ post });
    } catch (error: any) {
      console.error("POST /api/community/forum failed:", error);
      res.status(500).json({ error: "No se pudo crear la publicación." });
    }
  });

  app.delete("/api/community/forum/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      const postId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ error: "ID de publicación inválido." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await deleteForumPostAuthorized(
        user.id,
        postId,
        isCommunityModerator(req.user?.email),
      );
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ deleted: true, id: postId });
    } catch (error: any) {
      console.error("DELETE /api/community/forum/:id failed:", error);
      res.status(500).json({ error: "No se pudo eliminar la publicación." });
    }
  });

  app.patch("/api/community/forum/:id/moderate", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden moderar publicaciones." });
      }
      const postId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ error: "ID de publicación inválido." });
      }

      const pinned = typeof req.body?.pinned === "boolean" ? req.body.pinned : undefined;
      const locked = typeof req.body?.locked === "boolean" ? req.body.locked : undefined;
      if (pinned === undefined && locked === undefined) {
        return res.status(400).json({ error: "Indica si deseas fijar o bloquear la publicación." });
      }

      const result = await moderateForumPost(postId, { pinned, locked });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ post: result.post });
    } catch (error: any) {
      console.error("PATCH /api/community/forum/:id/moderate failed:", error);
      res.status(500).json({ error: "No se pudo moderar la publicación." });
    }
  });

  app.post("/api/community/forum/:id/react", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para reaccionar." });
      const postId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ error: "ID de publicación inválido." });
      }

      const rawReaction = String(req.body?.reaction || "").trim().toLowerCase();
      if (!isValidForumReaction(rawReaction)) {
        return res.status(400).json({ error: "Reacción inválida. Usa 'gg' o 'fire'." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await toggleForumReaction({
        postId,
        userId: user.id,
        reaction: rawReaction,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json(result);
    } catch (error: any) {
      console.error("POST /api/community/forum/:id/react failed:", error);
      res.status(500).json({ error: "No se pudo registrar la reacción." });
    }
  });

  app.get("/api/community/forum/:id/comments", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const postId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ error: "ID de publicación inválido." });
      }

      let viewerUserId: number | null = null;
      const viewerIsModerator = isCommunityModerator(req.user?.email);
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const result = await listForumComments({
        postId,
        viewerUserId,
        viewerIsModerator,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ comments: result.comments });
    } catch (error: any) {
      console.error("GET /api/community/forum/:id/comments failed:", error);
      res.status(500).json({ error: "No se pudieron cargar los comentarios." });
    }
  });

  app.post("/api/community/forum/:id/comments", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para comentar." });
      const postId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ error: "ID de publicación inválido." });
      }

      const validation = validateForumCommentDraft(req.body?.body);
      if (!validation.ok) return res.status(400).json({ error: validation.error });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const authorNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await createForumComment({
        postId,
        userId: user.id,
        authorNick,
        body: validation.body,
        isModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.status(201).json({ comment: result.comment });
    } catch (error: any) {
      console.error("POST /api/community/forum/:id/comments failed:", error);
      res.status(500).json({ error: "No se pudo publicar el comentario." });
    }
  });

  app.delete("/api/community/forum/comments/:commentId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      const commentId = Number.parseInt(String(req.params.commentId), 10);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        return res.status(400).json({ error: "ID de comentario inválido." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await deleteForumCommentAuthorized(
        user.id,
        commentId,
        isCommunityModerator(req.user?.email),
      );
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ deleted: true, id: commentId });
    } catch (error: any) {
      console.error("DELETE /api/community/forum/comments/:commentId failed:", error);
      res.status(500).json({ error: "No se pudo eliminar el comentario." });
    }
  });

  // ---------------- Comunidad · Fase 3: Retos y Misiones Semanales ----------------
  app.get("/api/community/missions", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      let viewerUserId: number | null = null;
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const overview = await getWeeklyMissionsOverview({ viewerUserId });
      res.json(overview);
    } catch (error: any) {
      console.error("GET /api/community/missions failed:", error);
      res.status(500).json({ error: "No se pudieron cargar las misiones semanales." });
    }
  });

  app.post("/api/community/missions/:code/progress", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para registrar tu progreso." });

      const code = String(req.params.code || "").trim().toLowerCase();
      const noteCheck = validateMissionProgressNote(req.body?.note);
      if (!noteCheck.ok) {
        return res.status(400).json({ error: noteCheck.error });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const userNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await recordMissionProgress({
        userId: user.id,
        userNick,
        missionCode: code,
        note: noteCheck.note,
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result.overview);
    } catch (error: any) {
      console.error("POST /api/community/missions/:code/progress failed:", error);
      res.status(500).json({ error: "No se pudo actualizar el progreso de la misión." });
    }
  });

  app.post("/api/community/missions/:code/claim", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para reclamar tu recompensa." });

      const code = String(req.params.code || "").trim().toLowerCase();
      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const userNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await claimMissionReward({
        userId: user.id,
        userNick,
        missionCode: code,
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ xpAwarded: result.xpAwarded, ...result.overview });
    } catch (error: any) {
      console.error("POST /api/community/missions/:code/claim failed:", error);
      res.status(500).json({ error: "No se pudo reclamar el XP de la misión." });
    }
  });

  // ---------------- Comunidad · Fase 4: Encuestas Oficiales y Pick'em ----------------
  app.get("/api/community/voting", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      let viewerUserId: number | null = null;
      const viewerIsModerator = isCommunityModerator(req.user?.email);
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const overview = await getVotingOverview({ viewerUserId, viewerIsModerator });
      res.json(overview);
    } catch (error: any) {
      console.error("GET /api/community/voting failed:", error);
      res.status(500).json({ error: "No se pudieron cargar las votaciones oficiales." });
    }
  });

  app.post("/api/community/polls/:id/vote", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para votar en encuestas oficiales." });

      const pollId = String(req.params.id || "").trim();
      const optionId = String(req.body?.optionId || "").trim();
      if (!pollId || !optionId) {
        return res.status(400).json({ error: "Selecciona una opción válida para votar." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const userNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await castPollVote({
        pollId,
        optionId,
        userId: user.id,
        userNick,
        viewerIsModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result.overview);
    } catch (error: any) {
      console.error("POST /api/community/polls/:id/vote failed:", error);
      res.status(500).json({ error: "No se pudo registrar tu voto." });
    }
  });

  app.post("/api/community/polls", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden crear encuestas oficiales." });
      }

      const validation = validateCustomPollDraft({
        title: req.body?.title,
        description: req.body?.description,
        kind: req.body?.kind,
        gameSlug: req.body?.gameSlug,
        closesInDays: req.body?.closesInDays,
        options: req.body?.options,
      });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);

      const result = await createCustomPoll({
        userId: user.id,
        draft: validation.data,
        viewerIsModerator: true,
      });
      res.status(201).json(result.overview);
    } catch (error: any) {
      console.error("POST /api/community/polls failed:", error);
      res.status(500).json({ error: "No se pudo crear la encuesta oficial." });
    }
  });

  app.patch("/api/community/polls/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden gestionar encuestas." });
      }

      const pollId = String(req.params.id || "").trim();
      const rawStatus = String(req.body?.status || "").trim().toLowerCase();
      if (rawStatus !== "open" && rawStatus !== "closed") {
        return res.status(400).json({ error: "Estado inválido. Usa 'open' o 'closed'." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await updatePollStatus({
        pollId,
        status: rawStatus,
        viewerUserId: user.id,
        viewerIsModerator: true,
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result.overview);
    } catch (error: any) {
      console.error("PATCH /api/community/polls/:id failed:", error);
      res.status(500).json({ error: "No se pudo actualizar el estado de la encuesta." });
    }
  });

  app.post("/api/community/pickem/:matchId/predict", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para participar en el Pick'em." });

      const matchId = String(req.params.matchId || "").trim();
      const pickedTeamId = String(req.body?.pickedTeamId || "").trim();
      if (!matchId || !pickedTeamId) {
        return res.status(400).json({ error: "Selecciona un equipo ganador para tu predicción." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const userNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await submitPickemPrediction({
        matchId,
        pickedTeamId,
        userId: user.id,
        userNick,
        viewerIsModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result.overview);
    } catch (error: any) {
      console.error("POST /api/community/pickem/:matchId/predict failed:", error);
      res.status(500).json({ error: "No se pudo guardar tu predicción." });
    }
  });

  app.patch("/api/community/pickem/:matchId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden resolver series Pick'em." });
      }

      const matchId = String(req.params.matchId || "").trim();
      const winnerId =
        req.body?.winnerId === null
          ? null
          : typeof req.body?.winnerId === "string"
            ? req.body.winnerId.trim()
            : undefined;
      const locked = typeof req.body?.locked === "boolean" ? req.body.locked : undefined;

      if (winnerId === undefined && locked === undefined) {
        return res.status(400).json({ error: "Indica un ganador oficial o el estado de bloqueo." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await resolvePickemMatch({
        matchId,
        winnerId,
        locked,
        viewerUserId: user.id,
        viewerIsModerator: true,
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result.overview);
    } catch (error: any) {
      console.error("PATCH /api/community/pickem/:matchId failed:", error);
      res.status(500).json({ error: "No se pudo actualizar la serie Pick'em." });
    }
  });

  // ---------------- Comunidad · Fase 5: Eventos y Showmatches (RSVP) ----------------
  app.get("/api/community/events", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      let viewerUserId: number | null = null;
      const viewerIsModerator = isCommunityModerator(req.user?.email);
      if (req.user?.uid) {
        const viewer = await resolveCommunityUser(
          req.user.uid,
          req.user.email || `${req.user.uid}@users.vants.cc`,
          req.user.name ?? null,
          req.user.picture ?? null,
        );
        viewerUserId = viewer.id;
      }

      const overview = await getEventsOverview({ viewerUserId, viewerIsModerator });
      res.json(overview);
    } catch (error: any) {
      console.error("GET /api/community/events failed:", error);
      res.status(500).json({ error: "No se pudieron cargar los eventos y showmatches." });
    }
  });

  app.post("/api/community/events/:id/rsvp", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para confirmar tu asistencia." });

      const eventId = String(req.params.id || "").trim();
      if (!eventId) return res.status(400).json({ error: "ID de evento inválido." });

      const noteCheck = validateRsvpRoleNote(req.body?.roleNote);
      if (!noteCheck.ok) return res.status(400).json({ error: noteCheck.error });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const userNick =
        (user.displayName || req.user?.name || email.split("@")[0] || "Jugador").trim().slice(0, 60);

      const result = await upsertEventRsvp({
        eventId,
        userId: user.id,
        userNick,
        roleNote: noteCheck.roleNote,
        viewerIsModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ rsvpStatus: result.status, ...result.overview });
    } catch (error: any) {
      console.error("POST /api/community/events/:id/rsvp failed:", error);
      res.status(500).json({ error: "No se pudo confirmar tu inscripción." });
    }
  });

  app.delete("/api/community/events/:id/rsvp", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para cancelar tu asistencia." });

      const eventId = String(req.params.id || "").trim();
      if (!eventId) return res.status(400).json({ error: "ID de evento inválido." });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);

      const result = await cancelEventRsvp({
        eventId,
        userId: user.id,
        viewerIsModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json(result.overview);
    } catch (error: any) {
      console.error("DELETE /api/community/events/:id/rsvp failed:", error);
      res.status(500).json({ error: "No se pudo cancelar tu inscripción." });
    }
  });

  app.post("/api/community/events/:id/checkin", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para realizar check-in." });

      const eventId = String(req.params.id || "").trim();
      if (!eventId) return res.status(400).json({ error: "ID de evento inválido." });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);

      const result = await toggleEventCheckIn({
        eventId,
        userId: user.id,
        viewerIsModerator: isCommunityModerator(req.user?.email),
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ checkedIn: result.checkedIn, ...result.overview });
    } catch (error: any) {
      console.error("POST /api/community/events/:id/checkin failed:", error);
      res.status(500).json({ error: "No se pudo actualizar tu check-in." });
    }
  });

  app.post("/api/community/events", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden crear eventos oficiales." });
      }

      const validation = validateEventDraft({
        title: req.body?.title,
        type: req.body?.type,
        gameSlug: req.body?.gameSlug,
        modality: req.body?.modality,
        location: req.body?.location,
        streamUrl: req.body?.streamUrl,
        description: req.body?.description,
        startsAt: req.body?.startsAt,
        endsAt: req.body?.endsAt,
        capacity: req.body?.capacity,
        featured: req.body?.featured,
      });
      if (!validation.ok) return res.status(400).json({ error: validation.error });

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const hostNick =
        (user.displayName || req.user?.name || "Organización VANTS").trim().slice(0, 60);

      const result = await createCommunityEvent({
        userId: user.id,
        hostNick,
        draft: validation.data,
      });
      res.status(201).json(result.overview);
    } catch (error: any) {
      console.error("POST /api/community/events failed:", error);
      res.status(500).json({ error: "No se pudo publicar el evento." });
    }
  });

  app.patch("/api/community/events/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Inicia sesión para continuar." });
      if (!isCommunityModerator(req.user?.email)) {
        return res.status(403).json({ error: "Solo administradores u owners pueden gestionar eventos." });
      }

      const eventId = String(req.params.id || "").trim();
      const rawStatus = String(req.body?.status || "").trim().toLowerCase();
      if (rawStatus !== "open" && rawStatus !== "closed" && rawStatus !== "cancelled") {
        return res.status(400).json({ error: "Estado inválido. Usa 'open', 'closed' o 'cancelled'." });
      }

      const email = req.user?.email || `${uid}@users.vants.cc`;
      const user = await resolveCommunityUser(uid, email, req.user?.name ?? null, req.user?.picture ?? null);
      const result = await updateCommunityEventStatus({
        eventId,
        status: rawStatus,
        viewerUserId: user.id,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json(result.overview);
    } catch (error: any) {
      console.error("PATCH /api/community/events/:id failed:", error);
      res.status(500).json({ error: "No se pudo actualizar el estado del evento." });
    }
  });

  // ---------------- Proxy hacia Workers de VANTS ----------------
  app.use("/fn", (req, res) => forward(req, res, FN_ORIGIN + "/fn" + req.url));
  app.use("/api", (req, res) => forward(req, res, API_ORIGIN + "/api" + req.url));
  return httpServer;
}
