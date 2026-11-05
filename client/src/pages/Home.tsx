import { useMemo } from "react";
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
import { PLANES } from "./Membresias";
import { useRanking, useEventos, FilaEvento } from "./Vants";
import { NivelFaceit } from "./PerfilFaceit";

function Hero() {
  const live = useApi<{ streams: Stream[] }>("/api/twitch/directos?limite=1", { refetchMs: 60_000 });
  const vivosInt = useApi<{ directos: DirectoInt[] }>("/int/directos", { refetchMs: 60_000 });
  const enVivo = Math.max(live.data?.streams?.length || 0, (vivosInt.data?.directos || []).filter((d) => d.en_vivo).length);
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: "var(--linea-suave)" }}>
      <img src={pub("img/arena.jpg")} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.55 }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,10,11,.96) 0%, rgba(10,10,11,.75) 45%, rgba(10,10,11,.2) 100%)" }} />
      <div className="wrap relative py-20 md:py-28 lg:py-36">
        <div className="eyebrow mb-6 reveal">ESPORTS · HECHO EN VENEZUELA</div>
        <h1 className="d-hero reveal" style={{ animationDelay: "40ms" }}>
          Compete.<br />Connect.<br /><span style={{ color: "var(--rojo)" }}>Dominate.</span>
        </h1>
        <p className="lead mt-6 reveal" style={{ animationDelay: "80ms" }}>
          Una plataforma para conectar jugadores, comunidades y oportunidades competitivas en Venezuela y Latinoamérica: torneos con bracket, rankings calculados en servidor, clips y la comunidad que juega cada noche.
        </p>
        <div className="flex flex-wrap gap-3 mt-8 reveal" style={{ animationDelay: "120ms" }}>
          <Link href="/torneos" className="btn btn-rojo" data-testid="hero-torneos">Ver torneos</Link>
          <Link href="/sala" className="btn" data-testid="hero-sala">Entrar a la sala</Link>
        </div>
        {enVivo > 0 && (
          <Link href="/en-vivo" className="inline-flex items-center gap-2 mt-8 tag tag-rojo" data-testid="hero-live">
            <span className="dot-live" /> {enVivo} canal de VANTS en directo
          </Link>
        )}
      </div>
    </section>
  );
}

function List<T>({ q, empty, render, what }: { q: { isLoading: boolean; error: any; data?: T[] }; empty: JSX.Element; render: (x: T, i: number) => JSX.Element; what: string }) {
  if (q.isLoading) return <Skel />;
  if (q.error) return <ErrorBox error={q.error} what={what} />;
  if (!q.data || q.data.length === 0) return empty;
  return <>{q.data.map(render)}</>;
}

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
  const matches = [...(live.data?.data.items || []), ...(upcomingM.data?.data.items || [])].slice(0, 6);
  const top = (ranking.data?.faceit || []).slice(0, 5);

  return (
    <>
      <Hero />

      <Section id="juegos" eyebrow="El circuito" title={<>Juegos de <span style={{ color: "var(--rojo)" }}>VANTS</span></>} more={{ to: "/torneos", label: "Torneos por juego" }}>
        <p className="muted" style={{ maxWidth: "72ch" }}>Once títulos competitivos entre PC, consola y móvil. VALORANT y CS2 tienen integración de estadísticas y logros; el resto completa el circuito de torneos, equipos y clips.</p>
        <div className="grid-auto grid sm:grid-cols-3 lg:grid-cols-4" data-testid="home-juegos">
          {JUEGOS.map((j) => (
            <Link key={j.slug} href={"/torneos?juego=" + j.slug} className="panel p-5 flex items-center justify-between gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"home-juego-" + j.slug}>
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{j.nombre}</div>
                <div className="small muted mt-1">{j.plataforma}{j.integrado ? " · estadísticas y logros" : ""}</div>
              </div>
              <span className="tag shrink-0">{j.label}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="torneos" eyebrow="Circuito" title="Torneos destacados" more={{ to: "/torneos", label: "Todos los torneos" }}>
        <div className="panel">
          <List
            q={{ isLoading: destacados.isLoading || proximos.isLoading, error: destacados.error || proximos.error, data: torneos }}
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
              q={{ isLoading: live.isLoading || upcomingM.isLoading, error: live.error || upcomingM.error, data: matches }}
              what="la agenda"
              render={(m, i) => <MatchRow key={i} m={m} />}
              empty={<Empty code="partidos · 0" title="Sin partidos programados" text="Los enfrentamientos se publican cuando un torneo genera su bracket." />}
            />
          </div>
        </Section>
        <Section id="ranking" eyebrow="Ranking global" title="Top jugadores VANTS" more={{ to: "/ranking", label: "Ver ranking" }} className="!px-0">
          <div className="panel">
            {ranking.isLoading ? <Skel n={5} h={44} /> : ranking.error ? <ErrorBox error={ranking.error} what="el ranking" /> : top.length === 0 ? (
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
            ) : eventos.data!.eventos.slice(0, 3).map((e) => <FilaEvento key={e.id} e={e} />)}
          </div>
        </Section>
      </div>

      <Section id="membresias" eyebrow="Membresías" title="Juega con ventaja" more={{ to: "/membresias", label: "Comparar planes" }}>
        <div className="grid-auto grid md:grid-cols-3">
          {PLANES.filter((p) => p.checkout).map((p) => (
            <Link key={p.id} href="/membresias" className="p-6 block hover:bg-[var(--grafito-2)] transition-colors" data-testid={"home-plan-" + p.id}>
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
