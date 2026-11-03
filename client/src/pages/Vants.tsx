/**
 * Funciones de comunidad de VANTS servidas por vants-integraciones (rutas /int/...):
 * ranking de jugadores VANTS, equipos de jugadores, inscripciones, logros de juego,
 * eventos y el panel de publicación de la organización (solo cuenta owner).
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate, GameTag, Initials } from "@/components/ui-vants";
import { NivelFaceit } from "./PerfilFaceit";
import { fecha, hora, gameLabel } from "@/lib/format";

/* ------------------------------------------------------------------ tipos */
export type EquipoRef = { slug: string; nombre: string; tag: string | null; juego: string };
export type FilaFaceit = { pos: number; nick: string; avatar: string | null; pais: string | null; nivel: number | null; elo: number | null; partidas: number | null; winrate: number | null; kd: number | null; url: string; equipo: EquipoRef | null; actualizado: string };
export type FilaXp = { pos: number; nick: string; xp: number; fundador: boolean; equipo: EquipoRef | null };
type Miembro = { id?: string; nick: string; rol: string; unido: string; yo?: boolean };
type MiEquipo = { slug: string; nombre: string; tag: string | null; juego: string; region: string | null; logo_url?: string | null; capitan: boolean; codigo: string | null; miembros: Miembro[] };
type Inscripcion = { id: string; slug: string; name: string; tag: string; status: string; created_at: string; torneo: string | null; starts_at: string | null; estado: string | null; game_slug: string | null };
type Logro = { code: string; nombre: string; descripcion: string; categoria: string; conseguido: boolean; progreso: { actual: number; meta: number } | null };
export type Evento = { id: string; titulo: string; tipo: string; descripcion: string | null; juego: string | null; lugar: string | null; url: string | null; empieza: string; termina: string | null };

const ERRORES: Record<string, string> = {
  nombre_invalido: "El nombre debe tener al menos 2 caracteres.",
  tag_invalido: "El tag debe tener de 2 a 4 letras o números.",
  juego_invalido: "Elige VALORANT o CS2.",
  ya_tienes_equipo: "Ya perteneces a un equipo de ese juego. Sal de él antes de crear o unirte a otro.",
  nombre_en_uso: "Ya existe un equipo con ese nombre.",
  codigo_invalido: "El código tiene 8 caracteres (letras y números).",
  codigo_no_existe: "No hay ningún equipo con ese código.",
  ya_eres_miembro: "Ya eres miembro de ese equipo.",
  equipo_lleno: "El equipo ya tiene 10 jugadores.",
  solo_capitan: "Solo el capitán puede hacer esto.",
  solo_owner: "Solo la cuenta de la organización puede publicar.",
  datos_invalidos: "Revisa los campos obligatorios.",
  fechas_invalidas: "La fecha de fin no puede ser anterior a la de inicio.",
  url_invalida: "El enlace debe empezar por https://",
  sin_sesion: "Tu sesión expiró. Vuelve a iniciar sesión.",
  imagen_grande: "La imagen es demasiado grande. Usa una de menos de 500 KB.",
  imagen_invalida: "Elige una imagen PNG, JPG o WEBP.",
  red_no_disponible: "No hay conexión con el servidor.",
};
const msg = (e: any) => ERRORES[e?.code] || "No se pudo completar (" + (e?.code || "error") + ").";
const isoLocal = (v: string) => (v ? new Date(v).toISOString() : "");
const aLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function useRol() {
  const { status } = useAuth();
  return useApi<{ owner: boolean; nick: string }>(status === "autenticado" ? "/int/rol" : null, { auth: true });
}

function Aviso({ k, children }: { k: "ok" | "error"; children: ReactNode }) {
  return <p className="small" role={k === "error" ? "alert" : "status"} style={{ color: k === "ok" ? "var(--ok)" : "#ff5468" }}>{children}</p>;
}

/* ================================================================== ranking */
export function useRanking() {
  return useApi<{ faceit: FilaFaceit[]; xp: FilaXp[] }>("/int/ranking", { refetchMs: 120_000 });
}

function EquipoMini({ e }: { e: EquipoRef | null }) {
  if (!e) return <span className="small muted">Agente libre</span>;
  return <Link href={"/equipos/" + e.slug} className="small hover:text-[var(--rojo)] truncate">{e.tag ? <span className="tag mr-1.5">{e.tag}</span> : null}{e.nombre}</Link>;
}

export function TablaRankingFaceit({ filas, max }: { filas: FilaFaceit[]; max?: number }) {
  const vis = max ? filas.slice(0, max) : filas;
  return (
    <div className="panel" data-testid="ranking-vants">
      <div className="row grid-cols-[40px_1fr_auto] md:grid-cols-[48px_1fr_180px_56px_80px_70px] small muted" style={{ background: "var(--grafito-2)" }}>
        <span>#</span><span>Jugador</span><span className="hidden md:block">Equipo</span><span className="hidden md:block">Nivel</span><span className="text-right">ELO</span><span className="hidden md:block text-right">K/D</span>
      </div>
      <ol>
        {vis.map((r) => (
          <li key={r.nick + r.pos} className="row grid-cols-[40px_1fr_auto] md:grid-cols-[48px_1fr_180px_56px_80px_70px] items-center">
            <span className="num" style={{ color: r.pos <= 3 ? "var(--rojo)" : "var(--gris-2)" }}>{String(r.pos).padStart(2, "0")}</span>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-w-0 hover:text-[var(--rojo)]">
              {r.avatar ? <img src={r.avatar} alt="" width={32} height={32} className="rounded-full" loading="lazy" /> : <Initials name={r.nick} size={32} />}
              <span className="font-semibold truncate">{r.nick}</span>
              <span className="md:hidden"><NivelFaceit n={r.nivel} size={22} /></span>
            </a>
            <span className="hidden md:block min-w-0"><EquipoMini e={r.equipo} /></span>
            <span className="hidden md:block"><NivelFaceit n={r.nivel} size={26} /></span>
            <span className="num text-right">{r.elo ?? "—"}</span>
            <span className="hidden md:block num text-right">{r.kd != null ? r.kd.toFixed(2) : "—"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RankingVants() {
  const q = useRanking();
  const [tab, setTab] = useState<"faceit" | "xp">("faceit");
  const f = q.data?.faceit || [], x = q.data?.xp || [];
  return (
    <>
      <PageHead eyebrow="Ranking global" title={<>Ranking <span style={{ color: "var(--rojo)" }}>VANTS</span></>} lead="Clasificación de los jugadores registrados en VANTS. El ELO y el nivel salen de FACEIT (CS2) al vincular la cuenta; la XP se gana en la plataforma." />
      <div className="wrap grid gap-4">
        <div className="tabs" role="tablist">
          <button role="tab" className="tab" aria-selected={tab === "faceit"} onClick={() => setTab("faceit")} data-testid="tab-ranking-faceit">ELO FACEIT</button>
          <button role="tab" className="tab" aria-selected={tab === "xp"} onClick={() => setTab("xp")} data-testid="tab-ranking-xp">XP VANTS</button>
        </div>
        {q.isLoading ? <Skel n={6} h={44} /> : q.error ? <ErrorBox error={q.error} what="el ranking" /> : tab === "faceit" ? (
          f.length === 0 ? <Empty code="ranking · 0" title="Aún no hay jugadores con FACEIT vinculado" text="Vincula tu cuenta de FACEIT en tu perfil para entrar en el ranking." action={<Link href="/perfil/cuentas" className="link-arrow">Vincular FACEIT →</Link>} /> : (
            <>
              <TablaRankingFaceit filas={f} />
              <p className="small muted">{f.length} jugadores VANTS · datos de FACEIT actualizados cada pocos minutos. ¿No apareces? <Link href="/perfil/cuentas" className="link-arrow">Vincula FACEIT</Link></p>
            </>
          )
        ) : x.length === 0 ? <Empty code="xp · 0" title="Sin jugadores con XP todavía" /> : (
          <div className="panel">
            <div className="row grid-cols-[48px_1fr_180px_90px] small muted" style={{ background: "var(--grafito-2)" }}><span>#</span><span>Jugador</span><span>Equipo</span><span className="text-right">XP</span></div>
            <ol>
              {x.map((r) => (
                <li key={r.nick + r.pos} className="row grid-cols-[48px_1fr_180px_90px] items-center">
                  <span className="num" style={{ color: r.pos <= 3 ? "var(--rojo)" : "var(--gris-2)" }}>{String(r.pos).padStart(2, "0")}</span>
                  <span className="flex items-center gap-2 min-w-0"><span className="font-semibold truncate">{r.nick}</span>{r.fundador && <span className="tag tag-rojo">Fundador</span>}</span>
                  <span className="min-w-0"><EquipoMini e={r.equipo} /></span>
                  <span className="num text-right">{r.xp}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </>
  );
}

/* ================================================================== equipos */
function CrearEquipo({ onOk }: { onOk: (slug: string) => void }) {
  const [f, setF] = useState({ nombre: "", tag: "", juego: "cs2", region: "LATAM" });
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "error"; m?: string }>({ k: "idle" });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try { const r = await api<{ slug: string }>("/int/equipos", { method: "POST", auth: true, body: f }); onOk(r.slug); setSt({ k: "idle" }); }
    catch (err) { setSt({ k: "error", m: msg(err) }); }
  };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-3 content-start" data-testid="form-crear-equipo">
      <h3 className="d-3">Crear equipo</h3>
      <p className="small muted">Serás el capitán. Recibirás un código para invitar a tus compañeros.</p>
      <div className="field"><label htmlFor="ce-n">Nombre</label><input id="ce-n" className="input" required minLength={2} maxLength={32} value={f.nombre} onChange={set("nombre")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label htmlFor="ce-t">Tag</label><input id="ce-t" className="input" required maxLength={4} pattern="[A-Za-z0-9]{2,4}" value={f.tag} onChange={set("tag")} /></div>
        <div className="field"><label htmlFor="ce-j">Juego</label><select id="ce-j" className="input" value={f.juego} onChange={set("juego")}><option value="cs2">CS2</option><option value="valorant">VALORANT</option></select></div>
      </div>
      <div className="field"><label htmlFor="ce-r">Región</label><input id="ce-r" className="input" maxLength={40} value={f.region} onChange={set("region")} /></div>
      <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-crear-equipo">{st.k === "enviando" ? "Creando…" : "Crear equipo"}</button>
      {st.k === "error" && <Aviso k="error">{st.m}</Aviso>}
    </form>
  );
}

function UnirseEquipo({ onOk }: { onOk: (slug: string) => void }) {
  const [codigo, setCodigo] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "error"; m?: string }>({ k: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try { const r = await api<{ slug: string }>("/int/equipos/unirse", { method: "POST", auth: true, body: { codigo } }); onOk(r.slug); setSt({ k: "idle" }); }
    catch (err) { setSt({ k: "error", m: msg(err) }); }
  };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-3 content-start" data-testid="form-unirse-equipo">
      <h3 className="d-3">Unirse con código</h3>
      <p className="small muted">Pide el código de invitación al capitán de tu equipo.</p>
      <div className="field"><label htmlFor="ue-c">Código de invitación</label><input id="ue-c" className="input num uppercase" required maxLength={8} pattern="[A-Za-z0-9]{8}" placeholder="ABCD2345" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} /></div>
      <button className="btn" disabled={st.k === "enviando"} data-testid="button-unirse-equipo">{st.k === "enviando" ? "Uniendo…" : "Unirme al equipo"}</button>
      {st.k === "error" && <Aviso k="error">{st.m}</Aviso>}
    </form>
  );
}

/** Reduce la imagen a 256×256 (recorte centrado) y la devuelve como data URL WEBP/PNG. */
async function imagenEquipo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Object.assign(new Error("imagen_invalida"), { code: "imagen_invalida" });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(Object.assign(new Error("imagen_invalida"), { code: "imagen_invalida" })); i.src = url; });
    const L = 256, c = document.createElement("canvas");
    c.width = L; c.height = L;
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, L, L);
    const webp = c.toDataURL("image/webp", 0.88);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

function FotoEquipo({ e, onCambio }: { e: MiEquipo; onCambio: (m: { k: "ok" | "error"; m: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<string | null>(e.logo_url || null);
  const subir = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const imagen = await imagenEquipo(f);
      const r = await api<{ logo_url: string }>("/int/equipos/logo", { method: "POST", auth: true, body: { slug: e.slug, imagen } });
      setLogo(r.logo_url); onCambio({ k: "ok", m: "Foto del equipo actualizada." });
    } catch (err) { onCambio({ k: "error", m: msg(err) }); }
    finally { setBusy(false); }
  };
  const quitar = async () => {
    if (!window.confirm("¿Quitar la foto del equipo?")) return;
    setBusy(true);
    try { await api("/int/equipos/logo", { method: "POST", auth: true, body: { slug: e.slug, quitar: true } }); setLogo(null); onCambio({ k: "ok", m: "Foto quitada." }); }
    catch (err) { onCambio({ k: "error", m: msg(err) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-1.5 justify-items-center" data-testid={"foto-equipo-" + e.slug}>
      {logo ? <img src={logo} alt={"Foto de " + e.nombre} width={72} height={72} className="chamfer object-cover" style={{ width: 72, height: 72 }} /> : <Initials name={e.tag || e.nombre} size={72} />}
      {e.capitan && (
        <div className="flex gap-1">
          <label className="btn btn-sm btn-ghost cursor-pointer" style={{ padding: "4px 8px", fontSize: 11 }}>
            {busy ? "Subiendo…" : logo ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={busy} onChange={(ev) => { subir(ev.target.files?.[0]); ev.target.value = ""; }} data-testid={"input-foto-equipo-" + e.slug} />
          </label>
          {logo && !busy && <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={quitar}>Quitar</button>}
        </div>
      )}
    </div>
  );
}

function TarjetaMiEquipo({ e, refrescar }: { e: MiEquipo; refrescar: () => void }) {
  const [codigo, setCodigo] = useState(e.codigo);
  const [st, setSt] = useState<{ k: "idle" | "ok" | "error"; m?: string }>({ k: "idle" });
  const accion = async (ruta: string, body: any, conf?: string) => {
    if (conf && !window.confirm(conf)) return;
    try { const r = await api<any>(ruta, { method: "POST", auth: true, body }); if (r.codigo) setCodigo(r.codigo); setSt({ k: "ok", m: "Hecho." }); refrescar(); }
    catch (err) { setSt({ k: "error", m: msg(err) }); }
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(codigo || ""); setSt({ k: "ok", m: "Código copiado." }); } catch { /* sin portapapeles */ } };
  return (
    <div className="panel" data-testid={"mi-equipo-" + e.slug}>
      <div className="panel-pad flex flex-wrap items-center gap-4 border-b" style={{ borderColor: "var(--linea-suave)" }}>
        <FotoEquipo e={e} onCambio={(m) => { setSt(m); refrescar(); }} />
        <div className="min-w-0 grow">
          <Link href={"/equipos/" + e.slug} className="d-2 hover:text-[var(--rojo)]">{e.nombre}</Link>
          <div className="flex flex-wrap gap-1.5 mt-2">{e.tag && <span className="tag">{e.tag}</span>}<GameTag g={e.juego} />{e.region && <span className="tag">{e.region}</span>}{e.capitan && <span className="tag tag-rojo">Capitán</span>}</div>
        </div>
        {e.capitan && codigo && (
          <div className="grid gap-1 text-right">
            <span className="eyebrow">Código de invitación</span>
            <span className="flex gap-2 items-center justify-end"><span className="num d-3" data-testid="codigo-invitacion">{codigo}</span><button className="btn btn-sm" onClick={copiar}>Copiar</button><button className="btn btn-sm btn-ghost" onClick={() => accion("/int/equipos/codigo", { slug: e.slug }, "¿Generar un código nuevo? El anterior dejará de funcionar.")}>Nuevo</button></span>
          </div>
        )}
      </div>
      <ul>
        {e.miembros.map((m) => (
          <li key={m.nick + m.unido} className="row grid-cols-[1fr_auto] items-center">
            <span className="flex items-center gap-3 min-w-0"><Initials name={m.nick} size={32} /><span className="font-semibold truncate">{m.nick}</span>{m.rol === "capitan" && <span className="tag">Capitán</span>}{m.yo && <span className="small muted">(tú)</span>}</span>
            {e.capitan && !m.yo && m.id ? <button className="btn btn-sm btn-ghost" onClick={() => accion("/int/equipos/expulsar", { slug: e.slug, id: m.id }, "¿Retirar a " + m.nick + " del equipo?")}>Retirar</button> : <span className="small muted">desde {fecha(m.unido)}</span>}
          </li>
        ))}
      </ul>
      <div className="panel-pad flex flex-wrap gap-3 items-center justify-between border-t" style={{ borderColor: "var(--linea-suave)" }}>
        <Link href="/torneos/competir" className="link-arrow">Inscribir en un torneo →</Link>
        <button className="btn btn-sm btn-ghost" onClick={() => accion("/int/equipos/salir", { slug: e.slug }, e.miembros.length === 1 ? "Eres el único miembro: el equipo se disolverá. ¿Continuar?" : "¿Salir del equipo?" + (e.capitan ? " La capitanía pasará al siguiente miembro." : ""))}>{e.miembros.length === 1 ? "Disolver equipo" : "Salir del equipo"}</button>
      </div>
      {st.k !== "idle" && <div className="px-5 pb-4"><Aviso k={st.k === "ok" ? "ok" : "error"}>{st.m}</Aviso></div>}
    </div>
  );
}

export function useMisEquipos() {
  const { status } = useAuth();
  return useApi<{ equipos: MiEquipo[] }>(status === "autenticado" ? "/int/mis-equipos" : null, { auth: true });
}

/** Gestión completa de equipos del jugador (crear, unirse, invitar, salir). */
export function MisEquiposPanel() {
  const q = useMisEquipos();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["/int/mis-equipos"] }); qc.invalidateQueries({ queryKey: ["/api/teams"] }); };
  const ok = (slug: string) => { refrescar(); nav("/equipos/" + slug); };
  const eqs = q.data?.equipos || [];
  return (
    <div className="grid gap-6" data-testid="mis-equipos">
      {q.isLoading ? <Skel n={2} /> : q.error ? <ErrorBox error={q.error} what="tus equipos" /> : eqs.length === 0 ? (
        <Empty code="equipos · 0" title="Todavía no tienes equipo" text="Crea uno y comparte el código con tus compañeros, o únete con el código que te pase tu capitán. Puedes tener un equipo de VALORANT y otro de CS2." />
      ) : eqs.map((e) => <TarjetaMiEquipo key={e.slug} e={e} refrescar={refrescar} />)}
      <div className="grid gap-6 md:grid-cols-2">
        <CrearEquipo onOk={ok} />
        <UnirseEquipo onOk={ok} />
      </div>
    </div>
  );
}

/** Bloque en la página /equipos: llamada a la acción o gestión si hay sesión. */
export function EquiposCTA() {
  const { status, login } = useAuth();
  if (status === "autenticado") return <Section eyebrow="Tu equipo" title="Crea o únete a un equipo"><MisEquiposPanel /></Section>;
  return (
    <Section eyebrow="Tu equipo" title="Crea tu equipo en VANTS">
      <div className="panel panel-pad chamfer flex flex-wrap items-center justify-between gap-4">
        <p className="muted max-w-xl">Inicia sesión para crear un equipo, invitar a tus compañeros con un código e inscribiros en los torneos de VANTS.</p>
        {status === "anonimo" && <button className="btn btn-rojo" onClick={() => login({ returnTo: "/equipos" })} data-testid="button-equipos-login">Iniciar sesión</button>}
      </div>
    </Section>
  );
}

/** Miembros VANTS de un equipo (con nivel/ELO de FACEIT) en la ficha pública. */
export function MiembrosVants({ slug }: { slug: string }) {
  const q = useApi<{ vants: boolean; miembros: { nick: string; rol: string; nivel: number | null; elo: number | null; slug: string | null }[] }>("/int/equipos/" + slug);
  if (!q.data?.vants || q.data.miembros.length === 0) return null;
  return (
    <Section title="Jugadores VANTS" eyebrow="Nivel FACEIT">
      <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
        {q.data.miembros.map((m) => (
          <Link key={m.nick} href={m.slug ? "/jugadores/" + m.slug : "#"} className="p-5 flex items-center gap-3 hover:bg-[var(--grafito-2)] transition-colors">
            <Initials name={m.nick} size={44} />
            <div className="min-w-0 grow"><div className="d-3 truncate">{m.nick}</div><div className="small muted">{m.rol === "capitan" ? "Capitán" : "Jugador"}{m.elo ? " · " + m.elo + " ELO" : ""}</div></div>
            {m.nivel ? <NivelFaceit n={m.nivel} size={30} /> : null}
          </Link>
        ))}
      </div>
    </Section>
  );
}

/** FACEIT de un jugador VANTS en su ficha /jugadores/:slug. */
export function FaceitDeJugador({ slug }: { slug: string }) {
  const q = useApi<{ faceit: { nick: string; avatar: string | null; nivel: number | null; elo: number | null; partidas: number | null; winrate: number | null; kd: number | null; url: string } | null }>("/int/jugador/" + slug);
  if (q.isLoading) return <div className="sk" style={{ height: 64 }} />;
  const f = q.data?.faceit;
  if (!f) return <p className="muted small">Este jugador todavía no ha vinculado FACEIT.</p>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3"><NivelFaceit n={f.nivel} size={36} /><div><div className="d-3">{f.elo ?? "—"} ELO</div><a href={f.url} target="_blank" rel="noopener noreferrer" className="small link-arrow">{f.nick} en FACEIT ↗</a></div></div>
      <div className="grid grid-cols-3 gap-2 small">
        <div><div className="muted">Partidas</div><div className="num">{f.partidas ?? "—"}</div></div>
        <div><div className="muted">Victorias</div><div className="num">{f.winrate != null ? f.winrate + "%" : "—"}</div></div>
        <div><div className="muted">K/D</div><div className="num">{f.kd != null ? f.kd.toFixed(2) : "—"}</div></div>
      </div>
    </div>
  );
}

/* ================================================================== inscripciones */
const ESTADO_INS: Record<string, string> = { pendiente: "tag tag-aviso", confirmado: "tag tag-ok", rechazado: "tag tag-rojo" };

export function useMisInscripciones() {
  const { status } = useAuth();
  return useApi<{ inscripciones: Inscripcion[] }>(status === "autenticado" ? "/int/mis-inscripciones" : null, { auth: true });
}

export function MisInscripciones() {
  const q = useMisInscripciones();
  const ins = q.data?.inscripciones || [];
  return (
    <div className="wrap" data-testid="mis-inscripciones">
      {q.isLoading ? <Skel n={2} /> : q.error ? <ErrorBox error={q.error} what="tus inscripciones" /> : ins.length === 0 ? (
        <Empty code="torneos · 0" title="No tienes inscripciones" text="Tus inscripciones y su estado (pendiente, confirmada o rechazada) aparecerán aquí." action={<Link href="/torneos/competir" className="link-arrow">Buscar torneos →</Link>} />
      ) : (
        <div className="panel">
          {ins.map((i) => (
            <Link key={i.id} href={"/torneos/" + i.slug} className="row grid-cols-[1fr_auto] md:grid-cols-[1fr_200px_140px_auto] items-center">
              <span className="min-w-0"><span className="font-semibold truncate block">{i.torneo || i.slug}</span><span className="small muted">{i.game_slug ? gameLabel(i.game_slug) + " · " : ""}{i.starts_at ? fecha(i.starts_at, { day: "2-digit", month: "short", year: "numeric" }) + " " + hora(i.starts_at) : "Fecha por anunciar"}</span></span>
              <span className="hidden md:block small truncate"><span className="tag mr-1.5">{i.tag}</span>{i.name}</span>
              <span className="hidden md:block small muted">Solicitado {fecha(i.created_at)}</span>
              <span className={ESTADO_INS[i.status] || "tag"}>{i.status === "confirmado" ? "Confirmado" : i.status === "rechazado" ? "Rechazado" : "Pendiente"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== logros */
export function LogrosJuego({ compacto = false }: { compacto?: boolean }) {
  const { status } = useAuth();
  const q = useApi<{ conseguidos: number; total: number; logros: Logro[] }>(status === "autenticado" ? "/int/logros" : null, { auth: true });
  if (q.isLoading) return <Skel n={2} />;
  if (q.error) return <ErrorBox error={q.error} what="tus logros" />;
  if (!q.data) return null;
  const ls = compacto ? q.data.logros.filter((l) => l.conseguido).slice(0, 8) : q.data.logros;
  return (
    <div className="grid gap-4" data-testid="logros-juego">
      <div className="flex items-center gap-4">
        <div className="num d-2">{q.data.conseguidos}<span className="muted">/{q.data.total}</span></div>
        <div className="grow h-2 bg-[var(--grafito-2)]" aria-hidden><div className="h-2" style={{ width: (100 * q.data.conseguidos) / q.data.total + "%", background: "var(--rojo)" }} /></div>
      </div>
      {compacto && ls.length === 0 ? <p className="small muted">Aún no has conseguido logros. Vincula FACEIT o crea tu equipo para empezar.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ls.map((l) => (
            <div key={l.code} className="panel panel-pad grid gap-2 content-start" style={{ opacity: l.conseguido ? 1 : 0.55, borderColor: l.conseguido ? "rgba(61,220,132,.35)" : undefined }} data-testid={"logro-" + l.code}>
              <div className="flex items-center justify-between gap-2"><span className="eyebrow">{l.categoria}</span>{l.conseguido ? <span className="tag tag-ok">Conseguido</span> : <span className="tag">Bloqueado</span>}</div>
              <div className="d-3">{l.nombre}</div>
              <p className="small muted">{l.descripcion}</p>
              {!l.conseguido && l.progreso && (
                <div className="grid gap-1"><div className="h-1.5 bg-[var(--grafito-2)]"><div className="h-1.5" style={{ width: Math.min(100, (100 * l.progreso.actual) / l.progreso.meta) + "%", background: "var(--rojo)" }} /></div><span className="small muted num">{l.progreso.actual} / {l.progreso.meta}</span></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== eventos */
export function useEventos() {
  return useApi<{ eventos: Evento[] }>("/int/eventos");
}

export function FilaEvento({ e }: { e: Evento }) {
  const cuerpo = (
    <>
      <span className="grid text-center w-14 shrink-0"><span className="num d-2">{new Date(e.empieza).getDate()}</span><span className="small muted uppercase">{fecha(e.empieza, { month: "short" })}</span></span>
      <span className="min-w-0 grow">
        <span className="flex flex-wrap gap-1.5 mb-1"><span className="tag">{e.tipo}</span>{e.juego && <GameTag g={e.juego} />}</span>
        <span className="font-semibold block">{e.titulo}</span>
        <span className="small muted block">{hora(e.empieza)}{e.termina ? " – " + hora(e.termina) : ""}{e.lugar ? " · " + e.lugar : ""}</span>
        {e.descripcion && <span className="small block mt-1" style={{ color: "var(--gris-1)" }}>{e.descripcion}</span>}
      </span>
      {e.url && <span className="link-arrow shrink-0">Abrir ↗</span>}
    </>
  );
  return e.url
    ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex gap-4 p-4 border-b hover:bg-[var(--grafito-2)] transition-colors" style={{ borderColor: "var(--linea-suave)" }} data-testid={"evento-" + e.id}>{cuerpo}</a>
    : <div className="flex gap-4 p-4 border-b" style={{ borderColor: "var(--linea-suave)" }} data-testid={"evento-" + e.id}>{cuerpo}</div>;
}

export function EventosLista() {
  const q = useEventos();
  const ev = q.data?.eventos || [];
  return (
    <>
      <PageHead eyebrow="Comunidad" title="Eventos" lead="Noches de comunidad, scrims abiertas, directos especiales y actividades de VANTS. Las horas se muestran en tu zona horaria." />
      <div className="wrap">
        {q.isLoading ? <Skel n={3} /> : q.error ? <ErrorBox error={q.error} what="los eventos" /> : ev.length === 0 ? (
          <Empty code="eventos · 0" title="No hay eventos programados" text="Cuando la organización publique un evento aparecerá aquí y recibirás un aviso en la campana." action={<Link href="/noticias" className="link-arrow">Ver anuncios →</Link>} />
        ) : <div className="panel">{ev.map((e) => <FilaEvento key={e.id} e={e} />)}</div>}
      </div>
    </>
  );
}

/* ================================================================== publicar (owner) */
type Resumen = {
  torneos: { slug: string; nombre: string; game_slug: string; estado: string; starts_at: string | null; max_teams: number | null }[];
  anuncios: { slug: string; titulo: string; publicado_at: string | null }[];
  eventos: Evento[];
  inscripciones: { id: string; tournament_id: string; name: string; tag: string; captain: string | null; region: string | null; status: string; created_at: string; torneo: string | null }[];
};

function useEnvio(onOk?: () => void) {
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const enviar = async (ruta: string, body: any, okMsg: string) => {
    setSt({ k: "enviando" });
    try { await api(ruta, { method: "POST", auth: true, body }); setSt({ k: "ok", m: okMsg }); onOk && onOk(); return true; }
    catch (err) { setSt({ k: "error", m: msg(err) }); return false; }
  };
  const aviso = st.k === "ok" || st.k === "error" ? <Aviso k={st.k === "ok" ? "ok" : "error"}>{st.m}</Aviso> : null;
  return { st, enviar, aviso };
}

const TORNEO_VACIO = { slug: "", nombre: "", juego: "cs2", estado: "upcoming", descripcion: "", region: "LATAM", location_type: "online", formato: "Eliminación simple · BO1", max_teams: "8", prize_value: "", prize_currency: "USD", fee: "0", starts_at: "", ends_at: "", reglas: "" };

function FormTorneo({ refrescar, editar, limpiar }: { refrescar: () => void; editar: typeof TORNEO_VACIO | null; limpiar: () => void }) {
  const [f, setF] = useState(editar || TORNEO_VACIO);
  const { st, enviar, aviso } = useEnvio(refrescar);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body: any = { ...f, starts_at: isoLocal(f.starts_at) || null, ends_at: isoLocal(f.ends_at) || null };
    if (!body.slug) delete body.slug;
    if (await enviar("/int/admin/torneo", body, f.slug ? "Torneo actualizado." : "Torneo publicado. Aparecerá en la web en menos de un minuto.")) { if (!f.slug) setF(TORNEO_VACIO); limpiar(); }
  };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-3" data-testid="form-torneo" key={editar?.slug || "nuevo"}>
      <h3 className="d-3">{f.slug ? "Editar torneo" : "Nuevo torneo"}</h3>
      <div className="field"><label htmlFor="t-n">Nombre</label><input id="t-n" className="input" required minLength={3} maxLength={80} value={f.nombre} onChange={set("nombre")} /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="field"><label htmlFor="t-j">Juego</label><select id="t-j" className="input" value={f.juego} onChange={set("juego")}><option value="cs2">CS2</option><option value="valorant">VALORANT</option></select></div>
        <div className="field"><label htmlFor="t-e">Estado</label><select id="t-e" className="input" value={f.estado} onChange={set("estado")}><option value="upcoming">Próximo (inscripciones abiertas)</option><option value="ongoing">En curso</option><option value="finished">Finalizado</option><option value="cancelled">Cancelado</option></select></div>
        <div className="field"><label htmlFor="t-r">Región</label><input id="t-r" className="input" maxLength={40} value={f.region} onChange={set("region")} /></div>
        <div className="field"><label htmlFor="t-l">Modalidad</label><select id="t-l" className="input" value={f.location_type} onChange={set("location_type")}><option value="online">Online</option><option value="lan">LAN</option></select></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="field"><label htmlFor="t-i">Inicio</label><input id="t-i" type="datetime-local" className="input" value={f.starts_at} onChange={set("starts_at")} /></div>
        <div className="field"><label htmlFor="t-f">Fin</label><input id="t-f" type="datetime-local" className="input" value={f.ends_at} onChange={set("ends_at")} /></div>
        <div className="field"><label htmlFor="t-m">Plazas (equipos)</label><input id="t-m" type="number" min={2} max={128} className="input" value={f.max_teams} onChange={set("max_teams")} /></div>
        <div className="field"><label htmlFor="t-fo">Formato</label><input id="t-fo" className="input" maxLength={80} value={f.formato} onChange={set("formato")} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="field"><label htmlFor="t-p">Premio</label><input id="t-p" type="number" min={0} step="any" className="input" value={f.prize_value} onChange={set("prize_value")} /></div>
        <div className="field"><label htmlFor="t-c">Moneda</label><input id="t-c" className="input uppercase" maxLength={3} value={f.prize_currency} onChange={set("prize_currency")} /></div>
        <div className="field"><label htmlFor="t-fee">Cuota</label><input id="t-fee" type="number" min={0} step="any" className="input" value={f.fee} onChange={set("fee")} /></div>
      </div>
      <div className="field"><label htmlFor="t-d">Descripción</label><textarea id="t-d" className="input" maxLength={1000} value={f.descripcion} onChange={set("descripcion")} /></div>
      <div className="field"><label htmlFor="t-re">Reglas</label><textarea id="t-re" className="input" maxLength={4000} value={f.reglas} onChange={set("reglas")} /></div>
      <div className="flex gap-3"><button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-publicar-torneo">{st.k === "enviando" ? "Guardando…" : f.slug ? "Guardar cambios" : "Publicar torneo"}</button>{f.slug && <button type="button" className="btn btn-ghost" onClick={() => { setF(TORNEO_VACIO); limpiar(); }}>Cancelar edición</button>}</div>
      {aviso}
    </form>
  );
}

function FormAnuncio({ refrescar }: { refrescar: () => void }) {
  const [f, setF] = useState({ titulo: "", resumen: "", cuerpo: "", juego: "" });
  const { st, enviar, aviso } = useEnvio(refrescar);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await enviar("/int/admin/anuncio", f, "Anuncio publicado y enviado a la campana de notificaciones.")) setF({ titulo: "", resumen: "", cuerpo: "", juego: "" }); };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-3" data-testid="form-anuncio">
      <h3 className="d-3">Nuevo anuncio</h3>
      <div className="grid md:grid-cols-[1fr_180px] gap-3">
        <div className="field"><label htmlFor="a-t">Título</label><input id="a-t" className="input" required minLength={3} maxLength={140} value={f.titulo} onChange={set("titulo")} /></div>
        <div className="field"><label htmlFor="a-j">Juego</label><select id="a-j" className="input" value={f.juego} onChange={set("juego")}><option value="">General</option><option value="cs2">CS2</option><option value="valorant">VALORANT</option></select></div>
      </div>
      <div className="field"><label htmlFor="a-r">Resumen</label><input id="a-r" className="input" maxLength={300} value={f.resumen} onChange={set("resumen")} /></div>
      <div className="field"><label htmlFor="a-c">Texto</label><textarea id="a-c" className="input" required rows={8} maxLength={20000} value={f.cuerpo} onChange={set("cuerpo")} /></div>
      <button className="btn btn-rojo w-fit" disabled={st.k === "enviando"} data-testid="button-publicar-anuncio">{st.k === "enviando" ? "Publicando…" : "Publicar anuncio"}</button>
      {aviso}
    </form>
  );
}

function FormEvento({ refrescar }: { refrescar: () => void }) {
  const vacio = { titulo: "", tipo: "comunidad", juego: "", lugar: "Discord VANTS", url: "", empieza: "", termina: "", descripcion: "" };
  const [f, setF] = useState(vacio);
  const { st, enviar, aviso } = useEnvio(refrescar);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await enviar("/int/admin/evento", { ...f, empieza: isoLocal(f.empieza), termina: isoLocal(f.termina) || null }, "Evento publicado.")) setF(vacio); };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-3" data-testid="form-evento">
      <h3 className="d-3">Nuevo evento</h3>
      <div className="field"><label htmlFor="e-t">Título</label><input id="e-t" className="input" required maxLength={120} value={f.titulo} onChange={set("titulo")} /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="field"><label htmlFor="e-ty">Tipo</label><select id="e-ty" className="input" value={f.tipo} onChange={set("tipo")}><option value="comunidad">Comunidad</option><option value="scrim">Scrim abierta</option><option value="directo">Directo</option><option value="torneo">Torneo</option><option value="sorteo">Sorteo</option></select></div>
        <div className="field"><label htmlFor="e-j">Juego</label><select id="e-j" className="input" value={f.juego} onChange={set("juego")}><option value="">General</option><option value="cs2">CS2</option><option value="valorant">VALORANT</option></select></div>
        <div className="field"><label htmlFor="e-i">Inicio</label><input id="e-i" type="datetime-local" required className="input" value={f.empieza} onChange={set("empieza")} /></div>
        <div className="field"><label htmlFor="e-f">Fin</label><input id="e-f" type="datetime-local" className="input" value={f.termina} onChange={set("termina")} /></div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="field"><label htmlFor="e-l">Lugar</label><input id="e-l" className="input" maxLength={120} value={f.lugar} onChange={set("lugar")} /></div>
        <div className="field"><label htmlFor="e-u">Enlace (opcional)</label><input id="e-u" type="url" className="input" placeholder="https://" maxLength={400} value={f.url} onChange={set("url")} /></div>
      </div>
      <div className="field"><label htmlFor="e-d">Descripción</label><textarea id="e-d" className="input" maxLength={2000} value={f.descripcion} onChange={set("descripcion")} /></div>
      <button className="btn btn-rojo w-fit" disabled={st.k === "enviando"} data-testid="button-publicar-evento">{st.k === "enviando" ? "Publicando…" : "Publicar evento"}</button>
      {aviso}
    </form>
  );
}

function Inscripciones({ r, refrescar }: { r: Resumen; refrescar: () => void }) {
  const { enviar, aviso } = useEnvio(refrescar);
  const [sembrado, setSembrado] = useState<string | null>(null);
  const sembrar = async (torneo: string) => {
    try { await api("/api/torneos/gestionar", { method: "POST", auth: true, body: { accion: "sembrar", torneo } }); setSembrado("Bracket generado para " + torneo + "."); }
    catch (e: any) { setSembrado(e.code === "equipos_insuficientes" ? "El bracket necesita exactamente 8 equipos confirmados." : "No se pudo generar el bracket (" + e.code + ")."); }
  };
  const porTorneo = new Map<string, Resumen["inscripciones"]>();
  r.inscripciones.forEach((i) => { const l = porTorneo.get(i.tournament_id) || []; l.push(i); porTorneo.set(i.tournament_id, l); });
  if (r.inscripciones.length === 0) return <Empty code="inscripciones · 0" title="Ninguna inscripción todavía" text="Cuando un capitán inscriba su equipo en un torneo aparecerá aquí para confirmarlo o rechazarlo." />;
  return (
    <div className="grid gap-4">
      {aviso}{sembrado && <p className="small muted">{sembrado}</p>}
      {Array.from(porTorneo.entries()).map(([t, lista]) => (
        <div key={t} className="panel">
          <div className="panel-pad flex flex-wrap justify-between gap-3 items-center border-b" style={{ borderColor: "var(--linea-suave)" }}>
            <span className="d-3">{lista[0].torneo || t}</span>
            <span className="flex gap-2 items-center"><span className="small muted">{lista.filter((i) => i.status === "confirmado").length} confirmados</span><button className="btn btn-sm" onClick={() => sembrar(t)}>Generar bracket</button></span>
          </div>
          {lista.map((i) => (
            <div key={i.id} className="row grid-cols-[1fr_auto] md:grid-cols-[1fr_160px_auto] items-center">
              <span className="min-w-0"><span className="tag mr-1.5">{i.tag}</span><span className="font-semibold">{i.name}</span><span className="small muted block">Capitán: {i.captain || "—"}{i.region ? " · " + i.region : ""} · {fecha(i.created_at)}</span></span>
              <span className={"hidden md:block w-fit " + (ESTADO_INS[i.status] || "tag")}>{i.status}</span>
              <span className="flex gap-2">
                <button className="btn btn-sm" disabled={i.status === "confirmado"} onClick={() => enviar("/int/admin/inscripcion", { id: i.id, status: "confirmado" }, i.name + " confirmado.")}>Confirmar</button>
                <button className="btn btn-sm btn-ghost" disabled={i.status === "rechazado"} onClick={() => enviar("/int/admin/inscripcion", { id: i.id, status: "rechazado" }, i.name + " rechazado.")}>Rechazar</button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Publicar() {
  const rol = useRol();
  const { status } = useAuth();
  const qc = useQueryClient();
  const res = useApi<Resumen>(rol.data?.owner ? "/int/admin/resumen" : null, { auth: true });
  const [tab, setTab] = useState("torneos");
  const [editar, setEditar] = useState<typeof TORNEO_VACIO | null>(null);
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["/int/admin/resumen"] }); qc.invalidateQueries({ queryKey: ["/int/eventos"] }); };
  const { aviso, enviar } = useEnvio(refrescar);
  const borrar = (tipo: string, id: string, nombre: string) => { if (window.confirm("¿Borrar «" + nombre + "»? No se puede deshacer.")) enviar("/int/admin/borrar", { tipo, id }, "Borrado."); };
  const editarTorneo = async (slug: string) => {
    try {
      const t = (await api<{ data: any }>("/api/tournaments/" + slug)).data;
      setEditar({ slug, nombre: t.nombre, juego: t.game?.slug || "cs2", estado: t.estado, descripcion: t.descripcion || "", region: t.region || "", location_type: t.location_type || "online", formato: t.formato || "", max_teams: t.max_teams ? String(t.max_teams) : "", prize_value: t.prize ? String(t.prize.value) : "", prize_currency: t.prize?.currency || "USD", fee: String(t.fee || 0), starts_at: aLocal(t.starts_at), ends_at: aLocal(t.ends_at), reglas: "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { /* sin datos */ }
  };
  const r = res.data;
  return (
    <>
      <PageHead eyebrow="Organización" title="Publicar" lead="Publica torneos, anuncios y eventos, y gestiona las inscripciones. Cada publicación avisa en la campana de notificaciones y en el Discord (si el canal de anuncios está configurado)." />
      <AuthGate what="el panel de publicación">
        {rol.isLoading || status === "cargando" ? <div className="wrap"><Skel n={2} /></div> : !rol.data?.owner ? (
          <div className="wrap"><Empty code="403 · solo organización" title="Esta sección es solo para la organización" text="Tu cuenta no tiene el rol de owner." /></div>
        ) : (
          <div className="wrap grid gap-6">
            <div className="tabs" role="tablist">
              {[["torneos", "Torneos"], ["inscripciones", "Inscripciones" + (r ? " (" + r.inscripciones.filter((i) => i.status === "pendiente").length + ")" : "")], ["anuncios", "Anuncios"], ["eventos", "Eventos"]].map(([v, l]) => <button key={v} role="tab" className="tab" aria-selected={tab === v} onClick={() => setTab(v)} data-testid={"tab-publicar-" + v}>{l}</button>)}
            </div>
            {aviso}
            {res.isLoading ? <Skel n={3} /> : res.error ? <ErrorBox error={res.error} what="el panel" /> : r && (
              <>
                {tab === "torneos" && (
                  <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
                    <FormTorneo key={editar?.slug || "nuevo"} refrescar={refrescar} editar={editar} limpiar={() => setEditar(null)} />
                    <div className="panel">{r.torneos.length === 0 ? <Empty code="torneos · 0" title="Sin torneos publicados" /> : r.torneos.map((t) => (
                      <div key={t.slug} className="row grid-cols-[1fr_auto] items-center">
                        <Link href={"/torneos/" + t.slug} className="min-w-0"><span className="font-semibold truncate block">{t.nombre}</span><span className="small muted">{gameLabel(t.game_slug)} · {t.estado}{t.starts_at ? " · " + fecha(t.starts_at) : ""}</span></Link>
                        <span className="flex gap-2"><button className="btn btn-sm" onClick={() => editarTorneo(t.slug)}>Editar</button><button className="btn btn-sm btn-ghost" onClick={() => borrar("torneo", t.slug, t.nombre)}>Borrar</button></span>
                      </div>
                    ))}</div>
                  </div>
                )}
                {tab === "inscripciones" && <Inscripciones r={r} refrescar={refrescar} />}
                {tab === "anuncios" && (
                  <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
                    <FormAnuncio refrescar={refrescar} />
                    <div className="panel">{r.anuncios.length === 0 ? <Empty code="anuncios · 0" title="Sin anuncios" /> : r.anuncios.map((a) => (
                      <div key={a.slug} className="row grid-cols-[1fr_auto] items-center"><Link href={"/noticias/" + a.slug} className="min-w-0"><span className="font-semibold truncate block">{a.titulo}</span><span className="small muted">{fecha(a.publicado_at)}</span></Link><button className="btn btn-sm btn-ghost" onClick={() => borrar("anuncio", a.slug, a.titulo)}>Borrar</button></div>
                    ))}</div>
                  </div>
                )}
                {tab === "eventos" && (
                  <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
                    <FormEvento refrescar={refrescar} />
                    <div className="panel">{r.eventos.length === 0 ? <Empty code="eventos · 0" title="Sin eventos" /> : r.eventos.map((e) => (
                      <div key={e.id} className="row grid-cols-[1fr_auto] items-center"><span className="min-w-0"><span className="font-semibold truncate block">{e.titulo}</span><span className="small muted">{fecha(e.empieza)} {hora(e.empieza)}</span></span><button className="btn btn-sm btn-ghost" onClick={() => borrar("evento", e.id, e.titulo)}>Borrar</button></div>
                    ))}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </AuthGate>
    </>
  );
}
