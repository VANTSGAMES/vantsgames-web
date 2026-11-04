import { useState } from "react";
import { Link, useParams } from "wouter";
import { useApi } from "@/lib/useApi";
import type { Article, Paged, Stream, YtVideo, Creator } from "@/lib/api";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate, GameTag } from "@/components/ui-vants";
import { VideoTile, StreamTile } from "@/components/domain";
import { fecha, gameLabel, hace } from "@/lib/format";
import { MiBiblioteca, ClipsComunidad } from "./MisClips";

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

function Recientes({ filtro }: { filtro?: string }) {
  const q = useApi<{ videos: YtVideo[]; canal?: { titulo: string } }>("/api/youtube/ultimos");
  let v = q.data?.videos || [];
  if (filtro === "valorant") v = v.filter((x) => /valorant|reyna|jett|phoenix|fade|sova|omen/i.test(x.titulo));
  if (filtro === "cs2") v = v.filter((x) => /\bcs2\b|counter[- ]?strike|\bcs\b/i.test(x.titulo));
  if (q.isLoading) return <Skel h={160} n={1} />;
  if (q.error) return <ErrorBox error={q.error} what="los clips" />;
  if (v.length === 0) return <Empty code={"clips · " + (filtro || "0")} title={filtro ? "No hay clips de " + gameLabel(filtro) + " todavía" : "Todavía no hay clips"} />;
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{v.map((x) => <VideoTile key={x.id} v={x} />)}</div>
      {q.data?.canal && <p className="small muted mt-6">Fuente: canal de YouTube «{q.data.canal.titulo}».</p>}
    </>
  );
}

export function Clips({ vista }: { vista: "destacados" | "recientes" | "juego" }) {
  const [juego, setJuego] = useState("valorant");
  const actual = vista === "destacados" ? "/clips" : vista === "recientes" ? "/clips/recientes" : "/clips/juego";
  return (
    <>
      <PageHead eyebrow="Clips" title={<>Las mejores <span style={{ color: "var(--rojo)" }}>jugadas</span></>} lead="Clips de la comunidad VANTS. Los clips automáticos de tus directos los edita y publica el bot de clips (VANTS-Clipper); también puedes subir los tuyos desde el ordenador o pegar el enlace de Twitch o Kick." actions={<Link href="/clips/publicar" className="btn btn-sm">Publicar clip</Link>} />
      <div className="wrap">
        <ClipTabs actual={actual} />
        {vista === "destacados" && <><Destacados /><div className="mt-10"><ClipsComunidad /></div></>}
        {vista === "recientes" && <><ClipsComunidad /><Recientes /></>}
        {vista === "juego" && (
          <>
            <div className="flex gap-1 mb-6" role="group" aria-label="Juego">{[["valorant", "VALORANT"], ["cs2", "CS2"]].map(([v, l]) => <button key={v} className={"btn btn-sm " + (juego === v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === v} onClick={() => setJuego(v)}>{l}</button>)}</div>
            <ClipsComunidad juego={juego} />
            <Recientes filtro={juego} />
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
        <div className="flex gap-1 mb-6" role="group" aria-label="Categoría de Twitch">{[["", "Todas"], ["VALORANT", "VALORANT"], ["Counter-Strike", "Counter-Strike"]].map(([v, l]) => <button key={v} className={"btn btn-sm " + (juego === v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === v} onClick={() => setJuego(v)} data-testid={"filter-twitch-" + (v || "todas")}>{l}</button>)}</div>
        {q.isLoading ? <Skel h={160} n={1} /> : q.error ? <ErrorBox error={q.error} what="los directos" /> : (q.data?.streams || []).length === 0 ? (
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
  return (
    <>
      <PageHead eyebrow="Comunidad" title={<>Connect<span style={{ color: "var(--rojo)" }}>.</span></>} lead="Lo que pasa en VANTS: anuncios, actividad y creadores." />
      <div className="wrap grid gap-px md:grid-cols-3" style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}>
        {[
          ["/noticias", "Noticias y anuncios", news.data ? news.data.data.total + " publicadas" : "…"],
          ["/en-vivo", "Twitch en vivo", creadores.data ? creadores.data.creadores.filter((c) => c.enVivo).length + " en directo" : "…"],
          ["/creadores", "Creadores", creadores.data ? creadores.data.creadores.length + " canales" : "…"],
        ].map(([to, l, n]) => (
          <Link key={to} href={to} className="p-6 hover:bg-[var(--grafito-2)] transition-colors" style={{ background: "var(--grafito-1)" }}><div className="d-2">{l}</div><div className="num muted mt-2">{n}</div></Link>
        ))}
      </div>
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
    </>
  );
}
