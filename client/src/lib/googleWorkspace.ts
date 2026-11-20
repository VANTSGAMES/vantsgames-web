import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import firebaseConfig from "../../../firebase-applet-config.json";

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

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: "consent" });

// Strictly in-memory OAuth token cache (never localStorage or sessionStorage).
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initWorkspaceAuth(
  onReady: (user: User, hasWorkspaceToken: boolean) => void,
  onSignedOut: () => void,
) {
  return onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      onReady(user, Boolean(cachedAccessToken));
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onSignedOut();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("No se obtuvo el token de acceso de Google Workspace.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getWorkspaceAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  await signOut(firebaseAuth);
}

/** Helper para llamar a /api/pro/* en nuestro backend Express + Cloud SQL usando Firebase ID Token. */
export async function proApi<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Inicia sesión con Google para guardar en tu espacio Pro.");
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method: opts.method || "GET", headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).error || `Error ${res.status}`);
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
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

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
