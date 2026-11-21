import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { Insignia3D, useCatalogoInsignias } from "@/components/Insignia3D";
import { useApi } from "@/lib/useApi";
type DirectoInt = { plataforma: "twitch" | "kick"; canal: string; nombre: string | null; en_vivo: boolean; titulo: string | null; juego: string | null; espectadores: number | null; miniatura: string | null; url: string; desde: string | null };
import { pub, type Paged, type Tournament, type Match, type Team, type Article, type YtVideo, type Stream } from "@/lib/api";
import { Section, Empty, Skel, ErrorBox } from "@/components/ui-vants";
import { SeccionEmpresas, APP_APK } from "@/components/SeccionEmpresas";
import { TournamentRow, MatchRow, TeamTile, VideoTile, StreamTile } from "@/components/domain";
import { JUEGOS } from "@/lib/juegos";
import { countGamesByPlatform, filterGamesByPlatform, type PlataformaFiltro } from "@/lib/discovery";
import { PLANES } from "@/lib/planes";
import { useAuth } from "@/lib/auth";
import { useRanking, useEventos, FilaEvento } from "./Vants";
import { NivelFaceit } from "./PerfilFaceit";

/* ---------- Bloque 1 · Hero: titular + CTAs de bienvenida ---------- */
function Hero() {
  const { status, login } = useAuth();
  const anonimo = status === "anonimo";
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: "var(--linea-suave)" }}>
      <div className="hero-fondo absolute inset-0" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />
      <div className="wrap relative py-20 md:py-28 lg:py-36">
        <div className="eyebrow mb-6 reveal anim-1">ESPORTS · HECHO EN VENEZUELA</div>
        <h1 className="d-hero">
          {["Compete.", "Connect.", "Dominate."].map((t, i) => (
            <span key={t} className="palabra block" style={{ "--d": `${80 + i * 120}ms`, color: i === 2 ? "var(--rojo)" : undefined } as CSSProperties}>
              {t}
            </span>
          ))}
        </h1>
        <p className="lead mt-6 reveal anim-4" style={{ maxWidth: "64ch" }}>
          Una plataforma para conectar jugadores, comunidades y oportunidades competitivas en Venezuela y Latinoamérica:
          torneos con bracket, rankings calculados en servidor, clips y la comunidad que juega cada noche.
        </p>
        <div className="flex flex-wrap gap-3 mt-8 reveal anim-5">
          {anonimo ? (
            <button type="button" className="btn btn-rojo" data-testid="hero-signup" onClick={() => login({ signup: true, returnTo: "/perfil" })}>
              Crear cuenta gratis <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <Link href="/torneos" className={"btn " + (anonimo ? "" : "btn-rojo")} data-testid="hero-torneos">Ver torneos</Link>
          <a href={APP_APK} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid="hero-apk">
            Descargar App Android (v1.0.0) <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Guía rápida: del registro a la final ---------- */
function ComoFunciona() {
  const pasos = [
    { n: "01", t: "Crea tu cuenta gratis", d: "Configura tu perfil gamer y vincula Riot o FACEIT para registrar tus estadísticas reales." },
    { n: "02", t: "Arma tu comunidad o equipo", d: "Crea tu squad o únete con un código de invitación y elige tus juegos favoritos." },
    { n: "03", t: "Compite, organiza y domina", d: "Participa en brackets oficiales, crea tus propios torneos, escala el ranking y desbloquea insignias." },
  ];
  return (
    <div className="grid gap-px md:grid-cols-3" style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }} data-testid="home-pasos">
      {pasos.map((p, i) => (
        <div key={p.n} className="reveal flotar p-6 md:p-8" style={{ "--d": `${i * 90}ms`, background: "var(--grafito-1)" } as CSSProperties}>
          <div className="num d-2" style={{ color: "var(--rojo)" }}>{p.n}</div>
          <div className="d-3 mt-3">{p.t}</div>
          <p className="muted small mt-2">{p.d}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Marquee: cinta infinita con el manifiesto ---------- */
function Marquee() {
  const items = ["COMPETE", "CONNECT", "DOMINATE", "VALORANT", "CS2", "TORNEOS CON PREMIO", "RANKING EN SERVIDOR", "HECHO EN VENEZUELA"];
  const pista = (
    <>
      {items.map((t) => (
        <span key={t} className="flex items-center gap-6 pr-6 shrink-0">
          <span className="font-bold tracking-wider" style={{ fontFamily: "var(--f-display)", textTransform: "uppercase", fontSize: "0.95rem", color: "var(--gris-2)" }}>{t}</span>
          <span aria-hidden style={{ color: "var(--rojo)" }}>◆</span>
        </span>
      ))}
    </>
  );
  return (
    <div className="marquee border-b py-3 select-none" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }} aria-hidden="true">
      <div className="marquee-pista">
        <div className="flex shrink-0">{pista}</div>
        <div className="flex shrink-0">{pista}</div>
      </div>
    </div>
  );
}

/* ---------- Bloque 3 · Contadores: solo métricas reales (nunca 0) ---------- */
function useContador(fin: number, activo: boolean, ms = 1100) {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!activo || fin <= 0) return;
    const t0 = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(fin * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [activo, fin, ms]);
  return n;
}

function Stat({ valor, sufijo, label, delay }: { valor: number; sufijo?: string; label: string; delay: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const n = useContador(valor, visible);
  return (
    <div ref={ref} className="contador-entrada p-6 text-center" style={{ "--d": delay } as CSSProperties}>
      <div className="d-1 num" style={{ color: "var(--blanco)" }}>{n.toLocaleString("es-VE")}{sufijo}</div>
      <div className="small muted mt-1" style={{ fontFamily: "var(--f-display)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
    </div>
  );
}

/* ---------- Torneo destacado: cuenta regresiva del próximo torneo ---------- */
function useCuentaRegresiva(cuando?: string | null) {
  const [restante, setRestante] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
  useEffect(() => {
    if (!cuando) return;
    const fin = new Date(cuando).getTime();
    if (!Number.isFinite(fin)) return;
    const tic = () => {
      const dif = fin - Date.now();
      if (dif <= 0) { setRestante(null); return; }
      setRestante({ d: Math.floor(dif / 86_400_000), h: Math.floor(dif / 3_600_000) % 24, m: Math.floor(dif / 60_000) % 60, s: Math.floor(dif / 1000) % 60 });
    };
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [cuando]);
  return restante;
}

function TorneoDestacado({ t }: { t: Tournament }) {
  const restante = useCuentaRegresiva(t.starts_at);
  const caja = (n: number, l: string) => (
    <div className="panel panel-pad text-center num" style={{ minWidth: 64 }}>
      <div className="d-2" style={{ color: "var(--blanco)" }}>{String(n).padStart(2, "0")}</div>
      <div className="small muted">{l}</div>
    </div>
  );
  return (
    <Link href={"/torneos/" + t.slug} className="panel flotar brillo-borde block p-6 md:p-8 relative" data-testid="home-destacado">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-3">Torneo destacado</div>
          <div className="d-2">{t.nombre}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="tag">{t.game?.nombre || ""}</span>
            {t.formato ? <span className="tag">{t.formato}</span> : null}
            {t.region ? <span className="tag">{t.region}</span> : null}
          </div>
        </div>
        {t.prize ? (
          <div className="text-right">
            <div className="small muted" style={{ fontFamily: "var(--f-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Premio</div>
            <div className="d-2 num" style={{ color: "var(--rojo)" }}>
              {t.prize.currency === "USD" ? "$" : ""}{Number(t.prize.value).toLocaleString("es-VE")}{t.prize.currency && t.prize.currency !== "USD" ? " " + t.prize.currency : ""}
            </div>
          </div>
        ) : null}
      </div>
      {restante && (
        <div className="flex flex-wrap gap-2 mt-6" aria-label="Cuenta regresiva">
          {caja(restante.d, "días")}{caja(restante.h, "horas")}{caja(restante.m, "min")}{caja(restante.s, "seg")}
        </div>
      )}
      <span className="link-arrow mt-6 inline-flex">Inscribir a mi equipo →</span>
    </Link>
  );
}

function List<T>({ q, empty, render, what }: { q: { isLoading: boolean; error: any; data?: T[]; onRetry?: () => void }; empty: JSX.Element; render: (x: T, i: number) => JSX.Element; what: string }) {
  if (q.isLoading) return <Skel />;
  if (q.error) return <ErrorBox error={q.error} what={what} onRetry={q.onRetry} />;
  if (!q.data || q.data.length === 0) return empty;
  return <>{q.data.map(render)}</>;
}

/* ---------- Bloque 2 · El Circuito: filtros con integrados destacados ---------- */
type FiltroJuego = PlataformaFiltro | "Integrados";
const FILTROS: FiltroJuego[] = ["Todas", "Integrados", "PC", "Consola", "Móvil"];

function ElCircuito() {
  const [filtro, setFiltro] = useState<FiltroJuego>("Todas");
  const conteoPlataformas = useMemo(() => countGamesByPlatform(JUEGOS), []);
  const visibles = useMemo(() => {
    if (filtro === "Integrados") return JUEGOS.filter((j) => j.integrado);
    if (filtro === "Todas") return [...JUEGOS].sort((a, b) => Number(b.integrado || false) - Number(a.integrado || false));
    return filterGamesByPlatform(JUEGOS, filtro).sort((a, b) => Number(b.integrado || false) - Number(a.integrado || false));
  }, [filtro]);
  const cuenta = (f: FiltroJuego) =>
    f === "Integrados" ? JUEGOS.filter((j) => j.integrado).length : conteoPlataformas[f as PlataformaFiltro] ?? visibles.length;

  return (
    <Section id="juegos" eyebrow="El circuito" title={<>Los <span style={{ color: "var(--rojo)" }}>11 juegos</span> de VANTS</>}>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <p className="muted" style={{ maxWidth: "66ch" }}>
          Once títulos competitivos entre PC, consola y móvil. VALORANT y Counter-Strike 2 tienen estadísticas
          integradas (FACEIT / Riot); el resto completa el circuito de torneos, equipos y clips.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar juegos" data-testid="home-platform-filter">
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              className={"btn btn-sm " + (filtro === f ? "btn-rojo" : "btn-ghost")}
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              data-testid={"juego-filter-" + f.toLowerCase()}
            >
              {f === "Integrados" ? "Integrados (Stats en vivo)" : f} <span className="num opacity-75">({cuenta(f)})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="home-juegos">
        {visibles.map((j, i) => (
          <div
            key={j.slug}
            className="reveal panel juego-cover relative block min-h-[220px]"
            style={{ "--d": `${Math.min(i * 40, 320)}ms` } as CSSProperties}
            data-testid={"home-juego-" + j.slug}
          >
            {j.img && <img src={pub(j.img)} alt={j.nombre} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.62 }} loading="lazy" />}
            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(10,10,11,.95) 8%, rgba(10,10,11,.25) 60%)" }} />
            <Link href={"/torneos?juego=" + j.slug} className="absolute inset-0 z-10" aria-label={"Torneos de " + j.nombre} />
            <div className="relative h-full flex flex-col justify-end p-4 pointer-events-none">
              <div className="font-semibold leading-tight">{j.nombre}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="tag">{j.plataforma}</span>
                {j.integrado ? <span className="tag tag-rojo">Estadísticas integradas</span> : null}
              </div>
              <div className="flex gap-3 mt-2 text-xs pointer-events-auto">
                <Link href={"/torneos?juego=" + j.slug} className="muted hover:text-white underline">Torneos</Link>
                <Link href="/clips" className="muted hover:text-white underline">Clips</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Bloque 4 · Escalera de planes + insignias de fundadores ---------- */
function EscaleraPlanes() {
  const insignias = useCatalogoInsignias();
  const gratuito = { id: "gratis", kicker: "Punto de partida", nombre: "Plan Gratuito", precio: "0 € · para siempre", lema: "Entra, compite y crece con la comunidad.", beneficios: ["Registro con verificación de correo", "Participación en comunidad y ranking", "Acceso a torneos abiertos"] };
  const escalera = [gratuito, ...PLANES.filter((p) => p.checkout)];
  return (
    <Section id="membresias" eyebrow="Planes, niveles e insignias" title={<>Tu escalera en <span style={{ color: "var(--rojo)" }}>VANTS</span></>} more={{ to: "/membresias", label: "Comparar planes" }}>
      <div className="grid-auto grid md:grid-cols-2 lg:grid-cols-4">
        {escalera.map((p, i) => (
          <Link
            key={p.id}
            href="/membresias"
            className={"reveal flotar p-6 block" + (p.id === "pro" ? " brillo-borde" : "")}
            style={{ "--d": `${i * 80}ms` } as CSSProperties}
            data-testid={"home-plan-" + p.id}
          >
            <div className="eyebrow mb-3">{p.kicker}</div>
            <div className="d-2">{p.nombre}</div>
            <div className="num mt-2" style={{ color: "var(--gris-1)" }}>{p.precio}</div>
            <ul className="muted small mt-3 grid gap-1.5">
              {(p as any).beneficios.slice(0, 4).map((b: string) => <li key={b}>· {b}</li>)}
            </ul>
          </Link>
        ))}
      </div>

      <div className="panel panel-pad chamfer mt-6 flex flex-wrap items-center gap-4" style={{ borderColor: "rgba(255,13,46,.3)" }} data-testid="home-fundadores">
        <span className="tag tag-rojo">Etapa inicial</span>
        <p className="muted small" style={{ maxWidth: "62ch" }}>
          Las insignias se colocan solas en tu perfil. Quienes se registren en esta etapa inicial obtienen
          reconocimiento como <strong style={{ color: "var(--blanco)" }}>miembros fundadores</strong> de la comunidad.
        </p>
        <div className="flex flex-wrap gap-2">
          {["FOUNDER MEMBER", "SOCIO VANTS", "PRO", "CREATOR", "VERIFIED PARTNER"].map((n) => (
            <span key={n} className="tag">{n}</span>
          ))}
        </div>
      </div>

      {(insignias.data?.catalogo || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-6">
          <span className="small muted">Insignias automáticas en tu perfil:</span>
          {insignias.data!.catalogo.slice(0, 8).map((b) => <Insignia3D key={b.code} d={b} size={44} titulo={b.nombre} />)}
          <Link href="/insignias" className="link-arrow">Ver todas <span aria-hidden>→</span></Link>
        </div>
      )}
    </Section>
  );
}

/* ---------- Home: 5 bloques ---------- */
export default function Home() {
  const destacados = useApi<{ data: Paged<Tournament> }>("/api/tournaments?estado=ongoing&porPagina=4");
  const proximos = useApi<{ data: Paged<Tournament> }>("/api/tournaments?estado=upcoming&porPagina=5");
  const live = useApi<{ data: Paged<Match> }>("/api/matches?estado=live&porPagina=5", { refetchMs: 30_000 });
  const upcomingM = useApi<{ data: Paged<Match> }>("/api/matches?estado=upcoming&porPagina=5");
  const teams = useApi<{ data: Team[] }>("/api/teams");
  const ranking = useRanking();
  const eventos = useEventos();
  const clips = useApi<{ videos: YtVideo[] }>("/api/youtube/ultimos");
  const streams = useApi<{ streams: Stream[]; total_canales: number }>("/api/twitch/directos?limite=3", { refetchMs: 60_000 });
  const directosInt = useApi<{ directos: DirectoInt[] }>("/int/directos", { refetchMs: 60_000 });
  const news = useApi<{ data: Paged<Article> }>("/api/articles?porPagina=3");

  const torneos = [...(destacados.data?.data.items || []), ...(proximos.data?.data.items || [])].slice(0, 5);
  const torneoProximo = (proximos.data?.data.items || []).find((t) => t.starts_at && new Date(t.starts_at).getTime() > Date.now());
  const cargandoTorneos = destacados.isLoading || proximos.isLoading;
  const errorTorneos = destacados.error || proximos.error;

  const matches = [...(live.data?.data.items || []), ...(upcomingM.data?.data.items || [])].slice(0, 6);
  const top = (ranking.data?.faceit || []).slice(0, 5);
  const totalEquipos = teams.data?.data?.length ?? 0;
  const noticias = news.data?.data.items || [];
  const listaEventos = eventos.data?.eventos || [];
  const listaClips = clips.data?.videos || [];

  const vivos = useMemo(() => {
    const xs: (Stream & { url?: string; plataforma?: "twitch" | "kick" })[] = (streams.data?.streams || []).map((s) => ({ ...s, plataforma: "twitch" as const }));
    for (const d of directosInt.data?.directos || []) {
      if (!d.en_vivo) continue;
      if (d.plataforma === "twitch" && xs.some((x) => x.canal.toLowerCase() === d.canal.toLowerCase())) continue;
      xs.push({ canal: d.canal, canalNombre: d.nombre || d.canal, perfil: "", titulo: d.titulo || "", juego: d.juego || "", vistas: d.espectadores || 0, inicio: d.desde || "", idioma: "es", mini: d.miniatura || "", url: d.url, plataforma: d.plataforma });
    }
    return xs;
  }, [streams.data, directosInt.data]);

  return (
    <>
      {/* Bloque 1 · Hero + guía de bienvenida */}
      <Hero />
      <div className="wrap pt-12">
        <ComoFunciona />
      </div>
      <div className="pt-10">
        <Marquee />
      </div>

      {/* Bloque 3 · Métricas reales (sin contadores en cero) */}
      <div className="wrap pt-10">
        <div className="grid-auto grid grid-cols-2 md:grid-cols-4" data-testid="home-stats">
          <Stat valor={JUEGOS.length} label="Juegos competitivos" delay="0ms" />
          <Stat valor={1000} sufijo="+" label="Logros desbloqueables" delay="80ms" />
          {!cargandoTorneos && torneos.length > 0 ? <Stat valor={torneos.length} label="Torneos del circuito" delay="160ms" /> : null}
          {!teams.isLoading && totalEquipos > 0 ? <Stat valor={totalEquipos} label="Equipos registrados" delay="240ms" /> : null}
          <div className="contador-entrada p-6 text-center grid content-center">
            <div className="d-1" style={{ color: "var(--blanco)", fontSize: "clamp(1.1rem,2.2vw,1.6rem)" }}>Riot & FACEIT</div>
            <div className="small muted mt-1" style={{ fontFamily: "var(--f-display)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Integración de estadísticas</div>
          </div>
        </div>
      </div>

      {/* Bloque 2 · El Circuito */}
      <ElCircuito />

      {/* Bloque 3 · Actividad real (solo lo que existe) */}
      {torneoProximo ? (
        <div className="wrap pt-10">
          <TorneoDestacado t={torneoProximo} />
        </div>
      ) : null}

      {cargandoTorneos ? (
        <div className="wrap pt-10"><Skel h={120} n={1} /></div>
      ) : errorTorneos ? (
        <div className="wrap pt-10"><ErrorBox error={errorTorneos} what="los torneos" onRetry={() => { destacados.refetch(); proximos.refetch(); }} /></div>
      ) : torneos.length > 0 ? (
        <Section id="torneos" eyebrow="Circuito" title="Torneos destacados" more={{ to: "/torneos", label: "Todos los torneos" }}>
          <div className="panel">
            {torneos.map((t) => <TournamentRow key={t.slug} t={t} />)}
          </div>
        </Section>
      ) : (
        <div className="wrap pt-12">
          <div className="panel panel-pad chamfer flex flex-wrap items-center justify-between gap-4" data-testid="home-torneos-vacio" style={{ borderColor: "rgba(255,13,46,.28)" }}>
            <div>
              <div className="eyebrow mb-2">La arena espera</div>
              <p className="d-3">¿Quieres inaugurar la arena?</p>
              <p className="muted small mt-1">Crea el primer torneo de tu comunidad hoy.</p>
            </div>
            <Link href="/crear-torneo" className="btn btn-rojo" data-testid="btn-inaugurar">Crear mi torneo <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      )}

      <div className="wrap grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {!(live.isLoading || upcomingM.isLoading) && matches.length === 0 ? null : (
          <Section id="agenda" eyebrow="Agenda" title="Próximos enfrentamientos" more={{ to: "/agenda", label: "Agenda completa" }} className="!px-0">
            <div className="panel">
              <List
                q={{ isLoading: live.isLoading || upcomingM.isLoading, error: live.error || upcomingM.error, data: matches, onRetry: () => { live.refetch(); upcomingM.refetch(); } }}
                what="la agenda"
                render={(m, i) => <MatchRow key={i} m={m} />}
                empty={<Empty code="partidos · 0" title="Sin partidos programados" text="Los enfrentamientos se publican cuando un torneo genera su bracket." />}
              />
            </div>
          </Section>
        )}
        {!ranking.isLoading && !ranking.error && top.length === 0 ? null : (
          <Section id="ranking" eyebrow="Ranking global" title="Top jugadores VANTS" more={{ to: "/ranking", label: "Ver ranking" }} className="!px-0">
            <div className="panel">
              {ranking.isLoading ? <Skel n={5} h={44} /> : ranking.error ? <ErrorBox error={ranking.error} what="el ranking" onRetry={() => ranking.refetch()} /> : (
                <>
                  <ol>
                    {top.map((e) => (
                      <li key={e.nick + e.pos} className="row grid-cols-[32px_1fr_auto_auto] items-center gap-3">
                        <span className="num" style={{ color: e.pos <= 3 ? "var(--rojo)" : "var(--gris-2)" }}>{String(e.pos).padStart(2, "0")}</span>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold truncate hover:text-[var(--rojo)]">{e.nick}{e.equipo?.tag ? <span className="small muted"> · {e.equipo.tag}</span> : null}</a>
                        <NivelFaceit n={e.nivel} size={24} />
                        <span className="num">{e.elo ?? "—"}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="small muted px-4 py-3 border-t" style={{ borderColor: "var(--linea-suave)" }}>Jugadores VANTS · ELO de FACEIT CS2</p>
                </>
              )}
            </div>
          </Section>
        )}
      </div>

      {teams.isLoading ? null : teams.error ? null : totalEquipos === 0 ? null : (
        <Section id="equipos" eyebrow="Circuito" title="Equipos" more={{ to: "/equipos", label: "Todos los equipos" }}>
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {teams.data!.data.slice(0, 8).map((t) => <TeamTile key={t.slug} t={t} />)}
          </div>
        </Section>
      )}

      {clips.isLoading || clips.error ? null : listaClips.length === 0 ? null : (
        <Section id="clips" eyebrow="Clips" title="Últimos clips" more={{ to: "/clips", label: "Ver clips" }}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {listaClips.slice(0, 4).map((v) => <VideoTile key={v.id} v={v} />)}
          </div>
        </Section>
      )}

      <div className="wrap grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {vivos.length > 0 ? (
          <Section id="twitch" eyebrow="Twitch y Kick" title="En directo" more={{ to: "/directos", label: "Directos en vivo" }} className="!px-0">
            <div className="grid gap-6 sm:grid-cols-2">{vivos.slice(0, 4).map((s) => <StreamTile key={(s.plataforma || "twitch") + s.canal} s={s} />)}</div>
          </Section>
        ) : null}
        {news.isLoading || news.error ? null : noticias.length === 0 ? null : (
          <Section id="noticias" eyebrow="Noticias" title="Anuncios" more={{ to: "/noticias", label: "Todas" }} className="!px-0">
            <div className="panel">
              {noticias.map((a) => (
                <Link key={a.slug} href={"/noticias/" + a.slug} className="row grid-cols-1">
                  <span className="small muted num">{new Date(a.publicado_at).toLocaleDateString("es-VE")}</span>
                  <span className="font-semibold">{a.titulo}</span>
                </Link>
              ))}
            </div>
          </Section>
        )}
        {eventos.isLoading || eventos.error ? null : listaEventos.length === 0 ? null : (
          <Section id="eventos" eyebrow="Comunidad" title="Próximos eventos" more={{ to: "/eventos", label: "Todos" }} className="!px-0 lg:col-span-2">
            <div className="panel">
              {listaEventos.slice(0, 3).map((e: any) => <FilaEvento key={e.id} e={e} />)}
            </div>
          </Section>
        )}
      </div>

      {/* Bloque 4 · Planes e insignias */}
      <EscaleraPlanes />

      {/* Bloque 5 · Empresas */}
      <SeccionEmpresas />
    </>
  );
}
