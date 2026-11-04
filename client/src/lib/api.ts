/**
 * Cliente único de la API de Vantsgames (Cloudflare Worker + D1).
 * Las rutas son relativas: en Cloudflare las sirve el Worker de esta web
 * (worker/index.ts) y en el preview local las reenvía server/routes.ts.
 * Aquí no hay secretos: el token de sesión es del usuario y viaja como Bearer.
 */
const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

/** Origen público de la plataforma, para imágenes que la API devuelve con ruta relativa. */
export const ASSET_ORIGIN: string =
  (import.meta.env.VITE_ASSET_ORIGIN as string | undefined) ?? "https://vantscc-preview.vants.workers.dev";

/** En producción (mismo Worker que la API) las funciones se llaman directo a vants-functions (CORS abierto). */
const FN_ORIGIN: string = (import.meta.env.VITE_FN_ORIGIN as string | undefined) || "";

/** Worker vants-integraciones (FACEIT, directos Twitch/Kick, notificaciones). Rutas "/int/...". */
const INT_ORIGIN: string = (import.meta.env.VITE_INT_ORIGIN as string | undefined) || "https://vants-integraciones.vants.workers.dev";
function destino(path: string): string {
  if (path.startsWith("/int/")) return INT_ORIGIN + path.slice(4);
  return (FN_ORIGIN && path.startsWith("/fn/") ? FN_ORIGIN : API_BASE) + path;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(fn: (() => Promise<string | null>) | null) {
  tokenProvider = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth && tokenProvider) {
    const t = await tokenProvider();
    if (t) headers.authorization = "Bearer " + t;
  }
  let r: Response;
  try {
    r = await fetch(destino(path), {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "red_no_disponible");
  }
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok || (data && data.ok === false)) {
    const e = data && (data.error || data.motivo);
    throw new ApiError(r.status, (typeof e === "string" ? e : e && e.message) || "error_" + r.status);
  }
  return data as T;
}

/** Envío multipart (subida de vídeos) con la sesión del usuario. */
export async function apiForm<T = any>(path: string, form: FormData, method = "POST"): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (tokenProvider) { const t = await tokenProvider(); if (t) headers.authorization = "Bearer " + t; }
  let r: Response;
  try { r = await fetch(destino(path), { method, headers, body: form }); } catch { throw new ApiError(0, "red_no_disponible"); }
  let data: any = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok || (data && data.ok === false)) {
    const e = data && (data.error || data.motivo);
    throw new ApiError(r.status, (typeof e === "string" ? e : e && e.message) || "error_" + r.status);
  }
  return data as T;
}

export function assetUrl(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return ASSET_ORIGIN.replace(/\/$/, "") + (u.startsWith("/") ? u : "/" + u);
}

/* ---------- Tipos (espejo de los serializadores del Worker de Vantsgames) ---------- */
export interface GameRef { slug: string; nombre: string }
export interface Paged<T> { pag: number; porPagina?: number; total: number; items: T[] }

/** torneoPublico() */
export interface Tournament {
  slug: string; nombre: string; descripcion: string | null; game: GameRef;
  estado: string; major: boolean; region: string | null; location_type: string | null;
  prize: { value: number; currency: string } | null; fee: number; max_teams: number | null;
  starts_at: string | null; ends_at: string | null; logo_url: string | null; formato: string | null;
  is_demo: boolean;
}
/** matchPublico() */
export interface Match {
  game: GameRef; tournament_slug: string | null; equipos: { a: string; b: string };
  score: { a: number; b: number } | null; estado: string; best_of: number | null;
  empieza_at: string | null; is_demo: boolean;
}
/** equipoPublico() (listado: game es slug; ficha: game es objeto + plantilla + partidas) */
export interface Team {
  slug: string; nombre: string; tag: string | null; game: string | GameRef; region: string | null;
  logo_url: string | null; is_demo: boolean; plantilla?: PtPlayer[]; partidas?: Match[];
}
/** jugadorPublicoPt() */
export interface PtPlayer {
  slug: string; nombre: string; game: GameRef | null; team_slug: string | null; rol: string | null;
  pais: string | null; bio: string | null; is_demo: boolean;
}
/** playerPublico() (cuentas de la plataforma) */
export interface AccountPlayer { id: string; role: string | null; display_name?: string; nombre?: string; rating?: number; region?: string; is_demo: boolean }
/** articuloPublico() */
export interface Article { slug: string; titulo: string; resumen: string | null; autor: string | null; game: string | null; publicado_at: string | null; cuerpo?: string | null; is_demo: boolean }
export interface Badge { code: string; name: string; description: string; requirement: string; category: string; rarity: string; color: string; image: { master: string; webp: string } }
export interface YtVideo { id: string; titulo: string; fecha: string; mini: string }
export interface Stream { canal: string; canalNombre: string; perfil: string; titulo: string; juego: string; vistas: number; inicio: string; idioma: string; mini: string }
export interface Creator { canal: string; enVivo: boolean; deD1: boolean; perfil: string }

/** Ruta a un archivo de /public que funciona con base "./" (preview) y "/" (Cloudflare). */
export const pub = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, "");
