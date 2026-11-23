import type { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { gameLabel } from "@/lib/format";
import { pub } from "@/lib/api";

export function Mark({ size = 28 }: { size?: number }) {
  return <img src={pub("brand/vants-mark.svg")} width={size} height={size} alt="" aria-hidden="true" />;
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="VANTS GAMES — inicio" data-testid="link-home">
      <Mark />
      <span className="d-3" style={{ letterSpacing: "0.14em", fontSize: "1.2rem" }}>
        VANTS<span style={{ color: "var(--gris-2)", fontWeight: 600 }}> GAMES</span>
      </span>
    </Link>
  );
}

export function PageHead({ eyebrow, title, lead, actions }: { eyebrow: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="wrap pt-12 pb-8 md:pt-16 md:pb-10 reveal">
      <div className="eyebrow mb-4">{eyebrow}</div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="d-1">{title}</h1>
          {lead && <p className="lead mt-4">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ id, eyebrow, title, more, children, className = "", nivel = 2 }: { id?: string; eyebrow?: string; title: ReactNode; more?: { to: string; label: string }; children: ReactNode; className?: string; nivel?: 1 | 2 }) {
  const Titulo = nivel === 1 ? "h1" : "h2";
  return (
    <section id={id} className={"wrap py-10 md:py-14 " + className} aria-labelledby={id ? id + "-t" : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <Titulo id={id ? id + "-t" : undefined} className="d-2">{title}</Titulo>
        </div>
        {more && <Link href={more.to} className="link-arrow shrink-0" data-testid={"link-more-" + (id || "x")}>{more.label} <span aria-hidden>→</span></Link>}
      </div>
      {children}
    </section>
  );
}

/** Estado vacío: explica qué falta y de dónde vendrá el dato. Nunca rellena con datos inventados. */
export function Empty({ code, title, text, action }: { code: string; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" role="status" data-testid={"empty-" + code}>
      <span className="empty-code">{code}</span>
      <p className="d-3">{title}</p>
      {text && <p className="muted small" style={{ maxWidth: "58ch" }}>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, what, onRetry }: { error: any; what: string; onRetry?: () => void }) {
  const code = (error && error.code) || "error";
  return (
    <div className="empty" role="alert" style={{ borderColor: "rgba(255,13,46,.35)" }} data-testid="state-error">
      <span className="empty-code" style={{ color: "#ff5468" }}>{code}</span>
      <p className="d-3">No se pudo cargar {what}</p>
      <p className="muted small">El servicio respondió con un error temporal. Puedes volver a intentarlo ahora mismo.</p>
      <button
        type="button"
        className="btn btn-sm mt-2"
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
        data-testid="button-retry-error"
      >
        Reintentar
      </button>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="wrap py-16 grid gap-4" aria-busy="true" aria-label="Cargando sección">
      <div className="sk" style={{ height: 28, width: "28%" }} />
      <div className="sk" style={{ height: 52, width: "62%" }} />
      <div className="sk mt-4" style={{ height: 180 }} />
    </div>
  );
}

export function Skel({ h = 64, n = 3 }: { h?: number; n?: number }) {
  return (
    <div className="grid gap-px" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: n }).map((_, i) => <div key={i} className="sk" style={{ height: h }} />)}
    </div>
  );
}

export function GameTag({ g }: { g?: any }) {
  const l = gameLabel(g);
  if (!l) return null;
  return <span className="tag">{l}</span>;
}

/** Puerta de autenticación: lo privado solo se muestra con sesión validada por el servidor. */
export function AuthGate({ children, what }: { children: ReactNode; what: string }) {
  const { status, login } = useAuth();
  if (status === "autenticado") return <>{children}</>;
  if (status === "cargando") return <div className="wrap py-10"><Skel n={2} /></div>;
  return (
    <div className="wrap py-10">
      <div className="panel panel-pad chamfer grid gap-4 max-w-2xl" data-testid="auth-gate">
        <div className="eyebrow">Acceso con cuenta</div>
        <h2 className="d-2">Inicia sesión para ver {what}</h2>
        {status === "no_disponible" ? (
          <p className="muted">
            El inicio de sesión funciona en el dominio oficial de VANTS. En esta vista previa no hay sesión,
            así que no se muestra ningún dato privado.
          </p>
        ) : status === "error" ? (
          <p className="muted">El servicio de identidad no respondió. Vuelve a intentarlo en unos minutos.</p>
        ) : (
          <p className="muted">Tus datos se guardan en VANTS y se validan en el servidor en cada petición.</p>
        )}
        {AUTH_ENABLED && status === "anonimo" && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-rojo" onClick={() => login()} data-testid="button-login-gate">Iniciar sesión</button>
            <button className="btn" onClick={() => login({ signup: true })} data-testid="button-signup-gate">Crear cuenta</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const t = (name || "?").replace(/[^A-Za-z0-9ÁÉÍÓÚÑ ]/gi, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center shrink-0 chamfer"
      style={{ width: size, height: size, background: "var(--grafito-3)", fontFamily: "var(--f-display)", fontWeight: 800, fontSize: size * 0.4, color: "var(--gris-1)" }}
    >
      {t}
    </span>
  );
}
