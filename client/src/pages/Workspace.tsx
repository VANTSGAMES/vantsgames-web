// client/src/pages/Workspace.tsx
// Centro Google Workspace VANTS GAMES (1 solo inicio de sesión, scopes 100% no sensibles:
// openid, email, profile, https://www.googleapis.com/auth/drive.file).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { PageHead, Empty, Skel } from "@/components/ui-vants";
import { FormulariosNativos } from "@/components/FormulariosNativos";
import { useFeedback } from "@/components/FeedbackProvider";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { opcionesJuegos } from "@/lib/juegos";
import { validateTacticalNote } from "@/lib/urlFilters";
import {
  GOOGLE_UNIFIED_SCOPES,
  WORKSPACE_SERVICES,
  buildGoogleCalendarLink,
  exportarAGoogleSheetsConDriveFile,
  hydrateUnifiedGoogleDriveToken,
  listDriveFiles,
  openGooglePicker,
  proApi,
  syncWorkspaceUserFromVants,
  type DriveFileItem,
} from "@/lib/googleWorkspace";

type TabKey = "envios" | "formularios" | "archivos" | "notas";

interface EnvioFormulario {
  id: string;
  tipo: string;
  nombre: string;
  email: string;
  juego: string | null;
  torneo_slug: string | null;
  organizacion: string | null;
  asunto: string | null;
  estado: string;
  calendar_url: string | null;
  creado_en: string;
}

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

export default function Workspace() {
  const { status, user, loginWithGoogle } = useAuth();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<TabKey>("envios");
  const [selectedGame, setSelectedGame] = useState("valorant");
  const [driveReady, setDriveReady] = useState(false);

  // Estado D1 (Workspace Pro + Formularios nativos)
  const [envios, setEnvios] = useState<EnvioFormulario[]>([]);
  const [esOwnerEnvios, setEsOwnerEnvios] = useState(false);
  const [notes, setNotes] = useState<TacticalNote[]>([]);
  const [links, setLinks] = useState<WorkspaceLink[]>([]);
  const [bookmarks, setBookmarks] = useState<TournamentBookmark[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null);

  // Generador de evento rápido para Google Calendar (cero OAuth)
  const [scrimTitle, setScrimTitle] = useState("Scrim Oficial VANTS");
  const [scrimDate, setScrimDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  // Notas tácticas
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("estrategia");

  const cargarTodo = useCallback(async () => {
    if (status !== "autenticado") return;
    setLoading(true);
    try {
      const [notesRes, linksRes, bookmarksRes, enviosRes, driveTok] = await Promise.all([
        proApi<{ notes: TacticalNote[] }>("/api/pro/notes").catch(() => ({ notes: [] })),
        proApi<{ links: WorkspaceLink[] }>("/api/pro/workspace-links").catch(() => ({ links: [] })),
        proApi<{ bookmarks: TournamentBookmark[] }>("/api/pro/bookmarks").catch(() => ({ bookmarks: [] })),
        api<{ ok: boolean; owner: boolean; envios: EnvioFormulario[] }>("/api/formularios/envios", { auth: true }).catch(() => ({ ok: false, owner: false, envios: [] })),
        hydrateUnifiedGoogleDriveToken(),
      ]);
      setNotes(notesRes.notes || []);
      setLinks(linksRes.links || []);
      setBookmarks(bookmarksRes.bookmarks || []);
      setEnvios(enviosRes.envios || []);
      setEsOwnerEnvios(Boolean(enviosRes.owner));
      setDriveReady(Boolean(driveTok));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === "autenticado" && user?.sub) {
      syncWorkspaceUserFromVants({
        uid: user.sub,
        email: user.email || "",
        displayName: user.name || user.nickname || "Jugador VANTS",
        photoURL: user.picture || null,
      });
      void cargarTodo();
    } else if (status === "anonimo") {
      syncWorkspaceUserFromVants(null);
    }
  }, [status, user, cargarTodo]);

  const exportarEnviosASheets = async () => {
    setBusyAction("export-sheets");
    try {
      const filas = envios.length
        ? envios.map((e) => [
            e.id,
            e.tipo,
            e.nombre,
            e.email,
            e.organizacion || "",
            e.juego || "",
            e.torneo_slug || "",
            e.asunto || "",
            e.estado,
            e.creado_en,
          ])
        : [["Ejemplo", "inscripcion_torneo", user?.name || "Capitán", user?.email || "", "Equipo VANTS", selectedGame, "copa-s4", "Inscripción", "recibido", new Date().toISOString()]];

      const sheet = await exportarAGoogleSheetsConDriveFile({
        titulo: `VANTS Formularios · ${new Date().toISOString().slice(0, 10)}`,
        encabezados: ["Referencia", "Tipo", "Nombre", "Correo", "Equipo / Organización", "Juego", "Torneo", "Asunto", "Estado", "Fecha UTC"],
        filas,
      });

      setDriveReady(true);
      setLastSheetUrl(sheet.url);
      await proApi("/api/pro/workspace-links", {
        method: "POST",
        body: {
          service: "sheets",
          resourceId: sheet.id,
          title: sheet.title,
          url: sheet.url,
          gameSlug: selectedGame,
        },
      }).catch(() => null);
      toast({ kind: "ok", title: "Exportado a Google Sheets", description: "Tu hoja quedó lista en Google Drive con drive.file." });
      void cargarTodo();
      window.open(sheet.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo exportar a Google Sheets", description: err?.message });
    } finally {
      setBusyAction(null);
    }
  };

  const cargarArchivosDrive = async () => {
    setBusyAction("drive-list");
    try {
      const files = await listDriveFiles(10);
      setDriveFiles(files);
      setDriveReady(true);
    } catch (err: any) {
      toast({ kind: "error", title: "Error al leer archivos de VANTS en Drive", description: err?.message });
    } finally {
      setBusyAction(null);
    }
  };

  const abrirPickerDrive = async () => {
    setBusyAction("picker");
    try {
      const picked = await openGooglePicker();
      if (!picked) return;
      await proApi("/api/pro/workspace-links", {
        method: "POST",
        body: {
          service: "drive",
          resourceId: picked.id,
          title: picked.name,
          url: picked.webViewLink || `https://drive.google.com/file/d/${picked.id}/view`,
          gameSlug: selectedGame,
        },
      });
      toast({ kind: "ok", title: "Archivo adjuntado a Workspace" });
      void cargarTodo();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo abrir Google Picker", description: err?.message });
    } finally {
      setBusyAction(null);
    }
  };

  const guardarNota = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateTacticalNote({ title: noteTitle, content: noteContent, gameSlug: selectedGame });
    if (!check.ok) {
      toast({ kind: "error", title: "Nota incompleta", description: check.error });
      return;
    }
    setBusyAction("save-note");
    try {
      await proApi("/api/pro/notes", {
        method: "POST",
        body: { title: noteTitle.trim(), content: noteContent.trim(), gameSlug: selectedGame, category: noteCategory },
      });
      setNoteTitle("");
      setNoteContent("");
      toast({ kind: "ok", title: "Nota táctica guardada" });
      void cargarTodo();
    } catch (err: any) {
      toast({ kind: "error", title: "Error al guardar nota", description: err?.message });
    } finally {
      setBusyAction(null);
    }
  };

  const borrarNota = async (id: number) => {
    await proApi(`/api/pro/notes/${id}`, { method: "DELETE" }).catch(() => null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const borrarLink = async (id: number) => {
    await proApi(`/api/pro/workspace-links/${id}`, { method: "DELETE" }).catch(() => null);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const borrarBookmark = async (id: number) => {
    await proApi(`/api/pro/bookmarks/${id}`, { method: "DELETE" }).catch(() => null);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const scrimCalendarUrl = buildGoogleCalendarLink({
    titulo: scrimTitle || "Scrim Oficial VANTS",
    detalles: `Sesión competitiva organizada desde Centro Workspace VANTS (${selectedGame}).`,
    ubicacion: "https://vants.cc/torneos",
    inicioIso: scrimDate ? new Date(scrimDate).toISOString() : undefined,
    duracionMin: 90,
  });

  return (
    <>
      <PageHead
        eyebrow="Centro Google Workspace · 1 solo inicio de sesión"
        title={<>Organiza torneos y equipos sin <span style={{ color: "var(--rojo)" }}>fricción</span></>}
        lead="Un solo inicio de sesión con Google (sin permisos sensibles ni pantalla de app no verificada): formularios nativos en D1, exportación en 1 clic a Google Sheets con drive.file, enlaces directos a Google Calendar y notas tácticas."
        actions={
          <button
            type="button"
            onClick={exportarEnviosASheets}
            disabled={busyAction === "export-sheets"}
            className="btn btn-rojo btn-sm"
            data-testid="btn-export-google-sheets"
          >
            {busyAction === "export-sheets" ? "Exportando…" : "📊 Exportar a Google Sheets (1 clic)"}
          </button>
        }
      />

      <div className="wrap grid gap-6 pb-14">
        {/* Resumen de sesión única y permisos no sensibles */}
        <div
          className="panel panel-pad grid gap-3 sm:grid-cols-[1fr_auto] items-center"
          style={{ background: "#111113", borderTop: "2px solid #ff0d2e" }}
          data-testid="workspace-single-login-banner"
        >
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag" style={{ background: "rgba(65,217,141,0.14)", color: "#41d98d", borderColor: "rgba(65,217,141,0.4)" }}>
                ✓ Sesión única activa
              </span>
              <span className="small font-semibold">{user?.name || user?.nickname || user?.email || "Jugador VANTS"}</span>
              {driveReady && (
                <span className="tag" style={{ background: "rgba(255,13,46,0.14)", color: "#ff6b7c" }}>
                  drive.file listo
                </span>
              )}
            </div>
            <p className="text-xs muted">
              Permisos activos (100% no sensibles):{" "}
              <code>{GOOGLE_UNIFIED_SCOPES.join(" · ")}</code>
            </p>
          </div>
          {!driveReady && (
            <button
              type="button"
              onClick={() => loginWithGoogle("/workspace")}
              className="btn btn-sm"
              data-testid="btn-workspace-google-sync"
            >
              Sincronizar con Google
            </button>
          )}
        </div>

        {/* Tarjetas rápidas de herramientas sin permisos sensibles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WORKSPACE_SERVICES.map((svc) => (
            <div key={svc.id} className="panel panel-pad grid gap-1.5" style={{ background: "#111113" }}>
              <div className="eyebrow" style={{ color: "#ff5468" }}>{svc.name}</div>
              <p className="small muted">{svc.description}</p>
            </div>
          ))}
        </div>

        {/* Pestañas de Workspace */}
        <div className="tabs" role="tablist">
          {[
            ["envios", `Formularios enviados (${envios.length})`],
            ["formularios", "Nuevo formulario nativo"],
            ["archivos", `Drive, Calendar y Guardados (${links.length + bookmarks.length})`],
            ["notas", `Notas tácticas (${notes.length})`],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k as TabKey)}
              data-testid={`workspace-tab-${k}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "envios" && (
          <div className="panel panel-pad grid gap-4" style={{ background: "#111113" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="d-3">Envíos registrados en D1 ({esOwnerEnvios ? "Vista organizador" : "Tus envíos"})</h2>
                <p className="small muted">Exporta todos los registros a una hoja nativa de Google Sheets usando únicamente <code>drive.file</code>.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {lastSheetUrl && (
                  <a href={lastSheetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                    Abrir último Sheet ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={exportarEnviosASheets}
                  disabled={busyAction === "export-sheets"}
                  className="btn btn-rojo btn-sm"
                >
                  {busyAction === "export-sheets" ? "Creando Sheet…" : "📊 Exportar a Google Sheets"}
                </button>
              </div>
            </div>

            {loading ? (
              <Skel n={3} />
            ) : envios.length === 0 ? (
              <Empty
                code="formularios · 0"
                title="Aún no hay envíos registrados"
                text="Completa un formulario nativo (inscripción, Workspace/Empresas o soporte) para verlo aquí y exportarlo a Google Sheets."
                action={
                  <button type="button" className="btn btn-rojo btn-sm" onClick={() => setTab("formularios")}>
                    Abrir formularios nativos
                  </button>
                }
              />
            ) : (
              <div className="grid gap-2">
                {envios.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3"
                    style={{ background: "#0a0a0b", border: "1px solid #26262c" }}
                  >
                    <div className="grid gap-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tag tag-rojo">{ev.tipo.replace(/_/g, " ")}</span>
                        <strong className="text-sm">{ev.organizacion || ev.nombre}</strong>
                        <span className="text-xs muted num">{ev.id}</span>
                      </div>
                      <div className="text-xs muted">
                        {ev.nombre} · {ev.email}
                        {ev.torneo_slug ? ` · Torneo: ${ev.torneo_slug}` : ""}
                        {ev.asunto ? ` · ${ev.asunto}` : ""}
                      </div>
                    </div>
                    {ev.calendar_url && (
                      <a
                        href={ev.calendar_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                      >
                        📅 Google Calendar
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "formularios" && (
          <FormulariosNativos onEnviado={() => void cargarTodo()} />
        )}

        {tab === "archivos" && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Google Calendar directo sin OAuth */}
            <div className="panel panel-pad grid gap-4 content-start" style={{ background: "#111113" }}>
              <div>
                <div className="eyebrow mb-1" style={{ color: "#ff5468" }}>Google Calendar · Cero permisos OAuth</div>
                <h2 className="d-3">Agendar scrim o torneo en 1 clic</h2>
              </div>
              <div className="grid gap-3">
                <div className="field">
                  <label htmlFor="ws-scrim-t">Título del evento</label>
                  <input
                    id="ws-scrim-t"
                    className="input"
                    value={scrimTitle}
                    onChange={(e) => setScrimTitle(e.target.value)}
                    placeholder="Ej.: Scrim Bo3 VALORANT vs Caracas Five"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="field">
                    <label htmlFor="ws-scrim-g">Juego</label>
                    <select id="ws-scrim-g" className="input" value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)}>
                      {opcionesJuegos().map((j) => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ws-scrim-d">Fecha y hora</label>
                    <input
                      id="ws-scrim-d"
                      type="datetime-local"
                      className="input"
                      value={scrimDate}
                      onChange={(e) => setScrimDate(e.target.value)}
                    />
                  </div>
                </div>
                <a
                  href={scrimCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-rojo btn-sm justify-center"
                  data-testid="btn-workspace-calendar-template"
                >
                  📅 Agregar a Google Calendar ↗
                </a>
              </div>

              <div className="border-t pt-4 grid gap-2.5" style={{ borderColor: "#24242b" }}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="d-3">Archivos Drive (drive.file)</h3>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-sm" onClick={abrirPickerDrive} disabled={busyAction === "picker"}>
                      Adjuntar archivo
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={cargarArchivosDrive} disabled={busyAction === "drive-list"}>
                      Listar creados
                    </button>
                  </div>
                </div>
                {driveFiles.length > 0 && (
                  <div className="grid gap-1.5">
                    {driveFiles.map((f) => (
                      <a
                        key={f.id}
                        href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-[#1a1a20]"
                        style={{ background: "#0a0a0b", border: "1px solid #24242b" }}
                      >
                        <span className="truncate font-medium">{f.name}</span>
                        <span className="muted shrink-0">Abrir ↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recursos guardados y torneos guardados */}
            <div className="panel panel-pad grid gap-4 content-start" style={{ background: "#111113" }}>
              <div>
                <h2 className="d-3">Hojas y archivos vinculados ({links.length})</h2>
                <p className="small muted">Archivos exportados desde VANTS o adjuntados mediante Google Picker.</p>
              </div>
              {links.length === 0 ? (
                <p className="small muted">Todavía no has exportado hojas ni adjuntado archivos.</p>
              ) : (
                <div className="grid gap-2">
                  {links.map((l) => (
                    <div
                      key={l.id}
                      className="p-3 flex items-center justify-between gap-2"
                      style={{ background: "#0a0a0b", border: "1px solid #24242b" }}
                    >
                      <div className="min-w-0">
                        <span className="tag mr-2">{l.service}</span>
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:underline">
                            {l.title} ↗
                          </a>
                        ) : (
                          <span className="text-sm font-semibold">{l.title}</span>
                        )}
                      </div>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => borrarLink(l.id)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 grid gap-2" style={{ borderColor: "#24242b" }}>
                <h3 className="d-3">Torneos guardados ({bookmarks.length})</h3>
                {bookmarks.length === 0 ? (
                  <p className="small muted">Guarda torneos desde <Link href="/torneos" className="underline">Torneos</Link> para seguirlos aquí.</p>
                ) : (
                  bookmarks.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 flex items-center justify-between gap-2"
                      style={{ background: "#0a0a0b", border: "1px solid #24242b" }}
                    >
                      <Link href={`/torneos/${b.tournamentSlug}`} className="text-sm font-semibold hover:underline truncate">
                        {b.tournamentName}
                      </Link>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => borrarBookmark(b.id)}>
                        Quitar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "notas" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <form onSubmit={guardarNota} className="panel panel-pad grid gap-3 content-start" style={{ background: "#111113" }}>
              <h2 className="d-3">Nueva nota táctica</h2>
              <div className="field">
                <label htmlFor="ws-n-t">Título *</label>
                <input
                  id="ws-n-t"
                  className="input"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Ej.: Default Ascent sitio A · Ejecución ronda eco"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label htmlFor="ws-n-g">Juego</label>
                  <select id="ws-n-g" className="input" value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)}>
                    {opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ws-n-c">Categoría</label>
                  <select id="ws-n-c" className="input" value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)}>
                    <option value="estrategia">Estrategia</option>
                    <option value="scouting">Scouting</option>
                    <option value="calendario">Calendario</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="ws-n-b">Detalle *</label>
                <textarea
                  id="ws-n-b"
                  rows={4}
                  className="input"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Ej.: Humo Heaven + flash árbol, trade inmediato de entry."
                  required
                />
              </div>
              <button type="submit" disabled={busyAction === "save-note"} className="btn btn-rojo btn-sm">
                {busyAction === "save-note" ? "Guardando…" : "Guardar nota"}
              </button>
            </form>

            <div className="panel panel-pad grid gap-3 content-start" style={{ background: "#111113" }}>
              <h2 className="d-3">Mis notas ({notes.length})</h2>
              {notes.length === 0 ? (
                <p className="small muted">Todavía no tienes notas tácticas guardadas.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="p-3.5 grid gap-1.5" style={{ background: "#0a0a0b", border: "1px solid #24242b" }}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{n.title}</strong>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => borrarNota(n.id)}>
                        Borrar
                      </button>
                    </div>
                    <p className="text-xs muted whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
