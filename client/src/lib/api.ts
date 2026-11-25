/**
 * Cliente único de la API de Vantsgames (Cloudflare Worker + D1).
 * En web (https://vants.cc) usa rutas relativas; dentro de la app nativa
 * Capacitor (Android / iOS / Tablet) apunta directamente a https://vants.cc,
 * https://int.vants.cc y https://fn.vants.cc para que todo funcione 100% in-app.
 */

/** Detecta si la app corre empaquetada de forma nativa (Android, iOS o Tablet vía Capacitor). */
export function esAppNativa(): boolean {
  if ((import.meta.env.VITE_NATIVE_APP as string | undefined) === "1") return true;
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "ionic:") return true;
  if (
    window.location.hostname === "localhost" &&
    proto === "https:" &&
    (window.location.port === "" || window.location.port === "443")
  ) {
    return true;
  }
  return false;
}

const PORT_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
const ENV_API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) || "").replace(/\/$/, "");

function resolverApiBase(): string {
  if (ENV_API_ORIGIN) return ENV_API_ORIGIN;
  if (esAppNativa()) return "https://vants.cc";
  return PORT_BASE;
}

/** Origen público de la plataforma, para imágenes que la API devuelve con ruta relativa. */
export const ASSET_ORIGIN: string =
  (import.meta.env.VITE_ASSET_ORIGIN as string | undefined) || "https://vants.cc";

/** En producción (mismo Worker que la API) las funciones se llaman directo a vants-functions (CORS abierto). */
const ENV_FN_ORIGIN: string = ((import.meta.env.VITE_FN_ORIGIN as string | undefined) || "").replace(/\/$/, "");

/** Worker vants-integraciones (FACEIT, directos Twitch/Kick, notificaciones, auth). Rutas "/int/...". */
export const INT_ORIGIN: string = (
  (import.meta.env.VITE_INT_ORIGIN as string | undefined) || "https://int.vants.cc"
).replace(/\/$/, "");

function destino(path: string): string {
  if (path.startsWith("/int/")) return INT_ORIGIN + path.slice(4);
  if (path.startsWith("/fn/")) {
    const fnBase = ENV_FN_ORIGIN || (esAppNativa() ? "https://fn.vants.cc" : resolverApiBase());
    return fnBase + path;
  }
  return resolverApiBase() + path;
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

type ProveedorToken = (opts?: { force?: boolean }) => Promise<string | null>;
let tokenProvider: ProveedorToken | null = null;
export function setTokenProvider(fn: ProveedorToken | null) {
  tokenProvider = fn;
}
export async function getAuthToken(): Promise<string | null> {
  return tokenProvider ? tokenProvider() : null;
}

async function pedir(path: string, headers: Record<string, string>, method: string, body?: BodyInit): Promise<Response> {
  try {
    return await fetch(destino(path), { method, headers, body });
  } catch {
    throw new ApiError(0, "red_no_disponible");
  }
}

/** Si el servidor responde 401 aun llevando token, el token local pudo vencerse o
 *  revocarse por adelantado (rotación de claves, cierre en otra pestaña): fuerza un
 *  refresh de sesión y reintenta una sola vez antes de fallar. */
async function pedirConSesion(path: string, headers: Record<string, string>, method: string, body?: BodyInit): Promise<Response> {
  let r = await pedir(path, headers, method, body);
  if (r.status === 401 && headers.authorization && tokenProvider) {
    const t = await tokenProvider({ force: true }).catch(() => null);
    if (t) r = await pedir(path, { ...headers, authorization: "Bearer " + t }, method, body);
  }
  return r;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth && tokenProvider) {
    const t = await tokenProvider();
    if (t) headers.authorization = "Bearer " + t;
  }
  const cuerpo = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const r = await pedirConSesion(path, headers, opts.method || "GET", cuerpo);
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
  const r = await pedirConSesion(path, headers, method, form);
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

/** Ruta a un archivo de /public que funciona con base "./" (app nativa / preview) y "/" (Cloudflare). */
export const pub = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, "");
