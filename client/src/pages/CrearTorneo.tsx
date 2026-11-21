import { useState } from "react";
import { Link } from "wouter";
import { PageHead, Section, Empty, Skel, ErrorBox } from "@/components/ui-vants";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useMembresia } from "@/lib/useMembresia";
import { JUEGOS } from "@/lib/juegos";
import { normalizeJuegoSlug, parseQueryParam } from "@/lib/urlFilters";
import { PLANES } from "./Membresias";
import { useApi } from "@/lib/useApi";

type MiTorneo = {
  slug: string;
  nombre: string;
  juego: string;
  estado: string;
  creado: string;
};

const REGIONES = ["LATAM", "NA", "EU", "Global"];
const FORMATOS = ["Single Elimination", "Double Elimination", "Round Robin", "Liga"];
const PLAZAS = [4, 8, 16, 32, 64];

/** Boleto de "beneficio bloqueado": candado animado + beneficios + CTA a planes. */
function GatePlan() {
  return (
    <div className="wrap py-14">
      <div className="panel panel-pad chamfer brillo-borde grid gap-5 max-w-2xl mx-auto text-center justify-items-center" data-testid="gate-plan">
        <div className="candado" style={{ fontSize: "3rem", lineHeight: 1 }} aria-hidden="true">🔒</div>
        <div className="eyebrow">Beneficio de planes VANTS</div>
        <h2 className="d-2">Crea tu propio torneo con un plan activo</h2>
        <p className="muted" style={{ maxWidth: "56ch" }}>
          La creación de torneos de comunidad es un beneficio exclusivo: publica tu competencia con bracket,
          inscripciones y supervisión del equipo VANTS. Activa un plan para desbloquearla.
        </p>
        <ul className="grid gap-2 text-left small muted" style={{ minWidth: "min(100%, 38ch)" }}>
          <li>▸ Crea torneos de comunidad en cualquier juego del circuito</li>
          <li>▸ Inscripciones sin fee en torneos abiertos</li>
          <li>▸ Cola prioritaria en VANTS Ranked</li>
          <li>▸ Sello e insignia exclusivos en tu ficha</li>
        </ul>
        <div className="flex flex-wrap gap-2 justify-center">
          <Link href="/membresias" className="btn btn-rojo" data-testid="gate-planes">Ver planes VANTS</Link>
          <Link href="/membresias" className="btn">Comparar beneficios</Link>
        </div>
        {PLANES.filter((p) => p.checkout).slice(0, 3).map((p) => (
          <span key={p.id} className="tag">{p.nombre} · {p.precio}</span>
        ))}
      </div>
    </div>
  );
}

function FormularioTorneo() {
  const juegoInicial = normalizeJuegoSlug(parseQueryParam("juego")) || "valorant";
  const [f, setF] = useState({ nombre: "", juego: juegoInicial, formato: FORMATOS[0], region: REGIONES[0], plazas: 8, premio: "", inicio: "", reglas: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{ slug: string; nombre: string } | null>(null);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.nombre.trim().length < 3) { setError("El nombre del torneo debe tener al menos 3 caracteres."); return; }
    if (!f.inicio) { setError("Indica la fecha y hora de inicio."); return; }
    setEnviando(true);
    try {
      await api("/int/torneos/crear", {
        method: "POST",
        auth: true,
        body: {
          nombre: f.nombre.trim(),
          juego: f.juego,
          formato: f.formato,
          region: f.region,
          plazas: Number(f.plazas),
          premio: f.premio.trim() || null,
          inicio: new Date(f.inicio).toISOString(),
          reglas: f.reglas.trim() || null,
        },
      });
      setOk({ slug: "", nombre: f.nombre.trim() });
    } catch (err: any) {
      const c = err?.code || "";
      setError(
        c === "sin_plan" ? "Necesitas un plan VANTS activo para crear torneos."
        : c === "datos_invalidos" ? "Revisa los campos: algunos datos no son válidos."
        : c === "sin_sesion" ? "Tu sesión expiró. Inicia sesión de nuevo."
        : "No se pudo enviar el torneo. Inténtalo de nuevo en unos minutos."
      );
    } finally {
      setEnviando(false);
    }
  };

  if (ok) {
    return (
      <div className="wrap pb-14">
        <div className="panel panel-pad chamfer grid gap-4 max-w-2xl mx-auto text-center justify-items-center" data-testid="crear-ok">
          <div className="check-circulo d-1" style={{ color: "var(--ok)" }} aria-hidden="true">✓</div>
          <h2 className="d-2">Torneo enviado a revisión</h2>
          <p className="muted" style={{ maxWidth: "52ch" }}>
            «{ok.nombre}» quedó registrado como pendiente. El equipo VANTS lo revisará y recibirás una
            notificación y un correo cuando sea aprobado y publicado en el circuito.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/torneos" className="btn btn-rojo">Ver torneos</Link>
            <button className="btn" onClick={() => { setOk(null); setF({ nombre: "", juego: "valorant", formato: FORMATOS[0], region: REGIONES[0], plazas: 8, premio: "", inicio: "", reglas: "" }); }}>Crear otro torneo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="wrap pb-14 grid gap-6 max-w-3xl" data-testid="form-crear-torneo" noValidate>
      <div className="panel panel-pad grid gap-5">
        <div className="field">
          <label htmlFor="ct-nombre">Nombre del torneo *</label>
          <input id="ct-nombre" className="input" maxLength={80} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej.: Copa VANTS Caracas · CS2" required />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="ct-juego">Juego *</label>
            <select id="ct-juego" className="input" value={f.juego} onChange={(e) => set("juego", e.target.value)}>
              {JUEGOS.map((j) => <option key={j.slug} value={j.slug}>{j.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-formato">Formato *</label>
            <select id="ct-formato" className="input" value={f.formato} onChange={(e) => set("formato", e.target.value)}>
              {FORMATOS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-region">Región *</label>
            <select id="ct-region" className="input" value={f.region} onChange={(e) => set("region", e.target.value)}>
              {REGIONES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-plazas">Plazas *</label>
            <select id="ct-plazas" className="input" value={f.plazas} onChange={(e) => set("plazas", Number(e.target.value))}>
              {PLAZAS.map((x) => <option key={x} value={x}>{x} equipos</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-premio">Premio (opcional)</label>
            <input id="ct-premio" className="input" maxLength={60} value={f.premio} onChange={(e) => set("premio", e.target.value)} placeholder="Ej.: 100 USD o skins" />
          </div>
          <div className="field">
            <label htmlFor="ct-inicio">Inicio *</label>
            <input id="ct-inicio" type="datetime-local" className="input" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ct-reglas">Reglas (opcional)</label>
          <textarea id="ct-reglas" className="input" maxLength={2000} value={f.reglas} onChange={(e) => set("reglas", e.target.value)} placeholder="Formato de mapas, horarios de veto, conducta esperada…" />
        </div>
        {error && <p className="small" style={{ color: "#ff5468" }} role="alert">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-rojo" disabled={enviando} data-testid="btn-enviar-torneo">{enviando ? "Enviando…" : "Enviar a revisión"}</button>
          <span className="small muted">El equipo VANTS revisa cada torneo antes de publicarlo. Recibirás un correo con el resultado.</span>
        </div>
      </div>
    </form>
  );
}

function MisTorneosComunidad() {
  const q = useApi<{ torneos: MiTorneo[] }>("/int/mis-torneos", { auth: true });
  if (q.isLoading) return <Skel n={2} h={48} />;
  if (q.error) return <ErrorBox error={q.error} what="tus torneos de comunidad" />;
  const ts = q.data?.torneos || [];
  if (ts.length === 0) return <Empty code="mis torneos · 0" title="Todavía no has creado torneos" text="Cuando envías un torneo a revisión aparece aquí con su estado." />;
  return (
    <div className="panel">
      {ts.map((t) => (
        <div key={t.slug} className="row grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-3">
          <span className="font-semibold truncate">{t.nombre}</span>
          <span className="small muted">{new Date(t.creado).toLocaleDateString("es-VE")}</span>
          <span className={"tag " + (t.estado === "upcoming" || t.estado === "ongoing" ? "tag-ok" : t.estado === "pendiente" ? "tag-aviso" : "")}>{t.estado}</span>
        </div>
      ))}
    </div>
  );
}

export default function CrearTorneo() {
  const { status } = useAuth();
  const mem = useMembresia();

  if (status !== "autenticado") {
    return (
      <>
        <PageHead eyebrow="Torneos de comunidad" title={<>Crea tu <span style={{ color: "var(--rojo)" }}>torneo</span></>} lead="Organiza tu propia competencia dentro del circuito VANTS: elige juego, formato y fechas. Requiere cuenta y un plan activo." />
        <GateSesion />
      </>
    );
  }
  if (mem.cargando) {
    return (
      <>
        <PageHead eyebrow="Torneos de comunidad" title={<>Crea tu <span style={{ color: "var(--rojo)" }}>torneo</span></>} />
        <div className="wrap pb-14"><Skel h={320} n={1} /></div>
      </>
    );
  }
  if (mem.sinPlan) {
    return (
      <>
        <PageHead eyebrow="Torneos de comunidad" title={<>Crea tu <span style={{ color: "var(--rojo)" }}>torneo</span></>} />
        <GatePlan />
      </>
    );
  }
  return (
    <>
      <PageHead eyebrow="Torneos de comunidad" title={<>Crea tu <span style={{ color: "var(--rojo)" }}>torneo</span></>} lead="Tu torneo pasa por revisión del equipo VANTS antes de publicarse. Recibirás una notificación y un correo con el resultado." />
      <FormularioTorneo />
      <Section id="mis-torneos" eyebrow="Seguimiento" title="Mis torneos de comunidad">
        <MisTorneosComunidad />
      </Section>
    </>
  );
}

/** Puerta de sesión mínima (AuthGate con texto de esta página). */
function GateSesion() {
  const { status, login } = useAuth();
  return (
    <div className="wrap pb-14">
      <div className="panel panel-pad chamfer grid gap-4 max-w-2xl" data-testid="gate-sesion">
        <div className="eyebrow">Acceso con cuenta</div>
        <h2 className="d-2">Inicia sesión para crear torneos</h2>
        <p className="muted">Necesitas una cuenta VANTS y un plan activo para organizar torneos de comunidad.</p>
        {status === "anonimo" && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-rojo" onClick={() => login({ returnTo: "/torneos/crear" })}>Iniciar sesión</button>
            <button className="btn" onClick={() => login({ signup: true, returnTo: "/torneos/crear" })}>Crear cuenta</button>
          </div>
        )}
      </div>
    </div>
  );
}
