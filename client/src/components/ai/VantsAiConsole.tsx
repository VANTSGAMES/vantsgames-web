// client/src/components/ai/VantsAiConsole.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  vantsAiApi,
  VantsAiError,
  type AiEstado,
  type AiTaskRow,
  type DispatchResponse,
} from "../../lib/vantsAiApi";

interface VantsAiConsoleProps {
  getAccessToken: () => Promise<string | null>;
}

const PRESETS = [
  {
    label: "🎯 Scouting jugador",
    prompt: "Evalúa el rendimiento competitivo de [NICK] y dime si tiene nivel para el Roster Oficial VANTS.",
    role: "head_coach",
  },
  {
    label: "💼 Propuesta Patrocinador",
    prompt: "Calcula el valor mediático y redacta una propuesta comercial ejecutiva para presentar a esta marca.",
    role: "cmo",
  },
  {
    label: "📢 Anuncio Torneos Discord",
    prompt: "Redacta y publica un anuncio oficial en Discord destacando los próximos torneos y eventos abiertos esta semana.",
    role: "community_manager",
  },
];

const AGENT_BADGE: Record<string, { label: string; color: string }> = {
  scouting: { label: "SCOUT AGENT", color: "#4cc9f0" },
  sponsorship: { label: "SPONSOR AGENT", color: "#f5c044" },
  community: { label: "COMMUNITY AGENT", color: "#ff0d2e" },
};

export function VantsAiConsole({ getAccessToken }: VantsAiConsoleProps) {
  const [tab, setTab] = useState<"console" | "approvals">("console");
  const [estado, setEstado] = useState<AiEstado | null>(null);
  const [prompt, setPrompt] = useState("");
  const [role, setRole] = useState("owner");

  // Contexto opcional para Sponsor / Discord / Scouting
  const [targetNick, setTargetNick] = useState("");
  const [brand, setBrand] = useState("");
  const [logoSeconds, setLogoSeconds] = useState("600");
  const [avgViewers, setAvgViewers] = useState("2500");
  const [discordTitle, setDiscordTitle] = useState("Anuncio Oficial VANTS");
  const [notifyAll, setNotifyAll] = useState(false);

  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<DispatchResponse | null>(null);
  const [tasks, setTasks] = useState<AiTaskRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending_approval");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarTodo = useCallback(async () => {
    const token = await getAccessToken().catch(() => null);
    if (!token) return;
    try {
      const st = await vantsAiApi.estado(token);
      setEstado(st);
      if (st.owner) {
        const list = await vantsAiApi.listarTareas(token, {
          scope: "admin",
          status: statusFilter || undefined,
        });
        setTasks(list.tasks || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando VANTS Core AI");
    }
  }, [getAccessToken, statusFilter]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function enviarOrden(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 3) return;
    setError(null);
    setSending(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("sin_sesion");

      const context_data: Record<string, unknown> = {};
      if (targetNick.trim()) context_data.nick = targetNick.trim();
      if (brand.trim()) {
        context_data.brand = brand.trim();
        context_data.logo_screen_seconds = Number(logoSeconds) || 600;
        context_data.avg_viewers = Number(avgViewers) || 500;
      }
      if (discordTitle.trim()) context_data.titulo = discordTitle.trim();
      context_data.notificar_todos = notifyAll;

      const res = await vantsAiApi.dispatch(token, {
        prompt: prompt.trim(),
        user_role: role,
        context_data,
      });
      setLastResult(res);
      if (res.requiere_aprobacion) {
        setStatusFilter("pending_approval");
      }
      await cargarTodo();
    } catch (err) {
      setError(err instanceof VantsAiError ? err.code : "Error ejecutando agente");
    } finally {
      setSending(false);
    }
  }

  async function revisar(taskId: string, accion: "approve" | "reject") {
    setBusyTaskId(taskId);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("sin_sesion");
      await vantsAiApi.revisarTarea(token, taskId, accion);
      await cargarTodo();
    } catch (err) {
      setError(err instanceof VantsAiError ? err.code : "No se pudo actualizar la tarea");
    } finally {
      setBusyTaskId(null);
    }
  }

  if (estado && !estado.owner) {
    return (
      <div style={{ padding: 20, background: "#111113", border: "1px solid #2a2a2f", color: "#a1a1aa" }}>
        Esta consola es exclusiva para el equipo Owner/Staff de VANTS GAMES.
      </div>
    );
  }

  const pendingCount = tasks.filter((t) => t.status === "pending_approval").length;

  return (
    <div data-testid="vants-ai-console" style={{ background: "#0a0a0b", color: "#f4f4f5", display: "grid", gap: 16 }}>
      {/* Barra superior de estado */}
      <div
        style={{
          background: "#111113",
          border: "1px solid #2a2a2f",
          borderTop: "2px solid #ff0d2e",
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#ff5468", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            VANTS Core AI · Centro de Operaciones
          </div>
          <div style={{ fontSize: 13, color: "#8e8e96", marginTop: 4 }}>
            {estado ? (
              <>
                Motor:{" "}
                <strong style={{ color: estado.configurado ? "#41d98d" : "#ff5468" }}>
                  {estado.configurado ? "ACTIVO" : "FALTA GEMINI_API_KEY"}
                </strong>{" "}
                · Router: <code>{estado.modelos.router}</code> · Experto: <code>{estado.modelos.expert}</code> ·
                Bus: {estado.bus ? "OK" : "OFF"}
              </>
            ) : (
              "Conectando con int.vants.cc..."
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("console")}
            style={{
              padding: "8px 14px",
              background: tab === "console" ? "#ff0d2e" : "#18181b",
              color: "#fff",
              border: "1px solid #2a2a2f",
              fontWeight: 700,
              fontSize: 12,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Orquestador
          </button>
          <button
            type="button"
            onClick={() => setTab("approvals")}
            style={{
              padding: "8px 14px",
              background: tab === "approvals" ? "#ff0d2e" : "#18181b",
              color: "#fff",
              border: "1px solid #2a2a2f",
              fontWeight: 700,
              fontSize: 12,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Aprobaciones {pendingCount > 0 ? `(${pendingCount})` : ""}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#1c1215", border: "1px solid #5a1d28", color: "#fca5a5", fontSize: 13 }}>
          Error: <code>{error}</code>
        </div>
      )}

      {tab === "console" && (
        <div style={{ display: "grid", gap: 16 }}>
          <form
            onSubmit={enviarOrden}
            style={{ background: "#111113", border: "1px solid #2a2a2f", padding: 20, display: "grid", gap: 14 }}
          >
            {/* Presets rápidos */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => {
                    setPrompt(pr.prompt);
                    setRole(pr.role);
                  }}
                  style={{
                    background: "#18181b",
                    border: "1px solid #2a2a2f",
                    color: "#d4d4d8",
                    padding: "6px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Escribe la orden operativa (ej: Analiza al jugador Feispla, calcula ROI de marca X o redacta anuncio de torneo para Discord)..."
              style={{
                width: "100%",
                background: "#0a0a0b",
                border: "1px solid #2a2a2f",
                color: "#fff",
                padding: 12,
                fontSize: 14,
                resize: "vertical",
              }}
            />

            {/* Contexto estructurado opcional */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              >
                <option value="owner">Rol: Owner</option>
                <option value="head_coach">Rol: Head Coach</option>
                <option value="cmo">Rol: Director Comercial</option>
                <option value="community_manager">Rol: Community Manager</option>
              </select>

              <input
                value={targetNick}
                onChange={(e) => setTargetNick(e.target.value)}
                placeholder="Nick jugador (Scouting)"
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              />

              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Marca (Sponsor ROI)"
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              />

              <input
                type="number"
                value={logoSeconds}
                onChange={(e) => setLogoSeconds(e.target.value)}
                placeholder="Seg. logo pantalla"
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              />

              <input
                type="number"
                value={avgViewers}
                onChange={(e) => setAvgViewers(e.target.value)}
                placeholder="Viewers promedio"
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              />

              <input
                value={discordTitle}
                onChange={(e) => setDiscordTitle(e.target.value)}
                placeholder="Título anuncio Discord"
                style={{ background: "#0a0a0b", border: "1px solid #2a2a2f", color: "#fff", padding: 8, fontSize: 13 }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label style={{ fontSize: 12, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={notifyAll}
                  onChange={(e) => setNotifyAll(e.target.checked)}
                />
                Al aprobar anuncio, enviar también notificación interna a todos los usuarios
              </label>

              <button
                type="submit"
                disabled={sending || prompt.trim().length < 3}
                style={{
                  background: sending ? "#4b161e" : "#ff0d2e",
                  color: "#fff",
                  border: "none",
                  padding: "10px 22px",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: sending ? "wait" : "pointer",
                }}
              >
                {sending ? "Procesando con Gemini..." : "Ejecutar Agente"}
              </button>
            </div>
          </form>

          {lastResult && (
            <div style={{ background: "#111113", border: "1px solid #2a2a2f", padding: 20 }}>
              <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "3px 8px",
                      background: "#18181b",
                      border: `1px solid ${AGENT_BADGE[lastResult.routing.target_agent]?.color || "#ff0d2e"}`,
                      color: AGENT_BADGE[lastResult.routing.target_agent]?.color || "#fff",
                    }}
                  >
                    {AGENT_BADGE[lastResult.routing.target_agent]?.label || lastResult.routing.target_agent}
                  </span>
                  <span style={{ fontSize: 12, color: "#8e8e96" }}>
                    Prioridad P{lastResult.routing.priority} · {lastResult.routing.reasoning}
                  </span>
                </div>

                {lastResult.requiere_aprobacion && (
                  <button
                    type="button"
                    onClick={() => setTab("approvals")}
                    style={{
                      background: "#f5c044",
                      color: "#000",
                      border: "none",
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Enviado a Cola de Aprobación →
                  </button>
                )}
              </div>

              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#e4e4e7",
                  margin: 0,
                }}
              >
                {lastResult.response}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === "approvals" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {[
                ["pending_approval", "Pendientes"],
                ["approved", "Aprobadas"],
                ["rejected", "Rechazadas"],
                ["", "Todas"],
              ].map(([val, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  style={{
                    padding: "6px 12px",
                    background: statusFilter === val ? "#27272a" : "#111113",
                    color: statusFilter === val ? "#fff" : "#8e8e96",
                    border: "1px solid #2a2a2f",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={cargarTodo}
              style={{
                padding: "6px 12px",
                background: "#18181b",
                color: "#d4d4d8",
                border: "1px solid #2a2a2f",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Refrescar
            </button>
          </div>

          {tasks.length === 0 ? (
            <div style={{ padding: 24, background: "#111113", border: "1px solid #2a2a2f", color: "#8e8e96", fontSize: 13 }}>
              No hay tareas en este estado.
            </div>
          ) : (
            tasks.map((t) => {
              const badge = AGENT_BADGE[t.target_agent] || { label: t.target_agent, color: "#ff0d2e" };
              const busy = busyTaskId === t.id;
              return (
                <article
                  key={t.id}
                  style={{
                    background: "#111113",
                    border: "1px solid #2a2a2f",
                    padding: 16,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "2px 8px",
                          border: `1px solid ${badge.color}`,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 12, color: "#8e8e96" }}>
                        P{t.priority} · {t.status} · {t.created_at.slice(0, 16).replace("T", " ")} UTC
                      </span>
                    </div>

                    {t.status === "pending_approval" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => revisar(t.id, "approve")}
                          style={{
                            background: "#16a34a",
                            color: "#fff",
                            border: "none",
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: busy ? "wait" : "pointer",
                          }}
                        >
                          ✅ Aprobar y ejecutar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => revisar(t.id, "reject")}
                          style={{
                            background: "#27272a",
                            color: "#fca5a5",
                            border: "1px solid #5a1d28",
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: busy ? "wait" : "pointer",
                          }}
                        >
                          ✖ Rechazar
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 13, color: "#a1a1aa" }}>
                    <strong style={{ color: "#e4e4e7" }}>Solicitud:</strong> {t.prompt}
                  </div>

                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "Inter, system-ui, sans-serif",
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "#e4e4e7",
                      background: "#0a0a0b",
                      border: "1px solid #27272a",
                      padding: 12,
                      margin: 0,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {t.response}
                  </pre>
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
