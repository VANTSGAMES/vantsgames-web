import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useApi } from "@/lib/useApi";
import { api, assetUrl, type Paged, type Tournament, type Match } from "@/lib/api";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate, GameTag } from "@/components/ui-vants";
import { TournamentRow, MatchRow } from "@/components/domain";
import { dinero, fecha, hora } from "@/lib/format";
import { useMisEquipos, MisInscripciones } from "./Vants";
import { JUEGO_POR_SLUG, filtrosJuegos } from "@/lib/juegos";
import { normalizeJuegoSlug, parseQueryParam } from "@/lib/urlFilters";
import {
  countTournamentsByGame,
  filterAndSortTournaments,
  normalizeText,
  type TorneoOrden,
} from "@/lib/discovery";
import { classifyBracketStatus, filterBracketMatches, type BracketStatusFilter } from "@/lib/competitive";
import { useMembresia } from "@/lib/useMembresia";
import { useFeedback } from "@/components/FeedbackProvider";
import { useQueryClient } from "@tanstack/react-query";

const JUEGOS = filtrosJuegos();
const POR_PAGINA = 12;

function GameFilter({
  value,
  onChange,
  counts,
  totalTodos,
}: {
  value: string;
  onChange: (v: string) => void;
  counts?: Record<string, number>;
  totalTodos?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por juego" data-testid="torneos-filtro-juegos">
      {JUEGOS.map((j) => {
        const n = j.v ? (counts ? counts[j.v] : undefined) : totalTodos;
        return (
          <button
            key={j.v}
            type="button"
            className={"btn btn-sm " + (value === j.v ? "btn-rojo" : "btn-ghost")}
            aria-pressed={value === j.v}
            onClick={() => onChange(j.v)}
            data-testid={"filter-juego-" + (j.v || "todos")}
          >
            {j.l}
            {typeof n === "number" && n > 0 ? <span className="num opacity-80">({n})</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Pager({ pag, total, por, onPage }: { pag: number; total: number; por: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / por));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t small" style={{ borderColor: "var(--linea-suave)" }}>
      <span className="muted num">Página {pag} de {pages} · {total} en total</span>
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={pag <= 1} onClick={() => onPage(pag - 1)}>Anterior</button>
        <button className="btn btn-sm" disabled={pag >= pages} onClick={() => onPage(pag + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

const TABS_T = [{ v: "upcoming", l: "Próximos" }, { v: "ongoing", l: "En curso" }, { v: "archive", l: "Archivo" }];

export function TorneosLista({ competir = false }: { competir?: boolean }) {
  const [location] = useLocation();
  const searchStr = useSearch();
  const readJuegoFromUrl = () => normalizeJuegoSlug(parseQueryParam("juego", searchStr || window.location.search, window.location.hash));
  const [estado, setEstado] = useState(competir ? "upcoming" : "upcoming");
  const [juego, setJuego] = useState<string>(readJuegoFromUrl);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<TorneoOrden>("fecha");
  const [pag, setPag] = useState(1);

  useEffect(() => {
    const sync = () => {
      const fromUrl = readJuegoFromUrl();
      setJuego(fromUrl);
      setPag(1);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [location, searchStr]);

  const handleJuegoChange = (nextJuego: string) => {
    const clean = normalizeJuegoSlug(nextJuego);
    setJuego(clean);
    setPag(1);
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (clean) sp.set("juego", clean);
      else sp.delete("juego");
      const qs = sp.toString();
      const baseHash = window.location.hash.split("?")[0];
      const nextUrl = window.location.pathname + (qs ? "?" + qs : "") + baseHash;
      window.history.replaceState(null, "", nextUrl);
    }
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.location.hash && window.location.search.includes("juego=")) {
        const sp = new URLSearchParams(window.location.search);
        sp.delete("juego");
        const qs = sp.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
      }
    };
  }, []);

  const q = useApi<{ data: Paged<Tournament> }>(`/api/tournaments?estado=${estado}&pag=1&porPagina=100`);
  const todosItems = q.data?.data?.items || [];

  const conteosPorJuego = useMemo(() => countTournamentsByGame(todosItems), [todosItems]);

  const itemsVisibles = useMemo(
    () => filterAndSortTournaments(todosItems, { juego, query: busqueda, sort: orden }),
    [todosItems, juego, busqueda, orden],
  );

  const paginados = useMemo(
    () => itemsVisibles.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA),
    [itemsVisibles, pag],
  );

  const juegoActivo = juego ? JUEGO_POR_SLUG[juego] || null : null;

  return (
    <>
      <PageHead
        eyebrow={competir ? "Competir" : "Torneos"}
        title={competir ? <>Inscribe a tu <span style={{ color: "var(--rojo)" }}>equipo</span></> : "Descubrir torneos"}
        lead={competir ? "Torneos con inscripción próxima. Filtra por videojuego para ver exclusivamente sus competencias disponibles." : "Torneos de los once juegos del circuito publicados por la organización de VANTS y por la comunidad con plan."}
        actions={<Link href={juego ? "/torneos/crear?juego=" + encodeURIComponent(juego) : "/torneos/crear"} className="btn" data-testid="cta-crear-torneo">Crear mi torneo</Link>}
      />
      <div className="wrap grid gap-4 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!competir ? (
            <div className="tabs" role="tablist">
              {TABS_T.map((t) => <button key={t.v} role="tab" className="tab" aria-selected={estado === t.v} onClick={() => { setEstado(t.v); setPag(1); }} data-testid={"tab-" + t.v}>{t.l}</button>)}
            </div>
          ) : <span />}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              className="input h-10 w-full sm:w-60"
              placeholder={juegoActivo ? `Buscar torneo de ${juegoActivo.label}…` : "Buscar torneo, región o formato"}
              aria-label="Buscar torneo"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPag(1); }}
              data-testid="input-buscar-torneo"
            />
            <select
              className="input h-10 w-full sm:w-48"
              aria-label="Filtrar torneos por juego"
              value={juego}
              onChange={(e) => handleJuegoChange(e.target.value)}
              data-testid="select-juego-torneo"
            >
              {JUEGOS.map((j) => {
                const n = j.v ? conteosPorJuego[j.v] : todosItems.length;
                return (
                  <option key={j.v || "todos"} value={j.v}>
                    {j.v ? `${j.l}${n ? ` (${n})` : ""}` : `Juego: Todos${todosItems.length ? ` (${todosItems.length})` : ""}`}
                  </option>
                );
              })}
            </select>
            <select
              className="input h-10 w-full sm:w-44"
              aria-label="Ordenar torneos"
              value={orden}
              onChange={(e) => { setOrden(e.target.value as TorneoOrden); setPag(1); }}
              data-testid="select-orden-torneo"
            >
              <option value="fecha">Ordenar: Próximos</option>
              <option value="premio">Ordenar: Mayor premio</option>
              <option value="plazas">Ordenar: Más plazas</option>
            </select>
          </div>
        </div>

        <GameFilter
          value={juego}
          onChange={handleJuegoChange}
          counts={conteosPorJuego}
          totalTodos={todosItems.length}
        />

        <div className="panel" data-testid="panel-lista-torneos">
          {q.isLoading ? (
            <Skel />
          ) : q.error ? (
            <ErrorBox error={q.error} what="los torneos" onRetry={() => q.refetch()} />
          ) : itemsVisibles.length === 0 ? (
            <Empty
              code={"torneos · " + estado + (juegoActivo ? " · " + juegoActivo.slug : "")}
              title={
                busqueda
                  ? "Ningún torneo coincide con tu búsqueda"
                  : juegoActivo
                    ? `No hay torneos de ${juegoActivo.nombre} en esta categoría`
                    : competir
                      ? "No hay inscripciones abiertas"
                      : "No hay torneos en esta categoría"
              }
              text={
                busqueda
                  ? "Prueba con otro término o limpia el filtro de juego."
                  : juegoActivo
                    ? `Cuando la organización o la comunidad publiquen un torneo de ${juegoActivo.nombre}, aparecerá exclusivamente aquí.`
                    : "Los torneos los publica la organización desde el panel interno. Vuelve más tarde o sigue los anuncios en Comunidad."
              }
              action={
                busqueda ? (
                  <button type="button" className="btn btn-sm" onClick={() => setBusqueda("")}>
                    Limpiar búsqueda
                  </button>
                ) : juegoActivo ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sm" onClick={() => handleJuegoChange("")} data-testid="button-ver-todos-juegos">
                      Ver todos los juegos
                    </button>
                    <Link
                      href={"/torneos/crear?juego=" + encodeURIComponent(juegoActivo.slug)}
                      className="btn btn-sm btn-rojo"
                    >
                      Crear torneo de {juegoActivo.label}
                    </Link>
                  </div>
                ) : (
                  <Link href="/noticias" className="link-arrow">
                    Ver anuncios <span aria-hidden>→</span>
                  </Link>
                )
              }
            />
          ) : (
            <>
              {paginados.map((t) => <TournamentRow key={t.slug} t={t} />)}
              <Pager pag={pag} total={itemsVisibles.length} por={POR_PAGINA} onPage={setPag} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Bracket ---------------- */
interface Llave { ronda: string; slot: number; team_a: string | null; team_b: string | null; score_a: number | null; score_b: number | null; estado: string | null; ganador: string | null }

const BRACKET_STATUS_FILTERS: { v: BracketStatusFilter; l: string }[] = [
  { v: "todos", l: "Todos" },
  { v: "live", l: "En vivo" },
  { v: "finished", l: "Finalizados" },
  { v: "pending", l: "Pendientes" },
];

export function Bracket({ torneo }: { torneo: string }) {
  const q = useApi<{ equipos: any[]; bracket: Llave[] }>("/api/torneos/bracket?torneo=" + encodeURIComponent(torneo));
  const [teamQuery, setTeamQuery] = useState("");
  const [roundFilter, setRoundFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<BracketStatusFilter>("todos");
  const [compact, setCompact] = useState(false);

  const allMatches = q.data?.bracket || [];
  const roundNames = useMemo(() => {
    const seen = new Set<string>();
    for (const l of allMatches) seen.add(String(l.ronda));
    return Array.from(seen);
  }, [allMatches]);

  const rondas = useMemo(() => {
    const filtered = filterBracketMatches(allMatches, {
      round: roundFilter,
      status: statusFilter,
      teamQuery,
    });
    const m = new Map<string, Llave[]>();
    for (const l of filtered) {
      const k = String(l.ronda);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    m.forEach((v) => v.sort((a, b) => (a.slot || 0) - (b.slot || 0)));
    return Array.from(m.entries());
  }, [allMatches, roundFilter, statusFilter, teamQuery]);

  if (q.isLoading) return <Skel h={80} n={2} />;
  if (q.error && q.error.code !== "sin_datos") return <ErrorBox error={q.error} what="el bracket" onRetry={() => q.refetch()} />;
  if (allMatches.length === 0)
    return <Empty code="bracket · sin sembrar" title="El bracket aún no se ha generado" text="Se genera en el servidor cuando cierran las inscripciones y se confirman los equipos." />;

  const normalizedQuery = normalizeText(teamQuery);
  const hasFilters = Boolean(normalizedQuery || roundFilter || statusFilter !== "todos");

  return (
    <div className="grid gap-4" data-testid="bracket-container">
      <div className="panel panel-pad grid gap-3" style={{ background: "var(--grafito-1)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            className="input h-10 w-full sm:w-64"
            placeholder="Buscar o resaltar equipo…"
            aria-label="Buscar equipo en el bracket"
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            data-testid="input-buscar-bracket"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {BRACKET_STATUS_FILTERS.map((st) => (
              <button
                key={st.v}
                type="button"
                className={"btn btn-sm " + (statusFilter === st.v ? "btn-rojo" : "btn-ghost")}
                aria-pressed={statusFilter === st.v}
                onClick={() => setStatusFilter(st.v)}
                data-testid={"filter-bracket-status-" + st.v}
              >
                {st.l}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-pressed={compact}
              onClick={() => setCompact((c) => !c)}
              data-testid="button-bracket-compact"
            >
              {compact ? "Vista normal" : "Vista compacta"}
            </button>
          </div>
        </div>
        {roundNames.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por ronda">
            <button
              type="button"
              className={"btn btn-sm " + (!roundFilter ? "btn-rojo" : "btn-ghost")}
              aria-pressed={!roundFilter}
              onClick={() => setRoundFilter("")}
              data-testid="filter-bracket-round-all"
            >
              Todas las rondas
            </button>
            {roundNames.map((r) => (
              <button
                key={r}
                type="button"
                className={"btn btn-sm " + (roundFilter === r ? "btn-rojo" : "btn-ghost")}
                aria-pressed={roundFilter === r}
                onClick={() => setRoundFilter(r)}
                data-testid={"filter-bracket-round-" + r}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {rondas.length === 0 ? (
        <Empty
          code="bracket · filtro"
          title="Ninguna llave coincide con los filtros"
          text="Ajusta la ronda, el estado o el nombre del equipo buscado."
          action={
            hasFilters ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setTeamQuery("");
                  setRoundFilter("");
                  setStatusFilter("todos");
                }}
              >
                Limpiar filtros
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto pb-2" data-testid="bracket">
          <div className="flex gap-5 min-w-max">
            {rondas.map(([ronda, llaves]) => (
              <div key={ronda} className={"grid content-around " + (compact ? "gap-2.5" : "gap-4")} style={{ width: compact ? 205 : 236 }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">{ronda}</span>
                  <span className="text-[11px] muted num">{llaves.length}</span>
                </div>
                {llaves.map((l) => {
                  const st = classifyBracketStatus(l);
                  const highlighted =
                    Boolean(normalizedQuery) &&
                    normalizeText([l.team_a, l.team_b].filter(Boolean).join(" ")).includes(normalizedQuery);
                  return (
                    <div
                      key={ronda + l.slot}
                      className="panel"
                      style={{
                        borderLeft: st === "live" ? "2px solid var(--rojo)" : undefined,
                        boxShadow: highlighted ? "inset 0 0 0 1px var(--rojo)" : undefined,
                      }}
                    >
                      {[{ n: l.team_a, s: l.score_a }, { n: l.team_b, s: l.score_b }].map((t, i) => {
                        const win = l.ganador && t.n && l.ganador === t.n;
                        return (
                          <div
                            key={i}
                            className={"flex justify-between gap-2 " + (compact ? "px-2.5 py-1.5 text-sm" : "px-3 py-2")}
                            style={{
                              borderTop: i ? "1px solid var(--linea-suave)" : undefined,
                              color: win ? "var(--blanco)" : t.n ? "var(--gris-1)" : "var(--gris-3)",
                              fontWeight: win ? 700 : 500,
                            }}
                          >
                            <span className="truncate">{t.n || "Por definir"}</span>
                            <span className="num">{t.s ?? "–"}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Inscripción ---------------- */
function Inscripcion({ t }: { t: Tournament }) {
  const { status, login } = useAuth();
  const mem = useMembresia();
  const [form, setForm] = useState({ equipo: "", tag: "", capitan: "", region: t.region || "" });
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; msg?: string }>({ k: "idle" });
  const qc = useQueryClient();
  const mis = useMisEquipos();
  const delJuego = (mis.data?.equipos || []).filter((e) => e.juego === t.game?.slug);
  const usarEquipo = (slug: string) => {
    const e = delJuego.find((x) => x.slug === slug);
    if (!e) return;
    const cap = e.miembros.find((m) => m.rol === "capitan");
    setForm({ equipo: e.nombre, tag: e.tag || "", capitan: cap ? cap.nick : form.capitan, region: e.region || form.region });
  };
  if (t.estado !== "upcoming") return <p className="muted small">Las inscripciones de este torneo están cerradas.</p>;
  if (status !== "autenticado") {
    return (
      <div className="grid gap-3">
        <p className="muted small">Para inscribir un equipo necesitas iniciar sesión. El capitán queda asociado a tu cuenta.</p>
        {AUTH_ENABLED && status === "anonimo" && <button className="btn btn-rojo" onClick={() => login({ returnTo: "/torneos/" + t.slug })} data-testid="button-inscribir-login">Iniciar sesión para inscribirte</button>}
      </div>
    );
  }
  if (st.k === "ok") {
    return (
      <div className="grid gap-4" data-testid="inscripcion-ok">
        <div className="empty" style={{ borderColor: "rgba(61,220,132,.4)" }} role="status">
          <div className="check-circulo d-2" style={{ color: "var(--ok)" }} aria-hidden="true">✓</div>
          <span className="empty-code" style={{ color: "var(--ok)" }}>inscripción · pendiente</span>
          <p className="d-3">Solicitud registrada</p>
          <p className="small muted">La organización revisará la inscripción de <strong>{form.equipo}</strong>{form.tag ? <span className="num"> [{form.tag}]</span> : null} en <strong>{t.nombre}</strong>.</p>
          <p className="small muted">Recibirás un correo de confirmación y el estado aparecerá en <Link href="/perfil/torneos" className="link-arrow">Mis torneos</Link>.</p>
        </div>
        {mem.sinPlan && <UpsellPlan motivo="inscripcion" />}
      </div>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.equipo.trim().length < 3) { setSt({ k: "error", msg: "El nombre del equipo debe tener al menos 3 caracteres." }); return; }
    if (!/^[A-Za-z0-9]{2,4}$/.test(form.tag)) { setSt({ k: "error", msg: "El tag debe tener entre 2 y 4 caracteres alfanuméricos." }); return; }
    if (!form.capitan.trim()) { setSt({ k: "error", msg: "Indica el nick del capitán." }); return; }
    setSt({ k: "enviando" });
    try {
      await api("/api/torneos/inscribir", { method: "POST", auth: true, body: { torneo: t.slug, juego: t.game?.slug, ...form } });
      setSt({ k: "ok" });
      qc.invalidateQueries({ queryKey: ["/int/mis-inscripciones"] });
      // Correo de confirmación al capitán (lo omite el worker si no hay email o API key).
      api("/int/email/inscripcion", { method: "POST", auth: true, body: { torneo: t.slug } }).catch(() => null);
    } catch (err: any) {
      const m: Record<string, string> = { equipo_ya_inscrito: "Ese equipo ya está inscrito en este torneo.", datos_invalidos: "Revisa los datos del equipo.", sin_sesion: "Tu sesión expiró.", "Origen no permitido": "Este dominio aún no está autorizado por la API para inscribir equipos." };
      setSt({ k: "error", msg: m[err.code] || "No se pudo registrar la inscripción (" + err.code + ")." });
    }
  };
  const set = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-4" data-testid="form-inscripcion">
      <div className="flex flex-wrap gap-2">
        <span className="tag">{t.game?.nombre || ""}</span>
        {t.formato ? <span className="tag">{t.formato}</span> : null}
        {t.prize ? <span className="tag tag-rojo">{dinero(t.prize.value, t.prize.currency)}</span> : null}
      </div>
      {delJuego.length > 0 ? (
        <div className="field"><label htmlFor="mi-eq">Inscribir uno de mis equipos</label><select id="mi-eq" className="input" defaultValue="" onChange={(e) => usarEquipo(e.target.value)} data-testid="select-mi-equipo"><option value="" disabled>Elegir equipo…</option>{delJuego.map((e) => <option key={e.slug} value={e.slug}>{e.nombre}{e.tag ? " [" + e.tag + "]" : ""}</option>)}</select></div>
      ) : mis.data ? <p className="small muted">¿Aún no tienes equipo de {t.game?.nombre || "este juego"}? <Link href="/equipos" className="link-arrow">Crea uno</Link> y vuelve aquí.</p> : null}
      <div className="field"><label htmlFor="eq">Nombre del equipo</label><input id="eq" className="input" required maxLength={32} value={form.equipo} onChange={set("equipo")} placeholder="Ej.: Reyes del Aim" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label htmlFor="tg">Tag (2–4)</label><input id="tg" className="input" required maxLength={4} pattern="[A-Za-z0-9]{2,4}" value={form.tag} onChange={set("tag")} placeholder="VNTS" /></div>
        <div className="field"><label htmlFor="rg">Región</label><input id="rg" className="input" maxLength={40} value={form.region} onChange={set("region")} placeholder="LATAM" /></div>
      </div>
      <div className="field"><label htmlFor="cp">Capitán (nick en el juego)</label><input id="cp" className="input" required maxLength={40} value={form.capitan} onChange={set("capitan")} placeholder="Tu nick dentro del juego" /></div>
      <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-inscribir">{st.k === "enviando" ? "Enviando…" : "Solicitar inscripción"}</button>
      {st.k === "error" && <p className="small" role="alert" style={{ color: "#ff5468" }}>{st.msg}</p>}
      <p className="small muted">La organización confirma cada plaza. Te avisaremos por correo y en la campana de notificaciones.</p>
    </form>
  );
}

/** Upsell a planes para jugadores sin plan (tras inscribirse, en Ranked…). */
export function UpsellPlan({ motivo }: { motivo: "inscripcion" | "ranked" | "clips" }) {
  const textos = {
    inscripcion: { t: "Inscríbete sin fee con VANTS PRO", d: "Los planes VANTS quitan el fee de inscripción en torneos abiertos y te dan cola prioritaria en VANTS Ranked." },
    ranked: { t: "Cola prioritaria con VANTS PRO", d: "Con un plan activo entras primero en las colas de VANTS Ranked y acumulas rango más rápido." },
    clips: { t: "Canal verificado con VANTS CREATOR", d: "Los creadores con plan tienen canal de clips verificado, destacado en la sala y kit de overlays." },
  }[motivo];
  return (
    <div className="panel panel-pad flotar" style={{ borderColor: "rgba(255,13,46,.4)" }} data-testid={"upsell-" + motivo}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Ventaja de planes</div>
          <div className="d-3">{textos.t}</div>
          <p className="small muted mt-2" style={{ maxWidth: "44ch" }}>{textos.d}</p>
        </div>
        <span className="candado" style={{ fontSize: "1.6rem" }} aria-hidden="true">🔒</span>
      </div>
      <Link href="/membresias" className="btn btn-rojo btn-sm mt-3" data-testid={"upsell-btn-" + motivo}>Ver planes VANTS</Link>
    </div>
  );
}

function GuardarTorneoBtn({ t }: { t: Tournament }) {
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  const toggleBookmark = async () => {
    setSaving(true);
    try {
      const ws = await import("@/lib/googleWorkspace");
      if (!ws.getCurrentWorkspaceUser()) {
        await ws.signInWithGoogleBasic();
      }
      if (savedId) {
        await ws.proApi(`/api/pro/bookmarks/${savedId}`, { method: "DELETE" });
        setSavedId(null);
        toast({ kind: "ok", title: "Torneo quitado de guardados" });
      } else {
        const res = await ws.proApi<{ bookmark: { id: number } }>("/api/pro/bookmarks", {
          method: "POST",
          body: { tournamentSlug: t.slug, tournamentName: t.nombre, gameSlug: t.game?.slug || null },
        });
        setSavedId(res.bookmark.id);
        toast({ kind: "ok", title: "Torneo guardado en tu Workspace Pro" });
      }
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo actualizar guardado", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <button
        type="button"
        className={"btn btn-sm " + (savedId ? "btn-rojo" : "")}
        disabled={saving}
        onClick={toggleBookmark}
        data-testid="button-guardar-torneo"
      >
        {saving ? "Guardando…" : savedId ? "Guardado en Workspace" : "Guardar torneo"}
      </button>
      <Link href="/workspace" className="btn btn-sm btn-ghost">
        Organizar en Workspace
      </Link>
    </div>
  );
}

export function TorneoDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useApi<{ data: Tournament }>("/api/tournaments/" + slug);
  const [tab, setTab] = useState("resumen");
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 ? <Empty code="404 · torneo" title="Este torneo no existe o fue retirado" action={<Link href="/torneos" className="link-arrow">Volver a torneos →</Link>} /> : <ErrorBox error={q.error} what="el torneo" onRetry={() => q.refetch()} />}</div>;
  const t = q.data!.data;
  const premio = t.prize ? dinero(t.prize.value, t.prize.currency) : null;
  return (
    <>
      <header className="border-b" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
        <div className="wrap py-10 md:py-14 grid gap-8 md:grid-cols-[1fr_auto] items-end">
          <div>
            <Link href="/torneos" className="link-arrow mb-5">← Torneos</Link>
            <div className="flex flex-wrap gap-1.5 mb-4"><GameTag g={t.game} />{t.major && <span className="tag tag-rojo">Major</span>}{t.region && <span className="tag">{t.region}</span>}{t.is_demo && <span className="tag tag-aviso">Demo</span>}</div>
            <h1 className="d-1">{t.nombre}</h1>
            {t.descripcion && <p className="lead mt-4">{t.descripcion}</p>}
            <GuardarTorneoBtn t={t} />
          </div>
          {t.logo_url && <img src={assetUrl(t.logo_url)!} alt="" width={120} height={120} className="chamfer" />}
        </div>
        <div className="wrap grid grid-cols-2 md:grid-cols-5 gap-px pb-0" style={{ background: "var(--linea-suave)" }}>
          {[
            ["Inicio", t.starts_at ? fecha(t.starts_at, { day: "2-digit", month: "short", year: "numeric" }) + " " + hora(t.starts_at) : "Por anunciar"],
            ["Fin", t.ends_at ? fecha(t.ends_at, { day: "2-digit", month: "short", year: "numeric" }) : "—"],
            ["Formato", t.formato || "—"],
            ["Plazas", t.max_teams ? String(t.max_teams) + " equipos" : "—"],
            ["Premio", premio || "—"],
          ].map(([k, v]) => <div key={k} className="p-4" style={{ background: "var(--grafito-1)" }}><div className="eyebrow mb-1">{k}</div><div className="num">{v}</div></div>)}
        </div>
      </header>
      <div className="wrap mt-6">
        <div className="tabs" role="tablist">
          {[["resumen", "Resumen"], ["bracket", "Bracket"], ["partidos", "Partidos"]].map(([v, l]) => <button key={v} role="tab" className="tab" aria-selected={tab === v} onClick={() => setTab(v)} data-testid={"tab-torneo-" + v}>{l}</button>)}
        </div>
      </div>
      {tab === "resumen" && (
        <div className="wrap py-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-6 content-start">
            <div><h2 className="d-3 mb-2">Inscripción</h2><p className="muted small">Cuota: {t.fee ? dinero(t.fee, "EUR") : "Sin coste"}. Cierre: {t.starts_at ? fecha(t.starts_at, { day: "2-digit", month: "long" }) : "por anunciar"}.</p></div>
            <div><h2 className="d-3 mb-3">Equipos confirmados</h2><Participantes slug={t.slug} /></div>
          </div>
          <aside className="panel panel-pad chamfer content-start"><h2 className="d-3 mb-4">Inscribir equipo</h2><Inscripcion t={t} /></aside>
        </div>
      )}
      {tab === "bracket" && <div className="wrap py-8"><Bracket torneo={t.slug} /></div>}
      {tab === "partidos" && <TorneoPartidos slug={t.slug} juego={t.game?.slug} />}
    </>
  );
}

function Participantes({ slug }: { slug: string }) {
  const q = useApi<{ equipos: any[] }>("/api/torneos/bracket?torneo=" + encodeURIComponent(slug));
  const eq = (q.data?.equipos || []).filter((e) => e.status !== "pendiente");
  if (q.isLoading) return <Skel n={2} h={44} />;
  if (eq.length === 0) return <Empty code="equipos · 0" title="Ningún equipo confirmado todavía" />;
  return <div className="grid-auto grid sm:grid-cols-2">{eq.map((e) => <div key={e.id} className="p-3 flex gap-2 items-center"><span className="tag">{e.tag}</span><span className="font-semibold truncate">{e.name}</span></div>)}</div>;
}

function TorneoPartidos({ slug, juego }: { slug: string; juego?: string }) {
  const qs = ["live", "upcoming", "finished"].map((e) => useApi<{ data: Paged<Match> }>(`/api/matches?estado=${e}&porPagina=50${juego ? "&juego=" + juego : ""}`));
  const all = qs.flatMap((q) => q.data?.data.items || []).filter((m) => m.tournament_slug === slug);
  return (
    <div className="wrap py-8"><div className="panel">
      {qs.some((q) => q.isLoading) ? <Skel /> : all.length === 0 ? <Empty code="partidos · 0" title="Sin partidos publicados para este torneo" /> : all.map((m, i) => <MatchRow key={i} m={m} />)}
    </div></div>
  );
}

/* ---------------- Agenda / resultados ---------------- */
export function Agenda({ modo }: { modo: "agenda" | "resultados" }) {
  const [estado, setEstado] = useState(modo === "agenda" ? "live" : "finished");
  const [juego, setJuego] = useState("");
  const [pag, setPag] = useState(1);
  const q = useApi<{ data: Paged<Match> }>(`/api/matches?estado=${estado}&pag=${pag}&porPagina=20${juego ? "&juego=" + juego : ""}`, { refetchMs: estado === "live" ? 30_000 : undefined });
  const d = q.data?.data;
  return (
    <>
      <PageHead eyebrow={modo === "agenda" ? "Agenda en vivo" : "Resultados"} title={modo === "agenda" ? "Agenda" : "Últimos resultados"} lead={modo === "agenda" ? "Partidos en directo y próximos. Los marcadores en vivo se actualizan cada 30 segundos." : "Resultados oficiales registrados por la organización."} />
      <div className="wrap">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {modo === "agenda" ? (
            <div className="tabs" role="tablist">{[["live", "En vivo"], ["upcoming", "Próximos"]].map(([v, l]) => <button key={v} role="tab" className="tab" aria-selected={estado === v} onClick={() => { setEstado(v); setPag(1); }}>{l}</button>)}</div>
          ) : <span />}
          <GameFilter value={juego} onChange={(v) => { setJuego(v); setPag(1); }} />
        </div>
        <div className="panel">
          {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="los partidos" onRetry={() => q.refetch()} /> : !d || d.items.length === 0 ? (
            <Empty code={"partidos · " + estado} title={estado === "live" ? "No hay partidos en directo" : estado === "upcoming" ? "No hay partidos programados" : "Todavía no hay resultados"} text="Los partidos se crean al generarse el bracket de cada torneo." />
          ) : (<>{d.items.map((m, i) => <MatchRow key={i} m={m} />)}<Pager pag={d.pag} total={d.total} por={d.porPagina || 20} onPage={setPag} /></>)}
        </div>
      </div>
    </>
  );
}

export function MiCalendario() {
  return (
    <>
      <PageHead eyebrow="Tu calendario" title="Mi calendario" lead="Los torneos en los que está inscrito tu equipo, con su fecha y el estado de la inscripción." />
      <AuthGate what="tu calendario">
        <MisInscripciones />
      </AuthGate>
    </>
  );
}

export function BracketPrincipal() {
  const q = useApi<{ data: Paged<Tournament> }>("/api/tournaments?estado=ongoing&porPagina=12");
  const t = (q.data?.data.items || []).find((x) => x.major) || q.data?.data.items[0];
  return (
    <>
      <PageHead eyebrow="Bracket principal" title={t ? t.nombre : "Bracket principal"} lead="El cuadro del torneo principal en curso. Los resultados los registra la organización." actions={t ? <Link href={"/torneos/" + t.slug} className="btn btn-sm">Ficha del torneo</Link> : undefined} />
      <div className="wrap">
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="el torneo principal" onRetry={() => q.refetch()} /> : !t ? (
          <Empty code="bracket · sin torneo en curso" title="No hay un torneo en curso" text="El bracket principal aparece cuando hay un torneo en marcha." action={<Link href="/torneos" className="link-arrow">Ver próximos torneos →</Link>} />
        ) : <Bracket torneo={t.slug} />}
      </div>
    </>
  );
}

export function Ligas() {
  const [juego, setJuego] = useState("");
  const q = useApi<{ data: Paged<Tournament> }>("/api/tournaments?estado=archive&porPagina=100");
  const todos = q.data?.data?.items || [];
  const counts = useMemo(() => countTournamentsByGame(todos), [todos]);
  const visibles = useMemo(
    () => filterAndSortTournaments(todos, { juego }),
    [todos, juego],
  );
  return (
    <>
      <PageHead eyebrow="Ligas y temporadas" title="Ligas y temporadas" lead="Temporadas del circuito VANTS y su histórico de torneos organizados por videojuego." />
      <Section title="Torneos de temporadas anteriores">
        <div className="grid gap-4">
          <GameFilter value={juego} onChange={setJuego} counts={counts} totalTodos={todos.length} />
          <div className="panel">
            {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="el archivo" onRetry={() => q.refetch()} /> : visibles.length === 0 ? (
              <Empty
                code={"ligas · " + (juego || "0")}
                title={juego && JUEGO_POR_SLUG[juego] ? `Sin temporadas cerradas de ${JUEGO_POR_SLUG[juego].nombre}` : "Todavía no hay temporadas cerradas"}
                text="Al terminar la primera temporada su clasificación y torneos quedarán archivados aquí."
              />
            ) : visibles.map((t) => <TournamentRow key={t.slug} t={t} />)}
          </div>
        </div>
      </Section>
    </>
  );
}
