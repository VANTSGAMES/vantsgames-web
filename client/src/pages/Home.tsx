import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { Insignia3D, useCatalogoInsignias } from "@/components/Insignia3D";
import { useApi } from "@/lib/useApi";
type DirectoInt = { plataforma: "twitch" | "kick"; canal: string; nombre: string | null; en_vivo: boolean; titulo: string | null; juego: string | null; espectadores: number | null; miniatura: string | null; url: string; desde: string | null };
import { pub, type Paged, type Tournament, type Match, type Team, type Article, type YtVideo, type Stream, type Badge } from "@/lib/api";
import { assetUrl } from "@/lib/api";
import { Section, Empty, Skel, ErrorBox } from "@/components/ui-vants";
import { TournamentRow, MatchRow, TeamTile, VideoTile, StreamTile } from "@/components/domain";
import { fecha } from "@/lib/format";
import { JUEGOS } from "@/lib/juegos";
import { countGamesByPlatform, filterGamesByPlatform, type PlataformaFiltro } from "@/lib/discovery";
import { PLANES } from "@/lib/planes";
import { useRanking, useEventos, FilaEvento } from "./Vants";
import { NivelFaceit } from "./PerfilFaceit";

/* ---------- Hero: titular palabra por palabra sobre retícula + glow CSS ---------- */
function Hero() {
  const live = useApi<{ streams: Stream[] }>("/api/twitch/directos?limite=1", { refetchMs: 60_000 });
  const vivosInt = useApi<{ directos: DirectoInt[] }>("/int/directos", { refetchMs: 60_000 });
  const enVivo = Math.max(live.data?.streams?.length || 0, (vivosInt.data?.directos || []).filter((d) => d.en_vivo).length);
  const palabras: { t: string; rojo?: boolean }[] = [
    { t: "Compete." }, { t: "Connect." }, { t: "Dominate.", rojo: true },
  ];
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: "var(--linea-suave)" }}>
      <div className="hero-fondo absolute inset-0" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />
      <div className="wrap relative py-20 md:py-28 lg:py-36">
        <div className="eyebrow mb-6 reveal anim-1">ESPORTS · HECHO EN VENEZUELA</div>
        <h1 className="d-hero">
          {palabras.map((p, i) => (
            <span key={p.t} className="palabra block" style={{ "--d": `${80 + i * 120}ms`, color: p.rojo ? "var(--rojo)" : undefined } as CSSProperties}>
              {p.t}
            </span>
          ))}
        </h1>
        <p className="lead mt-6 reveal anim-4">
          Una plataforma para conectar jugadores, comunidades y oportunidades competitivas en Venezuela y Latinoamérica: torneos con bracket, rankings calculados en servidor, clips y la comunidad que juega cada noche.
        </p>
        <div className="flex flex-wrap gap-3 mt-8 reveal anim-5">
          <Link href="/torneos" className="btn btn-rojo" data-testid="hero-torneos">Ver torneos</Link>
          <Link href="/torneos/crear" className="btn" data-testid="hero-crear">Crear mi torneo</Link>
          <Link href="/sala" className="btn btn-ghost" data-testid="hero-sala">Entrar a la sala</Link>
        </div>
        {enVivo > 0 && (
          <Link href="/en-vivo" className="inline-flex items-center gap-2 mt-8 tag tag-rojo reveal anim-6" data-testid="hero-live">
            <span className="dot-live" /> {enVivo} canal de VANTS en directo
          </Link>
        )}
      </div>
    </section>
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

/* ---------- Contador animado: cuenta desde 0 hasta `fin` al entrar en pantalla ---------- */
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

function Stats({ torneos, equipos }: { torneos: number; equipos: number }) {
  return (
    <div className="grid-auto grid grid-cols-2 md:grid-cols-4" data-testid="home-stats">
      <Stat valor={Math.max(torneos, 0)} label="Torneos del circuito" delay="0ms" />
      <Stat valor={Math.max(equipos, 0)} label="Equipos registrados" delay="80ms" />
      <Stat valor={JUEGOS.length} label="Juegos competitivos" delay="160ms" />
      <Stat valor={1000} sufijo="+" label="Logros desbloqueables" delay="240ms" />
    </div>
  );
}

/* ---------- Torneo destacado: próximo torneo con cuenta regresiva ---------- */
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

/* ---------- Cómo funciona: 3 pasos del embudo competitivo ---------- */
function ComoFunciona() {
  const pasos = [
    { n: "01", t: "Crea tu cuenta", d: "Regístrate gratis, configura tu nick y vincula FACEIT o Riot para que tus estadísticas cuenten." },
    { n: "02", t: "Arma tu equipo", d: "Crea tu equipo o únete con un código de invitación. Elige tu juego del circuito VANTS." },
    { n: "03", t: "Compite y domina", d: "Inscríbete en torneos con bracket, sube en el ranking calculado en servidor y gana premios." },
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

function List<T>({ q, empty, render, what }: { q: { isLoading: boolean; error: any; data?: T[]; onRetry?: () => void }; empty: JSX.Element; render: (x: T, i: number) => JSX.Element; what: string }) {
  if (q.isLoading) return <Skel />;
  if (q.error) return <ErrorBox error={q.error} what={what} onRetry={q.onRetry} />;
  if (!q.data || q.data.length === 0) return empty;
  return <>{q.data.map(render)}</>;
}

const PLATAFORMAS: PlataformaFiltro[] = ["Todas", "PC", "Consola", "Móvil"];

export default function Home() {
  const [plataforma, setPlataforma] = useState<PlataformaFiltro>("Todas");
  const juegosVisibles = useMemo(() => filterGamesByPlatform(JUEGOS, plataforma), [plataforma]);
  const conteoPlataformas = useMemo(() => countGamesByPlatform(JUEGOS), []);
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
  // Twitch (filtrado por juego en el Worker principal) + Kick y Twitch detectados por vants-integraciones.
  const vivos = useMemo(() => {
    const xs: (Stream & { url?: string; plataforma?: "twitch" | "kick" })[] = (streams.data?.streams || []).map((s) => ({ ...s, plataforma: "twitch" as const }));
    for (const d of directosInt.data?.directos || []) {
      if (!d.en_vivo) continue;
      if (d.plataforma === "twitch" && xs.some((x) => x.canal.toLowerCase() === d.canal.toLowerCase())) continue;
      xs.push({ canal: d.canal, canalNombre: d.nombre || d.canal, perfil: "", titulo: d.titulo || "", juego: d.juego || "", vistas: d.espectadores || 0, inicio: d.desde || "", idioma: "es", mini: d.miniatura || "", url: d.url, plataforma: d.plataforma });
    }
    return xs;
  }, [streams.data, directosInt.data]);
  const canalesVigilados = Math.max(streams.data?.total_canales ?? 0, (directosInt.data?.directos || []).length);
  const news = useApi<{ data: Paged<Article> }>("/api/articles?porPagina=3");
  const insignias = useCatalogoInsignias();

  const torneos = [...(destacados.data?.data.items || []), ...(proximos.data?.data.items || [])].slice(0, 5);
  const torneoProximo = (proximos.data?.data.items || []).find((t) => t.starts_at && new Date(t.starts_at).getTime() > Date.now());
  const matches = [...(live.data?.data.items || []), ...(upcomingM.data?.data.items || [])].slice(0, 6);
  const top = (ranking.data?.faceit || []).slice(0, 5);
  const totalEquipos = teams.data?.data?.length ?? 0;

  return (
    <>
      <Hero />
      <Marquee />
      <div className="wrap pt-10">
        <Stats torneos={torneos.length} equipos={totalEquipos} />
      </div>

      {torneoProximo && (
        <div className="wrap pt-10">
          <TorneoDestacado t={torneoProximo} />
        </div>
      )}

      <div className="wrap pt-14">
        <Section id="como-funciona" eyebrow="Cómo funciona" title={<>Del registro a la <span style={{ color: "var(--rojo)" }}>final</span></>} className="!px-0">
          <ComoFunciona />
        </Section>
      </div>

      <Section id="juegos" eyebrow="El circuito" title={<>Juegos de <span style={{ color: "var(--rojo)" }}>VANTS</span></>} more={{ to: "/torneos", label: "Torneos por juego" }}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <p className="muted" style={{ maxWidth: "66ch" }}>Once títulos competitivos entre PC, consola y móvil. VALORANT y CS2 tienen integración de estadísticas y logros; el resto completa el circuito de torneos, equipos y clips.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar juegos por plataforma" data-testid="home-platform-filter">
            {PLATAFORMAS.map((plat) => (
              <button
                key={plat}
                type="button"
                className={"btn btn-sm " + (plataforma === plat ? "btn-rojo" : "btn-ghost")}
                aria-pressed={plataforma === plat}
                onClick={() => setPlataforma(plat)}
                data-testid={"platform-filter-" + plat.toLowerCase()}
              >
                {plat} <span className="num opacity-75">({conteoPlataformas[plat]})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="home-juegos">
          {juegosVisibles.map((j, i) => (
            <Link
              key={j.slug}
              href={"/torneos?juego=" + j.slug}
              className="reveal panel juego-cover flotar relative block min-h-[220px]"
              style={{ "--d": `${Math.min(i * 40, 320)}ms` } as CSSProperties}
              data-testid={"home-juego-" + j.slug}
            >
              {j.img && <img src={pub(j.img)} alt={j.nombre} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.62 }} loading="lazy" />}
              <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(10,10,11,.95) 8%, rgba(10,10,11,.25) 60%)" }} />
              <div className="relative h-full flex flex-col justify-end p-4">
                <div className="font-semibold leading-tight">{j.nombre}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="tag">{j.plataforma}</span>
                  {j.integrado ? <span className="tag tag-rojo">Integrado</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="torneos" eyebrow="Circuito" title="Torneos destacados" more={{ to: "/torneos", label: "Todos los torneos" }}>
        <div className="panel">
          <List
            q={{
              isLoading: destacados.isLoading || proximos.isLoading,
              error: destacados.error || proximos.error,
              data: torneos,
              onRetry: () => { destacados.refetch(); proximos.refetch(); },
            }}
            what="los torneos"
            render={(t) => <TournamentRow key={t.slug} t={t} />}
            empty={<Empty code="torneos · 0" title="No hay torneos publicados ahora mismo" text="Cuando la organización publique un torneo desde el panel de administración aparecerá aquí con su fecha, formato y premio." />}
          />
        </div>
      </Section>

      <div className="wrap grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Section id="agenda" eyebrow="Agenda" title="Próximos enfrentamientos" more={{ to: "/agenda", label: "Agenda completa" }} className="!px-0">
          <div className="panel">
            <List
              q={{
                isLoading: live.isLoading || upcomingM.isLoading,
                error: live.error || upcomingM.error,
                data: matches,
                onRetry: () => { live.refetch(); upcomingM.refetch(); },
              }}
              what="la agenda"
              render={(m, i) => <MatchRow key={i} m={m} />}
              empty={<Empty code="partidos · 0" title="Sin partidos programados" text="Los enfrentamientos se publican cuando un torneo genera su bracket." />}
            />
          </div>
        </Section>
        <Section id="ranking" eyebrow="Ranking global" title="Top jugadores VANTS" more={{ to: "/ranking", label: "Ver ranking" }} className="!px-0">
          <div className="panel">
            {ranking.isLoading ? <Skel n={5} h={44} /> : ranking.error ? <ErrorBox error={ranking.error} what="el ranking" onRetry={() => ranking.refetch()} /> : top.length === 0 ? (
              <Empty code="ranking · 0" title="Aún no hay jugadores clasificados" text="Vincula FACEIT en tu perfil para entrar en el ranking VANTS." action={<Link href="/perfil/cuentas" className="link-arrow">Vincular FACEIT →</Link>} />
            ) : (
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
      </div>

      <Section id="equipos" eyebrow="Circuito" title="Equipos" more={{ to: "/equipos", label: "Todos los equipos" }}>
        {teams.isLoading ? <Skel /> : teams.error ? <ErrorBox error={teams.error} what="los equipos" /> : (teams.data?.data || []).length === 0 ? (
          <Empty code="equipos · 0" title="Aún no hay equipos registrados" text="Sé el primero: crea tu equipo e invita a tus compañeros con un código." action={<Link href="/equipos" className="link-arrow">Crear equipo →</Link>} />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {teams.data!.data.slice(0, 8).map((t) => <TeamTile key={t.slug} t={t} />)}
          </div>
        )}
      </Section>

      <Section id="ranked" eyebrow="Competición" title="VANTS Ranked">
        <div className="grid gap-px md:grid-cols-[1.3fr_1fr]" style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}>
          <div className="relative overflow-hidden" style={{ minHeight: 240, background: "var(--grafito-1)" }}>
            <img src={pub("img/setup.jpg")} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.5 }} loading="lazy" />
            <div className="relative p-6 md:p-8 h-full flex flex-col justify-end" style={{ background: "linear-gradient(0deg, rgba(10,10,11,.92), rgba(10,10,11,.1))" }}>
              <p className="d-2">Partidas con rango propio de VANTS</p>
              <p className="muted mt-2" style={{ maxWidth: "48ch" }}>Las posiciones se calculan en el servidor a partir de partidas verificadas.</p>
            </div>
          </div>
          <div className="p-6 md:p-8" style={{ background: "var(--grafito-1)" }}>
            <Empty code="ranked · temporada" title="La temporada de Ranked todavía no ha empezado" text="Mientras tanto, la clasificación de jugadores VANTS se calcula con el ELO de FACEIT." action={<Link href="/ranking" className="link-arrow">Ver ranking VANTS <span aria-hidden>→</span></Link>} />
          </div>
        </div>
      </Section>

      <Section id="clips" eyebrow="Clips" title="Últimos clips" more={{ to: "/clips", label: "Ver clips" }}>
        {clips.isLoading ? <Skel h={160} n={1} /> : clips.error ? <ErrorBox error={clips.error} what="los clips" /> : (clips.data?.videos || []).length === 0 ? (
          <Empty code="clips · 0" title="Todavía no hay clips publicados" />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {clips.data!.videos.slice(0, 4).map((v) => <VideoTile key={v.id} v={v} />)}
          </div>
        )}
      </Section>

      <div className="wrap grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Section id="twitch" eyebrow="Twitch y Kick" title="En directo" more={{ to: "/en-vivo", label: "Directos en vivo" }} className="!px-0">
          {streams.isLoading && directosInt.isLoading ? <Skel h={140} n={1} /> : streams.error && directosInt.error ? <ErrorBox error={streams.error} what="los directos" /> : vivos.length === 0 ? (
            <Empty code={"twitch + kick · " + canalesVigilados + " canales vigilados"} title="Ningún canal de VANTS está en directo" text="Se muestran los canales de Twitch y Kick registrados en VANTS. Se comprueban cada 2 minutos." />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">{vivos.slice(0, 4).map((s) => <StreamTile key={(s.plataforma || "twitch") + s.canal} s={s} />)}</div>
          )}
        </Section>
        <Section id="noticias" eyebrow="Noticias" title="Anuncios" more={{ to: "/noticias", label: "Todas" }} className="!px-0">
          <div className="panel">
            {news.isLoading ? <Skel n={3} h={56} /> : news.error ? <ErrorBox error={news.error} what="las noticias" /> : (news.data?.data.items || []).length === 0 ? (
              <Empty code="noticias · 0" title="Sin anuncios publicados" />
            ) : news.data!.data.items.map((a) => (
              <Link key={a.slug} href={"/noticias/" + a.slug} className="row grid-cols-1">
                <span className="small muted num">{fecha(a.publicado_at)}</span>
                <span className="font-semibold">{a.titulo}</span>
              </Link>
            ))}
          </div>
        </Section>
        <Section id="eventos" eyebrow="Comunidad" title="Próximos eventos" more={{ to: "/eventos", label: "Todos" }} className="!px-0 lg:col-span-2">
          <div className="panel">
            {eventos.isLoading ? <Skel n={2} h={56} /> : eventos.error ? <ErrorBox error={eventos.error} what="los eventos" /> : (eventos.data?.eventos || []).length === 0 ? (
              <Empty code="eventos · 0" title="No hay eventos programados" />
            ) : (eventos.data?.eventos || []).slice(0, 3).map((e) => <FilaEvento key={e.id} e={e} />)}
          </div>
        </Section>
      </div>

      <Section id="membresias" eyebrow="Membresías" title="Juega con ventaja" more={{ to: "/membresias", label: "Comparar planes" }}>
        <p className="muted" style={{ maxWidth: "72ch" }}>Los planes VANTS desbloquean la creación de torneos propios, inscripciones sin fee, cola prioritaria en Ranked y sellos exclusivos en tu perfil. Sin plan se puede competir; con plan se domina.</p>
        <div className="grid-auto grid md:grid-cols-3">
          {PLANES.filter((p) => p.checkout).map((p, i) => (
            <Link
              key={p.id}
              href="/membresias"
              className={"reveal flotar p-6 block" + (p.id === "pro" ? " brillo-borde" : "")}
              style={{ "--d": `${i * 90}ms` } as CSSProperties}
              data-testid={"home-plan-" + p.id}
            >
              <div className="eyebrow mb-3">{p.kicker}</div>
              <div className="d-2">{p.nombre}</div>
              <div className="num mt-2" style={{ color: "var(--gris-1)" }}>{p.precio}</div>
              <p className="muted small mt-3">{p.lema}</p>
            </Link>
          ))}
        </div>
        {(insignias.data?.catalogo || []).length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <span className="small muted">Insignias que se colocan solas en tu perfil:</span>
            {insignias.data!.catalogo.slice(0, 8).map((b) => <Insignia3D key={b.code} d={b} size={44} titulo={b.nombre} />)}
            <Link href="/insignias" className="link-arrow">Ver todas <span aria-hidden>→</span></Link>
          </div>
        )}
      </Section>

      <Section id="tienda" eyebrow="Tienda" title="Tienda oficial" more={{ to: "/tienda", label: "Ir a la tienda" }}>
        <Empty code="tienda · sin catálogo" title="La tienda abrirá con la Colección 01" text="La venta se activará cuando el catálogo esté conectado al sistema de pagos. Hasta entonces no hay carrito ni compras." />
      </Section>
    </>
  );
}
