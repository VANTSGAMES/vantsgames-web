// client/src/lib/googleWorkspace.ts
// Google Workspace unificado en 1 solo inicio de sesión (cero scopes sensibles/restringidos).
// Scopes activos: openid, email, profile, https://www.googleapis.com/auth/drive.file
import { classifyGoogleOAuthError, type AuthErrorDetail } from "./googleOAuthErrors";
import { AUTH_ENABLED } from "./auth";
import { getAuthToken } from "./api";

export type { AuthErrorDetail };

const INT_ORIGIN: string = (
  (import.meta.env.VITE_INT_ORIGIN as string | undefined) || "https://int.vants.cc"
).replace(/\/$/, "");

function resolveProUrl(path: string): string {
  if (AUTH_ENABLED && path.startsWith("/api/pro/")) {
    return INT_ORIGIN + path.slice(4);
  }
  return path;
}

export interface WorkspaceUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

export class GoogleAuthClientError extends Error {
  code: string;
  detail: AuthErrorDetail;

  constructor(detail: AuthErrorDetail) {
    super(detail.description);
    this.name = "GoogleAuthClientError";
    this.code = detail.code;
    this.detail = detail;
  }
}

export const GOOGLE_CLOUD_PROJECT_ID =
  (import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_ID as string) || "semiotic-ion-508913-r1";

export const GOOGLE_CLOUD_PROJECT_NUMBER =
  (import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER as string) || "238603325169";

const GOOGLE_OAUTH_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string) ||
  "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com";

/** Scopes únicos no sensibles (elimina por completo la pantalla "Aplicación no verificada"). */
export const GOOGLE_UNIFIED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export const WORKSPACE_SCOPES = ["https://www.googleapis.com/auth/drive.file"] as const;

export interface WorkspaceServiceDefinition {
  id: "drive" | "sheets" | "calendar" | "forms";
  name: string;
  requiredScopes: readonly string[];
  description: string;
}

export const WORKSPACE_SERVICES: readonly WorkspaceServiceDefinition[] = [
  {
    id: "drive",
    name: "Google Drive (drive.file)",
    requiredScopes: ["https://www.googleapis.com/auth/drive.file"],
    description: "Adjunta y guarda archivos creados con VANTS sin acceso al resto de tu Drive.",
  },
  {
    id: "sheets",
    name: "Exportación a Google Sheets",
    requiredScopes: ["https://www.googleapis.com/auth/drive.file"],
    description: "Crea hojas nativas de Google Sheets en 1 clic desde formularios de VANTS.",
  },
  {
    id: "calendar",
    name: "Google Calendar (enlaces directos)",
    requiredScopes: [],
    description: "Agrega torneos, check-in y scrims a tu Calendar sin permisos OAuth adicionales.",
  },
  {
    id: "forms",
    name: "Formularios Nativos VANTS",
    requiredScopes: [],
    description: "Inscripciones, solicitudes Workspace/Empresas y soporte guardados en D1.",
  },
] as const;

// Token efímero únicamente en memoria (nunca localStorage ni sessionStorage).
let cachedAccessToken: string | null = null;
let cachedTokenExpMs = 0;
let currentUser: WorkspaceUser | null = null;

type AuthListener = (user: WorkspaceUser | null, hasDriveToken: boolean) => void;
const listeners = new Set<AuthListener>();

function notifyListeners() {
  const valid = Boolean(cachedAccessToken && (cachedTokenExpMs === 0 || cachedTokenExpMs > Date.now() + 10_000));
  listeners.forEach((listener) => {
    listener(currentUser, valid);
  });
}

function getCurrentHostname(): string {
  try {
    return window.location.hostname || "";
  } catch {
    return "";
  }
}

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gsiScriptPromise: Promise<void> | null = null;
function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing && window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        gsiScriptPromise = null;
        reject(
          new GoogleAuthClientError(
            classifyGoogleOAuthError("gsi_script_blocked", "", getCurrentHostname()),
          ),
        );
      }
    };
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(
        new GoogleAuthClientError(
          classifyGoogleOAuthError("gsi_script_blocked", "", getCurrentHostname()),
        ),
      );
    };
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

/**
 * Obtiene el token `drive.file` ya concedido durante el inicio de sesión único de Google
 * (sin pedir un segundo login). Si caducó o el usuario entró por código de correo, puede
 * renovarlo bajo demanda usando únicamente `openid email profile drive.file`.
 */
export async function hydrateUnifiedGoogleDriveToken(): Promise<string | null> {
  if (cachedAccessToken && cachedTokenExpMs > Date.now() + 15_000) {
    return cachedAccessToken;
  }
  const vantsJwt = await getAuthToken().catch(() => null);
  if (!vantsJwt) return null;
  try {
    const res = await fetch("/auth/google/drive-token", {
      headers: { Authorization: `Bearer ${vantsJwt}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      available?: boolean;
      access_token?: string;
      expires_at?: number;
    } | null;
    if (data?.ok && data.available && data.access_token) {
      cachedAccessToken = data.access_token;
      cachedTokenExpMs = Number(data.expires_at || Date.now() + 30 * 60_000);
      notifyListeners();
      return cachedAccessToken;
    }
  } catch {
    // Fallback limpio si no hay token en sesión
  }
  return null;
}

/** Renueva el permiso no sensible `drive.file` en memoria solo si el token único ya caducó. */
export async function ensureDriveFileAccessToken(): Promise<string> {
  const fromSession = await hydrateUnifiedGoogleDriveToken();
  if (fromSession) return fromSession;

  await loadGoogleIdentityServices();
  const token = await new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_UNIFIED_SCOPES.join(" "),
        include_granted_scopes: true,
        prompt: "select_account",
        callback: (response: { access_token?: string; error?: string; error_description?: string }) => {
          if (response.error || !response.access_token) {
            reject(
              new GoogleAuthClientError(
                classifyGoogleOAuthError(
                  response.error || "unknown",
                  response.error_description || "",
                  getCurrentHostname(),
                ),
              ),
            );
            return;
          }
          resolve(response.access_token);
        },
        error_callback: (err: { type?: string; message?: string }) => {
          reject(
            new GoogleAuthClientError(
              classifyGoogleOAuthError(
                err?.type || "unknown",
                err?.message || "",
                getCurrentHostname(),
              ),
            ),
          );
        },
      });
      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (err: any) {
      reject(
        new GoogleAuthClientError(
          classifyGoogleOAuthError("unknown", err?.message || "", getCurrentHostname()),
        ),
      );
    }
  });

  cachedAccessToken = token;
  cachedTokenExpMs = Date.now() + 50 * 60_000;
  notifyListeners();
  return token;
}

export function initWorkspaceAuth(
  onReady: (user: WorkspaceUser, hasDriveToken: boolean) => void,
  onSignedOut: () => void,
) {
  const listener: AuthListener = (user, hasToken) => {
    if (user) onReady(user, hasToken);
    else onSignedOut();
  };
  listeners.add(listener);
  listener(currentUser, Boolean(cachedAccessToken && cachedTokenExpMs > Date.now() + 10_000));
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentWorkspaceUser(): WorkspaceUser | null {
  return currentUser;
}

export function syncWorkspaceUserFromVants(user: WorkspaceUser | null) {
  currentUser = user;
  if (!user) {
    cachedAccessToken = null;
    cachedTokenExpMs = 0;
  }
  notifyListeners();
}

/** Compatibilidad: usa los mismos 4 scopes no sensibles que el login único. */
export async function signInWithGoogleBasic(): Promise<{ user: WorkspaceUser; accessToken: string }> {
  const token = await ensureDriveFileAccessToken();
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  const user: WorkspaceUser = {
    uid: data.sub || "google-user",
    email: data.email || "",
    displayName: data.name || data.email || "Usuario Google",
    photoURL: data.picture || null,
  };
  currentUser = user;
  notifyListeners();
  return { user, accessToken: token };
}

export async function signInWithGoogleWorkspace() {
  return signInWithGoogleBasic();
}

export function getWorkspaceAccessToken(): string | null {
  if (cachedAccessToken && (cachedTokenExpMs === 0 || cachedTokenExpMs > Date.now() + 10_000)) {
    return cachedAccessToken;
  }
  return null;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  cachedTokenExpMs = 0;
  currentUser = null;
  notifyListeners();
}

/** Llamadas a /api/pro/* usando directamente el JWT de sesión única de VANTS. */
export async function proApi<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = (await getAuthToken().catch(() => null)) || getWorkspaceAccessToken();
  if (!token) {
    throw new Error("Inicia sesión en VANTS GAMES para sincronizar tu espacio Workspace.");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method: opts.method || "GET", headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(resolveProUrl(path), init);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !isJson) {
    throw new Error((data as any).error || (!isJson ? "Respuesta inválida del servidor Pro." : `Error ${res.status}`));
  }
  return data as T;
}

/* ---------------- Google Drive (solo drive.file) ---------------- */
export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function listDriveFiles(pageSize = 12): Promise<DriveFileItem[]> {
  const token = await ensureDriveFileAccessToken();
  const q = encodeURIComponent("trashed = false");
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&orderBy=modifiedTime%20desc&q=${q}&fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Drive HTTP ${res.status}`);
  }
  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files || [];
}

function csvCell(v: unknown): string {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Exporta filas de formularios nativos o inscritos directamente a una hoja nativa de
 * Google Sheets en el Drive del usuario usando EXCLUSIVAMENTE el scope no sensible `drive.file`.
 */
export async function exportarAGoogleSheetsConDriveFile(opts: {
  titulo: string;
  encabezados: string[];
  filas: Array<Array<string | number | null | undefined>>;
}): Promise<{ id: string; title: string; url: string }> {
  const token = await ensureDriveFileAccessToken();
  const csvLines = [
    opts.encabezados.map(csvCell).join(","),
    ...opts.filas.map((row) => row.map(csvCell).join(",")),
  ];
  const csvContent = "\uFEFF" + csvLines.join("\r\n");

  const boundary = "vants_sheets_boundary_" + Math.random().toString(36).slice(2, 10);
  const metadata = JSON.stringify({
    name: opts.titulo,
    mimeType: "application/vnd.google-apps.spreadsheet",
  });
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/csv; charset=UTF-8",
    "",
    csvContent,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    webViewLink?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || `No se pudo crear la hoja en Google Drive (HTTP ${res.status}).`);
  }
  return {
    id: data.id,
    title: data.name || opts.titulo,
    url: data.webViewLink || `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
  };
}

/**
 * Construye enlace directo "Agregar a Google Calendar" (action=TEMPLATE).
 * No requiere ningún scope OAuth de Google Calendar.
 */
export function buildGoogleCalendarLink(opts: {
  titulo: string;
  detalles?: string;
  ubicacion?: string;
  inicioIso?: string;
  duracionMin?: number;
}): string {
  const start = opts.inicioIso ? new Date(opts.inicioIso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const validStart = Number.isNaN(start.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000) : start;
  const end = new Date(validStart.getTime() + Math.max(15, opts.duracionMin || 120) * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.titulo.slice(0, 180),
    dates: `${fmt(validStart)}/${fmt(end)}`,
    details: (opts.detalles || "Evento oficial de VANTS GAMES (https://vants.cc).").slice(0, 1200),
    location: (opts.ubicacion || "https://vants.cc").slice(0, 240),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ---------------- Google Picker (solo archivos drive.file) ---------------- */
let pickerScriptPromise: Promise<void> | null = null;
function loadGooglePickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerScriptPromise) return pickerScriptPromise;
  pickerScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://apis.google.com/js/api.js"]');
    const loadPickerModule = () => {
      if (!window.gapi) {
        reject(new Error("No se cargó Google API Loader."));
        return;
      }
      window.gapi.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("No se pudo inicializar Google Picker.")),
      });
    };
    if (existing && window.gapi) {
      loadPickerModule();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = loadPickerModule;
    script.onerror = () => reject(new Error("No se pudo descargar Google Picker."));
    document.head.appendChild(script);
  });
  return pickerScriptPromise;
}

export async function openGooglePicker(): Promise<DriveFileItem | null> {
  const token = await ensureDriveFileAccessToken();
  await loadGooglePickerApi();

  return new Promise<DriveFileItem | null>((resolve) => {
    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.DOCS)
      .setOAuthToken(token)
      .setOrigin(pickerOrigin);

    if (typeof pickerBuilder.setAppId === "function" && GOOGLE_CLOUD_PROJECT_NUMBER) {
      pickerBuilder.setAppId(GOOGLE_CLOUD_PROJECT_NUMBER);
    }

    const picker = pickerBuilder
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
          const doc = data.docs[0];
          resolve({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType || "application/octet-stream",
            webViewLink: doc.url,
          });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
