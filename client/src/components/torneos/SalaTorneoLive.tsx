// client/src/components/torneos/SalaTorneoLive.tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import { esAppNativa, getAuthToken } from "@/lib/api";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";

export type RolSala = "staff" | "player" | "spectator";
export type EstadoAcSala = "vanguard" | "faceit" | "both" | "pc" | "none";

export interface ParticipanteSala {
  nick: string;
  role: RolSala;
  ac?: EstadoAcSala;
}

export interface MarcadorPartida {
  slot?: number;
  equipo_a?: string;
  equipo_b?: string;
  score_a?: number | null;
  score_b?: number | null;
  ganador?: string | null;
  estado?: string | null;
}

export interface MarcadorSala {
  torneoId?: string;
  torneoNombre?: string;
  ronda?: string | null;
  rondaLabel?: string | null;
  estado?: string | null;
  equipo_a?: string;
  equipo_b?: string;
  score_a?: number | null;
  score_b?: number | null;
  ganador?: string | null;
  campeon?: string | null;
  campeonTag?: string | null;
  partidas?: MarcadorPartida[];
}

export interface EventoSalaFeed {
  id: string;
  tipo: "chat" | "sistema" | "error" | "arbitro" | "caster";
  de?: string;
  role?: RolSala;
  ac?: EstadoAcSala;
  para?: string;
  accion?: string;
  escalado?: boolean;
  texto: string;
  ts?: string;
}

export interface SalaTorneoLiveProps {
  torneoId: string;
  torneoNombre?: string;
  acObligatorio?: boolean;
  juegoSlug?: string;
}

const VANTS_PC_RELEASES = "https://github.com/VANTSGAMES/banter/releases/latest";

function normalizarAc(raw: unknown): EstadoAcSala {
  if (raw === "vanguard" || raw === "faceit" || raw === "both" || raw === "pc") return raw;
  return "none";
}

function etiquetaAc(ac?: EstadoAcSala): { label: string; bg: string; color: string; border: string } {
  if (ac === "both") {
    return {
      label: "🛡️ Vanguard + FACEIT ON",
      bg: "rgba(65,217,141,0.16)",
      color: "#41d98d",
      border: "rgba(65,217,141,0.45)",
    };
  }
  if (ac === "vanguard") {
    return {
      label: "🛡️ Vanguard ON",
      bg: "rgba(65,217,141,0.16)",
      color: "#41d98d",
      border: "rgba(65,217,141,0.45)",
    };
  }
  if (ac === "faceit") {
    return {
      label: "🛡️ FACEIT AC ON",
      bg: "rgba(65,217,141,0.16)",
      color: "#41d98d",
      border: "rgba(65,217,141,0.45)",
    };
  }
  if (ac === "pc") {
    return {
      label: "🖥️ VANTS PC",
      bg: "rgba(245,192,68,0.14)",
      color: "#f5c044",
      border: "rgba(245,192,68,0.38)",
    };
  }
  return {
    label: "Sin VANTS PC",
    bg: "rgba(161,161,170,0.1)",
    color: "#a1a1aa",
    border: "rgba(161,161,170,0.25)",
  };
}

/** Construye la URL WebSocket hacia el proxy oficial `/api/torneos-live/sala/:id/ws`. */
export function buildSalaWsUrl(torneoId: string, token?: string | null): string {
  let base = "wss://vants.cc";
  if (!esAppNativa() && typeof window !== "undefined" && window.location?.host) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${window.location.host}`;
  }
  const path = `/api/torneos-live/sala/${encodeURIComponent(torneoId)}/ws`;
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${base}${path}${qs}`;
}

function formatearHora(ts?: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function etiquetaRol(role: RolSala): { label: string; bg: string; color: string; border: string } {
  if (role === "staff") {
    return {
      label: "STAFF",
      bg: "rgba(255,13,46,0.16)",
      color: "#ff5468",
      border: "rgba(255,13,46,0.45)",
    };
  }
  if (role === "player") {
    return {
      label: "JUGADOR",
      bg: "rgba(65,217,141,0.14)",
      color: "#41d98d",
      border: "rgba(65,217,141,0.38)",
    };
  }
  return {
    label: "ESPECTADOR",
    bg: "rgba(161,161,170,0.12)",
    color: "#a1a1aa",
    border: "rgba(161,161,170,0.28)",
  };
}

export function SalaTorneoLive({ torneoId, torneoNombre, acObligatorio = false, juegoSlug }: SalaTorneoLiveProps) {
  const { status: authStatus, login } = useAuth();
  const [estadoWs, setEstadoWs] = useState<"conectando" | "conectado" | "reconectando">("conectando");
  const [yo, setYo] = useState<ParticipanteSala | null>(null);
  const [presentes, setPresentes] = useState<ParticipanteSala[]>([]);
  const [mostrarPresentes, setMostrarPresentes] = useState(false);
  const [marcador, setMarcador] = useState<MarcadorSala | null>(null);
  const [mensajes, setMensajes] = useState<EventoSalaFeed[]>([]);
  const [texto, setTexto] = useState("");

  // Panel de edición rápida de marcador exclusivo para Staff
  const [editandoMarcador, setEditandoMarcador] = useState(false);
  const [formMarcador, setFormMarcador] = useState({
    equipo_a: "",
    equipo_b: "",
    score_a: "0",
    score_b: "0",
    rondaLabel: "En vivo",
    estado: "en_curso",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);
  const hydratedRef = useRef(false);

  const nextId = () => `ev-${Date.now()}-${++seqRef.current}`;

  useEffect(() => {
    setMensajes([]);
    setPresentes([]);
    setMarcador(null);
    setYo(null);
    hydratedRef.current = false;
  }, [torneoId]);

  useEffect(() => {
    let cancelado = false;
    let timerReconexion: ReturnType<typeof setTimeout> | null = null;
    let intento = 0;

    const pushFeed = (ev: EventoSalaFeed) => {
      setMensajes((prev) => [...prev.slice(-149), ev]);
    };

    const conectar = async () => {
      if (cancelado) return;
      setEstadoWs(intento === 0 ? "conectando" : "reconectando");
      const token = await getAuthToken().catch(() => null);
      if (cancelado) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildSalaWsUrl(torneoId, token));
      } catch {
        programarReconexion();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelado) {
          ws.close();
          return;
        }
        intento = 0;
        setEstadoWs("conectado");
      };

      ws.onmessage = (e) => {
        if (cancelado || typeof e.data !== "string") return;
        let ev: Record<string, any>;
        try {
          ev = JSON.parse(e.data);
        } catch {
          return;
        }

        if (ev.tipo === "init") {
          if (ev.yo?.nick) {
            setYo({
              nick: String(ev.yo.nick),
              role: ev.yo.role === "staff" || ev.yo.role === "player" ? ev.yo.role : "spectator",
              ac: normalizarAc(ev.yo.ac),
            });
          }
          if (Array.isArray(ev.presentes)) setPresentes(ev.presentes);
          if (ev.marcador && typeof ev.marcador === "object") setMarcador(ev.marcador as MarcadorSala);
          // Chat 100% efímero: nunca se hidrata historial persistido
          hydratedRef.current = true;
          return;
        }

        if (ev.tipo === "presencia" && Array.isArray(ev.datos)) {
          setPresentes(ev.datos);
          return;
        }

        if (ev.tipo === "marcador") {
          const datos = ev.datos && typeof ev.datos === "object" ? (ev.datos as MarcadorSala) : null;
          setMarcador(datos);
          if (ev.de) {
            pushFeed({
              id: nextId(),
              tipo: "sistema",
              texto: `Marcador oficial actualizado por ${String(ev.de)}`,
              ts: ev.ts,
            });
          }
          return;
        }

        if (ev.tipo === "chat") {
          pushFeed({
            id: nextId(),
            tipo: "chat",
            de: String(ev.de || "espectador"),
            role: ev.role === "staff" || ev.role === "player" ? ev.role : "spectator",
            ac: normalizarAc(ev.ac),
            texto: String(ev.texto || ""),
            ts: ev.ts,
          });
          return;
        }

        if (ev.tipo === "arbitro") {
          pushFeed({
            id: nextId(),
            tipo: "arbitro",
            accion: String(ev.accion || "responder"),
            para: ev.para ? String(ev.para) : undefined,
            escalado: Boolean(ev.escalado || ev.accion === "escalar_staff"),
            texto: String(ev.texto || ""),
            ts: ev.ts,
          });
          return;
        }

        if (ev.tipo === "caster") {
          pushFeed({
            id: nextId(),
            tipo: "caster",
            texto: String(ev.texto || ""),
            ts: ev.ts,
          });
          return;
        }

        if (ev.tipo === "sistema" || ev.tipo === "error") {
          pushFeed({
            id: nextId(),
            tipo: ev.tipo,
            texto: String(ev.texto || ""),
            ts: ev.ts,
          });
        }
      };

      ws.onerror = () => {
        // onclose se encargará de reconectar limpiamente
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (!cancelado) programarReconexion();
      };
    };

    const programarReconexion = () => {
      if (cancelado) return;
      setEstadoWs("reconectando");
      const demora = Math.min(10000, 1500 * Math.pow(2, intento));
      intento += 1;
      timerReconexion = setTimeout(() => {
        void conectar();
      }, demora);
    };

    void conectar();

    return () => {
      cancelado = true;
      if (timerReconexion) clearTimeout(timerReconexion);
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "unmount");
        } catch {
          // noop
        }
        wsRef.current = null;
      }
    };
  }, [torneoId, authStatus]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  const enviarMensaje = (e: FormEvent) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ tipo: "chat", texto: limpio }));
    setTexto("");
  };

  const insertarComandoArbitro = () => {
    setTexto((prev) => {
      const trimmed = prev.trimStart();
      if (/^(?:!arbitro|@arbitro)\b/i.test(trimmed)) return prev;
      return trimmed ? `!arbitro ${trimmed}` : "!arbitro ";
    });
    inputRef.current?.focus();
  };

  const abrirEditorMarcador = () => {
    setFormMarcador({
      equipo_a: marcador?.equipo_a || "",
      equipo_b: marcador?.equipo_b || "",
      score_a: marcador?.score_a != null ? String(marcador.score_a) : "0",
      score_b: marcador?.score_b != null ? String(marcador.score_b) : "0",
      rondaLabel: marcador?.rondaLabel || "En vivo",
      estado: marcador?.estado || "en_curso",
    });
    setEditandoMarcador((v) => !v);
  };

  const enviarMarcadorStaff = (e: FormEvent) => {
    e.preventDefault();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        tipo: "marcador",
        datos: {
          torneoId,
          torneoNombre: torneoNombre || torneoId,
          equipo_a: formMarcador.equipo_a.trim() || "Equipo A",
          equipo_b: formMarcador.equipo_b.trim() || "Equipo B",
          score_a: Number(formMarcador.score_a) || 0,
          score_b: Number(formMarcador.score_b) || 0,
          rondaLabel: formMarcador.rondaLabel.trim() || "En vivo",
          estado: formMarcador.estado,
        },
      }),
    );
    setEditandoMarcador(false);
  };

  const yoBadge = yo ? etiquetaRol(yo.role) : null;
  const hayMarcadorSimple = Boolean(marcador && (marcador.equipo_a || marcador.equipo_b));
  const hayPartidasRonda = Boolean(marcador?.partidas && marcador.partidas.length > 0);

  return (
    <section
      data-testid="sala-torneo-live"
      style={{
        background: "#111113",
        border: "1px solid #2a2a2f",
        borderTop: "2px solid #ff0d2e",
        color: "#f4f4f5",
      }}
    >
      {/* Cabecera de la sala */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid #232329", background: "#111113" }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase"
              style={{
                background: estadoWs === "conectado" ? "rgba(255,13,46,0.16)" : "rgba(245,192,68,0.16)",
                color: estadoWs === "conectado" ? "#ff5468" : "#f5c044",
                border: `1px solid ${estadoWs === "conectado" ? "rgba(255,13,46,0.45)" : "rgba(245,192,68,0.4)"}`,
              }}
              data-testid="sala-live-status"
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "9999px",
                  background: estadoWs === "conectado" ? "#ff0d2e" : "#f5c044",
                  display: "inline-block",
                }}
              />
              {estadoWs === "conectado" ? "EN VIVO" : estadoWs === "conectando" ? "CONECTANDO…" : "RECONECTANDO…"}
            </span>
            <h2 className="text-sm sm:text-base font-bold truncate" style={{ color: "#ffffff" }}>
              Sala del torneo{torneoNombre ? ` · ${torneoNombre}` : ""}
            </h2>
          </div>
          <p className="text-xs" style={{ color: "#a1a1aa" }}>
            Marcador oficial en tiempo real · Árbitro IA (<code className="text-[#ff6b7c]">!arbitro</code>) · Caster IA
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {yo && yoBadge && (
            <div
              className="flex flex-wrap items-center gap-1.5 px-2.5 py-1 text-xs"
              style={{ background: "#0a0a0b", border: "1px solid #27272d" }}
              data-testid="sala-live-me"
            >
              <span className="font-semibold truncate max-w-[140px]">{yo.nick}</span>
              <span
                className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                style={{ background: yoBadge.bg, color: yoBadge.color, border: `1px solid ${yoBadge.border}` }}
              >
                {yoBadge.label}
              </span>
              {(() => {
                const acb = etiquetaAc(yo.ac);
                return (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ background: acb.bg, color: acb.color, border: `1px solid ${acb.border}` }}
                    data-testid="sala-live-my-ac"
                  >
                    {acb.label}
                  </span>
                );
              })()}
            </div>
          )}

          <button
            type="button"
            onClick={() => setMostrarPresentes((v) => !v)}
            className="px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              background: mostrarPresentes ? "#1f1f25" : "#0a0a0b",
              border: "1px solid #2a2a2f",
              color: "#e4e4e7",
            }}
            data-testid="sala-live-presentes-btn"
          >
            {presentes.length} {presentes.length === 1 ? "conectado" : "conectados"}
          </button>

          {yo?.role === "staff" && (
            <button
              type="button"
              onClick={abrirEditorMarcador}
              className="px-2.5 py-1 text-xs font-semibold"
              style={{
                background: "rgba(255,13,46,0.16)",
                border: "1px solid rgba(255,13,46,0.5)",
                color: "#ff5468",
              }}
              data-testid="sala-live-staff-marcador-btn"
            >
              {editandoMarcador ? "Cerrar marcador" : "Actualizar marcador"}
            </button>
          )}
        </div>
      </div>

      {/* Aviso de Anti-Cheat obligatorio cuando ac_obligatorio = 1 */}
      {acObligatorio && (
        <div
          className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{ background: "#170b0e", borderBottom: "1px solid rgba(255,13,46,0.38)", color: "#f4f4f5" }}
          data-testid="sala-live-ac-obligatorio"
        >
          <span>
            🛡️ <strong>Anti-Cheat obligatorio</strong>: este torneo exige <strong>VANTS PC</strong> activo con{" "}
            {juegoSlug === "valorant" ? "Riot Vanguard" : juegoSlug === "cs2" ? "FACEIT Anti-Cheat" : "anti-cheat oficial"} encendido.
          </span>
          <a
            href={VANTS_PC_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "#ff0d2e", color: "#ffffff" }}
          >
            Abrir / Descargar VANTS PC ↗
          </a>
        </div>
      )}

      {/* Lista colapsable de presencia */}
      {mostrarPresentes && (
        <div
          className="px-4 py-2.5 flex flex-wrap gap-1.5"
          style={{ background: "#0d0d10", borderBottom: "1px solid #232329" }}
          data-testid="sala-live-presentes"
        >
          {presentes.length === 0 ? (
            <span className="text-xs" style={{ color: "#71717a" }}>Sin participantes visibles todavía.</span>
          ) : (
            presentes.map((p, idx) => {
              const b = etiquetaRol(p.role);
              const acb = etiquetaAc(p.ac);
              return (
                <span
                  key={`${p.nick}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs"
                  style={{ background: "#141418", border: `1px solid ${b.border}`, color: "#e4e4e7" }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "9999px", background: b.color }} />
                  <span>{p.nick}</span>
                  <span className="text-[10px]" style={{ color: acb.color }}>{acb.label}</span>
                </span>
              );
            })
          )}
        </div>
      )}

      {/* Editor rápido de marcador oficial (solo Staff verificado) */}
      {editandoMarcador && yo?.role === "staff" && (
        <form
          onSubmit={enviarMarcadorStaff}
          className="px-4 py-3 grid gap-2 sm:grid-cols-6 items-end"
          style={{ background: "#160d10", borderBottom: "1px solid rgba(255,13,46,0.35)" }}
          data-testid="sala-live-marcador-form"
        >
          <label className="grid gap-1 text-[11px] sm:col-span-2" style={{ color: "#d4d4d8" }}>
            Equipo A
            <input
              className="input h-8 text-xs"
              value={formMarcador.equipo_a}
              onChange={(e) => setFormMarcador((f) => ({ ...f, equipo_a: e.target.value }))}
              placeholder="Ej.: VANTS Alpha"
              required
            />
          </label>
          <label className="grid gap-1 text-[11px]" style={{ color: "#d4d4d8" }}>
            Pts A
            <input
              type="number"
              min={0}
              max={99}
              className="input h-8 text-xs num"
              value={formMarcador.score_a}
              onChange={(e) => setFormMarcador((f) => ({ ...f, score_a: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[11px]" style={{ color: "#d4d4d8" }}>
            Pts B
            <input
              type="number"
              min={0}
              max={99}
              className="input h-8 text-xs num"
              value={formMarcador.score_b}
              onChange={(e) => setFormMarcador((f) => ({ ...f, score_b: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[11px] sm:col-span-2" style={{ color: "#d4d4d8" }}>
            Equipo B
            <input
              className="input h-8 text-xs"
              value={formMarcador.equipo_b}
              onChange={(e) => setFormMarcador((f) => ({ ...f, equipo_b: e.target.value }))}
              placeholder="Ej.: Caracas Five"
              required
            />
          </label>
          <label className="grid gap-1 text-[11px] sm:col-span-3" style={{ color: "#d4d4d8" }}>
            Ronda / Etiqueta
            <input
              className="input h-8 text-xs"
              value={formMarcador.rondaLabel}
              onChange={(e) => setFormMarcador((f) => ({ ...f, rondaLabel: e.target.value }))}
              placeholder="Semifinal · Mapa 2"
            />
          </label>
          <label className="grid gap-1 text-[11px] sm:col-span-2" style={{ color: "#d4d4d8" }}>
            Estado
            <select
              className="input h-8 text-xs"
              value={formMarcador.estado}
              onChange={(e) => setFormMarcador((f) => ({ ...f, estado: e.target.value }))}
            >
              <option value="en_curso">En curso</option>
              <option value="final">Final</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-8 px-3 text-xs font-bold uppercase tracking-wider"
            style={{ background: "#ff0d2e", color: "#ffffff" }}
          >
            Publicar
          </button>
        </form>
      )}

      {/* Banner de Marcador Oficial en Vivo */}
      {marcador && (marcador.campeon || hayMarcadorSimple || hayPartidasRonda) && (
        <div
          className="px-4 py-3"
          style={{
            background: "linear-gradient(90deg, rgba(255,13,46,0.12) 0%, #0d0d10 55%, rgba(255,13,46,0.08) 100%)",
            borderBottom: "1px solid #26262d",
          }}
          data-testid="sala-live-marcador"
        >
          {marcador.campeon ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden="true">🏆</span>
                <span className="text-xs uppercase tracking-widest font-bold" style={{ color: "#ff5468" }}>
                  Campeón oficial
                </span>
                <strong className="text-sm sm:text-base text-white">
                  {marcador.campeon}
                  {marcador.campeonTag ? ` [${marcador.campeonTag}]` : ""}
                </strong>
              </div>
              {marcador.rondaLabel && (
                <span className="text-xs px-2 py-0.5" style={{ background: "#1a1a20", color: "#d4d4d8" }}>
                  {marcador.rondaLabel}
                </span>
              )}
            </div>
          ) : hayMarcadorSimple ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "#ff5468" }}>
                {marcador.rondaLabel || (marcador.ronda ? `Ronda ${marcador.ronda.toUpperCase()}` : "Marcador oficial")}
              </div>
              <div className="flex items-center gap-3 text-sm sm:text-base font-bold">
                <span className="truncate max-w-[140px] sm:max-w-[200px]">{marcador.equipo_a || "Equipo A"}</span>
                <span
                  className="px-2.5 py-0.5 num text-white"
                  style={{ background: "#1b1b21", border: "1px solid rgba(255,13,46,0.45)" }}
                >
                  {marcador.score_a ?? 0} — {marcador.score_b ?? 0}
                </span>
                <span className="truncate max-w-[140px] sm:max-w-[200px]">{marcador.equipo_b || "Equipo B"}</span>
              </div>
              <span
                className="text-[11px] uppercase tracking-wider px-2 py-0.5 font-semibold"
                style={{
                  background: marcador.estado === "final" ? "rgba(65,217,141,0.14)" : "rgba(255,13,46,0.14)",
                  color: marcador.estado === "final" ? "#41d98d" : "#ff6b7c",
                }}
              >
                {marcador.estado === "final" ? "Final" : "En juego"}
              </span>
            </div>
          ) : hayPartidasRonda ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: "#ff5468" }}>
                  {marcador.rondaLabel || "Ronda activa"}
                </span>
                <span className="text-[11px]" style={{ color: "#a1a1aa" }}>
                  {marcador.partidas!.length} {marcador.partidas!.length === 1 ? "llave" : "llaves"}
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {marcador.partidas!.map((p, idx) => (
                  <div
                    key={p.slot ?? idx}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                    style={{ background: "#0a0a0b", border: "1px solid #24242b" }}
                  >
                    <span className="truncate">
                      <strong>{p.equipo_a || "TBD"}</strong>{" "}
                      <span style={{ color: "#71717a" }}>vs</span>{" "}
                      <strong>{p.equipo_b || "BYE"}</strong>
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 shrink-0"
                      style={{
                        background: p.estado === "final" ? "rgba(65,217,141,0.14)" : "rgba(255,255,255,0.06)",
                        color: p.estado === "final" ? "#41d98d" : "#a1a1aa",
                      }}
                    >
                      {p.equipo_b === "BYE" ? "BYE" : p.estado || "pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Feed de chat, Árbitro IA y Caster IA */}
      <div
        ref={feedRef}
        className="px-4 py-3 grid gap-2.5 overflow-y-auto content-start"
        style={{ background: "#0a0a0b", height: 380 }}
        role="log"
        aria-live="polite"
        data-testid="sala-live-feed"
      >
        {mensajes.length === 0 ? (
          <div className="m-auto text-center max-w-md py-12 grid gap-2">
            <span className="text-xs uppercase tracking-widest font-bold" style={{ color: "#ff5468" }}>
              Sala en tiempo real VANTS
            </span>
            <p className="text-sm" style={{ color: "#d4d4d8" }}>
              Comenta las partidas en vivo, sigue el marcador oficial o invoca al{" "}
              <strong>Árbitro IA</strong> escribiendo{" "}
              <code className="px-1.5 py-0.5" style={{ background: "#18181d", color: "#ff6b7c" }}>
                !arbitro ¿cuánto tiempo de pausa hay?
              </code>
            </p>
          </div>
        ) : (
          mensajes.map((m) => {
            if (m.tipo === "caster") {
              return (
                <div
                  key={m.id}
                  className="p-3 grid gap-1.5"
                  style={{
                    background: "linear-gradient(135deg, #1b0b0f 0%, #111113 75%)",
                    border: "1px solid rgba(255,13,46,0.45)",
                    borderLeft: "3px solid #ff0d2e",
                  }}
                  data-testid="sala-msg-caster"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#ff5468" }}>
                      🎙️ Caster IA · Crónica en vivo
                    </span>
                    <span className="text-[10px] num" style={{ color: "#a1a1aa" }}>
                      {formatearHora(m.ts)}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: "#ffffff" }}>
                    {m.texto}
                  </p>
                </div>
              );
            }

            if (m.tipo === "arbitro") {
              const esEscalada = Boolean(m.escalado || m.accion === "escalar_staff");
              const esAdvertencia = m.accion === "advertir";
              const accent = esEscalada ? "#ff0d2e" : esAdvertencia ? "#f59e0b" : "#eab308";
              const bg = esEscalada ? "#1f0a0e" : esAdvertencia ? "#1b1408" : "#16130b";
              return (
                <div
                  key={m.id}
                  className="p-3 grid gap-1.5"
                  style={{
                    background: bg,
                    border: `1px solid ${esEscalada ? "rgba(255,13,46,0.65)" : "rgba(234,179,8,0.4)"}`,
                    borderLeft: `3px solid ${accent}`,
                  }}
                  data-testid="sala-msg-arbitro"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accent }}>
                        {esEscalada ? "🚨 Árbitro IA · Disputa" : esAdvertencia ? "⚠️ Árbitro IA · Aviso" : "⚖️ Árbitro IA · Oficial"}
                      </span>
                      {esEscalada && (
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            background: "rgba(255,13,46,0.22)",
                            color: "#ff8090",
                            border: "1px solid rgba(255,13,46,0.55)",
                          }}
                          data-testid="sala-arbitro-escalado-badge"
                        >
                          Escalado a #staff en Discord
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] num" style={{ color: "#a1a1aa" }}>
                      {formatearHora(m.ts)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
                    {m.para && (
                      <strong className="mr-1" style={{ color: accent }}>
                        @{m.para}
                      </strong>
                    )}
                    {m.texto}
                  </p>
                </div>
              );
            }

            if (m.tipo === "error") {
              return (
                <div
                  key={m.id}
                  className="px-3 py-2 text-xs"
                  style={{
                    background: "rgba(255,13,46,0.12)",
                    border: "1px solid rgba(255,13,46,0.35)",
                    color: "#ff8090",
                  }}
                >
                  {m.texto}
                </div>
              );
            }

            if (m.tipo === "sistema") {
              return (
                <div key={m.id} className="text-center py-0.5">
                  <span
                    className="inline-block px-2.5 py-0.5 text-[11px]"
                    style={{ background: "#141418", color: "#a1a1aa", border: "1px solid #202026" }}
                  >
                    {m.texto}
                  </span>
                </div>
              );
            }

            const rb = etiquetaRol(m.role || "spectator");
            const acb = etiquetaAc(m.ac);
            return (
              <div
                key={m.id}
                className="px-3 py-2 grid gap-0.5"
                style={{ background: "#111113", border: "1px solid #1e1e24" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span
                      className="text-xs font-bold truncate"
                      style={{ color: m.role === "staff" ? "#ff5468" : m.role === "player" ? "#41d98d" : "#e4e4e7" }}
                    >
                      {m.de}
                    </span>
                    {m.role && m.role !== "spectator" && (
                      <span
                        className="px-1 py-0 text-[9px] font-bold tracking-wider"
                        style={{ background: rb.bg, color: rb.color, border: `1px solid ${rb.border}` }}
                      >
                        {rb.label}
                      </span>
                    )}
                    <span
                      className="px-1 py-0 text-[9px] font-semibold tracking-wider"
                      style={{ background: acb.bg, color: acb.color, border: `1px solid ${acb.border}` }}
                    >
                      {acb.label}
                    </span>
                  </div>
                  <span className="text-[10px] num shrink-0" style={{ color: "#71717a" }}>
                    {formatearHora(m.ts)}
                  </span>
                </div>
                <p className="text-sm break-words leading-snug" style={{ color: "#f4f4f5" }}>
                  {m.texto}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Barra de envío */}
      <form
        onSubmit={enviarMensaje}
        className="p-3 grid gap-2"
        style={{ background: "#111113", borderTop: "1px solid #232329" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={insertarComandoArbitro}
            className="h-10 px-3 text-xs font-bold uppercase tracking-wider shrink-0 transition-colors"
            style={{
              background: "rgba(234,179,8,0.14)",
              border: "1px solid rgba(234,179,8,0.45)",
              color: "#facc15",
            }}
            title="Consultar al Árbitro IA con el reglamento oficial del torneo"
            data-testid="sala-live-btn-arbitro"
          >
            ⚖️ !arbitro
          </button>
          <input
            ref={inputRef}
            type="text"
            className="input h-10 flex-1 text-sm"
            style={{ background: "#0a0a0b", borderColor: "#2a2a2f", color: "#f4f4f5" }}
            placeholder="Escribe en la sala o usa !arbitro <duda del reglamento>…"
            aria-label="Mensaje para la sala en vivo"
            maxLength={400}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            data-testid="sala-live-input"
          />
          <button
            type="submit"
            disabled={estadoWs !== "conectado" || !texto.trim()}
            className="h-10 px-4 text-xs font-bold uppercase tracking-wider shrink-0 disabled:opacity-40"
            style={{ background: "#ff0d2e", color: "#ffffff" }}
            data-testid="sala-live-send"
          >
            Enviar
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "#71717a" }}>
          <span>
            Usa <code style={{ color: "#d4d4d8" }}>!arbitro &lt;consulta&gt;</code> para dudas del reglamento o reportar incidencias al staff.
          </span>
          {AUTH_ENABLED && authStatus === "anonimo" && (
            <button
              type="button"
              onClick={() => login({ returnTo: `/torneos/${torneoId}` })}
              className="underline font-medium"
              style={{ color: "#ff5468" }}
            >
              Inicia sesión para entrar como jugador verificado
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
