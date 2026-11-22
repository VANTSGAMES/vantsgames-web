import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { Article, Paged, Stream, YtVideo, Creator } from "@/lib/api";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate, GameTag } from "@/components/ui-vants";
import { VideoTile, StreamTile } from "@/components/domain";
import { fecha, gameLabel, hace } from "@/lib/format";
import { JUEGOS } from "@/lib/juegos";
import { MiBiblioteca, ClipsComunidad } from "./MisClips";
import { UpsellPlan } from "./Torneos";
import { useMembresia } from "@/lib/useMembresia";
import { communityFetch } from "@/lib/communityApi";
import { formatExpiryCountdown, type LfgListingItem } from "@/lib/lfgHelpers";
import {
  formatRelativeTimeEs,
  forumCategoryLabel,
  type ForumPostItem,
} from "@/lib/forumHelpers";
import type { WeeklyMissionsResponse } from "@/lib/missionsHelpers";
import type { CommunityVotingResponse } from "@/lib/votingHelpers";
import { eventTypeLabel, formatEventCountdown, type CommunityEventsResponse } from "@/lib/eventsHelpers";

/* ---------------- Clips ---------------- */
const CLIP_TABS = [
  { to: "/clips", l: "Destacados" },
  { to: "/clips/recientes", l: "Recientes" },
  { to: "/clips/juego", l: "Por videojuego" },
];

function ClipTabs({ actual }: { actual: string }) {
  return <div className="tabs mb-6" role="tablist">{CLIP_TABS.map((t) => <Link key={t.to} href={t.to} role="tab" className="tab" aria-selected={actual === t.to}>{t.l}</Link>)}</div>;
}

function Destacados() {
  const q = useApi<any>("/api/clips/featured");
  const items: any[] = q.data?.clips || q.data?.data || [];
  if (q.isLoading) return <Skel h={160} n={1} />;
  if (q.error || items.length === 0)
    return <Empty code={"clips · " + (q.error?.code || "0")} title="La vitrina de clips destacados está vacía" text="Los clips destacados los selecciona la organización y los publica el servicio de clips (VANTS-Clipper). Mientras tanto puedes ver los clips más recientes." action={<Link href="/clips/recientes" className="link-arrow">Ver recientes →</Link>} />;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c: any) => (
        <figure key={c.id} className="grid gap-2" data-testid={"clip-" + c.id}>
          <video src={c.video} poster={c.thumb || undefined} controls preload="none" playsInline className="w-full aspect-video bg-[var(--grafito)] object-cover" />
          <figcaption className="grid gap-1">
            <span className="flex gap-2 items-center"><GameTag g={c.juego} />{c.dur ? <span className="num muted text-xs">{c.dur}s</span> : null}</span>
            <strong className="text-sm">{c.titulo}</strong>
            <span className="muted text-xs">{c.nick || c.username}{c.fecha ? " · " + hace(c.fecha) : ""}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Recientes({ filtro, silencioso = false }: { filtro?: string; silencioso?: boolean }) {
  const q = useApi<{ videos: YtVideo[]; canal?: { titulo: string } }>("/api/youtube/ultimos");
  let v = q.data?.videos || [];
  const CLAVES: Record<string, RegExp> = {
    valorant: /valorant|reyna|jett|phoenix|fade|sova|omen/i,
    cs2: /\bcs2\b|counter[- ]?strike|\bcs\b/i,
    fortnite: /fortnite/i,
    fc27: /\bfc\s?2[0-9]\b|\bfc\b|fifa/i,
    smash: /smash/i,
    warzone: /warzone|call of duty|callofduty|\bcod\b/i,
    freefire: /free ?fire/i,
    lol: /\blol\b|league of legends/i,
    wildrift: /wild ?rift/i,
    mlbb: /mobile legends|mlbb/i,
    clashroyale: /clash royale/i,
  };
  if (filtro && CLAVES[filtro]) v = v.filter((x) => CLAVES[filtro].test(x.titulo));
  if (q.isLoading) return silencioso ? null : <Skel h={160} n={1} />;
  if (q.error) return silencioso ? null : <ErrorBox error={q.error} what="los clips" onRetry={() => q.refetch()} />;
  if (v.length === 0) return silencioso ? null : <Empty code={"clips · " + (filtro || "0")} title={filtro ? "No hay clips de " + gameLabel(filtro) + " todavía" : "Todavía no hay clips"} />;
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{v.map((x) => <VideoTile key={x.id} v={x} />)}</div>
      {q.data?.canal && <p className="small muted mt-6">Fuente: canal de YouTube «{q.data.canal.titulo}».</p>}
    </>
  );
}

export function Clips({ vista }: { vista: "destacados" | "recientes" | "juego" }) {
  const [juego, setJuego] = useState("valorant");
  const mem = useMembresia();
  const actual = vista === "destacados" ? "/clips" : vista === "recientes" ? "/clips/recientes" : "/clips/juego";
  return (
    <>
      <PageHead eyebrow="Clips" title={<>Las mejores <span style={{ color: "var(--rojo)" }}>jugadas</span></>} lead="Clips de la comunidad VANTS. Los clips automáticos de tus directos los edita y publica el bot de clips (VANTS-Clipper); también puedes subir los tuyos desde el ordenador o pegar el enlace de Twitch o Kick." actions={<Link href="/clips/publicar" className="btn btn-sm">Publicar clip</Link>} />
      {mem.sinPlan && <div className="wrap pb-2"><UpsellPlan motivo="clips" /></div>}
      <div className="wrap">
        <ClipTabs actual={actual} />
        {vista === "destacados" && <><Destacados /><div className="mt-10"><ClipsComunidad /></div></>}
        {vista === "recientes" && <><ClipsComunidad /><Recientes /></>}
        {vista === "juego" && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Juego">
              {JUEGOS.map((j) => (
                <button
                  key={j.slug}
                  className={"btn btn-sm " + (juego === j.slug ? "btn-rojo" : "btn-ghost")}
                  aria-pressed={juego === j.slug}
                  onClick={() => setJuego(j.slug)}
                  data-testid={"clips-juego-" + j.slug}
                >
                  {j.label}
                </button>
              ))}
            </div>
            <ClipsComunidad juego={juego} mostrarVacio />
            <Recientes filtro={juego} silencioso />
          </>
        )}
      </div>
    </>
  );
}

export function ClipsPrivado({ vista }: { vista: "publicar" | "biblioteca" }) {
  return (
    <>
      <PageHead eyebrow="Clips" title={vista === "publicar" ? "Publicar clip" : "Mi biblioteca"} lead={vista === "publicar" ? "Sube un vídeo desde tu ordenador o pega el enlace de tu clip de Twitch o Kick." : "Los clips asociados a tu cuenta."} actions={vista === "publicar" ? <Link href="/clips/biblioteca" className="btn btn-sm">Mi biblioteca</Link> : undefined} />
      <AuthGate what={vista === "publicar" ? "la publicación de clips" : "tu biblioteca"}>
        <div className="wrap">
          <MiBiblioteca />
        </div>
      </AuthGate>
    </>
  );
}

/* ---------------- Noticias ---------------- */
export function Noticias() {
  const [pag, setPag] = useState(1);
  const q = useApi<{ data: Paged<Article> }>(`/api/articles?pag=${pag}&porPagina=12`);
  const d = q.data?.data;
  return (
    <>
      <PageHead eyebrow="Noticias y anuncios" title="Noticias" lead="Anuncios oficiales del circuito VANTS." />
      <div className="wrap">
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="las noticias" /> : !d || d.items.length === 0 ? (
          <Empty code="noticias · 0" title="Todavía no hay noticias publicadas" text="Las noticias las publica la organización desde el panel interno." />
        ) : (
          <div className="grid-auto grid md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((a) => (
              <Link key={a.slug} href={"/noticias/" + a.slug} className="p-6 grid gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"card-noticia-" + a.slug}>
                <div className="flex gap-2 small muted num">{fecha(a.publicado_at, { day: "2-digit", month: "short", year: "numeric" })}{a.game && <span className="tag">{gameLabel(a.game)}</span>}</div>
                <h2 className="d-3">{a.titulo}</h2>
                {a.resumen && <p className="small muted line-clamp-3">{a.resumen}</p>}
              </Link>
            ))}
          </div>
        )}
        {d && d.total > 12 && <div className="flex gap-2 mt-4"><button className="btn btn-sm" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>Anterior</button><button className="btn btn-sm" disabled={pag * 12 >= d.total} onClick={() => setPag(pag + 1)}>Siguiente</button></div>}
      </div>
    </>
  );
}

export function NoticiaDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useApi<{ data: Article }>("/api/articles/" + slug);
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16"><Empty code="404 · noticia" title="Esta noticia no existe" action={<Link href="/noticias" className="link-arrow">Ver noticias →</Link>} /></div>;
  const a = q.data!.data;
  return (
    <article className="wrap py-14" style={{ maxWidth: 820 }}>
      <Link href="/noticias" className="link-arrow mb-6">← Noticias</Link>
      <div className="small muted num mb-3">{fecha(a.publicado_at, { day: "2-digit", month: "long", year: "numeric" })}{a.autor ? " · " + a.autor : ""}</div>
      <h1 className="d-1">{a.titulo}</h1>
      {a.resumen && <p className="lead mt-5">{a.resumen}</p>}
      {a.cuerpo && <div className="mt-8 grid gap-4" style={{ color: "var(--gris-1)", whiteSpace: "pre-line" }}>{a.cuerpo}</div>}
    </article>
  );
}

/* ---------------- Twitch / creadores ---------------- */
type DirectoInt = { plataforma: "twitch" | "kick"; canal: string; nombre: string; en_vivo: boolean; titulo: string | null; juego: string | null; espectadores: number | null; miniatura: string | null; url: string };
/** Canales VANTS y de jugadores en Twitch y Kick (vants-integraciones, se revisa cada 2 min). */
function DirectosVants() {
  const q = useApi<{ directos: DirectoInt[] }>("/int/directos", { refetchMs: 60_000 });
  const ds = q.data?.directos || [];
  if (q.isLoading || q.error || ds.length === 0) return null;
  return (
    <div className="mb-10" data-testid="directos-vants">
      <div className="eyebrow mb-3">Canales VANTS · Twitch y Kick</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ds.map((d) => (
          <a key={d.plataforma + d.canal} href={d.url} target="_blank" rel="noopener noreferrer" className="panel panel-pad hover:bg-[var(--grafito-2)] transition-colors" data-testid={"directo-" + d.plataforma + "-" + d.canal}>
            {d.en_vivo && d.miniatura ? <img src={d.miniatura} alt="" className="w-full mb-3" loading="lazy" /> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="d-3 truncate">{d.nombre}</span>
              <span className="tag" style={{ color: d.plataforma === "twitch" ? "#a970ff" : "#53fc18" }}>{d.plataforma === "twitch" ? "Twitch" : "Kick"}</span>
            </div>
            {d.en_vivo ? <div className="small mt-2"><span className="tag tag-rojo"><span className="dot-live" /> En vivo{d.espectadores != null ? " · " + d.espectadores : ""}</span>{d.titulo ? <p className="muted mt-2 line-clamp-2">{d.titulo}</p> : null}</div> : <span className="tag mt-2">Desconectado</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

export function EnVivo() {
  const [juego, setJuego] = useState("");
  const q = useApi<{ streams: Stream[]; total_canales: number }>("/api/twitch/directos?limite=24" + (juego ? "&juego=" + encodeURIComponent(juego) : ""), { refetchMs: 60_000 });
  return (
    <>
      <PageHead eyebrow="Twitch en vivo" title={<>En <span style={{ color: "var(--rojo)" }}>directo</span></>} lead="Solo canales registrados en VANTS emitiendo VALORANT o Counter-Strike. Las categorías de Twitch no son torneos de VANTS." />
      <div className="wrap">
        <DirectosVants />
        <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Categoría de Twitch">{[["", "Todas"], ["VALORANT", "VALORANT"], ["Counter-Strike", "Counter-Strike"]].map(([v, l]) => <button key={v} className={"btn btn-sm " + (juego === v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === v} onClick={() => setJuego(v)} data-testid={"filter-twitch-" + (v || "todas")}>{l}</button>)}</div>
        {q.isLoading ? <Skel h={160} n={1} /> : q.error ? <ErrorBox error={q.error} what="los directos" onRetry={() => q.refetch()} /> : (q.data?.streams || []).length === 0 ? (
          <Empty code={"twitch · " + (q.data?.total_canales ?? 0) + " canales registrados"} title="Ningún canal está en directo ahora" text="La lista se actualiza cada minuto con datos de Twitch. Vincula tu canal desde tu perfil para aparecer aquí cuando emitas." action={<Link href="/creadores" className="link-arrow">Ver creadores →</Link>} />
        ) : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{q.data!.streams.map((s) => <StreamTile key={s.canal} s={s} />)}</div>}
      </div>
    </>
  );
}

export function Creadores() {
  const q = useApi<{ creadores: Creator[] }>("/api/twitch/creadores");
  return (
    <>
      <PageHead eyebrow="Creadores" title="Creadores destacados" lead="Canales de Twitch registrados en VANTS." />
      <div className="wrap">
        {q.isLoading ? <Skel n={2} /> : q.error ? <ErrorBox error={q.error} what="los creadores" /> : (q.data?.creadores || []).length === 0 ? (
          <Empty code="creadores · 0" title="Aún no hay creadores registrados" />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {q.data!.creadores.map((c) => (
              <a key={c.canal} href={"https://www.twitch.tv/" + c.canal} target="_blank" rel="noopener noreferrer" className="p-5 flex items-center gap-4 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"creador-" + c.canal}>
                {c.perfil ? <img src={c.perfil} alt="" width={56} height={56} className="rounded-full" loading="lazy" /> : null}
                <div><div className="d-3">{c.canal}</div>{c.enVivo ? <span className="tag tag-rojo mt-1"><span className="dot-live" /> En vivo</span> : <span className="tag mt-1">Desconectado</span>}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Eventos() {
  return (
    <>
      <PageHead eyebrow="Eventos" title="Eventos" lead="Quedadas, showmatches y eventos de comunidad de VANTS." />
      <div className="wrap"><Empty code="eventos · 0" title="No hay eventos programados" text="Los eventos se anuncian en Noticias y en el Discord oficial cuando la organización los confirma." action={<Link href="/noticias" className="link-arrow">Ver anuncios →</Link>} /></div>
    </>
  );
}

export function Comunidad() {
  const news = useApi<{ data: Paged<Article> }>("/api/articles?porPagina=4");
  const creadores = useApi<{ creadores: Creator[] }>("/api/twitch/creadores");
  const vivos = useApi<{ jugadores: any[] }>("/api/en-vivo", { refetchMs: 60_000 });
  const lfg = useQuery<{ listings: LfgListingItem[] }>({
    queryKey: ["community-lfg", "preview"],
    queryFn: () => communityFetch<{ listings: LfgListingItem[] }>("/api/community/lfg"),
    staleTime: 30_000,
  });
  const forum = useQuery<{ posts: ForumPostItem[] }>({
    queryKey: ["community-forum", "preview"],
    queryFn: () => communityFetch<{ posts: ForumPostItem[] }>("/api/community/forum"),
    staleTime: 30_000,
  });
  const missions = useQuery<WeeklyMissionsResponse>({
    queryKey: ["community-missions", "preview"],
    queryFn: () => communityFetch<WeeklyMissionsResponse>("/api/community/missions"),
    staleTime: 30_000,
  });
  const voting = useQuery<CommunityVotingResponse>({
    queryKey: ["community-voting", "preview"],
    queryFn: () => communityFetch<CommunityVotingResponse>("/api/community/voting"),
    staleTime: 30_000,
  });
  const eventsQ = useQuery<CommunityEventsResponse>({
    queryKey: ["community-events", "preview"],
    queryFn: () => communityFetch<CommunityEventsResponse>("/api/community/events"),
    staleTime: 30_000,
  });
  const lfgItems = lfg.data?.listings || [];
  const forumItems = forum.data?.posts || [];
  const missionItems = missions.data?.missions || [];
  const pollItems = voting.data?.polls || [];
  const pickemItems = voting.data?.pickemMatches || [];
  const eventItems = eventsQ.data?.events || [];
  return (
    <>
      <PageHead eyebrow="Comunidad" title={<>Connect<span style={{ color: "var(--rojo)" }}>.</span></>} lead="Lo que pasa en VANTS: buscador de equipos y scrims, muro por juego, misiones semanales, votaciones Pick'em, eventos RSVP, anuncios y creadores." />
      <div className="wrap">
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}>
          {[
            ["/comunidad/lfg", "Buscador LFG / Scrims", lfg.isLoading ? "…" : lfgItems.length + " activos"],
            ["/comunidad/foro", "Muro / Foro", forum.isLoading ? "…" : forumItems.length + " hilos"],
            ["/comunidad/misiones", "Misiones Semanales", missions.isLoading ? "…" : missionItems.length + " retos · " + (missions.data?.summary.maxWeeklyXp || 0) + " XP"],
            ["/comunidad/votaciones", "Votaciones y Pick'em", voting.isLoading ? "…" : pollItems.length + " encuestas · " + pickemItems.length + " series"],
            ["/eventos", "Eventos y Showmatches", eventsQ.isLoading ? "…" : (eventsQ.data?.summary.totalUpcoming ?? 0) + " próximos · RSVP"],
            ["/noticias", "Noticias y anuncios", news.data ? news.data.data.total + " publicadas" : "…"],
            ["/en-vivo", "Twitch en vivo", creadores.data ? creadores.data.creadores.filter((c) => c.enVivo).length + " en directo" : "…"],
            ["/creadores", "Creadores", creadores.data ? creadores.data.creadores.length + " canales" : "…"],
          ].map(([to, l, n]) => (
            <Link key={to} href={to} className="p-6 hover:bg-[var(--grafito-2)] transition-colors" style={{ background: "var(--grafito-1)" }} data-testid={"comunidad-card-" + to.replace(/\//g, "-").replace(/^-/, "")}><div className="d-2">{l}</div><div className="num muted mt-2">{n}</div></Link>
          ))}
        </div>
      </div>
      <Section id="lfg-comunidad" eyebrow="Fase 1 · Equipos y Scrims" title="Buscador LFG / LFT" more={{ to: "/comunidad/lfg", label: "Abrir buscador" }}>
        {lfg.isLoading ? (
          <Skel h={84} n={2} />
        ) : lfgItems.length === 0 ? (
          <Empty
            code="lfg · 0"
            title="Sin anuncios activos en este momento"
            text="Publica si buscas equipo (LFT), jugadores para tu roster (LFG) o scrims en cualquiera de los 11 juegos de VANTS."
            action={<Link href="/comunidad/lfg" className="btn btn-sm btn-rojo">Publicar en el buscador →</Link>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {lfgItems.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                href="/comunidad/lfg"
                className="panel p-5 grid gap-2 hover:bg-[var(--grafito-2)] transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={item.type === "lft" ? "tag tag-rojo" : item.type === "lfg" ? "tag tag-ok" : "tag"}>
                      {item.type.toUpperCase()}
                    </span>
                    <GameTag g={item.gameSlug} />
                    <span className="tag">{item.region}</span>
                  </div>
                  <span className="small muted num">{formatExpiryCountdown(item.expiresAt)}</span>
                </div>
                <strong className="d-3">{item.title}</strong>
                <div className="small muted">
                  {item.roleNeeded} · {item.rankLevel} · {item.schedule}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section id="foro-comunidad" eyebrow="Fase 2 · Muro y Foro" title="Conversación por videojuego" more={{ to: "/comunidad/foro", label: "Ir al muro" }}>
        {forum.isLoading ? (
          <Skel h={84} n={2} />
        ) : forumItems.length === 0 ? (
          <Empty
            code="foro · 0"
            title="Aún no hay hilos en el muro"
            text="Comparte discusiones, guías y lineups, highlights, análisis de torneos o debates en cualquiera de los 11 juegos de VANTS."
            action={<Link href="/comunidad/foro" className="btn btn-sm btn-rojo">Abrir el muro →</Link>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {forumItems.slice(0, 4).map((post) => (
              <Link
                key={post.id}
                href="/comunidad/foro"
                className="panel p-5 grid gap-2 hover:bg-[var(--grafito-2)] transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tag">{forumCategoryLabel(post.category)}</span>
                    {post.gameSlug === "general" ? <span className="tag">General</span> : <GameTag g={post.gameSlug} />}
                  </div>
                  <span className="small muted num">{formatRelativeTimeEs(post.createdAt)}</span>
                </div>
                <strong className="d-3">{post.title}</strong>
                <div className="small muted">
                  {post.authorNick} · GG {post.reactions.gg} · Fuego {post.reactions.fire} · {post.commentsCount} comentarios
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section id="misiones-comunidad" eyebrow="Fase 3 · Retos Semanales" title="Misiones y XP de temporada" more={{ to: "/comunidad/misiones", label: "Ver todas" }}>
        {missions.isLoading ? (
          <Skel h={84} n={2} />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {missionItems.slice(0, 3).map((m) => (
              <Link
                key={m.code}
                href="/comunidad/misiones"
                className="panel p-5 grid gap-2 hover:bg-[var(--grafito-2)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tag">{m.badgeTag}</span>
                  <span className="tag tag-rojo num">+{m.xp} XP</span>
                </div>
                <strong className="d-3">{m.title}</strong>
                <div className="small muted line-clamp-2">{m.description}</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section id="votaciones-comunidad" eyebrow="Fase 4 · Encuestas y Pick'em" title="Votaciones oficiales y predicciones" more={{ to: "/comunidad/votaciones", label: "Ir a votar" }}>
        {voting.isLoading ? (
          <Skel h={84} n={2} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pollItems.slice(0, 2).map((p) => (
              <Link
                key={p.id}
                href="/comunidad/votaciones"
                className="panel p-5 grid gap-2 hover:bg-[var(--grafito-2)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tag tag-rojo">{p.badge}</span>
                  <span className="small muted num">{p.totalVotes} votos</span>
                </div>
                <strong className="d-3">{p.title}</strong>
                <div className="small muted line-clamp-2">{p.description}</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section id="eventos-comunidad" eyebrow="Fase 5 · Eventos y Showmatches" title="Agenda con inscripción RSVP" more={{ to: "/eventos", label: "Ver agenda completa" }}>
        {eventsQ.isLoading ? (
          <Skel h={84} n={2} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {eventItems.slice(0, 2).map((ev) => (
              <Link
                key={ev.id}
                href="/eventos"
                className="panel p-5 grid gap-2 hover:bg-[var(--grafito-2)] transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tag tag-rojo">{eventTypeLabel(ev.type)}</span>
                    {ev.gameSlug === "general" ? <span className="tag">General</span> : <GameTag g={ev.gameSlug} />}
                  </div>
                  <span className="small muted num">{formatEventCountdown(ev.startsAt)}</span>
                </div>
                <strong className="d-3">{ev.title}</strong>
                <div className="small muted num">
                  {ev.confirmedCount} / {ev.capacity} confirmados · {ev.location}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section id="actividad" eyebrow="Actividad reciente" title="Jugadores conectados ahora">
        {vivos.isLoading ? <Skel n={2} /> : vivos.error ? <ErrorBox error={vivos.error} what="la actividad" /> : (vivos.data?.jugadores || []).length === 0 ? (
          <Empty code="actividad · 0" title="Nadie conectado en este momento" text="La presencia se registra cuando un jugador con sesión está en la plataforma." />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">{vivos.data!.jugadores.map((j: any, i: number) => <div key={i} className="p-4 flex items-center gap-2"><span className="dot-live" style={{ background: "var(--ok)", animation: "none" }} /><span className="font-semibold">{j.nick || j.display_name || j.nombre}</span></div>)}</div>
        )}
      </Section>
      <Section id="noticias-c" eyebrow="Noticias" title="Últimos anuncios" more={{ to: "/noticias", label: "Todas" }}>
        <div className="panel">
          {news.isLoading ? <Skel n={3} /> : (news.data?.data.items || []).length === 0 ? <Empty code="noticias · 0" title="Sin anuncios publicados" /> : news.data!.data.items.map((a) => <Link key={a.slug} href={"/noticias/" + a.slug} className="row grid-cols-[120px_1fr]"><span className="small muted num">{fecha(a.publicado_at)}</span><span className="font-semibold">{a.titulo}</span></Link>)}
        </div>
      </Section>
      <Sugerencias />
    </>
  );
}

/* ---------------- Sugerencias de la comunidad ---------------- */
function Sugerencias() {
  const [mensaje, setMensaje] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const { status } = useAuth();
  useEffect(() => { setSt({ k: "idle" }); }, [status]);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mensaje.trim().length < 10) { setSt({ k: "error", m: "Cuéntanos un poco más (mínimo 10 caracteres)." }); return; }
    setSt({ k: "enviando" });
    try {
      const { api } = await import("@/lib/api");
      await api("/int/sugerencia", { method: "POST", auth: true, body: { mensaje: mensaje.trim() } });
      setSt({ k: "ok" });
      setMensaje("");
    } catch (err: any) {
      const codigo = err?.code || "";
      setSt({
        k: "error",
        m: codigo === "cuenta_no_verificada"
          ? "Verifica tu correo electrónico para participar en la comunidad."
          : codigo === "sin_sesion"
            ? "Inicia sesión para enviar sugerencias."
            : "No se pudo enviar ahora mismo. Inténtalo de nuevo.",
      });
    }
  };
  return (
    <Section id="sugerencias" eyebrow="Mejora la arena" title={<>Sugerencias de la <span style={{ color: "var(--rojo)" }}>comunidad</span></>}>
      <div className="panel panel-pad chamfer grid gap-3 max-w-2xl" data-testid="sugerencias">
        <p className="muted small">
          ¿Qué agregarías a VANTS? Las sugerencias llegan directo al canal privado del equipo.
          Los mejores pedidos se convierten en misiones, torneos o funciones de la plataforma.
        </p>
        <form className="grid gap-3" onSubmit={enviar}>
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            placeholder="Ej.: torneos nocturnos de Clash Royale los viernes…"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            data-testid="sugerencia-texto"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-sm btn-rojo" disabled={st.k === "enviando"} data-testid="btn-sugerencia">
              {st.k === "enviando" ? "Enviando…" : "Enviar sugerencia"}
            </button>
            <span className="small muted num">{mensaje.length}/1000</span>
          </div>
        </form>
        {st.k === "ok" && <p className="small" style={{ color: "var(--ok)" }} role="status" data-testid="sugerencia-ok">¡Gracias! Tu sugerencia ya está con el equipo. 🎮</p>}
        {st.k === "error" && <p className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</p>}
      </div>
    </Section>
  );
}
