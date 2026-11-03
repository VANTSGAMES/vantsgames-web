/**
 * Biblioteca de clips del jugador (vants-integraciones):
 *   GET  /int/clips/mios      → clips publicados + clips del canal de Twitch del jugador
 *   POST /int/clips           → publicar por enlace (YouTube, Twitch, Kick, Medal, Streamable, Outplayed)
 *   POST /int/clips/borrar    → quitar un clip propio
 *   GET  /int/clips/comunidad → clips públicos de la comunidad
 */
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { Empty, Skel, ErrorBox, GameTag } from "@/components/ui-vants";
import { hace } from "@/lib/format";

export type Clip = {
  id: string; origen: "vants" | "twitch"; plataforma: string; url: string; titulo: string | null; juego: string | null;
  miniatura: string | null; embed: string | null; creado: string; autor: string | null; vistas?: number; duracion?: number; propio: boolean; publico?: boolean;
};

const PLAT: Record<string, string> = { youtube: "YouTube", twitch: "Twitch", kick: "Kick", medal: "Medal", streamable: "Streamable", outplayed: "Outplayed" };
const ERR: Record<string, string> = {
  enlace_invalido: "Ese enlace no es de un clip compatible. Usa YouTube, Twitch, Kick, Medal, Streamable u Outplayed.",
  clip_repetido: "Ese clip ya está en tu biblioteca.",
  limite_clips: "Has llegado al máximo de 200 clips.",
  sin_sesion: "Tu sesión expiró. Vuelve a iniciar sesión.",
};
const mensaje = (e: any) => ERR[e?.code] || "No se pudo completar (" + (e?.code || "error") + ").";

export function TarjetaClip({ c, onBorrar }: { c: Clip; onBorrar?: (c: Clip) => void }) {
  const [ver, setVer] = useState(false);
  return (
    <figure className="panel grid" data-testid={"clip-" + c.id}>
      <div className="relative w-full aspect-video bg-[var(--grafito)] overflow-hidden">
        {ver && c.embed ? (
          <iframe src={c.embed} title={c.titulo || "Clip"} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <button type="button" className="absolute inset-0 w-full h-full grid place-items-center group" onClick={() => (c.embed ? setVer(true) : window.open(c.url, "_blank", "noopener"))} aria-label={"Reproducir " + (c.titulo || "clip")}>
            {c.miniatura ? <img src={c.miniatura} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <span className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--grafito-2), var(--grafito-3))" }} />}
            <span className="relative grid place-items-center" style={{ width: 54, height: 54, background: "var(--rojo)", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} aria-hidden />
          </button>
        )}
      </div>
      <figcaption className="p-4 grid gap-1.5">
        <span className="flex gap-1.5 items-center flex-wrap"><span className="tag">{PLAT[c.plataforma] || c.plataforma}</span><GameTag g={c.juego === "otro" ? null : c.juego} />{c.origen === "twitch" && <span className="tag tag-aviso">De tu canal</span>}{c.publico === false && <span className="tag">Privado</span>}</span>
        <strong className="text-sm line-clamp-2">{c.titulo || "Clip"}</strong>
        <span className="muted text-xs">{c.autor ? c.autor + " · " : ""}{hace(c.creado)}{c.vistas != null ? " · " + c.vistas + " vistas" : ""}</span>
        <span className="flex gap-3 items-center mt-1">
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="link-arrow text-xs">Abrir en {PLAT[c.plataforma] || "origen"} ↗</a>
          {onBorrar && c.origen === "vants" && <button className="text-xs underline muted ml-auto" onClick={() => onBorrar(c)} data-testid={"borrar-clip-" + c.id}>Quitar</button>}
        </span>
      </figcaption>
    </figure>
  );
}

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
      await api("/int/clips", { method: "POST", auth: true, body: { url: url.trim(), titulo: titulo.trim(), juego, publico } });
      setUrl(""); setTitulo("");
      setSt({ k: "ok", m: "Clip publicado en tu biblioteca." });
      qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] });
      qc.invalidateQueries({ queryKey: ["/int/clips/comunidad"] });
      onOk?.();
    } catch (err) { setSt({ k: "error", m: mensaje(err) }); }
  };
  return (
    <form onSubmit={enviar} className="panel panel-pad grid gap-4" data-testid="form-publicar-clip">
      <div><h2 className="d-3">Publicar un clip</h2><p className="small muted mt-1">Pega el enlace de tu clip de YouTube, Twitch, Kick, Medal, Streamable u Outplayed. Se reproduce aquí mismo.</p></div>
      <div className="grid gap-4 md:grid-cols-[2fr_1.4fr_auto]">
        <div className="field"><label htmlFor="clip-url">Enlace del clip</label><input id="clip-url" className="input" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://clips.twitch.tv/…" maxLength={400} data-testid="input-clip-url" /></div>
        <div className="field"><label htmlFor="clip-titulo">Título (opcional)</label><input id="clip-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={100} placeholder="Ace en Mirage" /></div>
        <div className="field"><label htmlFor="clip-juego">Juego</label><select id="clip-juego" className="input" value={juego} onChange={(e) => setJuego(e.target.value)}><option value="valorant">VALORANT</option><option value="cs2">CS2</option><option value="otro">Otro</option></select></div>
      </div>
      <label className="flex items-center gap-2 small"><input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} /> Mostrar también en Clips recientes de la comunidad</label>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-publicar-clip">{st.k === "enviando" ? "Publicando…" : "Publicar clip"}</button>
        {st.k === "ok" && <span className="small" role="status" style={{ color: "var(--ok)" }}>{st.m}</span>}
        {st.k === "error" && <span className="small" role="alert" style={{ color: "#ff5468" }}>{st.m}</span>}
      </div>
    </form>
  );
}

export function MiBiblioteca({ conFormulario = true }: { conFormulario?: boolean }) {
  const qc = useQueryClient();
  const q = useApi<{ clips: Clip[]; twitch: Clip[]; canal_twitch: string | null; error_twitch: string | null }>("/int/clips/mios", { auth: true });
  const [filtro, setFiltro] = useState<"todos" | "valorant" | "cs2">("todos");
  const borrar = async (c: Clip) => {
    if (!window.confirm("¿Quitar este clip de tu biblioteca?")) return;
    try { await api("/int/clips/borrar", { method: "POST", auth: true, body: { id: c.id } }); qc.invalidateQueries({ queryKey: ["/int/clips/mios", true] }); }
    catch (e) { window.alert(mensaje(e)); }
  };
  const f = (xs: Clip[]) => (filtro === "todos" ? xs : xs.filter((c) => c.juego === filtro));
  const propios = f(q.data?.clips || []), tw = f(q.data?.twitch || []);
  return (
    <div className="grid gap-8" data-testid="mi-biblioteca">
      {conFormulario && <PublicarClip />}
      <div className="flex gap-1 flex-wrap" role="group" aria-label="Filtrar por juego">
        {([["todos", "Todos"], ["valorant", "VALORANT"], ["cs2", "CS2"]] as const).map(([v, l]) => <button key={v} className={"btn btn-sm " + (filtro === v ? "btn-rojo" : "btn-ghost")} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{l}</button>)}
      </div>
      {q.isLoading ? <Skel h={160} n={2} /> : q.error ? <ErrorBox error={q.error} what="tu biblioteca" /> : (
        <>
          <section className="grid gap-4">
            <h2 className="d-3">Mis clips publicados <span className="muted small">({propios.length})</span></h2>
            {propios.length === 0 ? <Empty code="clips · 0" title="Aún no has publicado clips" text="Pega el enlace de una jugada en el formulario de arriba y aparecerá aquí." /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{propios.map((c) => <TarjetaClip key={c.id} c={c} onBorrar={borrar} />)}</div>
            )}
          </section>
          <section className="grid gap-4">
            <h2 className="d-3">Clips de tu canal de Twitch{q.data?.canal_twitch ? <span className="muted small"> · {q.data.canal_twitch}</span> : null}</h2>
            {!q.data?.canal_twitch ? (
              <p className="small muted">Añade tu canal de Twitch en <Link href="/perfil/ajustes" className="link-arrow">Configuración</Link> y tus clips de Twitch aparecerán aquí solos.</p>
            ) : tw.length === 0 ? <p className="small muted">{q.data.error_twitch ? "Twitch no respondió. Se reintenta en unos minutos." : "Tu canal no tiene clips en los últimos 180 días."}</p> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{tw.map((c) => <TarjetaClip key={c.id} c={c} />)}</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Clips públicos de la comunidad VANTS (para Clips recientes / por videojuego). */
export function ClipsComunidad({ juego }: { juego?: string }) {
  const q = useApi<{ clips: Clip[] }>("/int/clips/comunidad" + (juego ? "?juego=" + juego : ""));
  const cs = q.data?.clips || [];
  if (q.isLoading || cs.length === 0) return null;
  return (
    <section className="grid gap-4 mb-10" data-testid="clips-comunidad">
      <h2 className="d-3">De la comunidad VANTS</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cs.map((c) => <TarjetaClip key={c.id} c={c} />)}</div>
    </section>
  );
}
