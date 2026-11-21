import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRol } from "@/pages/Vants";
import { Link, useLocation } from "wouter";
import { NAV, PERFIL_LINKS } from "@/lib/nav";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { Wordmark } from "./ui-vants";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { CommandPalette } from "./CommandPalette";
import { PWAInstallButton, OfflineIndicator } from "./PWAInstallButton";

type Notif = { id: number; tipo: string; titulo: string; cuerpo: string | null; url: string | null; creada: string; leida: boolean };

/** Campana: notificaciones reales de vants-integraciones (partidas FACEIT, directos). */
function Campana() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const q = useApi<{ sin_leer: number; notificaciones: Notif[] }>("/int/notificaciones", { auth: true, refetchMs: 60_000 });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const n = q.data?.sin_leer || 0;
  const abrir = async () => {
    const nuevo = !open;
    setOpen(nuevo);
    if (nuevo && n > 0) {
      try { await api("/int/notificaciones/leer", { method: "POST", auth: true, body: {} }); } catch { /* se reintenta al abrir otra vez */ }
      qc.invalidateQueries({ queryKey: ["/int/notificaciones", true] });
    }
  };
  const fecha = (s: string) => { const d = new Date(s.replace(" ", "T") + "Z"); return isNaN(d.getTime()) ? "" : d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
  return (
    <div className="nav-item" ref={ref}>
      <button className="btn btn-sm btn-ghost relative" onClick={abrir} aria-expanded={open} aria-label={"Notificaciones" + (n ? " (" + n + " sin leer)" : "")} data-testid="button-notificaciones">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
        {n > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "var(--rojo)", color: "#fff", borderRadius: 999, fontSize: 10, minWidth: 16, height: 16, lineHeight: "16px", textAlign: "center", padding: "0 4px" }} data-testid="badge-notificaciones">{n > 9 ? "9+" : n}</span>}
      </button>
      {open && (
        <div className="nav-menu" role="menu" style={{ right: 0, left: "auto", width: "min(320px, calc(100vw - 2 * var(--gutter)))", maxHeight: 420, overflowY: "auto" }}>
          {q.isLoading ? <div className="small muted p-3">Cargando…</div> : q.error ? <div className="small muted p-3">No se pudieron cargar las notificaciones.</div> :
            (q.data?.notificaciones || []).length === 0 ? <div className="small muted p-3">Sin notificaciones. Aquí verás tus partidas de FACEIT y quién entra en directo.</div> :
            q.data!.notificaciones.map((x) => (
              <a key={x.id} href={x.url || "#"} target={x.url ? "_blank" : undefined} rel="noopener noreferrer" role="menuitem" style={{ opacity: x.leida ? 0.7 : 1 }} data-testid={"notif-" + x.id}>
                <span style={{ fontWeight: x.leida ? 400 : 700 }}>{x.titulo}</span>
                <small>{[x.cuerpo, fecha(x.creada)].filter(Boolean).join(" · ")}</small>
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

function Dropdown({ label, base, links, path }: { label: string; base: string; links: { label: string; to: string; hint?: string; privado?: boolean }[]; path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { status } = useAuth();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => setOpen(false), [path]);
  const activo = links.some((l) => path === l.to || (l.to !== "/" && path.startsWith(l.to + "/"))) || path.startsWith(base);
  const visibles = links.filter((l) => !l.privado || status === "autenticado");
  return (
    <div className="nav-item" ref={ref} onMouseLeave={() => setOpen(false)}>
      <button
        className={"nav-btn" + (activo ? " activo" : "")}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        data-testid={"nav-" + base.slice(1)}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      {open && (
        <div className="nav-menu" role="menu">
          {visibles.map((l) => (
            <Link key={l.to} href={l.to} role="menuitem" data-testid={"navlink-" + l.to.replace(/\//g, "-")}>
              {l.label}
              {l.hint && <small>{l.hint}</small>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EnlacePublicar() {
  const rol = useRol();
  if (!rol.data?.owner) return null;
  return <Link href="/publicar" className="btn btn-sm btn-rojo hidden sm:inline-flex" data-testid="link-publicar">Publicar</Link>;
}

function AccountButton() {
  const { status, user, login, logout } = useAuth();
  if (status === "autenticado") {
    return (
      <div className="flex items-center gap-2">
        <Campana />
        <EnlacePublicar />
        <Link href="/perfil" className="btn btn-sm" data-testid="link-perfil">Mi perfil</Link>
        <button className="btn btn-sm btn-ghost" onClick={() => logout()} data-testid="button-logout" aria-label={"Cerrar sesión" + (user?.nickname ? " de " + user.nickname : "")}>Salir</button>
      </div>
    );
  }
  if (!AUTH_ENABLED || status === "no_disponible") {
    return <Link href="/entrar" className="btn btn-sm" data-testid="link-entrar">Entrar</Link>;
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-sm btn-ghost cta-xs-off" onClick={() => login()} disabled={status === "cargando"} data-testid="button-login">Entrar</button>
      <button className="btn btn-sm btn-rojo cta-xs-off" onClick={() => login({ signup: true })} disabled={status === "cargando"} data-testid="button-signup">Crear cuenta</button>
    </div>
  );
}

function MobileNav({ path, onOpenSearch }: { path: string; onOpenSearch: () => void }) {
  const [open, setOpen] = useState(false);
  const { status, login } = useAuth();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  return (
    <>
      <button className="btn btn-sm lg:hidden" aria-expanded={open} aria-controls="menu-movil" onClick={() => setOpen((o) => !o)} data-testid="button-menu">
        {open ? "Cerrar" : "Menú"}
      </button>
      {open && (
        <nav id="menu-movil" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto lg:hidden" style={{ background: "var(--negro)" }} aria-label="Menú principal">
          <div className="wrap py-6 grid gap-6">
            <button
              type="button"
              className="btn btn-sm w-full justify-between"
              onClick={() => { setOpen(false); onOpenSearch(); }}
              data-testid="button-mobile-search"
            >
              <span>Buscar secciones y juegos…</span>
              <span className="text-xs muted" style={{ fontFamily: "var(--f-mono)" }}>⌘K</span>
            </button>
            <PWAInstallButton compact />
            {AUTH_ENABLED && status === "anonimo" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => { setOpen(false); login(); }}
                  data-testid="button-mobile-login"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-rojo"
                  onClick={() => { setOpen(false); login({ signup: true }); }}
                  data-testid="button-mobile-signup"
                >
                  Crear cuenta
                </button>
              </div>
            )}
            <Link href="/" className="d-2">Inicio</Link>
            <Link href="/empresas" className="d-2">Empresas</Link>
            {NAV.map((g) => (
              <div key={g.base}>
                <div className="eyebrow mb-2">{g.label}</div>
                <div className="grid">
                  {g.links.filter((l) => !l.privado || status === "autenticado").map((l) => (
                    <Link key={l.to} href={l.to} className="py-2 border-b" style={{ borderColor: "var(--linea-suave)", color: "var(--gris-1)" }}>{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}
            {status === "autenticado" && (
              <div>
                <div className="eyebrow mb-2">Mi perfil</div>
                {PERFIL_LINKS.map((l) => <Link key={l.to} href={l.to} className="block py-2" style={{ color: "var(--gris-1)" }}>{l.label}</Link>)}
              </div>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

export function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [path] = useLocation();
  return (
    <header className="hdr">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 btn btn-sm">Saltar al contenido</a>
      <div className="wrap hdr-in">
        <Wordmark />
        <nav className="hidden lg:flex items-center ml-4" aria-label="Principal">
          <Link href="/" className={"nav-btn" + (path === "/" ? " activo" : "")} data-testid="nav-inicio">Inicio</Link>
          {NAV.map((g) => <Dropdown key={g.base} {...g} path={path} />)}
          <Link href="/empresas" className={"nav-btn" + (path === "/empresas" ? " activo" : "")} data-testid="nav-empresas">Empresas</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost flex items-center gap-2"
            onClick={onOpenSearch}
            aria-label="Abrir buscador rápido (Ctrl+K)"
            data-testid="button-open-search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="hidden md:inline">Buscar</span>
            <kbd className="hidden xl:inline text-[10px] px-1.5 py-0.5 border" style={{ borderColor: "var(--linea)", color: "var(--gris-2)", fontFamily: "var(--f-mono)" }}>⌘K</kbd>
          </button>
          <span className="hidden sm:inline-flex"><PWAInstallButton /></span>
          <AccountButton />
          <MobileNav path={path} onOpenSearch={onOpenSearch} />
        </div>
      </div>
    </header>
  );
}

const APP_APK = "https://github.com/VANTSGAMES/vantsgames-web/releases/latest/download/VANTS-1.0.0.apk";

/** Columnas del footer: reflejan la navegación principal + legal y app. */
const COLUMNAS: { titulo: string; enlaces: { label: string; to: string; externo?: boolean }[] }[] = [
  { titulo: "Competición", enlaces: [
    { label: "Torneos activos", to: "/torneos" },
    { label: "Crear mi torneo", to: "/crear-torneo" },
    { label: "Agenda en vivo", to: "/agenda" },
    { label: "Resultados", to: "/resultados" },
    { label: "Ranking global", to: "/ranking" },
  ]},
  { titulo: "Comunidad & Sala", enlaces: [
    { label: "Clips", to: "/clips" },
    { label: "Directos Twitch & Kick", to: "/directos" },
    { label: "Noticias", to: "/noticias" },
    { label: "Sala de jugadores", to: "/sala" },
    { label: "Equipos", to: "/equipos" },
  ]},
  { titulo: "Planes & Empresas", enlaces: [
    { label: "Membresías", to: "/membresias" },
    { label: "Pase de Temporada S4", to: "/pase-s4" },
    { label: "Insignias", to: "/insignias" },
    { label: "Empresas y marcas", to: "/empresas" },
  ]},
  { titulo: "Legal & App", enlaces: [
    { label: "Privacidad", to: "/privacidad" },
    { label: "Términos", to: "/terminos" },
    { label: "App Android (APK v1.0.0)", to: APP_APK, externo: true },
    { label: "Twitch", to: "https://www.twitch.tv/feisreal", externo: true },
    { label: "YouTube", to: "https://www.youtube.com/@feispla", externo: true },
  ]},
];

export function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
      <div className="wrap py-12 grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="grid gap-4 content-start">
          <Wordmark />
          <p className="d-3" style={{ letterSpacing: "0.12em" }}>Compete. Connect. <span style={{ color: "var(--rojo)" }}>Dominate.</span></p>
          <p className="muted small" style={{ maxWidth: "38ch" }}>Torneos, rankings, clips y comunidad de once juegos competitivos, desde Venezuela para Latinoamérica.</p>
          <a href="mailto:contacto@vants.cc" className="muted small hover:text-white">Contacto: contacto@vants.cc</a>
        </div>
        {COLUMNAS.map((col) => (
          <div key={col.titulo}>
            <div className="eyebrow mb-3">{col.titulo}</div>
            <ul className="grid gap-1.5 small">
              {col.enlaces.map((l) => (
                <li key={l.to}>
                  {l.externo ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="muted hover:text-white">{l.label}</a>
                  ) : (
                    <Link href={l.to} className="muted hover:text-white">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wrap py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between small muted border-t" style={{ borderColor: "var(--linea-suave)" }}>
        <span>© {new Date().getFullYear()} VANTS GAMES.</span>
        <span className="flex gap-4">
          <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
          <Link href="/terminos" className="hover:text-white">Términos</Link>
          <a href="https://www.twitch.tv/feisreal" target="_blank" rel="noopener noreferrer" className="hover:text-white">Twitch</a>
          <a href="https://www.youtube.com/@feispla" target="_blank" rel="noopener noreferrer" className="hover:text-white">YouTube</a>
        </span>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [path]);
  return (
    <div className="min-h-screen flex flex-col">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <main id="contenido" className="flex-1">{children}</main>
      <Footer />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <OfflineIndicator />
    </div>
  );
}
