import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { useApi } from "@/lib/useApi";
import { api, assetUrl, type Paged, type Tournament, type Match } from "@/lib/api";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate, GameTag } from "@/components/ui-vants";
import { TournamentRow, MatchRow } from "@/components/domain";
import { dinero, fecha, hora } from "@/lib/format";
import { useMisEquipos, MisInscripciones } from "./Vants";
import { useQueryClient } from "@tanstack/react-query";

const JUEGOS = [{ v: "", l: "Todos" }, { v: "valorant", l: "VALORANT" }, { v: "cs2", l: "CS2" }];

function GameFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Filtrar por juego">
      {JUEGOS.map((j) => (
        <button key={j.v} className={"btn btn-sm " + (value === j.v ? "btn-rojo" : "btn-ghost")} aria-pressed={value === j.v} onClick={() => onChange(j.v)} data-testid={"filter-juego-" + (j.v || "todos")}>{j.l}</button>
      ))}
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
  const [estado, setEstado] = useState(competir ? "upcoming" : "upcoming");
  const [juego, setJuego] = useState("");
  const [pag, setPag] = useState(1);
  const q = useApi<{ data: Paged<Tournament> }>(`/api/tournaments?estado=${estado}&pag=${pag}&porPagina=12${juego ? "&juego=" + juego : ""}`);
  const d = q.data?.data;
  return (
    <>
      <PageHead
        eyebrow={competir ? "Competir" : "Torneos"}
        title={competir ? <>Inscribe a tu <span style={{ color: "var(--rojo)" }}>equipo</span></> : "Descubrir torneos"}
        lead={competir ? "Torneos con inscripción próxima. La inscripción se valida en el servidor y queda pendiente hasta que la organización la confirme." : "Torneos de VALORANT y Counter-Strike 2 publicados por la organización de VANTS."}
      />
      <div className="wrap">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {!competir ? (
            <div className="tabs" role="tablist">
              {TABS_T.map((t) => <button key={t.v} role="tab" className="tab" aria-selected={estado === t.v} onClick={() => { setEstado(t.v); setPag(1); }} data-testid={"tab-" + t.v}>{t.l}</button>)}
            </div>
          ) : <span />}
          <GameFilter value={juego} onChange={(v) => { setJuego(v); setPag(1); }} />
        </div>
        <div className="panel">
          {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="los torneos" /> : !d || d.items.length === 0 ? (
            <Empty code={"torneos · " + estado + (juego ? " · " + juego : "")} title={competir ? "No hay inscripciones abiertas" : "No hay torneos en esta categoría"} text="Los torneos los publica la organización desde el panel interno. Vuelve más tarde o sigue los anuncios en Comunidad." action={<Link href="/noticias" className="link-arrow">Ver anuncios <span aria-hidden>→</span></Link>} />
          ) : (
            <>
              {d.items.map((t) => <TournamentRow key={t.slug} t={t} />)}
              <Pager pag={d.pag} total={d.total} por={d.porPagina || 12} onPage={setPag} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Bracket ---------------- */
interface Llave { ronda: string; slot: number; team_a: string | null; team_b: string | null; score_a: number | null; score_b: number | null; estado: string | null; ganador: string | null }

export function Bracket({ torneo }: { torneo: string }) {
  const q = useApi<{ equipos: any[]; bracket: Llave[] }>("/api/torneos/bracket?torneo=" + encodeURIComponent(torneo));
  const rondas = useMemo(() => {
    const m = new Map<string, Llave[]>();
    for (const l of q.data?.bracket || []) {
      const k = String(l.ronda);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    m.forEach((v) => v.sort((a, b) => (a.slot || 0) - (b.slot || 0)));
    return Array.from(m.entries());
  }, [q.data]);
  if (q.isLoading) return <Skel h={80} n={2} />;
  if (q.error && q.error.code !== "sin_datos") return <ErrorBox error={q.error} what="el bracket" />;
  if (rondas.length === 0)
    return <Empty code="bracket · sin sembrar" title="El bracket aún no se ha generado" text="Se genera en el servidor cuando cierran las inscripciones y se confirman los equipos." />;
  return (
    <div className="overflow-x-auto pb-2" data-testid="bracket">
      <div className="flex gap-6 min-w-max">
        {rondas.map(([ronda, llaves]) => (
          <div key={ronda} className="grid content-around gap-4" style={{ width: 230 }}>
            <div className="eyebrow">{ronda}</div>
            {llaves.map((l) => (
              <div key={ronda + l.slot} className="panel" style={{ borderLeft: l.estado === "live" ? "2px solid var(--rojo)" : undefined }}>
                {[{ n: l.team_a, s: l.score_a }, { n: l.team_b, s: l.score_b }].map((t, i) => {
                  const win = l.ganador && t.n && l.ganador === t.n;
                  return (
                    <div key={i} className="flex justify-between gap-2 px-3 py-2" style={{ borderTop: i ? "1px solid var(--linea-suave)" : undefined, color: win ? "var(--blanco)" : t.n ? "var(--gris-1)" : "var(--gris-3)", fontWeight: win ? 700 : 500 }}>
                      <span className="truncate">{t.n || "Por definir"}</span>
                      <span className="num">{t.s ?? "–"}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Inscripción ---------------- */
function Inscripcion({ t }: { t: Tournament }) {
  const { status, login } = useAuth();
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
  if (st.k === "ok") return <div className="empty" style={{ borderColor: "rgba(61,220,132,.4)" }} role="status"><span className="empty-code" style={{ color: "var(--ok)" }}>inscripción · pendiente</span><p className="d-3">Solicitud registrada</p><p className="small muted">La organización revisará la inscripción. Su estado aparecerá en <Link href="/perfil/torneos" className="link-arrow">Mis torneos</Link> y recibirás un aviso en la campana.</p></div>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try {
      await api("/api/torneos/inscribir", { method: "POST", auth: true, body: { torneo: t.slug, juego: t.game?.slug, ...form } });
      setSt({ k: "ok" });
      qc.invalidateQueries({ queryKey: ["/int/mis-inscripciones"] });
    } catch (err: any) {
      const m: Record<string, string> = { equipo_ya_inscrito: "Ese equipo ya está inscrito en este torneo.", datos_invalidos: "Revisa los datos del equipo.", sin_sesion: "Tu sesión expiró.", "Origen no permitido": "Este dominio aún no está autorizado por la API para inscribir equipos." };
      setSt({ k: "error", msg: m[err.code] || "No se pudo registrar la inscripción (" + err.code + ")." });
    }
  };
  const set = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-3" data-testid="form-inscripcion">
      {delJuego.length > 0 ? (
        <div className="field"><label htmlFor="mi-eq">Inscribir uno de mis equipos</label><select id="mi-eq" className="input" defaultValue="" onChange={(e) => usarEquipo(e.target.value)} data-testid="select-mi-equipo"><option value="" disabled>Elegir equipo…</option>{delJuego.map((e) => <option key={e.slug} value={e.slug}>{e.nombre}{e.tag ? " [" + e.tag + "]" : ""}</option>)}</select></div>
      ) : mis.data ? <p className="small muted">¿Aún no tienes equipo de {t.game?.nombre || "este juego"}? <Link href="/equipos" className="link-arrow">Crea uno</Link> y vuelve aquí.</p> : null}
      <div className="field"><label htmlFor="eq">Nombre del equipo</label><input id="eq" className="input" required maxLength={32} value={form.equipo} onChange={set("equipo")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label htmlFor="tg">Tag</label><input id="tg" className="input" required maxLength={4} pattern="[A-Za-z0-9]{2,4}" value={form.tag} onChange={set("tag")} /></div>
        <div className="field"><label htmlFor="rg">Región</label><input id="rg" className="input" maxLength={40} value={form.region} onChange={set("region")} /></div>
      </div>
      <div className="field"><label htmlFor="cp">Capitán (nick en el juego)</label><input id="cp" className="input" required maxLength={40} value={form.capitan} onChange={set("capitan")} /></div>
      <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-inscribir">{st.k === "enviando" ? "Enviando…" : "Solicitar inscripción"}</button>
      {st.k === "error" && <p className="small" role="alert" style={{ color: "#ff5468" }}>{st.msg}</p>}
    </form>
  );
}

export function TorneoDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useApi<{ data: Tournament }>("/api/tournaments/" + slug);
  const [tab, setTab] = useState("resumen");
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 ? <Empty code="404 · torneo" title="Este torneo no existe o fue retirado" action={<Link href="/torneos" className="link-arrow">Volver a torneos →</Link>} /> : <ErrorBox error={q.error} what="el torneo" />}</div>;
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
          {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="los partidos" /> : !d || d.items.length === 0 ? (
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
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="el torneo principal" /> : !t ? (
          <Empty code="bracket · sin torneo en curso" title="No hay un torneo en curso" text="El bracket principal aparece cuando hay un torneo en marcha." action={<Link href="/torneos" className="link-arrow">Ver próximos torneos →</Link>} />
        ) : <Bracket torneo={t.slug} />}
      </div>
    </>
  );
}

export function Ligas() {
  const q = useApi<{ data: Paged<Tournament> }>("/api/tournaments?estado=archive&porPagina=12");
  return (
    <>
      <PageHead eyebrow="Ligas y temporadas" title="Ligas y temporadas" lead="Temporadas del circuito VANTS y su histórico de torneos." />
      <Section title="Torneos de temporadas anteriores">
        <div className="panel">
          {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="el archivo" /> : (q.data?.data.items || []).length === 0 ? (
            <Empty code="ligas · 0" title="Todavía no hay temporadas cerradas" text="Al terminar la primera temporada su clasificación y torneos quedarán archivados aquí." />
          ) : q.data!.data.items.map((t) => <TournamentRow key={t.slug} t={t} />)}
        </div>
      </Section>
    </>
  );
}
