/**
 * Muro de acceso de miembros. La vitrina pública (Home, planes, legal y
 * perfiles compartibles) es abierta; TODO el interior de VANTS exige cuenta.
 * Muestra una vista congelada y difuminada de la sección, los beneficios del
 * club y dos caminos: crear cuenta gratis o iniciar sesión.
 */
import type { CSSProperties, ReactNode } from "react";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PageLoader } from "./ui-vants";
import { JUEGOS } from "@/lib/juegos";

const BENEFICIOS: { t: string; d: string }[] = [
  { t: "Torneos con bracket", d: "Inscripciones, llaves en vivo y resultados oficiales en los " + (JUEGOS.length || 11) + " juegos del circuito." },
  { t: "Ranking verificado", d: "ELO de FACEIT y Riot calculado en servidor. Sin datos inventados ni cuentas falsas." },
  { t: "Clips y comunidad", d: "Publica clips, foro por juego, misiones semanales, votaciones y buscador LFG." },
  { t: "Insignias y ventajas", d: "Logros, mini-insignias en tu ficha y membresías con beneficios competitivos." },
];

function Candado() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="candado">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="var(--rojo)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4.5" y="10" width="15" height="10.5" rx="1.5" fill="var(--rojo-tenue)" stroke="var(--rojo)" strokeWidth="1.6" />
      <circle cx="12" cy="15.2" r="1.6" fill="var(--rojo)" />
      <path d="M12 16.4v1.8" stroke="var(--rojo)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Vitrina congelada: esqueleto de la sección difuminado bajo el candado. */
function Vitrina() {
  return (
    <div className="panel chamfer muro-vitrina" aria-hidden="true" data-testid="muro-vitrina">
      <div className="muro-preview">
        <div className="sk" style={{ height: 14, width: "38%" }} />
        <div className="sk" style={{ height: 44, width: "72%" }} />
        <div className="sk" style={{ height: 14, width: "52%" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          <div className="sk" style={{ height: 92 }} />
          <div className="sk" style={{ height: 92 }} />
          <div className="sk" style={{ height: 92 }} />
        </div>
        <div className="sk" style={{ height: 54, marginTop: 10 }} />
        <div className="sk" style={{ height: 54 }} />
      </div>
      <div className="muro-velo" />
      <div className="muro-lock"><Candado /></div>
    </div>
  );
}

export function MuroAcceso({ seccion }: { seccion: string }) {
  const { status, login } = useAuth();
  const sinSesion = !AUTH_ENABLED || status !== "autenticado";
  return (
    <div className="wrap py-12 md:py-20" data-testid="muro-acceso">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="reveal">
          <div className="eyebrow mb-4">// ACCESO MIEMBROS · VANTS GAMES</div>
          <h1 className="d-1">
            {seccion} es <span style={{ color: "var(--rojo)" }}>del club</span>
          </h1>
          <p className="lead mt-4" style={{ maxWidth: "52ch" }}>
            El interior de VANTS es exclusivo para miembros: torneos, rankings, sala de jugadores,
            clips, comunidad y tienda. Crea tu cuenta gratis y entra en menos de un minuto.
          </p>
          {sinSesion ? (
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                type="button"
                className="btn btn-rojo"
                style={{ height: 52, padding: "0 1.6rem" }}
                onClick={() => login({ signup: true })}
                data-testid="muro-signup"
              >
                Crear cuenta gratis <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 52 }}
                onClick={() => login()}
                data-testid="muro-login"
              >
                Ya tengo cuenta
              </button>
            </div>
          ) : null}
          <p className="muted small mt-4" style={{ fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
            Gratis · Sin tarjeta · {(JUEGOS.length || 11)} juegos · Ranking FACEIT + Riot
          </p>
        </div>
        <Vitrina />
      </div>

      <div className="grid gap-4 md:grid-cols-4 mt-12 md:mt-16">
        {BENEFICIOS.map((b, i) => (
          <div key={b.t} className="panel panel-pad chamfer grid gap-2 content-start reveal" style={{ "--d": `${i * 70}ms` } as CSSProperties}>
            <span className="muro-num">0{i + 1}</span>
            <span className="d-3" style={{ fontFamily: "var(--f-display)", letterSpacing: "0.04em" }}>{b.t}</span>
            <p className="muted small">{b.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Envoltorio de ruta privada: mientras carga la sesión muestra un loader
 * (nunca el muro), con sesión muestra la sección y sin sesión el muro.
 * En entornos sin auth habilitado (vistas previas) deja pasar tal cual.
 */
export function Privado({ seccion, children }: { seccion: string; children: ReactNode }) {
  const { status } = useAuth();
  if (!AUTH_ENABLED || status === "no_disponible" || status === "error") return <>{children}</>;
  if (status === "cargando") return <PageLoader />;
  if (status === "autenticado") return <>{children}</>;
  return <MuroAcceso seccion={seccion} />;
}
