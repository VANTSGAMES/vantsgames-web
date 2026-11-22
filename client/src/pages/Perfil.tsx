import { useEffect, useState, type FormEvent } from "react";
import { PanelFaceit, EquipoFaceit, EstadisticasFaceit, CanalesForm } from "./PerfilFaceit";
import { MisEquiposPanel, MisInscripciones, imagenEquipo, mensajeError } from "./Vants";
import { MiBiblioteca } from "./MisClips";
import { PLANES } from "./Membresias";
import { FilaInsignias, Sello3D, SelloAvatar, Insignia3D, pngInsignia, useCatalogoInsignias } from "@/components/Insignia3D";
import { useMisInsignias } from "./Membresias";
import { TarjetaEpic, PanelFortnite, useCuentaEpic } from "@/components/Fortnite";
import { ResumenLogros, PanelValorantPerfil, RiotIdForm, VincularEquipoFaceit } from "./Juegos";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api, pub } from "@/lib/api";
import { useAuth, AUTH_ENABLED, AUTH0_DOMAIN, AUTH0_CLIENT_ID } from "@/lib/auth";
import { PERFIL_LINKS } from "@/lib/nav";
import { PageHead, Empty, AuthGate, Initials } from "@/components/ui-vants";

type Estado = "conectada" | "desconectada" | "pendiente" | "error";
const PROVEEDORES = [
  { id: "faceit", nombre: "FACEIT", logo: "brand/logo-faceit.png", linker: "faceit" },
  { id: "discord", nombre: "Discord", logo: "brand/logo-discord.png", linker: "discord" },
  { id: "twitch", nombre: "Twitch", logo: "brand/logo-twitch.svg", linker: "twitch" },
  { id: "riot", nombre: "Riot Games", logo: "brand/logo-riot.svg", linker: "riot" },
  { id: "steam", nombre: "Steam", logo: "brand/logo-steam.svg", linker: "steam" },
] as const;

const ESTADO_UI: Record<Estado, { l: string; c: string }> = {
  conectada: { l: "Conectado", c: "tag tag-ok tag-conectado" },
  desconectada: { l: "Desconectada", c: "tag" },
  pendiente: { l: "Pendiente", c: "tag tag-aviso" },
  error: { l: "Error", c: "tag tag-rojo" },
};

/** Estado público del servicio de vinculación (qué proveedores tienen OAuth configurado). No requiere sesión. */
export function useLinker() {
  return useApi<{ plataformas: Record<string, string> }>("/fn/linker/");
}

function PerfilNav() {
  return (
    <nav className="wrap mb-8" aria-label="Secciones del perfil">
      <div className="tabs">
        {PERFIL_LINKS.map((l) => <Link key={l.to} href={l.to} className="tab" data-testid={"perfil-tab-" + l.to.split("/").pop()}>{l.label}</Link>)}
      </div>
    </nav>
  );
}

/** Foto del perfil principal: la que se ve en la ficha pública, el ranking, la sala y los equipos. */
function FotoPerfil({ nombre, picture, size = 96 }: { nombre: string; picture: string | null; size?: number }) {
  const qc = useQueryClient();
  const q = useApi<{ pid: string | null; avatar: string | null; propia: boolean }>("/int/perfil/foto", { auth: true });
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<{ k: "ok" | "error"; m: string } | null>(null);
  const foto = q.data?.propia ? q.data.avatar : picture || q.data?.avatar || null;
  // La primera vez, la foto de tu cuenta (Google/Twitch) pasa a ser la foto del perfil principal.
  useEffect(() => {
    if (!q.data || q.data.propia || !q.data.pid || !picture || !/^https:/.test(picture) || /cdn\.auth0\.com|gravatar\.com/.test(picture)) return;
    const k = "vants_foto_sync_" + q.data.pid;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    api("/int/perfil/foto", { method: "POST", auth: true, body: { url: picture } }).then(() => { qc.invalidateQueries({ queryKey: ["/int/perfil/foto", true] }); qc.invalidateQueries({ queryKey: ["/int/jugadores", false] }); }).catch(() => localStorage.removeItem(k));
  }, [q.data, picture]);
  const guardar = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setSt(null);
    try {
      await api("/int/perfil/foto", { method: "POST", auth: true, body });
      await qc.invalidateQueries({ queryKey: ["/int/perfil/foto", true] });
      qc.invalidateQueries({ queryKey: ["/int/jugadores", false] });
      if (q.data?.pid) qc.invalidateQueries({ queryKey: ["/int/u/" + q.data.pid, false] });
      setSt({ k: "ok", m: ok });
    } catch (e) { setSt({ k: "error", m: mensajeError(e) }); } finally { setBusy(false); }
  };
  const subir = async (f: File | undefined) => {
    if (!f) return;
    try { const imagen = await imagenEquipo(f); await guardar({ imagen }, "Foto de perfil actualizada."); }
    catch (e) { setSt({ k: "error", m: mensajeError(e) }); }
  };
  return (
    <div className="grid gap-2 justify-items-start" data-testid="foto-perfil">
      <label className="relative block cursor-pointer group shrink-0" style={{ width: size, height: size }} title="Cambiar foto de perfil">
        {foto ? <img src={foto} alt={"Foto de " + nombre} width={size} height={size} className="chamfer object-cover block" style={{ width: size, height: size }} referrerPolicy="no-referrer" /> : <Initials name={nombre} size={size} />}
        <span className={"absolute inset-0 chamfer flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-wider transition-opacity " + (busy ? "opacity-100" : "opacity-0 group-hover:opacity-100")} style={{ background: "rgba(0,0,0,.7)", color: "#fff" }}>{busy ? "Guardando…" : "Cambiar foto"}</span>
        <span aria-hidden className="absolute flex items-center justify-center rounded-full" style={{ right: -6, bottom: -6, width: 26, height: 26, background: "var(--rojo)", color: "#fff", border: "2px solid var(--grafito-1)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        </span>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(ev) => { subir(ev.target.files?.[0]); ev.target.value = ""; }} data-testid="input-foto-perfil" aria-label="Subir foto de perfil" />
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-1">
        <label className="underline cursor-pointer">Subir foto<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(ev) => { subir(ev.target.files?.[0]); ev.target.value = ""; }} /></label>
        {picture && /^https:/.test(picture) && <button type="button" className="underline muted" disabled={busy} onClick={() => guardar({ url: picture }, "Ahora usas la foto de tu cuenta.")} data-testid="foto-de-cuenta">Usar la de mi cuenta</button>}
        {q.data?.propia && <button type="button" className="underline muted" disabled={busy} onClick={() => guardar({ quitar: true }, "Foto quitada.")}>Quitar</button>}
      </div>
      {st && <span className="text-xs" role={st.k === "error" ? "alert" : "status"} style={{ color: st.k === "ok" ? "var(--ok)" : "#ff5468", maxWidth: 220 }}>{st.m}</span>}
    </div>
  );
}

function Resumen() {
  const { user } = useAuth();
  const q = useApi<{ nickname: string | null; redes: Record<string, any> }>("/api/account/perfil", { auth: true });
  // El nombre público es el nickname guardado en el servidor. Nunca se sustituye por el correo.
  const nombre = q.data?.nickname || null;
  const ins = useMisInsignias();
  return (
    <div className="wrap grid gap-6">
      <div className="panel panel-pad flex flex-wrap items-center gap-6">
        <span className="relative inline-block shrink-0">
          <FotoPerfil nombre={nombre || "?"} picture={user?.picture || null} />
          <SelloAvatar s={ins.data?.sello} />
        </span>
        <div className="min-w-0">
          <div className="eyebrow mb-1">Nombre público</div>
          {q.isLoading ? <div className="sk" style={{ height: 36, width: 220 }} /> : q.error ? (
            <p className="muted small">No se pudo leer tu perfil del servidor ({q.error.code}).</p>
          ) : nombre ? <h2 className="d-1 flex flex-wrap items-center gap-3">{nombre}<Sello3D s={ins.data?.sello} size={26} /></h2> : (
            <div><p className="d-3">Sin nombre público</p><Link href="/perfil/ajustes" className="link-arrow mt-1">Elegir nombre →</Link></div>
          )}
        </div>
      </div>
      <div className="panel panel-pad grid gap-4" data-testid="perfil-insignias"><div className="flex justify-between items-center gap-3"><h2 className="d-3">Mis insignias</h2><Link href="/insignias" className="link-arrow">Catálogo →</Link></div>{ins.isLoading ? <div className="sk" style={{ height: 90 }} /> : <FilaInsignias codes={ins.data?.conseguidas || []} size={72} />}<p className="text-xs muted">Se colocan solas cuando cumples el requisito (plan activo, cuentas vinculadas, logros, torneos…).</p></div>
      <div className="panel panel-pad grid gap-4"><div className="flex justify-between items-center gap-3"><h2 className="d-3">Logros conseguidos</h2><Link href="/logros" className="link-arrow">Ver los 1000 →</Link></div><ResumenLogros /></div>
      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/perfil/cuentas" className="panel panel-pad hover:bg-[var(--grafito-2)] transition-colors"><div className="eyebrow mb-2">Cuentas vinculadas</div><p className="small muted">FACEIT, Discord, Twitch, Riot y Steam.</p></Link>
        <Link href="/logros" className="panel panel-pad hover:bg-[var(--grafito-2)] transition-colors"><div className="eyebrow mb-2">Insignias y logros</div><p className="small muted">Validados por el motor de logros.</p></Link>
        <Link href="/perfil/membresia" className="panel panel-pad hover:bg-[var(--grafito-2)] transition-colors"><div className="eyebrow mb-2">Membresía</div><p className="small muted">Estado de tu plan.</p></Link>
      </div>
    </div>
  );
}

function Ajustes() {
  const qc = useQueryClient();
  const q = useApi<{ nickname: string | null }>("/api/account/perfil", { auth: true });
  const [nick, setNick] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  useEffect(() => { if (q.data?.nickname) setNick(q.data.nickname); }, [q.data?.nickname]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "guardando" });
    try {
      await api("/api/account/perfil", { method: "POST", auth: true, body: { nickname: nick.trim() } });
      // Se vuelve a leer del servidor: lo que se muestra es lo que quedó guardado.
      await qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] });
      setSt({ k: "ok" });
    } catch (err: any) {
      const m: Record<string, string> = { nick_invalido: "Entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.", nick_ocupado: "Ese nombre ya lo usa otra cuenta.", db_no_config: "La base de datos no está disponible.", sin_sesion: "Tu sesión caducó. Vuelve a iniciar sesión.", "Origen no permitido": "Este dominio aún no está autorizado por la API para guardar perfiles." };
      setSt({ k: "error", m: m[err.code] || "No se pudo guardar (" + err.code + ")." });
    }
  };
  return (
    <div className="wrap">
      <form onSubmit={submit} className="panel panel-pad grid gap-4 max-w-xl" data-testid="form-ajustes">
        <h2 className="d-3">Nombre público</h2>
        <p className="small muted">Es el nombre que verán los demás jugadores. Se guarda en el servidor y se mantiene entre sesiones.</p>
        <div className="field"><label htmlFor="nick">Nick</label><input id="nick" className="input" value={nick} onChange={(e) => setNick(e.target.value)} required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_.\-]{3,20}" disabled={q.isLoading} data-testid="input-nick" /></div>
        <div className="flex items-center gap-3">
          <button className="btn btn-rojo" disabled={st.k === "guardando" || q.isLoading} data-testid="button-guardar-nick">{st.k === "guardando" ? "Guardando…" : "Guardar"}</button>
          {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">Guardado en el servidor.</span>}
          {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
        </div>
      </form>
      <div className="mt-6"><PerfilPublicoForm /></div>
      <div className="mt-6"><VitrinaInsignias /></div>
      <div className="mt-6"><CanalesForm /></div>
    </div>
  );
}

/** Vitrina de insignias: elige cuáles mostrar en tu ficha pública y en qué orden. */
function VitrinaInsignias() {
  const qc = useQueryClient();
  const ficha = useApi<{ vitrina: string[] | null }>("/int/perfil/publico", { auth: true });
  const mias = useMisInsignias();
  const cat = useCatalogoInsignias();
  const [sel, setSel] = useState<string[] | null>(null);
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  useEffect(() => {
    if (ficha.data && sel === null) setSel(ficha.data.vitrina || []);
  }, [ficha.data, sel]);

  const conseguidas = (mias.data?.conseguidas || []).filter((c) => c !== "MEMBER");
  const info = (code: string) => (cat.data?.catalogo || []).find((b) => b.code === code);

  const alternar = (code: string) => {
    setSt({ k: "idle" });
    setSel((prev) => {
      const p = prev || [];
      if (p.includes(code)) return p.filter((c) => c !== code);
      if (p.length >= 6) return p;
      return [...p, code];
    });
  };
  const mover = (code: string, dir: -1 | 1) => {
    setSel((prev) => {
      const p = [...(prev || [])];
      const i = p.indexOf(code);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      [p[i], p[j]] = [p[j], p[i]];
      return p;
    });
  };
  const guardar = async () => {
    setSt({ k: "guardando" });
    try {
      const r = await api<{ ok: boolean; codigos: string[] }>("/int/perfil/vitrina", { method: "POST", auth: true, body: { codigos: sel || [] } });
      setSel(r.codigos);
      const foto = await qc.getQueryData<{ pid: string | null }>(["/int/perfil/foto", true]);
      if (foto?.pid) qc.invalidateQueries({ queryKey: ["/int/u/" + foto.pid, false] });
      await qc.invalidateQueries({ queryKey: ["/int/perfil/publico", true] });
      setSt({ k: "ok" });
    } catch (err: any) {
      setSt({ k: "error", m: "No se pudo guardar la vitrina (" + (err?.code || "error") + ")." });
    }
  };

  if (mias.isLoading || ficha.isLoading) return <div className="panel panel-pad"><div className="sk" style={{ height: 80 }} /></div>;

  return (
    <div className="panel panel-pad grid gap-4 max-w-xl" data-testid="vitrina-insignias">
      <div>
        <h2 className="d-3">Vitrina de insignias</h2>
        <p className="small muted">Elige hasta 6 insignias para exhibir en tu ficha pública y ordénalas a tu gusto. Pasa el cursor por cada una para ver su requisito.</p>
      </div>

      {/* Orden actual con controles */}
      {(sel || []).length > 0 ? (
        <ol className="grid gap-2" data-testid="vitrina-orden">
          {(sel || []).map((code, i) => {
            const d = info(code);
            return (
              <li key={code} className="flex items-center gap-3 p-2 border" style={{ borderColor: "var(--linea-suave)" }}>
                <span className="num muted" style={{ width: 20 }}>{i + 1}</span>
                {d ? <Insignia3D d={d} size={40} titulo={d.nombre} /> : <img src={pngInsignia(code, 64)} alt="" width={40} height={40} />}
                <span className="flex-1 min-w-0 truncate font-semibold">{d?.nombre || code}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => mover(code, -1)} disabled={i === 0} aria-label={"Subir " + (d?.nombre || code)}>↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => mover(code, 1)} disabled={i === (sel || []).length - 1} aria-label={"Bajar " + (d?.nombre || code)}>↓</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => alternar(code)} aria-label={"Quitar " + (d?.nombre || code)}>✕</button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="small muted" data-testid="vitrina-vacia">Sin vitrina: tu ficha muestra automáticamente tus primeras insignias. Elige algunas abajo para personalizarla.</p>
      )}

      {/* Catálogo de conseguidas */}
      {conseguidas.length === 0 ? (
        <p className="small muted">Aún no tienes insignias conseguidas. Compite, publica clips y vincula tus cuentas para desbloquearlas.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }} data-testid="vitrina-catalogo">
          {conseguidas.map((code) => {
            const d = info(code);
            const activa = (sel || []).includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => alternar(code)}
                title={(d ? d.nombre + " — " + d.requisito : code) + (activa ? " (en vitrina)" : "")}
                aria-pressed={activa}
                className="grid gap-1 justify-items-center p-2 border transition-colors"
                style={{
                  borderColor: activa ? "var(--rojo)" : "var(--linea-suave)",
                  background: activa ? "var(--rojo-tenue)" : "transparent",
                }}
                data-testid={"vitrina-item-" + code}
              >
                {d ? <Insignia3D d={d} size={44} titulo={d.nombre} /> : <img src={pngInsignia(code, 64)} alt="" width={44} height={44} />}
                <span className="text-[10px] muted truncate w-full text-center">{d?.nombre || code}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-rojo" disabled={st.k === "guardando" || sel === null} onClick={guardar} data-testid="btn-guardar-vitrina">
          {st.k === "guardando" ? "Guardando…" : "Guardar vitrina"}
        </button>
        <span className="small muted num">{(sel || []).length}/6</span>
        {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">Vitrina actualizada.</span>}
        {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
      </div>
    </div>
  );
}

const REDES_FORM = [
  { k: "twitch", l: "Twitch", ph: "tu canal (miuser)" },
  { k: "youtube", l: "YouTube", ph: "@tucanal" },
  { k: "x", l: "X / Twitter", ph: "@tucuenta" },
  { k: "tiktok", l: "TikTok", ph: "@tucuenta" },
  { k: "instagram", l: "Instagram", ph: "@tucuenta" },
] as const;

/** Banner y redes sociales de la ficha pública (/u/tu-pid). */
function PerfilPublicoForm() {
  const qc = useQueryClient();
  const q = useApi<{ banner: string | null; redes: Record<string, string> | null }>("/int/perfil/publico", { auth: true });
  const [banner, setBanner] = useState("");
  const [redes, setRedes] = useState<Record<string, string>>({});
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  useEffect(() => {
    if (!q.data) return;
    setBanner(q.data.banner || "");
    setRedes(q.data.redes || {});
  }, [q.data]);
  // Subida de banner: recorte central 3:1, ancho máx 1600 y JPEG comprimido.
  const elegirBanner = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setSt({ k: "error", m: "Elige un archivo de imagen (JPG, PNG o WebP)." }); return; }
    const urlObj = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(urlObj);
      const PROP = 3, MAXW = 1600;
      let sw = img.width, sh = Math.round(img.width / PROP);
      if (sh > img.height) { sh = img.height; sw = Math.round(img.height * PROP); }
      const sx = Math.max(0, Math.round((img.width - sw) / 2)), sy = Math.max(0, Math.round((img.height - sh) / 2));
      const w = Math.min(MAXW, sw), h = Math.round(w / PROP);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")?.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      setBanner(cv.toDataURL("image/jpeg", 0.82));
      setSt({ k: "idle" });
    };
    img.onerror = () => { URL.revokeObjectURL(urlObj); setSt({ k: "error", m: "No se pudo leer la imagen." }); };
    img.src = urlObj;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "guardando" });
    try {
      await api("/int/perfil/publico", { method: "POST", auth: true, body: { banner: banner.trim() || null, redes } });
      const foto = await qc.getQueryData<{ pid: string | null }>(["/int/perfil/foto", true]);
      if (foto?.pid) qc.invalidateQueries({ queryKey: ["/int/u/" + foto.pid, false] });
      await qc.invalidateQueries({ queryKey: ["/int/perfil/publico", true] });
      setSt({ k: "ok" });
    } catch (err: any) {
      const m: Record<string, string> = { banner_invalido: "El banner debe ser una imagen o un enlace https://.", banner_grande: "La imagen quedó demasiado pesada tras optimizarla: prueba con una más ligera.", sin_sesion: "Tu sesión caducó. Vuelve a iniciar sesión." };
      setSt({ k: "error", m: m[err.code] || "No se pudo guardar (" + err.code + ")." });
    }
  };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-4 max-w-xl" data-testid="form-perfil-publico">
      <h2 className="d-3">Ficha pública</h2>
      <p className="small muted">El banner y tus redes se muestran arriba de tu perfil público. Sube una imagen horizontal y se optimiza sola: recorte 3:1, hasta 1600 px y comprimida.</p>
      {q.isLoading ? <div className="sk" style={{ height: 44 }} /> : (
        <>
          <div className="field">
            <label htmlFor="banner-file">Banner de la ficha</label>
            <input
              id="banner-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="input"
              onChange={(e) => elegirBanner(e.target.files?.[0])}
              data-testid="input-banner-file"
            />
            <span className="small muted">JPG, PNG o WebP · se recorta al centro y se comprime automáticamente</span>
          </div>
          {banner.trim() && (
            <div className="grid gap-2">
              <img src={banner.trim()} alt="Vista previa del banner" className="chamfer object-cover w-full" style={{ height: 120 }} data-testid="preview-banner" />
              <button type="button" className="btn btn-sm btn-ghost w-fit" onClick={() => setBanner("")}>Quitar banner</button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {REDES_FORM.map((r) => (
              <div className="field" key={r.k}>
                <label htmlFor={"red-" + r.k}>{r.l}</label>
                <input id={"red-" + r.k} className="input" value={redes[r.k] || ""} maxLength={120} placeholder={r.ph} onChange={(e) => setRedes({ ...redes, [r.k]: e.target.value })} data-testid={"input-red-" + r.k} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-rojo" disabled={st.k === "guardando"} data-testid="button-guardar-ficha">{st.k === "guardando" ? "Guardando…" : "Guardar ficha"}</button>
            {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">Ficha pública actualizada.</span>}
            {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
          </div>
        </>
      )}
    </form>
  );
}

type Vinculo = { plataforma: string; usuario: string; avatar: string | null; verificada: boolean; desde: string | null };
const ERR_LINK: Record<string, string> = {
  state_invalido: "La autorización caducó o no es válida. Inténtalo de nuevo.",
  sin_code: "El proveedor no devolvió la autorización.",
  cancelado: "Cancelaste la autorización en el proveedor. Puedes intentarlo de nuevo.",
};
// Errores con prefijo (p. ej. intercambio_twitch:invalid_client, perfil_faceit)
function mensajeLink(ko: string): string {
  if (ERR_LINK[ko]) return ERR_LINK[ko];
  if (ko.startsWith("intercambio_")) return "El proveedor rechazó la autorización (" + ko + "). Revisa que la URL de retorno registrada en su portal sea la del linker.";
  if (ko.startsWith("perfil_")) return "Se autorizó, pero no se pudo leer tu perfil del proveedor (" + ko + ").";
  return "La vinculación no se completó (" + ko + ").";
}

function Cuentas() {
  const qc = useQueryClient();
  const linker = useLinker();
  const perfil = useApi<{ redes: Record<string, any>; vinculos?: Vinculo[] }>("/api/account/perfil", { auth: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; m: string } | null>(null);
  // Vuelta del proveedor: ?linked=faceit o ?linkerr=motivo
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ok = sp.get("linked"), ko = sp.get("linkerr");
    if (!ok && !ko) return;
    const esEpic = ok === "epic" || !!ko && /^(epic|intercambio_epic)/.test(ko); // lo muestra la tarjeta de Epic
    if (esEpic) { window.history.replaceState(null, "", window.location.pathname); return; }
    if (ok) setAviso({ ok: true, m: "Cuenta de " + (PROVEEDORES.find((p) => p.id === ok)?.nombre || ok) + " vinculada y verificada." });
    else if (ko) setAviso({ ok: false, m: mensajeLink(ko) });
    window.history.replaceState(null, "", window.location.pathname);
    qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] });
  }, [qc]);
  // Aviso desde la ventana del OAuth (popup): refrescar estados y mostrar el resultado.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as any;
      if (d?.tipo !== "oauth-vuelta") return;
      if (d.linked) setAviso({ ok: true, m: "Cuenta de " + (PROVEEDORES.find((p) => p.id === d.linked)?.nombre || d.linked) + " vinculada y verificada." });
      else if (d.linkerr) setAviso({ ok: false, m: mensajeLink(String(d.linkerr)) });
      qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [qc]);
  const conectar = async (plataforma: string) => {
    setBusy(plataforma);
    setErr((x) => { const n = { ...x }; delete n[plataforma]; return n; });
    try {
      const r = await api<{ url: string }>("/fn/linker/api/link/start", { method: "POST", auth: true, body: { platform: plataforma, return_to: window.location.origin + "/perfil/cuentas" } });
      if (!r.url) {
        setErr((x) => ({ ...x, [plataforma]: "sin_url" }));
        setBusy(null);
        return;
      }
      // Redirección en la MISMA pestaña. FACEIT y Twitch sirven su login con
      // Cross-Origin-Opener-Policy: same-origin, que corta el vínculo con una
      // ventana emergente (window.opener = null, popup.closed = true): la web
      // nunca recibía el aviso y la cuenta quedaba "Desconectada". Al volver,
      // el linker redirige a /perfil/cuentas?linked=<plataforma> (o ?linkerr=).
      window.location.assign(r.url);
    } catch (e: any) {
      setErr((x) => ({ ...x, [plataforma]: e.code }));
      setBusy(null);
    }
  };
  const desconectar = async (plataforma: string) => {
    setBusy(plataforma);
    try {
      await api("/fn/linker/api/link/unlink", { method: "POST", auth: true, body: { platform: plataforma } });
      await qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] });
    } catch (e: any) {
      setErr((x) => ({ ...x, [plataforma]: e.code }));
    } finally { setBusy(null); }
  };
  const vinculos = perfil.data?.vinculos || [];
  return (
    <div className="wrap grid gap-4">
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        Una cuenta solo figura como conectada cuando el servidor completa la autorización oficial del proveedor (OAuth). Los datos escritos a mano no cuentan como vinculación.
      </p>
      {aviso && <p className="small" role="status" style={{ color: aviso.ok ? "var(--ok)" : "#ff5468" }} data-testid="aviso-vinculo">{aviso.m}</p>}
      <div className="grid-auto grid md:grid-cols-2">
        {PROVEEDORES.map((p) => {
          const diag = linker.data?.plataformas?.[p.linker];
          const configurado = diag === "ok" && linker.data?.plataformas?._linker_url === "ok";
          const v = vinculos.find((x) => x.plataforma === p.linker);
          let estado: Estado;
          if (err[p.id]) estado = "error";
          else if (v && v.verificada) estado = "conectada";
          else if (linker.error) estado = "error";
          else if (linker.data && !configurado) estado = "pendiente";
          else estado = "desconectada";
          const ui = ESTADO_UI[estado];
          return (
            <div key={p.id} className="p-5 grid gap-3" data-testid={"cuenta-" + p.id}>
              <div className="flex items-center gap-3">
                {v?.avatar ? <img src={v.avatar} alt="" width={32} height={32} /> : <img src={pub(p.logo)} alt="" width={32} height={32} />}
                <span className="d-3">{p.nombre}</span>
                <span className={ui.c + " ml-auto"} data-testid={"estado-" + p.id}>{linker.isLoading || perfil.isLoading ? "…" : ui.l}</span>
              </div>
              {estado === "conectada" && v && <p className="small muted">Cuenta verificada: <b style={{ color: "var(--gris-1)" }}>{v.usuario}</b></p>}
              {estado === "pendiente" && <p className="small muted">La vinculación oficial con {p.nombre} se activará cuando la app de {p.nombre} esté registrada en el servidor.</p>}
              {estado === "error" && <p className="small" style={{ color: "#ff5468" }}>{err[p.id] === "sin_url" ? "No se pudo abrir la vinculación: tu sesión no está activa. Inicia sesión de nuevo e inténtalo." : err[p.id] ? "No se pudo completar la operación (" + err[p.id] + ")." : "El servicio de vinculación no respondió."}</p>}
              {estado === "desconectada" && <button className="btn btn-sm w-fit" disabled={busy === p.id} onClick={() => conectar(p.linker)} data-testid={"button-conectar-" + p.id}>{busy === p.id ? "Abriendo…" : "Conectar " + p.nombre}</button>}
              {estado === "conectada" && <button className="btn btn-sm w-fit" disabled={busy === p.id} onClick={() => desconectar(p.linker)} data-testid={"button-desconectar-" + p.id}>{busy === p.id ? "Quitando…" : "Desconectar"}</button>}
            </div>
          );
        })}
        <TarjetaEpic />
      </div>
      <div className="mt-4"><RiotIdForm /></div>
    </div>
  );
}

type EstadoMembresia = { activo: boolean; plan: string | null; planes: string[]; nombre?: string | null; origen?: string; caduca?: string | null; periodo?: string | null; todos?: boolean };

function Membresia() {
  const q = useApi<EstadoMembresia>("/int/membresia", { auth: true });
  if (q.isLoading) return <div className="wrap"><div className="sk" style={{ height: 160 }} /></div>;
  const d = q.data;
  if (q.error || !d || !d.activo) {
    return (
      <div className="wrap">
        <Empty code={"membresía · " + (q.error ? q.error.code : "sin plan")} title="No hay un plan activo en tu cuenta" text="Cuando Stripe confirme un pago, el servidor activará el plan y su insignia aparecerá en tus logros." action={<Link href="/membresias" className="link-arrow">Ver planes →</Link>} />
      </div>
    );
  }
  const incluidos = PLANES.filter((p) => d.planes.includes(p.id));
  const top = PLANES.find((p) => p.id === d.plan);
  return (
    <div className="wrap grid gap-6" data-testid="membresia-activa">
      <div className="panel panel-pad chamfer grid gap-3" style={{ boxShadow: "inset 0 2px 0 var(--rojo)" }}>
        <div className="eyebrow">Plan activo</div>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="d-1">{d.nombre || top?.nombre || d.plan}</h2>
          <span className="tag tag-ok">Activo</span>
          {d.todos && <span className="tag tag-rojo">Plan máximo</span>}
        </div>
        <p className="small muted">{d.origen === "owner" ? "Eres el dueño de VANTS: tienes todos los planes y beneficios incluidos, sin caducidad." : d.caduca ? "Se renueva o caduca el " + new Date(d.caduca).toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" }) + "." : "Sin fecha de caducidad."}</p>
      </div>
      <div className="grid-auto grid md:grid-cols-2 xl:grid-cols-4">
        {incluidos.map((p) => (
          <article key={p.id} className="p-6 grid gap-3 content-start" data-testid={"membresia-plan-" + p.id}>
            <div className="flex items-center justify-between gap-2"><span className="eyebrow">{p.kicker}</span><span className="tag tag-ok">Incluido</span></div>
            <h3 className="d-3">{p.nombre}</h3>
            <ul className="grid gap-1.5 small">{p.beneficios.map((b) => <li key={b} className="flex gap-2"><span style={{ color: "var(--rojo)" }} aria-hidden>▸</span>{b}</li>)}</ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function FortnitePropio() {
  const q = useCuentaEpic();
  return <div className="wrap grid gap-3"><h2 className="d-3">Fortnite</h2>{q.isLoading ? <div className="sk" style={{ height: 120 }} /> : <PanelFortnite c={q.data} propio />}</div>;
}

/* ---------------- Soporte: tickets al canal tickets-soporte ---------------- */
const ASUNTOS_SOPORTE = [
  "Problema con mi cuenta o sesión",
  "Vinculación de Riot / FACEIT / Epic",
  "Torneos e inscripciones",
  "Clips y perfil público",
  "Pagos y membresías",
  "Reporte de jugador o trampa",
  "Propuesta o problema técnico",
];

function Soporte() {
  const { status } = useAuth();
  const [asunto, setAsunto] = useState(ASUNTOS_SOPORTE[0]);
  const [mensaje, setMensaje] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string; ref?: string }>({ k: "idle" });
  useEffect(() => { setSt({ k: "idle" }); }, [status]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (mensaje.trim().length < 10) { setSt({ k: "error", m: "Cuéntanos un poco más (mínimo 10 caracteres)." }); return; }
    setSt({ k: "enviando" });
    try {
      const r = await api<{ ok: boolean; ref?: string }>("/int/soporte/ticket", { method: "POST", auth: true, body: { asunto, mensaje: mensaje.trim() } });
      setSt({ k: "ok", ref: r.ref || "" });
      setMensaje("");
    } catch (err: any) {
      const codigo = err?.code || "";
      setSt({
        k: "error",
        m: codigo === "cuenta_no_verificada"
          ? "Verifica tu correo electrónico para abrir tickets de soporte."
          : "No se pudo enviar ahora mismo. Inténtalo de nuevo en unos minutos.",
      });
    }
  };
  return (
    <div className="wrap">
      <div className="panel panel-pad chamfer grid gap-4 max-w-2xl" data-testid="soporte">
        <div>
          <div className="eyebrow mb-2">Soporte VANTS</div>
          <h2 className="d-3">Abre un ticket</h2>
          <p className="muted small mt-1">Tu solicitud llega directo al equipo con una referencia VTS. Te respondemos por correo y por la campana de notificaciones de la plataforma.</p>
        </div>
        <form className="grid gap-4" onSubmit={enviar}>
          <div className="field">
            <label htmlFor="so-asunto">Asunto *</label>
            <select id="so-asunto" className="input" value={asunto} onChange={(e) => setAsunto(e.target.value)}>
              {ASUNTOS_SOPORTE.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="so-mensaje">Mensaje *</label>
            <textarea
              id="so-mensaje"
              className="input"
              rows={4}
              maxLength={1500}
              required
              placeholder="Describe qué pasa, qué esperabas y desde dónde (web o app)…"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              data-testid="ticket-mensaje"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="btn-ticket">
              {st.k === "enviando" ? "Enviando…" : "Abrir ticket"}
            </button>
            <span className="small muted num">{mensaje.length}/1500</span>
          </div>
        </form>
        {st.k === "ok" && (
          <div className="grid gap-2" role="status" data-testid="ticket-ok">
            <p className="d-3">Ticket {st.ref} creado 🎫</p>
            <p className="muted small">El equipo ya lo recibió. Recibirás la respuesta en tu correo y en las notificaciones de la plataforma.</p>
          </div>
        )}
        {st.k === "error" && <p className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</p>}
      </div>
    </div>
  );
}

const SUB: Record<string, { t: string; el: () => JSX.Element }> = {
  "": { t: "Mi perfil", el: Resumen },
  ajustes: { t: "Configuración", el: Ajustes },
  cuentas: { t: "Cuentas vinculadas", el: Cuentas },
  soporte: { t: "Soporte", el: Soporte },
  membresia: { t: "Membresía", el: Membresia },
  estadisticas: { t: "Estadísticas", el: () => <div className="grid gap-8"><EstadisticasFaceit /><div className="wrap grid gap-3"><h2 className="d-3">VALORANT</h2><PanelValorantPerfil /></div><FortnitePropio /></div> },
  equipos: { t: "Mis equipos", el: () => <div className="wrap grid gap-10"><MisEquiposPanel /><div className="grid gap-3"><h2 className="d-3">Equipo en FACEIT</h2><EquipoFaceit pie={(actual) => <VincularEquipoFaceit actual={actual} />} /></div></div> },
  torneos: { t: "Mis torneos", el: MisInscripciones },
  clips: { t: "Mis clips", el: () => <div className="wrap"><MiBiblioteca /></div> },
};

export default function Perfil() {
  const params = useParams<{ sub?: string }>();
  const sub = SUB[params.sub || ""] ? params.sub || "" : "";
  const S = SUB[sub];
  return (
    <>
      <PageHead eyebrow="Mi perfil" title={S.t} />
      <AuthGate what="tu perfil">
        <PerfilNav />
        <S.el />
      </AuthGate>
    </>
  );
}

/* ---------------- Acceso ---------------- */
export function Acceso({ modo }: { modo: "entrar" | "registro" | "recuperar" }) {
  const { status, login } = useAuth();
  const [email, setEmail] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const titulos = { entrar: "Iniciar sesión", registro: "Crear cuenta", recuperar: "Recuperar contraseña" };
  const recuperar = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try {
      // Endpoint público de Auth0 para usuarios con correo y contraseña: envía el enlace de restablecimiento.
      const r = await fetch("https://" + AUTH0_DOMAIN + "/dbconnections/change_password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: AUTH0_CLIENT_ID, email: email.trim(), connection: "Username-Password-Authentication" }),
      });
      if (!r.ok) throw new Error("http_" + r.status);
      setSt({ k: "ok" });
    } catch (err: any) {
      setSt({ k: "error", m: "No se pudo enviar el correo (" + (err.message || "error") + ")." });
    }
  };
  return (
    <>
      <PageHead eyebrow="Cuenta" title={titulos[modo]} />
      <div className="wrap">
        <div className="panel panel-pad chamfer grid gap-5 max-w-lg" data-testid={"acceso-" + modo}>
          {status === "autenticado" ? (
            <><p>Ya tienes la sesión iniciada.</p><Link href="/perfil" className="btn btn-rojo w-fit">Ir a mi perfil</Link></>
          ) : !AUTH_ENABLED || status === "no_disponible" ? (
            <>
              <p className="muted">El acceso usa la identidad de VANTS (Auth0) y solo funciona en el dominio registrado de la plataforma. En esta vista previa no se puede iniciar sesión y no se muestra ningún dato privado.</p>
              <p className="small" style={{ color: "var(--gris-3)" }}>Estado del servicio de identidad: no disponible en este entorno.</p>
            </>
          ) : modo === "recuperar" ? (
            st.k === "ok" ? <p role="status">Si la dirección corresponde a una cuenta, recibirás un correo para restablecer la contraseña.</p> : (
              <form onSubmit={recuperar} className="grid gap-4">
                <div className="field"><label htmlFor="em">Correo de la cuenta</label><input id="em" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
                <button className="btn btn-rojo" disabled={st.k === "enviando"}>{st.k === "enviando" ? "Enviando…" : "Enviar enlace"}</button>
                {st.k === "error" && <p className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</p>}
              </form>
            )
          ) : (
            <>
              {modo === "registro" && (
                <p className="muted" data-testid="bienvenida-registro">
                  Bienvenido a VANTS. Crea tu cuenta gratis en menos de un minuto, vincula tu perfil gamer y
                  empieza a competir o armar tu propia comunidad.
                </p>
              )}
              {modo === "registro" && (
                <div className="field">
                  <label className="flex items-start gap-3 small" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      required
                      checked={acepta}
                      onChange={(e) => setAcepta(e.target.checked)}
                      data-testid="checkbox-terminos"
                      style={{ width: 18, height: 18, accentColor: "var(--rojo)" }}
                    />
                    <span>
                      Acepto los{" "}
                      <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline">Términos de Servicio</a>, la{" "}
                      <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidad</a>{" "}
                      y las normas de conducta y juego limpio de VANTS GAMES.
                    </span>
                  </label>
                </div>
              )}
              {modo !== "registro" && (
                <p className="muted">Accede con tu cuenta de VANTS.</p>
              )}
              <button
                className="btn btn-rojo"
                disabled={status === "cargando" || (modo === "registro" && !acepta)}
                onClick={() => login({ signup: modo === "registro", returnTo: "/perfil" })}
                data-testid={"button-" + modo}
              >
                {titulos[modo]}
              </button>
              <div className="flex flex-wrap gap-4 small">
                {modo === "entrar" ? <Link href="/registro" className="underline muted">Crear cuenta</Link> : <Link href="/entrar" className="underline muted">Ya tengo cuenta</Link>}
                <Link href="/recuperar" className="underline muted">Olvidé mi contraseña</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

