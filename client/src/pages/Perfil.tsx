import { useEffect, useState, type FormEvent } from "react";
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
  { id: "twitch", nombre: "Twitch", logo: null, linker: "twitch" },
  { id: "riot", nombre: "Riot Games", logo: null, linker: "riot" },
  { id: "steam", nombre: "Steam", logo: null, linker: "steam" },
] as const;

const ESTADO_UI: Record<Estado, { l: string; c: string }> = {
  conectada: { l: "Conectada", c: "tag tag-ok" },
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

function Resumen() {
  const { user } = useAuth();
  const q = useApi<{ nickname: string | null; redes: Record<string, any> }>("/api/account/perfil", { auth: true });
  // El nombre público es el nickname guardado en el servidor. Nunca se sustituye por el correo.
  const nombre = q.data?.nickname || null;
  return (
    <div className="wrap grid gap-6">
      <div className="panel panel-pad flex flex-wrap items-center gap-6">
        {user?.picture ? <img src={user.picture} alt="" width={88} height={88} className="chamfer" /> : <Initials name={nombre || "?"} size={88} />}
        <div className="min-w-0">
          <div className="eyebrow mb-1">Nombre público</div>
          {q.isLoading ? <div className="sk" style={{ height: 36, width: 220 }} /> : q.error ? (
            <p className="muted small">No se pudo leer tu perfil del servidor ({q.error.code}).</p>
          ) : nombre ? <h2 className="d-1">{nombre}</h2> : (
            <div><p className="d-3">Sin nombre público</p><Link href="/perfil/ajustes" className="link-arrow mt-1">Elegir nombre →</Link></div>
          )}
        </div>
      </div>
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
    </div>
  );
}

type Vinculo = { plataforma: string; usuario: string; avatar: string | null; verificada: boolean; desde: string | null };
const ERR_LINK: Record<string, string> = {
  state_invalido: "La autorización caducó o no es válida. Inténtalo de nuevo.",
  sin_code: "El proveedor no devolvió la autorización.",
};

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
    if (ok) setAviso({ ok: true, m: "Cuenta de " + (PROVEEDORES.find((p) => p.id === ok)?.nombre || ok) + " vinculada y verificada." });
    else if (ko) setAviso({ ok: false, m: ERR_LINK[ko] || "La vinculación no se completó (" + ko + ")." });
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
      else if (d.linkerr) setAviso({ ok: false, m: ERR_LINK[d.linkerr] || "La vinculación no se completó (" + d.linkerr + ")." });
      qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [qc]);
  const conectar = async (plataforma: string) => {
    setBusy(plataforma);
    // La ventana se abre en el propio clic (gesto del usuario): si no, el navegador la bloquea.
    const v = window.open("about:blank", "vants-oauth", "width=520,height=740");
    try {
      const r = await api<{ url: string }>("/fn/linker/api/link/start", { method: "POST", auth: true, body: { platform: plataforma, return_to: window.location.origin + "/perfil/cuentas" } });
      if (!r.url) {
        try { v?.close(); } catch {}
        setErr((x) => ({ ...x, [plataforma]: "sin_url" }));
        return;
      }
      if (v && !v.closed) {
        // FACEIT usa redirect_popup=true: su página espera una ventana que pueda cerrarse sola.
        v.location.href = r.url;
        const t = setInterval(() => {
          if (v.closed) { clearInterval(t); qc.invalidateQueries({ queryKey: ["/api/account/perfil", true] }); }
        }, 800);
      } else {
        // Reserva si el navegador bloqueó la ventana: misma pestaña, sin modo popup.
        window.location.href = r.url.replace("redirect_popup=true&", "").replace("?redirect_popup=true", "?");
      }
    } catch (e: any) {
      setErr((x) => ({ ...x, [plataforma]: e.code }));
      try { v?.close(); } catch {}
    } finally { setBusy(null); }
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
                {v?.avatar ? <img src={v.avatar} alt="" width={32} height={32} /> : p.logo ? <img src={pub(p.logo)} alt="" width={32} height={32} /> : <Initials name={p.nombre} size={32} />}
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
      </div>
    </div>
  );
}

function Membresia() {
  return (
    <div className="wrap">
      <Empty code="membresía · sin plan activo verificado" title="No hay un plan activo en tu cuenta" text="Cuando Stripe confirme un pago, el servidor activará el plan y su insignia aparecerá en tus logros." action={<Link href="/membresias" className="link-arrow">Ver planes →</Link>} />
    </div>
  );
}

const SUB: Record<string, { t: string; el: () => JSX.Element }> = {
  "": { t: "Mi perfil", el: Resumen },
  ajustes: { t: "Configuración", el: Ajustes },
  cuentas: { t: "Cuentas vinculadas", el: Cuentas },
  membresia: { t: "Membresía", el: Membresia },
  estadisticas: { t: "Estadísticas", el: () => <div className="wrap"><Empty code="estadísticas · 0" title="Sin estadísticas todavía" text="Se calculan a partir de partidas registradas en torneos de VANTS y de tu cuenta de FACEIT vinculada." /></div> },
  equipos: { t: "Mis equipos", el: () => <div className="wrap"><Empty code="equipos · 0" title="No perteneces a ningún equipo" text="Inscribe un equipo en un torneo o pide al capitán que te añada a su plantilla." action={<Link href="/torneos/competir" className="link-arrow">Competir →</Link>} /></div> },
  torneos: { t: "Mis torneos", el: () => <div className="wrap"><Empty code="torneos · 0" title="No tienes inscripciones" text="Tus inscripciones y su estado (pendiente, confirmada o rechazada) aparecerán aquí." action={<Link href="/torneos/competir" className="link-arrow">Buscar torneos →</Link>} /></div> },
};

export default function Perfil() {
  const params = useParams<{ sub?: string }>();
  const sub = SUB[params.sub || ""] ? params.sub || "" : "";
  const S = SUB[sub];
  // Vuelta del OAuth dentro del popup: avisar a la ventana padre y cerrarse sola.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ok = sp.get("linked"), ko = sp.get("linkerr");
    if (!window.opener || (!ok && !ko)) return;
    try { window.opener.postMessage({ tipo: "oauth-vuelta", linked: ok, linkerr: ko }, window.location.origin); } catch {}
    window.close();
  }, []);
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
              <p className="muted">{modo === "entrar" ? "Accede con tu cuenta de VANTS." : "Crea tu cuenta para inscribirte en torneos, ganar insignias y guardar tu perfil."}</p>
              <button className="btn btn-rojo" disabled={status === "cargando"} onClick={() => login({ signup: modo === "registro", returnTo: "/perfil" })} data-testid={"button-" + modo}>{titulos[modo]}</button>
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

