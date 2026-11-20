import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { User } from "firebase/auth";
import { PageHead, Empty, Skel } from "@/components/ui-vants";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useFeedback } from "@/components/FeedbackProvider";
import { JUEGOS, etiquetaJuego, opcionesJuegos } from "@/lib/juegos";
import { validateTacticalNote } from "@/lib/urlFilters";
import {
  FIREBASE_PROJECT_ID,
  createCalendarScrimEvent,
  createGoogleTask,
  createMeetBriefingRoom,
  createRegistrationForm,
  createTeamSponsorDeck,
  createTournamentRulebookDoc,
  createTournamentStandingsSheet,
  initWorkspaceAuth,
  listDriveFiles,
  listGoogleChatSpaces,
  listGoogleTasks,
  listRecentGmailMessages,
  listUpcomingCalendarEvents,
  openGooglePicker,
  proApi,
  sendGmailAnnouncement,
  sendGoogleChatMessage,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  toggleGoogleTask,
  type CalendarEventItem,
  type ChatSpaceItem,
  type DriveFileItem,
  type GmailMessageSummary,
  type GoogleTaskItem,
} from "@/lib/googleWorkspace";

type TabKey = "archivos" | "agenda" | "comunicaciones" | "notas";

interface TacticalNote {
  id: number;
  title: string;
  content: string;
  gameSlug: string | null;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceLink {
  id: number;
  service: string;
  resourceId: string;
  title: string;
  url: string | null;
  gameSlug: string | null;
  createdAt: string;
}

interface TournamentBookmark {
  id: number;
  tournamentSlug: string;
  tournamentName: string;
  gameSlug: string | null;
  notes: string | null;
  createdAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  drive: "Drive",
  docs: "Docs",
  sheets: "Sheets",
  slides: "Slides",
  forms: "Forms",
  calendar: "Calendar",
  meet: "Meet",
  tasks: "Tasks",
  gmail: "Gmail",
  chat: "Chat",
};

const WORKSPACE_SERVICES = [
  { name: "Google Drive & Picker", desc: "Adjunta y organiza reglamentos, brackets y demos de tu equipo." },
  { name: "Docs, Sheets & Slides", desc: "Genera reglamentos, hojas de resultados y decks para sponsors." },
  { name: "Calendar, Meet & Tasks", desc: "Programa scrims, abre salas de briefing y controla tu checklist." },
  { name: "Gmail, Forms & Chat", desc: "Envía convocatorias, abre registros de equipos y coordina espacios." },
];

export default function Workspace() {
  const { confirm, toast } = useFeedback();
  const [user, setUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [tab, setTab] = useState<TabKey>("archivos");
  const [selectedGame, setSelectedGame] = useState("valorant");

  // Cloud SQL backed state
  const [notes, setNotes] = useState<TacticalNote[]>([]);
  const [links, setLinks] = useState<WorkspaceLink[]>([]);
  const [bookmarks, setBookmarks] = useState<TournamentBookmark[]>([]);
  const [loadingPro, setLoadingPro] = useState(false);

  // Google Workspace live state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [emails, setEmails] = useState<GmailMessageSummary[]>([]);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceItem[]>([]);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Forms state
  const [templateTitle, setTemplateTitle] = useState("Torneo VANTS Apertura");
  const [scrimTitle, setScrimTitle] = useState("Scrim Oficial VANTS");
  const [scrimDate, setScrimDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("Convocatoria torneo VANTS GAMES");
  const [mailBody, setMailBody] = useState("Hola equipo, confirmamos horario y check-in 30 minutos antes del inicio.");
  const [chatSpace, setChatSpace] = useState("");
  const [chatText, setChatText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("estrategia");

  const loadProData = useCallback(async () => {
    setLoadingPro(true);
    try {
      const [notesRes, linksRes, bookmarksRes] = await Promise.all([
        proApi<{ notes: TacticalNote[] }>("/api/pro/notes"),
        proApi<{ links: WorkspaceLink[] }>("/api/pro/workspace-links"),
        proApi<{ bookmarks: TournamentBookmark[] }>("/api/pro/bookmarks"),
      ]);
      setNotes(notesRes.notes || []);
      setLinks(linksRes.links || []);
      setBookmarks(bookmarksRes.bookmarks || []);
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo sincronizar tu espacio", description: err.message });
    } finally {
      setLoadingPro(false);
    }
  }, [toast]);

  const loadWorkspaceTab = useCallback(
    async (activeTab: TabKey) => {
      if (!hasToken) return;
      setBusyAction("load-" + activeTab);
      try {
        if (activeTab === "archivos") {
          const files = await listDriveFiles(10);
          setDriveFiles(files);
        } else if (activeTab === "agenda") {
          const [ev, ts] = await Promise.all([
            listUpcomingCalendarEvents(8),
            listGoogleTasks(),
          ]);
          setEvents(ev);
          setTasks(ts);
        } else if (activeTab === "comunicaciones") {
          const msgs = await listRecentGmailMessages(6);
          setEmails(msgs);
          try {
            const spaces = await listGoogleChatSpaces();
            setChatSpaces(spaces);
            setChatNotice(null);
            if (spaces.length > 0 && !chatSpace) setChatSpace(spaces[0].name);
          } catch (chatErr: any) {
            setChatSpaces([]);
            if (chatErr.status === 404 || /not found/i.test(chatErr.message || "")) {
              setChatNotice(
                "Google Chat requiere una cuenta Business/Enterprise de Google Workspace y configurar la app de Chat en Google Cloud Console.",
              );
            } else {
              setChatNotice(chatErr.message || "Google Chat no está disponible para esta cuenta.");
            }
          }
        }
      } catch (err: any) {
        toast({ kind: "error", title: "Error al consultar Google Workspace", description: err.message });
      } finally {
        setBusyAction(null);
      }
    },
    [hasToken, chatSpace, toast],
  );

  useEffect(() => {
    const unsub = initWorkspaceAuth(
      (u, tokenPresent) => {
        setUser(u);
        setHasToken(tokenPresent);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setHasToken(false);
        setAuthReady(true);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user) {
      loadProData();
    } else {
      setNotes([]);
      setLinks([]);
      setBookmarks([]);
    }
  }, [user, loadProData]);

  useEffect(() => {
    if (user && hasToken && tab !== "notas") {
      loadWorkspaceTab(tab);
    }
  }, [user, hasToken, tab, loadWorkspaceTab]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const res = await signInWithGoogleWorkspace();
      setUser(res.user);
      setHasToken(true);
      await proApi("/api/pro/me").catch(() => null);
      toast({
        kind: "ok",
        title: "Google Workspace conectado",
        description: `Sesión activa como ${res.user.email || res.user.displayName}.`,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se completó el acceso con Google",
        description: err?.message || "Inténtalo de nuevo.",
      });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Cerrar sesión de Google Workspace",
      description: "Se limpiará el acceso en memoria de Google Workspace en esta pestaña.",
      confirmLabel: "Cerrar sesión",
      danger: false,
    });
    if (!ok) return;
    await signOutGoogleWorkspace();
    setDriveFiles([]);
    setEvents([]);
    setTasks([]);
    setEmails([]);
    setChatSpaces([]);
    toast({ kind: "info", title: "Sesión de Google cerrada" });
  };

  const persistWorkspaceLink = async (payload: {
    service: string;
    resourceId: string;
    title: string;
    url?: string;
  }) => {
    try {
      const res = await proApi<{ link: WorkspaceLink }>("/api/pro/workspace-links", {
        method: "POST",
        body: { ...payload, gameSlug: selectedGame },
      });
      setLinks((prev) => [res.link, ...prev]);
    } catch {
      // Silencioso: el archivo ya fue creado en Google Workspace.
    }
  };

  const handleOpenPicker = async () => {
    setBusyAction("picker");
    try {
      const picked = await openGooglePicker();
      if (!picked) return;
      await persistWorkspaceLink({
        service: "drive",
        resourceId: picked.id,
        title: picked.name,
        url: picked.webViewLink,
      });
      toast({ kind: "ok", title: "Archivo vinculado desde Drive", description: picked.name });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo abrir Google Picker", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateTemplate = async (kind: "docs" | "sheets" | "slides" | "forms") => {
    const title = templateTitle.trim() || "Torneo VANTS GAMES";
    const gameLabel = etiquetaJuego(selectedGame);
    const meta = {
      docs: { label: "Google Docs", action: "Crear reglamento en Google Docs" },
      sheets: { label: "Google Sheets", action: "Crear hoja de tabla e inscritos en Google Sheets" },
      slides: { label: "Google Slides", action: "Crear presentación de equipo/sponsor en Google Slides" },
      forms: { label: "Google Forms", action: "Crear formulario de inscripción en Google Forms" },
    }[kind];

    const ok = await confirm({
      title: meta.action,
      description: `Se creará un archivo nuevo directamente en tu cuenta de ${meta.label} y quedará registrado en tus recursos de VANTS.`,
      details: [`Título: ${title}`, `Juego: ${gameLabel}`],
      confirmLabel: "Crear archivo",
      danger: false,
    });
    if (!ok) return;

    setBusyAction("create-" + kind);
    try {
      let created: { id: string; title: string; url: string };
      if (kind === "docs") created = await createTournamentRulebookDoc(title, gameLabel);
      else if (kind === "sheets") created = await createTournamentStandingsSheet(title, gameLabel);
      else if (kind === "slides") created = await createTeamSponsorDeck(title);
      else created = await createRegistrationForm(title, gameLabel);

      await persistWorkspaceLink({
        service: kind,
        resourceId: created.id,
        title: created.title,
        url: created.url,
      });
      toast({
        kind: "ok",
        title: `${meta.label} creado`,
        description: `${created.title} listo y guardado en tus recursos.`,
      });
      loadWorkspaceTab("archivos");
    } catch (err: any) {
      toast({ kind: "error", title: `Error al crear en ${meta.label}`, description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateMeet = async () => {
    const ok = await confirm({
      title: "Crear sala de Google Meet",
      description: "Se generará un espacio de videollamada en Google Meet para briefing de equipo o arbitraje.",
      details: [`Juego asociado: ${etiquetaJuego(selectedGame)}`],
      confirmLabel: "Crear sala Meet",
      danger: false,
    });
    if (!ok) return;
    setBusyAction("meet");
    try {
      const room = await createMeetBriefingRoom();
      await persistWorkspaceLink({
        service: "meet",
        resourceId: room.id,
        title: `Briefing ${etiquetaJuego(selectedGame)}${room.code ? ` (${room.code})` : ""}`,
        url: room.url,
      });
      toast({ kind: "ok", title: "Sala de Google Meet lista", description: room.url });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo crear la sala Meet", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleScheduleScrim = async (e: FormEvent) => {
    e.preventDefault();
    const start = new Date(scrimDate);
    if (Number.isNaN(start.getTime())) {
      toast({ kind: "error", title: "Fecha inválida", description: "Elige una fecha y hora válidas." });
      return;
    }
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    const summary = scrimTitle.trim() || "Scrim VANTS GAMES";

    const ok = await confirm({
      title: "Agendar evento en Google Calendar",
      description: "Se creará un evento de 90 minutos en tu calendario principal de Google.",
      details: [
        `Evento: ${summary}`,
        `Juego: ${etiquetaJuego(selectedGame)}`,
        `Inicio: ${start.toLocaleString("es-VE")}`,
      ],
      confirmLabel: "Agendar evento",
      danger: false,
    });
    if (!ok) return;

    setBusyAction("calendar");
    try {
      const created = await createCalendarScrimEvent({
        summary: `[VANTS · ${etiquetaJuego(selectedGame)}] ${summary}`,
        description: `Organizado desde el Centro Workspace de VANTS GAMES.`,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
      });
      await persistWorkspaceLink({
        service: "calendar",
        resourceId: created.id,
        title: created.summary || summary,
        url: created.htmlLink,
      });
      toast({ kind: "ok", title: "Scrim agendado en Calendar", description: created.summary || summary });
      loadWorkspaceTab("agenda");
    } catch (err: any) {
      toast({ kind: "error", title: "Error al crear evento", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    const ok = await confirm({
      title: "Añadir tarea a Google Tasks",
      description: "Se agregará esta tarea a tu lista principal de Google Tasks.",
      details: [`Tarea: ${title}`],
      confirmLabel: "Añadir tarea",
      danger: false,
    });
    if (!ok) return;
    setBusyAction("task-create");
    try {
      const created = await createGoogleTask(title, `VANTS GAMES · ${etiquetaJuego(selectedGame)}`);
      setTasks((prev) => [created, ...prev]);
      setTaskTitle("");
      toast({ kind: "ok", title: "Tarea creada en Google Tasks" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo crear la tarea", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleTask = async (task: GoogleTaskItem) => {
    const nextAction = task.status === "completed" ? "reabrir" : "marcar como completada";
    const ok = await confirm({
      title: "Actualizar tarea en Google Tasks",
      description: `¿Deseas ${nextAction} la tarea «${task.title}»?`,
      confirmLabel: "Actualizar",
      danger: false,
    });
    if (!ok) return;
    setBusyAction("task-" + task.id);
    try {
      const updated = await toggleGoogleTask(task);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast({ kind: "ok", title: "Estado de tarea actualizado" });
    } catch (err: any) {
      toast({ kind: "error", title: "Error al actualizar tarea", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendEmail = async (e: FormEvent) => {
    e.preventDefault();
    const to = mailTo.trim();
    const subject = mailSubject.trim();
    const body = mailBody.trim();
    if (!to || !subject || !body) return;

    const ok = await confirm({
      title: "Enviar correo mediante Gmail",
      description: "Se enviará un correo real desde tu cuenta de Gmail al destinatario indicado.",
      details: [`Para: ${to}`, `Asunto: ${subject}`],
      confirmLabel: "Enviar correo",
      danger: true,
    });
    if (!ok) return;

    setBusyAction("gmail-send");
    try {
      await sendGmailAnnouncement(to, subject, body);
      toast({ kind: "ok", title: "Correo enviado", description: `Enviado a ${to}.` });
      setMailTo("");
      loadWorkspaceTab("comunicaciones");
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo enviar el correo", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatSpace || !chatText.trim()) return;
    const spaceObj = chatSpaces.find((s) => s.name === chatSpace);
    const ok = await confirm({
      title: "Publicar mensaje en Google Chat",
      description: "Se enviará un mensaje real en tu nombre al espacio seleccionado.",
      details: [`Espacio: ${spaceObj?.displayName || chatSpace}`, `Mensaje: ${chatText.trim()}`],
      confirmLabel: "Publicar mensaje",
      danger: true,
    });
    if (!ok) return;

    setBusyAction("chat-send");
    try {
      await sendGoogleChatMessage(chatSpace, chatText.trim());
      setChatText("");
      toast({ kind: "ok", title: "Mensaje publicado en Google Chat" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo enviar a Google Chat", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateNote = async (e: FormEvent) => {
    e.preventDefault();
    const valid = validateTacticalNote({ title: noteTitle, content: noteContent, gameSlug: selectedGame });
    if (!valid.ok) {
      toast({ kind: "error", title: "Revisa la nota", description: valid.error });
      return;
    }
    setBusyAction("note-create");
    try {
      const res = await proApi<{ note: TacticalNote }>("/api/pro/notes", {
        method: "POST",
        body: {
          title: valid.title,
          content: valid.content,
          gameSlug: valid.gameSlug || null,
          category: noteCategory,
        },
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteTitle("");
      setNoteContent("");
      toast({ kind: "ok", title: "Nota táctica guardada" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo guardar la nota", description: err.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteNote = async (note: TacticalNote) => {
    const ok = await confirm({
      title: "Eliminar nota táctica",
      description: `Se eliminará permanentemente «${note.title}». Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar nota",
      danger: true,
    });
    if (!ok) return;
    try {
      await proApi(`/api/pro/notes/${note.id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      toast({ kind: "ok", title: "Nota eliminada" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo eliminar la nota", description: err.message });
    }
  };

  const handleDeleteLink = async (link: WorkspaceLink) => {
    const ok = await confirm({
      title: "Quitar recurso guardado",
      description: `Se quitará «${link.title}» de tu lista en VANTS (el archivo original en Google permanece intacto).`,
      confirmLabel: "Quitar de la lista",
      danger: false,
    });
    if (!ok) return;
    try {
      await proApi(`/api/pro/workspace-links/${link.id}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast({ kind: "ok", title: "Recurso quitado de tu lista" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo quitar el recurso", description: err.message });
    }
  };

  const handleDeleteBookmark = async (bookmark: TournamentBookmark) => {
    const ok = await confirm({
      title: "Quitar torneo guardado",
      description: `Se quitará «${bookmark.tournamentName}» de tus torneos en seguimiento.`,
      confirmLabel: "Quitar",
      danger: false,
    });
    if (!ok) return;
    try {
      await proApi(`/api/pro/bookmarks/${bookmark.id}`, { method: "DELETE" });
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
      toast({ kind: "ok", title: "Torneo quitado de seguimiento" });
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo quitar el torneo", description: err.message });
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Operaciones Pro · Google Workspace"
        title={
          <>
            Centro <span style={{ color: "var(--rojo)" }}>Workspace</span>
          </>
        }
        lead="Gestiona torneos, scrims, convocatorias y playbooks de tu equipo directamente con Google Drive, Docs, Sheets, Slides, Calendar, Meet, Tasks, Gmail, Forms y Chat."
        actions={
          user ? (
            <div className="flex flex-wrap items-center gap-2">
              {!hasToken && (
                <GoogleSignInButton
                  onClick={handleSignIn}
                  disabled={signingIn}
                  label={signingIn ? "Conectando…" : "Reconectar Workspace"}
                />
              )}
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleSignOut}>
                Cerrar sesión Google
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="wrap grid gap-8">
        {!authReady ? (
          <Skel n={3} h={72} />
        ) : !user ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
            <div className="panel panel-pad chamfer grid gap-5" style={{ boxShadow: "inset 0 2px 0 var(--rojo)" }}>
              <div className="eyebrow">Acceso oficial con Google</div>
              <h2 className="d-2">Conecta tu cuenta de Google Workspace</h2>
              <p className="muted small" style={{ maxWidth: "56ch" }}>
                Autoriza el acceso desde tu navegador para crear reglamentos, tablas de resultados, formularios de inscripción, eventos de scrims y salas de Meet sin salir de VANTS GAMES. Cada acción de escritura o envío pide tu confirmación explícita antes de ejecutarse.
              </p>
              <div className="pt-1">
                <GoogleSignInButton
                  onClick={handleSignIn}
                  disabled={signingIn}
                  label={signingIn ? "Abriendo Google…" : "Sign in with Google"}
                />
              </div>
            </div>
            <div className="grid gap-px" style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}>
              {WORKSPACE_SERVICES.map((s) => (
                <div key={s.name} className="p-5" style={{ background: "var(--grafito-1)" }}>
                  <div className="d-3">{s.name}</div>
                  <p className="small muted mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="panel panel-pad flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    width={44}
                    height={44}
                    className="chamfer object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="font-semibold truncate">{user.displayName || user.email}</div>
                  <div className="small muted truncate">{user.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="field">
                  <label htmlFor="ws-game" className="sr-only">Juego activo</label>
                  <select
                    id="ws-game"
                    className="input h-10 text-sm"
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                    data-testid="workspace-game-select"
                  >
                    {opcionesJuegos().map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <span className={"tag " + (hasToken ? "tag-ok" : "tag-aviso")}>
                  {hasToken ? "Workspace autorizado" : "Sesión sin token activo"}
                </span>
              </div>
            </div>

            {!hasToken && (
              <div className="panel panel-pad flex flex-wrap items-center justify-between gap-4" style={{ borderColor: "rgba(245,192,68,.4)" }}>
                <p className="small muted">
                  Por seguridad, el token de Google Workspace vive solo en memoria. Vuelve a confirmar con Google para operar Drive, Calendar, Gmail, Docs, Sheets, Slides, Forms, Tasks, Meet y Chat.
                </p>
                <GoogleSignInButton onClick={handleSignIn} disabled={signingIn} label="Autorizar Workspace" />
              </div>
            )}

            <div className="tabs" role="tablist">
              {(
                [
                  ["archivos", "Archivos y Plantillas"],
                  ["agenda", "Agenda, Meet y Tasks"],
                  ["comunicaciones", "Gmail y Chat"],
                  ["notas", `Notas y Guardados (${notes.length + links.length + bookmarks.length})`],
                ] as [TabKey, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  data-testid={"ws-tab-" + k}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "archivos" && (
              <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] items-start">
                <div className="panel panel-pad grid gap-5">
                  <div>
                    <div className="eyebrow mb-2">Plantillas competitivas</div>
                    <h2 className="d-3">Crear documentos en Google Workspace</h2>
                    <p className="small muted mt-1">
                      Genera activos oficiales para {etiquetaJuego(selectedGame)} con estructura lista para torneos.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="tpl-title">Nombre del torneo o campaña</label>
                    <input
                      id="tpl-title"
                      className="input"
                      value={templateTitle}
                      onChange={(e) => setTemplateTitle(e.target.value)}
                      maxLength={120}
                      placeholder="Ej.: Copa VANTS VALORANT S1"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!hasToken || !!busyAction}
                      onClick={() => handleCreateTemplate("docs")}
                      data-testid="ws-create-docs"
                    >
                      {busyAction === "create-docs" ? "Creando…" : "Reglamento (Docs)"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!hasToken || !!busyAction}
                      onClick={() => handleCreateTemplate("sheets")}
                      data-testid="ws-create-sheets"
                    >
                      {busyAction === "create-sheets" ? "Creando…" : "Tabla e Inscritos (Sheets)"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!hasToken || !!busyAction}
                      onClick={() => handleCreateTemplate("slides")}
                      data-testid="ws-create-slides"
                    >
                      {busyAction === "create-slides" ? "Creando…" : "Deck Sponsor (Slides)"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!hasToken || !!busyAction}
                      onClick={() => handleCreateTemplate("forms")}
                      data-testid="ws-create-forms"
                    >
                      {busyAction === "create-forms" ? "Creando…" : "Registro Equipos (Forms)"}
                    </button>
                  </div>
                  <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--linea-suave)" }}>
                    <span className="small muted">¿Ya tienes un archivo en Drive? Selecciónalo con Google Picker.</span>
                    <button
                      type="button"
                      className="btn btn-rojo btn-sm"
                      disabled={!hasToken || !!busyAction}
                      onClick={handleOpenPicker}
                      data-testid="ws-open-picker"
                    >
                      {busyAction === "picker" ? "Abriendo…" : "Elegir con Google Picker"}
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--linea-suave)" }}>
                    <h2 className="d-3">Recientes en Google Drive</h2>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={!hasToken || busyAction === "load-archivos"}
                      onClick={() => loadWorkspaceTab("archivos")}
                    >
                      Actualizar
                    </button>
                  </div>
                  {busyAction === "load-archivos" ? (
                    <Skel n={4} h={46} />
                  ) : driveFiles.length === 0 ? (
                    <div className="p-4">
                      <Empty
                        code="drive · 0"
                        title="Sin archivos recientes"
                        text={hasToken ? "Crea una plantilla o selecciona un archivo con Google Picker." : "Autoriza Workspace para consultar tus archivos de Drive."}
                      />
                    </div>
                  ) : (
                    <div>
                      {driveFiles.map((f) => (
                        <div key={f.id} className="row grid-cols-[1fr_auto] items-center">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{f.name}</div>
                            <div className="text-xs muted num truncate">
                              {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("es-VE") : "Google Drive"}
                            </div>
                          </div>
                          {f.webViewLink && (
                            <a
                              href={f.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link-arrow text-xs"
                            >
                              Abrir ↗
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "agenda" && (
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <div className="grid gap-6">
                  <form onSubmit={handleScheduleScrim} className="panel panel-pad grid gap-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="eyebrow mb-1">Google Calendar + Meet</div>
                        <h2 className="d-3">Programar scrim o partido</h2>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!hasToken || !!busyAction}
                        onClick={handleCreateMeet}
                        data-testid="ws-create-meet"
                      >
                        {busyAction === "meet" ? "Creando…" : "+ Sala Meet instantánea"}
                      </button>
                    </div>
                    <div className="field">
                      <label htmlFor="scrim-title">Título del encuentro</label>
                      <input
                        id="scrim-title"
                        className="input"
                        required
                        value={scrimTitle}
                        onChange={(e) => setScrimTitle(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="scrim-date">Fecha y hora</label>
                      <input
                        id="scrim-date"
                        type="datetime-local"
                        className="input"
                        required
                        value={scrimDate}
                        onChange={(e) => setScrimDate(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-rojo w-fit"
                      disabled={!hasToken || !!busyAction}
                      data-testid="ws-schedule-scrim"
                    >
                      {busyAction === "calendar" ? "Agendando…" : "Agendar en Calendar"}
                    </button>
                  </form>

                  <div className="panel">
                    <div className="p-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
                      <h3 className="d-3">Próximos eventos</h3>
                    </div>
                    {events.length === 0 ? (
                      <div className="p-4">
                        <Empty code="calendar · 0" title="Sin eventos próximos" text="Agenda un scrim o recarga tu calendario." />
                      </div>
                    ) : (
                      events.map((ev) => (
                        <div key={ev.id} className="row grid-cols-[1fr_auto] items-center">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{ev.summary || "Sin título"}</div>
                            <div className="text-xs muted num">
                              {ev.start?.dateTime
                                ? new Date(ev.start.dateTime).toLocaleString("es-VE")
                                : ev.start?.date || "—"}
                            </div>
                          </div>
                          {ev.htmlLink && (
                            <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="link-arrow text-xs">
                              Ver ↗
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="panel panel-pad grid gap-4">
                  <div>
                    <div className="eyebrow mb-1">Google Tasks</div>
                    <h2 className="d-3">Checklist de torneo</h2>
                  </div>
                  <form onSubmit={handleCreateTask} className="flex gap-2">
                    <input
                      className="input grow"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Ej.: Confirmar map pool y árbitros"
                      disabled={!hasToken}
                    />
                    <button
                      type="submit"
                      className="btn btn-rojo btn-sm shrink-0"
                      disabled={!hasToken || !taskTitle.trim() || !!busyAction}
                    >
                      Añadir
                    </button>
                  </form>
                  {tasks.length === 0 ? (
                    <Empty code="tasks · 0" title="Sin tareas pendientes" text="Añade los pasos clave antes del check-in." />
                  ) : (
                    <div className="grid divide-y" style={{ borderColor: "var(--linea-suave)" }}>
                      {tasks.map((t) => (
                        <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                          <span
                            className="small"
                            style={{
                              textDecoration: t.status === "completed" ? "line-through" : undefined,
                              color: t.status === "completed" ? "var(--gris-3)" : "var(--blanco)",
                            }}
                          >
                            {t.title}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost shrink-0"
                            disabled={busyAction === "task-" + t.id}
                            onClick={() => handleToggleTask(t)}
                          >
                            {t.status === "completed" ? "Reabrir" : "Completar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "comunicaciones" && (
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <div className="grid gap-6">
                  <form onSubmit={handleSendEmail} className="panel panel-pad grid gap-4">
                    <div>
                      <div className="eyebrow mb-1">Gmail</div>
                      <h2 className="d-3">Enviar convocatoria por correo</h2>
                    </div>
                    <div className="field">
                      <label htmlFor="mail-to">Destinatario</label>
                      <input
                        id="mail-to"
                        type="email"
                        className="input"
                        required
                        value={mailTo}
                        onChange={(e) => setMailTo(e.target.value)}
                        placeholder="capitan@equipo.gg"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="mail-sub">Asunto</label>
                      <input
                        id="mail-sub"
                        className="input"
                        required
                        value={mailSubject}
                        onChange={(e) => setMailSubject(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="mail-body">Mensaje</label>
                      <textarea
                        id="mail-body"
                        className="input"
                        required
                        value={mailBody}
                        onChange={(e) => setMailBody(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-rojo w-fit"
                      disabled={!hasToken || !!busyAction}
                      data-testid="ws-send-gmail"
                    >
                      {busyAction === "gmail-send" ? "Enviando…" : "Enviar con Gmail"}
                    </button>
                  </form>

                  <div className="panel">
                    <div className="p-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
                      <h3 className="d-3">Bandeja reciente</h3>
                    </div>
                    {emails.length === 0 ? (
                      <div className="p-4">
                        <Empty code="gmail · 0" title="Sin mensajes recientes" />
                      </div>
                    ) : (
                      emails.map((m) => (
                        <div key={m.id} className="row grid-cols-1 gap-1">
                          <div className="font-semibold small truncate">{m.subject}</div>
                          <div className="text-xs muted truncate">{m.from}</div>
                          <p className="text-xs muted line-clamp-2">{m.snippet}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="panel panel-pad grid gap-4">
                  <div>
                    <div className="eyebrow mb-1">Google Chat</div>
                    <h2 className="d-3">Avisos en espacios de equipo</h2>
                  </div>
                  {chatNotice ? (
                    <div className="empty">
                      <span className="empty-code">google chat · requisito workspace</span>
                      <p className="small muted">{chatNotice}</p>
                      <a
                        href={`https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${FIREBASE_PROJECT_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-arrow"
                      >
                        Configurar Google Chat en Cloud Console ↗
                      </a>
                    </div>
                  ) : (
                    <form onSubmit={handleSendChat} className="grid gap-4">
                      <div className="field">
                        <label htmlFor="chat-space">Espacio</label>
                        <select
                          id="chat-space"
                          className="input"
                          value={chatSpace}
                          onChange={(e) => setChatSpace(e.target.value)}
                        >
                          {chatSpaces.length === 0 && <option value="">Sin espacios disponibles</option>}
                          {chatSpaces.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.displayName || s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="chat-msg">Mensaje para el espacio</label>
                        <textarea
                          id="chat-msg"
                          className="input"
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                          placeholder="Check-in abierto para cuartos de final."
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn btn-rojo w-fit"
                        disabled={!hasToken || !chatSpace || !chatText.trim() || !!busyAction}
                      >
                        Publicar en Chat
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {tab === "notas" && (
              <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr] items-start">
                <form onSubmit={handleCreateNote} className="panel panel-pad grid gap-4" data-testid="form-nota-tactica">
                  <div>
                    <div className="eyebrow mb-1">Playbook personal</div>
                    <h2 className="d-3">Nueva nota táctica</h2>
                    <p className="text-xs muted mt-1">
                      Guarda composiciones, calls de mapa y notas de scouting sincronizadas con tu cuenta (alternativa directa a Google Keep, que solo habilita API para dominios Enterprise).
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="note-title">Título</label>
                    <input
                      id="note-title"
                      className="input"
                      required
                      maxLength={140}
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Ej.: Defensa Ascent B + rotaciones"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="field">
                      <label htmlFor="note-cat">Categoría</label>
                      <select
                        id="note-cat"
                        className="input"
                        value={noteCategory}
                        onChange={(e) => setNoteCategory(e.target.value)}
                      >
                        <option value="estrategia">Estrategia</option>
                        <option value="scouting">Scouting rival</option>
                        <option value="reglas">Reglas / Check-in</option>
                        <option value="roster">Roster</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="note-game">Juego</label>
                      <select
                        id="note-game"
                        className="input"
                        value={selectedGame}
                        onChange={(e) => setSelectedGame(e.target.value)}
                      >
                        {JUEGOS.map((j) => (
                          <option key={j.slug} value={j.slug}>
                            {j.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="note-content">Contenido</label>
                    <textarea
                      id="note-content"
                      className="input"
                      required
                      maxLength={4000}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Detalla ejecuciones, bans de mapas o notas de la serie…"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-rojo w-fit"
                    disabled={busyAction === "note-create"}
                    data-testid="ws-save-note"
                  >
                    {busyAction === "note-create" ? "Guardando…" : "Guardar nota"}
                  </button>
                </form>

                <div className="grid gap-6">
                  <div className="panel">
                    <div className="p-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
                      <h3 className="d-3">Notas tácticas ({notes.length})</h3>
                    </div>
                    {loadingPro ? (
                      <Skel n={2} h={64} />
                    ) : notes.length === 0 ? (
                      <div className="p-4">
                        <Empty code="notas · 0" title="Aún no tienes notas tácticas" text="Crea tu primera nota de scouting o estrategia para tu equipo." />
                      </div>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="row grid-cols-[1fr_auto] items-start">
                          <div className="min-w-0 grid gap-1">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="font-semibold">{n.title}</span>
                              {n.gameSlug && <span className="tag">{etiquetaJuego(n.gameSlug)}</span>}
                              <span className="tag">{n.category}</span>
                            </div>
                            <p className="small muted whitespace-pre-wrap break-words">{n.content}</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleDeleteNote(n)}
                          >
                            Eliminar
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="panel">
                    <div className="p-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
                      <h3 className="d-3">Recursos de Google Workspace ({links.length})</h3>
                    </div>
                    {links.length === 0 ? (
                      <div className="p-4">
                        <Empty
                          code="recursos · 0"
                          title="Sin recursos vinculados todavía"
                          text="Los documentos, hojas, presentaciones, formularios, eventos y salas Meet que crees aparecerán aquí."
                        />
                      </div>
                    ) : (
                      links.map((l) => (
                        <div key={l.id} className="row grid-cols-[1fr_auto] items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="tag tag-rojo">{SERVICE_LABELS[l.service] || l.service}</span>
                              {l.gameSlug && <span className="tag">{etiquetaJuego(l.gameSlug)}</span>}
                              <span className="font-semibold truncate">{l.title}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {l.url && (
                              <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-arrow text-xs">
                                Abrir ↗
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => handleDeleteLink(l)}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="panel">
                    <div className="p-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
                      <h3 className="d-3">Torneos guardados ({bookmarks.length})</h3>
                    </div>
                    {bookmarks.length === 0 ? (
                      <div className="p-4">
                        <Empty
                          code="guardados · 0"
                          title="Sin torneos en seguimiento"
                          text="Usa «Guardar torneo» en la ficha de cualquier torneo para tenerlo a mano aquí."
                          action={<Link href="/torneos" className="link-arrow">Explorar torneos →</Link>}
                        />
                      </div>
                    ) : (
                      bookmarks.map((b) => (
                        <div key={b.id} className="row grid-cols-[1fr_auto] items-center">
                          <div className="min-w-0 flex flex-wrap items-center gap-2">
                            {b.gameSlug && <span className="tag">{etiquetaJuego(b.gameSlug)}</span>}
                            <Link href={"/torneos/" + b.tournamentSlug} className="font-semibold truncate hover:text-[var(--rojo)]">
                              {b.tournamentName}
                            </Link>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={"/torneos/" + b.tournamentSlug} className="link-arrow text-xs">
                              Ver →
                            </Link>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => handleDeleteBookmark(b)}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
