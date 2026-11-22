/**
 * Biblioteca de clips del jugador.
 *   GET  /int/clips/mios        → clips por enlace + subidos + canal de Twitch (+ canal de Kick)
 *   POST /int/clips             → publicar por enlace (YouTube, Twitch, Kick, Medal, Streamable, Outplayed)
 *   POST /int/clips/borrar      → quitar un clip por enlace
 *   POST /api/clips/featured    → subir un vídeo desde el ordenador (Worker principal → vants-clips)
 *   DELETE /api/clips/featured  → quitar un vídeo subido
 *   GET  /int/clips/comunidad   → clips públicos de la comunidad
 * Kick no deja que los servidores lean su API, pero sí la web (CORS): los clips
 * de Kick se leen desde el navegador.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { filtrosJuegos, opcionesJuegos } from "@/lib/juegos";
import { detectKickClipGame, filterClipsByGame } from "@/lib/clipFiltering";
import { api, apiForm } from "@/lib/api";
import { Empty, Skel, ErrorBox, GameTag } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { hace } from "@/lib/format";
import { useRol } from "./Vants";

export type Clip = {
  id: string; origen: "vants" | "twitch" | "kick" | "subido"; plataforma: string; url: string; titulo: string | null; juego: string | null;
  miniatura: string | null; embed: string | null; video?: string | null; creado: string; autor: string | null; vistas?: number | null; duracion?: number | null; propio: boolean; publico?: boolean; kv?: boolean;
};

const PLAT: Record<string, string> = { youtube: "YouTube", twitch: "Twitch", kick: "Kick", medal: "Medal", streamable: "Streamable", outplayed: "Outplayed", faceit: "FACEIT", vants: "VANTS" };
const ERR: Record<string, string> = {
  enlace_invalido: "Ese enlace no es de un clip compatible. Usa FACEIT, YouTube, Twitch, Kick, Medal, Streamable u Outplayed.",
  clip_repetido: "Ese clip ya está en tu biblioteca.",
  limite_clips: "Has llegado al máximo de 200 clips.",
  sin_sesion: "Tu sesión expiró. Vuelve a iniciar sesión.",
  clip_demasiado_grande: "El vídeo pesa más de 50,5 MB. Recórtalo o expórtalo con menos calidad.",
  falta_video: "Elige un archivo de vídeo.",
  thumb_invalida: "No se pudo generar la miniatura del vídeo. Prueba con un MP4.",
  gh_no_config: "El almacenamiento de clips no está configurado en el servidor.",
  "Demasiadas peticiones": "Has subido muchos clips seguidos. Espera unos minutos.",
  "Origen no permitido": "Este dominio no puede subir clips todavía.",
  no_es_tuyo: "Ese clip lo subió otra cuenta.",
};
const mensaje = (e: any) => ERR[e?.code] || "No se pudo completar (" + (e?.code || "error") + ").";

/* ---------------- Kick (desde el navegador) ---------------- */
type KickClip = { id: string; title: string; video_url?: string; clip_url?: string; thumbnail_url?: string; views?: number; view_count?: number; duration?: number; created_at: string; category?: { name?: string; slug?: string }; creator?: { username?: string } };
const juegoKick = (c?: { name?: string; slug?: string }) => detectKickClipGame(c);
async function kickApi<T>(path: string): Promise<T> {
  const r = await fetch("https://kick.com/api/v2" + path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("kick_" + r.status);
  return r.json();
}
function useClipsKick(canal: string | null | undefined) {
  return useQuery<Clip[]>({
    queryKey: ["kick-clips", canal],
    enabled: !!canal,
    staleTime: 300_000,
    retry: 0,
    queryFn: async () => {
      const j = await kickApi<{ clips: KickClip[] }>("/channels/" + encodeURIComponent(canal!) + "/clips?sort=date&time=all");
      return (j.clips || []).slice(0, 24).map((c) => ({
        id: "kk_" + c.id, origen: "kick", plataforma: "kick", url: "https://kick.com/" + canal + "/clips/" + c.id, titulo: c.title, juego: juegoKick(c.category),
        miniatura: c.thumbnail_url || null, embed: null, video: c.video_url || c.clip_url || null, vistas: c.views ?? c.view_count ?? null, duracion: c.duration,
        creado: c.created_at, autor: c.creator?.username || canal!, propio: false,
      }));
    },
  });
}
function idClipKick(url: string): string | null {
  try { const u = new URL(url); if (!/(^|\.)kick\.com$/.test(u.hostname)) return null; const m = u.pathname.match(/\/clips\/(clip_\w+)/); return m ? m[1] : (u.searchParams.get("clip") || "").match(/^clip_\w+$/) ? u.searchParams.get("clip") : null; } catch { return null; }
}

/* ---------------- Reproductor ---------------- */
function VideoClip({ src, poster }: { src: string; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!/\.m3u8(\?|$)/.test(src) || v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; v.play().catch(() => {}); return; }
    let hls: any = null;
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) { v.src = src; return; }
      hls = new Hls({ maxBufferLength: 20 });
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
    });
    return () => { if (hls) hls.destroy(); };
  }, [src]);
  return <video ref={ref} poster={poster || undefined} controls playsInline className="absolute inset-0 w-full h-full bg-black" />;
}

/** Cambiar el juego de un clip propio (POST /int/clips/editar). */
function CambiarJuego({ c }: { c: Clip }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const cambiar = async (juego: string) => {
    setSt("guardando");
    try {
      await api("/int/clips/editar", { method: "POST", auth: true, body: { id: c.id, juego } });
      setSt("ok");
      qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] });
      qc.invalidateQueries({ queryKey: ["/int/clips/comunidad", false] });
    } catch { setSt("error"); }
  };
  return (
    <label className="flex items-center gap-2 text-xs muted">
      Juego
      <select className="input" style={{ height: 28, padding: "0 .5rem", fontSize: 12, width: "auto" }} value={c.juego || "otro"} disabled={st === "guardando"} onChange={(e) => cambiar(e.target.value)} data-testid={"juego-clip-" + c.id} aria-label="Cambiar juego del clip">
        {opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}<option value="otro">Otro</option>
      </select>
      {st === "ok" && <span style={{ color: "var(--ok)" }}>Guardado</span>}
      {st === "error" && <span style={{ color: "#ff5468" }}>No se pudo guardar</span>}
    </label>
  );
}

export function TarjetaClip({ c, onBorrar }: { c: Clip; onBorrar?: (c: Clip) => void }) {
  const [ver, setVer] = useState(false);
  const reproducible = !!(c.embed || c.video);
  return (
    <figure className="panel grid content-start" data-testid={"clip-" + c.id}>
      <div className="relative w-full aspect-video bg-[var(--grafito)] overflow-hidden">
        {ver && c.video ? <VideoClip src={c.video} poster={c.miniatura} /> : ver && c.embed ? (
          <iframe src={c.embed} title={c.titulo || "Clip"} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
        ) : reproducible ? (
          <button type="button" className="absolute inset-0 w-full h-full grid place-items-center" onClick={() => setVer(true)} aria-label={"Reproducir " + (c.titulo || "clip")}>
            {c.miniatura ? <img src={c.miniatura} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <span className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--grafito-2), var(--grafito-3))" }} />}
            <span className="relative" style={{ width: 54, height: 54, background: "var(--rojo)", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} aria-hidden />
            {c.duracion ? <span className="absolute bottom-2 right-2 num text-xs px-1.5 py-0.5" style={{ background: "rgba(0,0,0,.7)" }}>{Math.round(c.duracion)}s</span> : null}
          </button>
        ) : (
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 w-full h-full grid place-items-center" aria-label={"Abrir " + (c.titulo || "clip")}>
            {c.miniatura ? <img src={c.miniatura} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <span className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--grafito-2), var(--grafito-3))" }} />}
            <span className="relative" style={{ width: 54, height: 54, background: "var(--rojo)", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} aria-hidden />
            {c.duracion ? <span className="absolute bottom-2 right-2 num text-xs px-1.5 py-0.5" style={{ background: "rgba(0,0,0,.7)" }}>{Math.round(c.duracion)}s</span> : null}
          </a>
        )}
      </div>
      <figcaption className="p-4 grid gap-1.5">
        <span className="flex gap-1.5 items-center flex-wrap">
          <span className="tag">{c.origen === "subido" ? "Subido" : PLAT[c.plataforma] || c.plataforma}</span>
          <GameTag g={c.juego === "otro" ? null : c.juego} />
          {(c.origen === "twitch" || c.origen === "kick") && <span className="tag tag-aviso">De tu canal</span>}
          {c.publico === false && <span className="tag">Privado</span>}
        </span>
        <strong className="text-sm line-clamp-2">{c.titulo || "Clip"}</strong>
        <span className="muted text-xs">{c.autor ? c.autor + " · " : ""}{hace(c.creado)}{c.vistas != null ? " · " + c.vistas + " vistas" : ""}</span>
        {onBorrar && (c.origen === "vants" || c.origen === "subido") && <CambiarJuego c={c} />}
        <span className="flex gap-3 items-center mt-1">
          {c.origen !== "subido" && <a href={c.url} target="_blank" rel="noopener noreferrer" className="link-arrow text-xs">Abrir en {PLAT[c.plataforma] || "origen"} ↗</a>}
          {onBorrar && (c.origen === "vants" || c.origen === "subido") && <button className="text-xs underline muted ml-auto" onClick={() => onBorrar(c)} data-testid={"borrar-clip-" + c.id}>Quitar</button>}
        </span>
      </figcaption>
    </figure>
  );
}

/* ---------------- Publicar por enlace ---------------- */
export function PublicarClip({ onOk }: { onOk?: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [juego, setJuego] = useState("valorant");
  const [publico, setPublico] = useState(true);
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try {
      const body: Record<string, unknown> = { url: url.trim(), titulo: titulo.trim(), juego, publico };
      const kid = idClipKick(url.trim());
      if (kid) {
        const d = await kickApi<{ clip: KickClip }>("/clips/" + kid).catch(() => null);
        if (d?.clip) { body.video = d.clip.video_url || d.clip.clip_url; body.miniatura = d.clip.thumbnail_url; body.titulo_kick = d.clip.title; }
      }
      await api("/int/clips", { method: "POST", auth: true, body });
      setUrl(""); setTitulo("");
      setSt({ k: "ok", m: "Clip publicado en tu biblioteca." });
      qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] });
      qc.invalidateQueries({ queryKey: ["/int/clips/comunidad", false] });
      onOk?.();
    } catch (err) { setSt({ k: "error", m: mensaje(err) }); }
  };
  return (
    <form onSubmit={enviar} className="panel panel-pad grid gap-4 min-w-0 overflow-hidden" data-testid="form-publicar-clip">
      <div><h2 className="d-3">Publicar por enlace</h2><p className="small muted mt-1">Pega el enlace de tu clip de FACEIT, Twitch, Kick, YouTube, Medal, Streamable u Outplayed. Se reproduce aquí mismo.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 min-w-0 [&>*]:min-w-0">
        <div className="field sm:col-span-2">
          <label htmlFor="clip-url">Enlace del clip</label>
          <input id="clip-url" className="input" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://clips.twitch.tv/… o https://kick.com/canal/clips/…" maxLength={400} data-testid="input-clip-url" />
          <span className="text-xs muted">FACEIT: faceit.com/…/players/tu-nick/videos/… · Twitch: clips.twitch.tv/… · Kick: kick.com/canal/clips/clip_…</span>
        </div>
        <div className="field"><label htmlFor="clip-titulo">Título (opcional)</label><input id="clip-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={100} placeholder="Ace en Mirage" /></div>
        <div className="field"><label htmlFor="clip-juego">Juego</label><select id="clip-juego" className="input" value={juego} onChange={(e) => setJuego(e.target.value)}>{opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}<option value="otro">Otro</option></select></div>
      </div>
      <label className="flex items-center gap-2 small"><input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} /> Mostrar también en Clips de la comunidad VANTS</label>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-publicar-clip">{st.k === "enviando" ? "Publicando…" : "Publicar clip"}</button>
        {st.k === "ok" && <span className="small" role="status" style={{ color: "var(--ok)" }}>{st.m}</span>}
        {st.k === "error" && <span className="small" role="alert" style={{ color: "#ff5468" }}>{st.m}</span>}
      </div>
    </form>
  );
}

/* ---------------- Subir desde el ordenador ---------------- */
const MAX_MB = 50.5;
async function miniaturaDe(file: File): Promise<{ thumb: Blob; dur: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise<void>((ok, ko) => { v.onloadedmetadata = () => ok(); v.onerror = () => ko(Object.assign(new Error("thumb"), { code: "thumb_invalida" })); });
    const dur = isFinite(v.duration) ? v.duration : 0;
    v.currentTime = Math.min(1, dur / 3 || 0);
    await new Promise<void>((ok) => { v.onseeked = () => ok(); setTimeout(ok, 4000); });
    const ancho = Math.min(640, v.videoWidth || 640), alto = Math.round(ancho * ((v.videoHeight || 360) / (v.videoWidth || 640)));
    const c = document.createElement("canvas"); c.width = ancho; c.height = alto;
    c.getContext("2d")!.drawImage(v, 0, 0, ancho, alto);
    const thumb = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8));
    if (!thumb) throw Object.assign(new Error("thumb"), { code: "thumb_invalida" });
    return { thumb, dur: Math.round(dur) };
  } finally { URL.revokeObjectURL(url); }
}

export function SubirClip() {
  const qc = useQueryClient();
  const rol = useRol();
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [juego, setJuego] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const elegir = (f: File | undefined) => {
    setSt({ k: "idle" });
    if (!f) return setFile(null);
    if (!/^video\//.test(f.type) && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name)) { setFile(null); return setSt({ k: "error", m: "Elige un vídeo MP4, WEBM, MOV o MKV." }); }
    if (f.size > MAX_MB * 1024 * 1024) { setFile(null); return setSt({ k: "error", m: ERR.clip_demasiado_grande }); }
    setFile(f);
    if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
  };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setSt({ k: "error", m: ERR.falta_video });
    if (!juego) return setSt({ k: "error", m: "Elige el juego correcto del clip para que aparezca en su categoría." });
    setSt({ k: "enviando", m: "Preparando el vídeo…" });
    try {
      const { thumb, dur } = await miniaturaDe(file);
      const ext = (file.name.match(/\.(mp4|webm|mov|mkv|m4v)$/i)?.[1] || "mp4").toLowerCase();
      const fd = new FormData();
      fd.append("video", file, "clip." + ext);
      fd.append("thumb", thumb, "thumb.jpg");
      fd.append("ext", ext);
      fd.append("titulo", titulo.trim() || "Clip destacado");
      fd.append("juego", juego);
      fd.append("nick", rol.data?.nick || "JUGADOR");
      fd.append("dur", String(dur));
      setSt({ k: "enviando", m: "Subiendo " + (file.size / 1048576).toFixed(1) + " MB…" });
      await apiForm("/int/clips/subir", fd);
      setFile(null); setTitulo(""); setJuego("");
      setSt({ k: "ok", m: "Clip subido. Ya aparece en tu biblioteca y en Clips de la comunidad VANTS." });
      qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] });
      qc.invalidateQueries({ queryKey: ["/api/clips/featured", false] });
      qc.invalidateQueries({ queryKey: ["/int/clips/comunidad", false] });
    } catch (err) { setSt({ k: "error", m: mensaje(err) }); }
  };
  return (
    <form onSubmit={enviar} className="panel panel-pad grid gap-4 min-w-0 overflow-hidden" data-testid="form-subir-clip">
      <div><h2 className="d-3">Subir desde tu ordenador</h2><p className="small muted mt-1">Sube un vídeo de hasta 50,5 MB (MP4, WEBM, MOV o MKV). Se publica en tu biblioteca y en Clips de la comunidad VANTS.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 min-w-0">
        <div className="field sm:col-span-2 min-w-0">
          <label htmlFor="clip-archivo">Vídeo</label>
          <input id="clip-archivo" className="input" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.m4v" onChange={(e) => elegir(e.target.files?.[0])} data-testid="input-clip-archivo" />
          {file && <span className="text-xs muted">{file.name} · {(file.size / 1048576).toFixed(1)} MB</span>}
        </div>
        <div className="field min-w-0"><label htmlFor="clip-titulo-up">Título</label><input id="clip-titulo-up" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Clutch 1v3" /></div>
        <div className="field min-w-0"><label htmlFor="clip-juego-up">Juego</label><select id="clip-juego-up" className="input" value={juego} onChange={(e) => setJuego(e.target.value)} required data-testid="select-clip-juego-up"><option value="" disabled>Selecciona el juego</option>{opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}<option value="otro">Otro</option></select></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn btn-rojo" disabled={st.k === "enviando" || !file || !juego} data-testid="button-subir-clip">{st.k === "enviando" ? "Subiendo…" : "Subir clip"}</button>
        {file && !juego && st.k !== "enviando" && !st.m && <span className="small muted">Elige el juego para poder subir.</span>}
        {st.m && <span className="small" role={st.k === "error" ? "alert" : "status"} style={{ color: st.k === "error" ? "#ff5468" : st.k === "ok" ? "var(--ok)" : undefined }}>{st.m}</span>}
      </div>
    </form>
  );
}

/* ---------------- Biblioteca ---------------- */
type Mios = { clips: Clip[]; subidos: Clip[]; twitch: Clip[]; kick?: Clip[]; canal_twitch: string | null; canal_kick: string | null; error_twitch: string | null };

function Rejilla({ xs, onBorrar }: { xs: Clip[]; onBorrar?: (c: Clip) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{xs.map((c) => <TarjetaClip key={c.id} c={c} onBorrar={onBorrar} />)}</div>;
}

export function MiBiblioteca({ conFormulario = true }: { conFormulario?: boolean }) {
  const { confirm, toast } = useFeedback();
  const qc = useQueryClient();
  const q = useApi<Mios>("/int/clips/mios", { auth: true });
  const kk = useClipsKick(q.data?.canal_kick);
  const [filtro, setFiltro] = useState<string>("");
  const borrar = async (c: Clip) => {
    const ok = await confirm({ title: "Quitar clip de tu biblioteca", description: `¿Quitar «${c.titulo || "este clip"}» de tu biblioteca?`, confirmLabel: "Quitar clip", danger: true });
    if (!ok) return;
    try {
      if (c.origen === "subido" && !c.kv) await api("/api/clips/featured?id=" + encodeURIComponent(c.id), { method: "DELETE", auth: true });
      else await api("/int/clips/borrar", { method: "POST", auth: true, body: { id: c.id } });
      qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] });
      toast({ kind: "ok", title: "Clip quitado de tu biblioteca" });
    } catch (e) { toast({ kind: "error", title: "No se pudo quitar el clip", description: mensaje(e) }); }
  };
  const f = (xs: Clip[] | undefined) => filterClipsByGame(xs, filtro);
  const enlaces = new Set((q.data?.clips || []).map((c) => c.url));
  const propios = f(q.data?.clips), subidos = f(q.data?.subidos), tw = f(q.data?.twitch);
  const kick = f((q.data?.kick && q.data.kick.length ? q.data.kick : kk.data) || []).filter((c) => !enlaces.has(c.url));
  // Filtros con contenido real: se ocultan los juegos sin ningún clip activo.
  const todosLosClips = [...(q.data?.clips || []), ...(q.data?.subidos || []), ...(q.data?.twitch || []), ...kick];
  const filtros = filtrosJuegos().filter((j) => !j.v || filterClipsByGame(todosLosClips, j.v).length > 0);
  return (
    <div className="grid gap-8" data-testid="mi-biblioteca">
      {conFormulario && <div className="grid gap-4 lg:grid-cols-2 items-start [&>*]:min-w-0"><SubirClip /><PublicarClip /></div>}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrar por juego">
        {filtros.map((j) => (
          <button
            key={j.v}
            className={"btn btn-sm " + (filtro === j.v ? "btn-rojo" : "btn-ghost")}
            aria-pressed={filtro === j.v}
            onClick={() => setFiltro(j.v)}
            data-testid={"biblioteca-juego-" + (j.v || "todos")}
          >
            {j.l}
          </button>
        ))}
      </div>
      {q.isLoading ? <Skel h={160} n={2} /> : q.error ? <ErrorBox error={q.error} what="tu biblioteca" /> : (
        <>
          <section className="grid gap-4">
            <h2 className="d-3">Subidos desde tu ordenador <span className="muted small">({subidos.length})</span></h2>
            {subidos.length === 0 ? <p className="small muted">Aún no has subido vídeos. Usa «Subir desde tu ordenador».</p> : <Rejilla xs={subidos} onBorrar={borrar} />}
          </section>
          <section className="grid gap-4">
            <h2 className="d-3">Publicados por enlace <span className="muted small">({propios.length})</span></h2>
            {propios.length === 0 ? <Empty code="clips · 0" title="Aún no has publicado clips por enlace" text="Pega el enlace de un clip de Twitch o Kick en «Publicar por enlace» y aparecerá aquí." /> : <Rejilla xs={propios} onBorrar={borrar} />}
          </section>
          <section className="grid gap-4">
            <h2 className="d-3">Clips de tu canal de Twitch{q.data?.canal_twitch ? <span className="muted small"> · {q.data.canal_twitch}</span> : null}</h2>
            {!q.data?.canal_twitch ? <p className="small muted">Añade tu canal de Twitch en <Link href="/perfil/ajustes" className="link-arrow">Configuración</Link> y tus clips aparecerán aquí solos.</p>
              : tw.length === 0 ? <p className="small muted">{q.data.error_twitch ? "Twitch no respondió. Se reintenta en unos minutos." : "Tu canal no tiene clips en los últimos 180 días."}</p> : <Rejilla xs={tw} />}
          </section>
          <section className="grid gap-4" data-testid="clips-kick">
            <h2 className="d-3">Clips de tu canal de Kick{q.data?.canal_kick ? <span className="muted small"> · {q.data.canal_kick}</span> : null}</h2>
            {!q.data?.canal_kick ? <p className="small muted">Añade tu canal de Kick en <Link href="/perfil/ajustes" className="link-arrow">Configuración</Link> y tus clips de Kick aparecerán aquí solos.</p>
              : kk.isLoading ? <Skel h={120} n={1} /> : kick.length === 0 ? <p className="small muted">{kk.error ? "Kick no respondió. Prueba a recargar en unos minutos." : "Tu canal de Kick no tiene clips todavía."}</p> : <Rejilla xs={kick} />}
          </section>
        </>
      )}
    </div>
  );
}

/** Clips públicos de la comunidad VANTS (Recientes / Por videojuego). */
export function ClipsComunidad({ juego, mostrarVacio = false }: { juego?: string; mostrarVacio?: boolean }) {
  const q = useApi<{ clips: Clip[] }>("/int/clips/comunidad" + (juego ? "?juego=" + encodeURIComponent(juego) : ""));
  const cs = filterClipsByGame(q.data?.clips, juego);
  if (q.isLoading) return mostrarVacio ? <Skel h={160} n={1} /> : null;
  if (cs.length === 0) {
    if (!mostrarVacio) return null;
    return (
      <div className="mb-8">
        <Empty
          code={"clips · " + (juego || "0")}
          title={juego ? "Todavía no hay clips publicados en esta categoría" : "Todavía no hay clips de la comunidad"}
          text="Cuando subas o pegues un clip eligiendo este juego, aparecerá exclusivamente aquí."
          action={<Link href="/clips/publicar" className="btn btn-sm btn-rojo">Publicar clip</Link>}
        />
      </div>
    );
  }
  return (
    <section className="grid gap-4 mb-10" data-testid="clips-comunidad">
      <h2 className="d-3">Clips de la comunidad VANTS</h2>
      <Rejilla xs={cs} />
    </section>
  );
}
