import {
  classifyGoogleOAuthError,
  type AuthErrorDetail,
} from "./googleOAuthErrors";
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

export const WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.messages.readonly",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
] as const;

const BASIC_SCOPES = ["openid", "email", "profile"] as const;

// Strictly in-memory OAuth session cache (never localStorage or sessionStorage).
let cachedAccessToken: string | null = null;
let cachedHasWorkspaceScopes = false;
let currentUser: WorkspaceUser | null = null;

type AuthListener = (user: WorkspaceUser | null, hasWorkspaceToken: boolean) => void;
const listeners = new Set<AuthListener>();

function notifyListeners() {
  listeners.forEach((listener) => {
    listener(currentUser, Boolean(cachedAccessToken && cachedHasWorkspaceScopes));
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

async function fetchGoogleUserProfile(accessToken: string): Promise<WorkspaceUser> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new GoogleAuthClientError(
      classifyGoogleOAuthError(
        "userinfo_error",
        "No se pudo verificar tu perfil de Google tras la autorización.",
        getCurrentHostname(),
      ),
    );
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  if (!data.sub) {
    throw new GoogleAuthClientError(
      classifyGoogleOAuthError("userinfo_error", "Respuesta de perfil de Google incompleta.", getCurrentHostname()),
    );
  }
  return {
    uid: data.sub,
    email: data.email || "",
    displayName: data.name || data.email || "Usuario Google",
    photoURL: data.picture || null,
  };
}

async function requestGoogleOAuthToken(
  scopes: readonly string[],
  prompt: "consent" | "select_account",
  includesWorkspaceScopes: boolean,
): Promise<{ user: WorkspaceUser; accessToken: string }> {
  await loadGoogleIdentityServices();

  const token = await new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: scopes.join(" "),
        prompt,
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
      tokenClient.requestAccessToken({ prompt });
    } catch (err: any) {
      reject(
        new GoogleAuthClientError(
          classifyGoogleOAuthError("unknown", err?.message || "", getCurrentHostname()),
        ),
      );
    }
  });

  const user = await fetchGoogleUserProfile(token);
  cachedAccessToken = token;
  cachedHasWorkspaceScopes = includesWorkspaceScopes || cachedHasWorkspaceScopes;
  currentUser = user;
  notifyListeners();
  return { user, accessToken: token };
}

export function initWorkspaceAuth(
  onReady: (user: WorkspaceUser, hasWorkspaceToken: boolean) => void,
  onSignedOut: () => void,
) {
  const listener: AuthListener = (user, hasToken) => {
    if (user) {
      onReady(user, hasToken);
    } else {
      onSignedOut();
    }
  };
  listeners.add(listener);
  listener(currentUser, Boolean(cachedAccessToken && cachedHasWorkspaceScopes));
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentWorkspaceUser(): WorkspaceUser | null {
  return currentUser;
}

/** Inicio de sesión básico con Google Identity Services (perfil y correo únicamente). */
export async function signInWithGoogleBasic(): Promise<{ user: WorkspaceUser; accessToken: string }> {
  return requestGoogleOAuthToken(BASIC_SCOPES, "select_account", false);
}

/** Inicio de sesión directo con Google Identity Services + permisos OAuth de Google Workspace (token solo en memoria). */
export async function signInWithGoogleWorkspace(): Promise<{
  user: WorkspaceUser;
  accessToken: string;
}> {
  return requestGoogleOAuthToken([...BASIC_SCOPES, ...WORKSPACE_SCOPES], "consent", true);
}

export function getWorkspaceAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  cachedHasWorkspaceScopes = false;
  currentUser = null;
  notifyListeners();
  if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      try {
        window.google.accounts.oauth2.revoke(tokenToRevoke, () => resolve());
      } catch {
        resolve();
      }
    });
  }
}

/** Helper para llamar a /api/pro/* (Cloudflare D1 en producción / Express en desarrollo) con token de Google OAuth 2.0 o VANTS Identity. */
export async function proApi<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = cachedAccessToken || (await getAuthToken());
  if (!token) {
    throw new Error("Inicia sesión con Google para guardar en tu espacio Pro.");
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

/** Helper genérico para llamadas autenticadas a APIs de Google Workspace desde el cliente. */
async function gFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getWorkspaceAccessToken();
  if (!token) {
    throw new Error("Conecta tu cuenta de Google Workspace para autorizar esta acción.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || `Google API HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

/* ---------------- Google Drive ---------------- */
export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function listDriveFiles(pageSize = 12): Promise<DriveFileItem[]> {
  const q = encodeURIComponent("trashed = false");
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)");
  const data = await gFetch<{ files?: DriveFileItem[] }>(
    `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&orderBy=modifiedTime%20desc&q=${q}&fields=${fields}`,
  );
  return data.files || [];
}

/* ---------------- Google Picker (client-side widget, sin developer key) ---------------- */
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
  const token = getWorkspaceAccessToken();
  if (!token) throw new Error("Conecta tu cuenta de Google Workspace primero.");
  await loadGooglePickerApi();

  return new Promise<DriveFileItem | null>((resolve) => {
    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.DOCS)
      .setOAuthToken(token)
      .setOrigin(pickerOrigin)
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

/* ---------------- Google Docs ---------------- */
export async function createTournamentRulebookDoc(title: string, gameLabel: string) {
  const doc = await gFetch<{ documentId: string; title: string }>(
    "https://docs.googleapis.com/v1/documents",
    {
      method: "POST",
      body: JSON.stringify({ title }),
    },
  );
  const template = [
    `${title}\n`,
    `Circuito VANTS GAMES · Juego: ${gameLabel}\n\n`,
    "1. FORMATO DEL TORNEO\n- Eliminación directa / Doble eliminación\n- Check-in obligatorio 30 minutos antes del inicio\n\n",
    "2. REGLAS DE PARTIDA\n- Captura de marcador obligatoria para ambos capitanes\n- Uso estricto de anticheat oficial y cuentas verificadas en VANTS\n\n",
    "3. CONDUCTA Y PREMIOS\n- Cero tolerancia a trampas o suplantación\n- Distribución de premios tras validación del bracket\n",
  ].join("");

  await gFetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: template } }],
    }),
  });

  return {
    id: doc.documentId,
    title: doc.title,
    url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
  };
}

/* ---------------- Google Sheets ---------------- */
export async function createTournamentStandingsSheet(title: string, gameLabel: string) {
  const sheet = await gFetch<{ spreadsheetId: string; spreadsheetUrl: string }>(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: "Inscritos" } },
          { properties: { title: "Resultados" } },
        ],
      }),
    },
  );

  await gFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/Inscritos!A1:F2?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        values: [
          ["Seed", "Equipo", "Tag", "Capitán", "Juego", "Estado"],
          ["1", "Pendiente de inscripción", "VNTS", "Por definir", gameLabel, "Confirmado"],
        ],
      }),
    },
  );

  return {
    id: sheet.spreadsheetId,
    title,
    url: sheet.spreadsheetUrl,
  };
}

/* ---------------- Google Slides ---------------- */
export async function createTeamSponsorDeck(title: string) {
  const deck = await gFetch<{ presentationId: string; title: string }>(
    "https://slides.googleapis.com/v1/presentations",
    {
      method: "POST",
      body: JSON.stringify({ title }),
    },
  );
  return {
    id: deck.presentationId,
    title: deck.title || title,
    url: `https://docs.google.com/presentation/d/${deck.presentationId}/edit`,
  };
}

/* ---------------- Google Forms ---------------- */
export async function createRegistrationForm(title: string, gameLabel: string) {
  const form = await gFetch<{ formId: string; responderUri: string }>(
    "https://forms.googleapis.com/v1/forms",
    {
      method: "POST",
      body: JSON.stringify({
        info: {
          title,
          documentTitle: title,
        },
      }),
    },
  );

  await gFetch(`https://forms.googleapis.com/v1/forms/${form.formId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateFormInfo: {
            info: {
              description: `Formulario oficial de registro para ${gameLabel} en el circuito VANTS GAMES.`,
            },
            updateMask: "description",
          },
        },
        {
          createItem: {
            item: {
              title: "Nombre del equipo y Tag (2-4 caracteres)",
              questionItem: { question: { required: true, textQuestion: {} } },
            },
            location: { index: 0 },
          },
        },
        {
          createItem: {
            item: {
              title: "Nick del capitán y cuenta verificada (Riot / FACEIT / Discord)",
              questionItem: { question: { required: true, textQuestion: {} } },
            },
            location: { index: 1 },
          },
        },
      ],
    }),
  });

  return {
    id: form.formId,
    title,
    url: form.responderUri || `https://docs.google.com/forms/d/${form.formId}/edit`,
  };
}

/* ---------------- Google Meet ---------------- */
export async function createMeetBriefingRoom() {
  const space = await gFetch<{ name: string; meetingUri: string; meetingCode?: string }>(
    "https://meet.googleapis.com/v2/spaces",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return {
    id: space.name,
    code: space.meetingCode || "",
    url: space.meetingUri,
  };
}

/* ---------------- Google Calendar ---------------- */
export interface CalendarEventItem {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  description?: string;
}

export async function listUpcomingCalendarEvents(maxResults = 8): Promise<CalendarEventItem[]> {
  const timeMin = encodeURIComponent(new Date().toISOString());
  const data = await gFetch<{ items?: CalendarEventItem[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`,
  );
  return data.items || [];
}

export async function createCalendarScrimEvent(input: {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
}) {
  return gFetch<CalendarEventItem>(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso },
      }),
    },
  );
}

/* ---------------- Google Tasks ---------------- */
export interface GoogleTaskItem {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due?: string;
}

export async function listGoogleTasks(): Promise<GoogleTaskItem[]> {
  const data = await gFetch<{ items?: GoogleTaskItem[] }>(
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&maxResults=15",
  );
  return data.items || [];
}

export async function createGoogleTask(title: string, notes?: string) {
  return gFetch<GoogleTaskItem>(
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
    {
      method: "POST",
      body: JSON.stringify({ title, notes: notes || undefined }),
    },
  );
}

export async function toggleGoogleTask(task: GoogleTaskItem) {
  const nextStatus = task.status === "completed" ? "needsAction" : "completed";
  return gFetch<GoogleTaskItem>(
    `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${encodeURIComponent(task.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    },
  );
}

/* ---------------- Gmail ---------------- */
export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function listRecentGmailMessages(maxResults = 6): Promise<GmailMessageSummary[]> {
  const list = await gFetch<{ messages?: { id: string }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
  );
  const ids = (list.messages || []).slice(0, maxResults);
  const details = await Promise.all(
    ids.map((m) =>
      gFetch<any>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      ).catch(() => null),
    ),
  );
  return details
    .filter(Boolean)
    .map((d) => {
      const headers: { name: string; value: string }[] = d.payload?.headers || [];
      const h = (name: string) =>
        headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || "";
      return {
        id: d.id,
        subject: h("Subject") || "(Sin asunto)",
        from: h("From") || "Desconocido",
        date: h("Date") || "",
        snippet: d.snippet || "",
      };
    });
}

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailAnnouncement(to: string, subject: string, body: string) {
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");

  return gFetch<{ id: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encodeBase64Url(mime) }),
  });
}

/* ---------------- Google Chat ---------------- */
export interface ChatSpaceItem {
  name: string;
  displayName?: string;
  spaceType?: string;
}

export async function listGoogleChatSpaces(): Promise<ChatSpaceItem[]> {
  const data = await gFetch<{ spaces?: ChatSpaceItem[] }>(
    "https://chat.googleapis.com/v1/spaces?pageSize=12",
  );
  return data.spaces || [];
}

export async function sendGoogleChatMessage(spaceName: string, text: string) {
  return gFetch<{ name: string }>(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/* ---------------- YouTube Data API v3 (autorización incremental opcional) ---------------- */
// Solo los 2 scopes mínimos necesarios para leer tu canal y subir clips/Shorts;
// nunca se solicitan en el login principal (/auth/google/start).
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
] as const;

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl: string | null;
  thumbnail: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  uploadsPlaylistId: string | null;
}

export interface YouTubeVideoItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  publishedAt: string;
  url: string;
  isShort: boolean;
  durationSec: number | null;
  viewCount: number | null;
}

let cachedYouTubeToken: string | null = null;
let cachedYouTubeChannel: YouTubeChannelInfo | null = null;

export function getConnectedYouTubeChannel(): YouTubeChannelInfo | null {
  return cachedYouTubeChannel;
}

export function hasYouTubeAccessToken(): boolean {
  return Boolean(cachedYouTubeToken);
}

function parseIsoDurationSec(iso?: string): number | null {
  if (!iso) return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

async function ytFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!cachedYouTubeToken) {
    throw new Error("Conecta tu canal de YouTube para continuar.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${cachedYouTubeToken}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    if (res.status === 401) {
      cachedYouTubeToken = null;
      cachedYouTubeChannel = null;
    }
    const msg = json?.error?.message || `YouTube API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

/** Autorización incremental de YouTube (solo youtube.readonly + youtube.upload). */
export async function connectYouTubeChannel(): Promise<YouTubeChannelInfo> {
  await loadGoogleIdentityServices();

  const token = await new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: YOUTUBE_SCOPES.join(" "),
        include_granted_scopes: true,
        prompt: "consent",
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
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (err: any) {
      reject(
        new GoogleAuthClientError(
          classifyGoogleOAuthError("unknown", err?.message || "", getCurrentHostname()),
        ),
      );
    }
  });

  cachedYouTubeToken = token;
  const data = await ytFetch<{
    items?: Array<{
      id: string;
      snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
      statistics?: { subscriberCount?: string; videoCount?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true");

  const ch = data.items?.[0];
  if (!ch) {
    cachedYouTubeToken = null;
    cachedYouTubeChannel = null;
    throw new Error("Esta cuenta de Google no tiene un canal de YouTube activo.");
  }

  cachedYouTubeChannel = {
    id: ch.id,
    title: ch.snippet?.title || "Mi canal de YouTube",
    customUrl: ch.snippet?.customUrl || null,
    thumbnail: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || null,
    subscriberCount: ch.statistics?.subscriberCount != null ? Number(ch.statistics.subscriberCount) : null,
    videoCount: ch.statistics?.videoCount != null ? Number(ch.statistics.videoCount) : null,
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads || null,
  };
  return cachedYouTubeChannel;
}

export async function disconnectYouTubeChannel(): Promise<void> {
  const token = cachedYouTubeToken;
  cachedYouTubeToken = null;
  cachedYouTubeChannel = null;
  if (token && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      try {
        window.google.accounts.oauth2.revoke(token, () => resolve());
      } catch {
        resolve();
      }
    });
  }
}

export async function listMyYouTubeVideos(maxResults = 12): Promise<YouTubeVideoItem[]> {
  if (!cachedYouTubeChannel?.uploadsPlaylistId) return [];
  const pl = await ytFetch<{
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
        resourceId?: { videoId?: string };
      };
    }>;
  }>(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(
      cachedYouTubeChannel.uploadsPlaylistId,
    )}&maxResults=${Math.min(25, Math.max(1, maxResults))}`,
  );

  const rawItems = (pl.items || []).filter((it) => Boolean(it.snippet?.resourceId?.videoId));
  if (!rawItems.length) return [];

  const ids = rawItems.map((it) => it.snippet!.resourceId!.videoId!).join(",");
  const stats = await ytFetch<{
    items?: Array<{
      id: string;
      contentDetails?: { duration?: string };
      statistics?: { viewCount?: string };
    }>;
  }>(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${encodeURIComponent(ids)}`).catch(
    () => ({ items: [] }),
  );

  const byId = new Map((stats.items || []).map((v) => [v.id, v]));
  return rawItems.map((it) => {
    const sn = it.snippet!;
    const id = sn.resourceId!.videoId!;
    const st = byId.get(id);
    const dur = parseIsoDurationSec(st?.contentDetails?.duration);
    const title = sn.title || "Vídeo de YouTube";
    const isShort = (dur !== null && dur <= 61) || /#shorts?\b/i.test(title + " " + (sn.description || ""));
    return {
      id,
      title,
      description: sn.description || "",
      thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
      publishedAt: sn.publishedAt || new Date().toISOString(),
      url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      isShort,
      durationSec: dur,
      viewCount: st?.statistics?.viewCount != null ? Number(st.statistics.viewCount) : null,
    };
  });
}

export async function uploadVideoToYouTube(params: {
  file: File;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: "public" | "unlisted" | "private";
  isShort?: boolean;
}): Promise<{ id: string; url: string }> {
  if (!cachedYouTubeToken) {
    await connectYouTubeChannel();
  }
  const cleanTitle = params.title.trim().slice(0, 100) || "Clip VANTS GAMES #shorts";
  const metadata = {
    snippet: {
      title: cleanTitle,
      description: params.description.trim().slice(0, 4800),
      tags: (params.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 20),
      categoryId: "20", // Gaming
      defaultLanguage: "es",
    },
    status: {
      privacyStatus: params.privacyStatus || "unlisted",
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cachedYouTubeToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(params.file.size),
        "X-Upload-Content-Type": params.file.type || "video/mp4",
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!initRes.ok) {
    const errJson = await initRes.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `No se pudo iniciar la subida a YouTube (HTTP ${initRes.status}).`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube no devolvió la URL de carga resumable.");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": params.file.type || "video/mp4",
    },
    body: params.file,
  });
  const uploaded = (await putRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!putRes.ok || !uploaded.id) {
    throw new Error(uploaded?.error?.message || `Error al transferir el vídeo a YouTube (HTTP ${putRes.status}).`);
  }

  return {
    id: uploaded.id,
    url: params.isShort ? `https://www.youtube.com/shorts/${uploaded.id}` : `https://www.youtube.com/watch?v=${uploaded.id}`,
  };
}

