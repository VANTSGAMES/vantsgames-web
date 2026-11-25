import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRol } from "@/pages/Vants";
import { Link, useLocation } from "wouter";
import { NAV } from "@/lib/nav";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { Wordmark, Initials } from "./ui-vants";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api, esAppNativa } from "@/lib/api";
import { CommandPalette } from "./CommandPalette";
import { PWAInstallButton, OfflineIndicator } from "./PWAInstallButton";
import { InsigniaBienvenidaPlayGames, LanzadorRapidoTorneo, TarjetaExperienciaPlayGames } from "./DispositivosJuegos";

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
              <a
                key={x.id}
                href={x.url || "#"}
                target={x.url && !esAppNativa() ? "_blank" : undefined}
                rel="noopener noreferrer"
                role="menuitem"
                style={{ opacity: x.leida ? 0.7 : 1 }}
                data-testid={"notif-" + x.id}
              >
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
    const nombreCorto = user?.nickname || user?.name || "Perfil";
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Campana />
        <EnlacePublicar />
        <Link href="/perfil" className="btn btn-sm flex items-center gap-2" data-testid="link-perfil">
          {user?.picture ? (
            <img src={user.picture} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Initials name={nombreCorto} size={20} />
          )}
          <span className="hidden sm:inline truncate" style={{ maxWidth: 110 }}>Mi perfil</span>
          <span className="sm:hidden">Perfil</span>
        </Link>
        <button className="btn btn-sm btn-ghost hidden md:inline-flex" onClick={() => logout()} data-testid="button-logout" aria-label={"Cerrar sesión" + (user?.nickname ? " de " + user.nickname : "")}>Salir</button>
      </div>
    );
  }
  if (!AUTH_ENABLED || status === "no_disponible") {
    return <Link href="/entrar" className="btn btn-sm" data-testid="link-entrar">Entrar</Link>;
  }
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button className="btn btn-sm btn-rojo sm:btn-ghost" onClick={() => login()} disabled={status === "cargando"} data-testid="button-login">Entrar</button>
      <button className="btn btn-sm btn-rojo cta-xs-off" onClick={() => login({ signup: true })} disabled={status === "cargando"} data-testid="button-signup">Crear cuenta</button>
    </div>
  );
}

function MobileNav({ path, onOpenSearch, onOpenLauncher }: { path: string; onOpenSearch: () => void; onOpenLauncher: () => void }) {
  const [open, setOpen] = useState(false);
  const { status, user, login, logout } = useAuth();
  const nativo = esAppNativa();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  return (
    <>
      <button className="btn btn-sm xl:hidden" aria-expanded={open} aria-controls="menu-movil" onClick={() => setOpen((o) => !o)} data-testid="button-menu">
        {open ? "✕" : "Menú"}
      </button>
      {open && (
        <nav
          id="menu-movil"
          className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto xl:hidden"
          style={{ top: "calc(64px + var(--safe-top))", paddingBottom: "calc(88px + var(--safe-bottom))", background: "var(--negro)" }}
          aria-label="Menú principal"
        >
          <div className="wrap py-5 grid gap-5">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                className="btn btn-sm w-full justify-between"
                onClick={() => { setOpen(false); onOpenSearch(); }}
                data-testid="button-mobile-search"
              >
                <span>Buscar torneos y juegos…</span>
                <span className="text-xs muted" style={{ fontFamily: "var(--f-mono)" }}>🔍</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-rojo w-full justify-center"
                onClick={() => { setOpen(false); onOpenLauncher(); }}
                data-testid="button-mobile-launcher"
              >
                🎮 Abrir juego para Torneo
              </button>
            </div>

            {!nativo && <PWAInstallButton compact />}

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

            {status === "autenticado" && (
              <div className="panel chamfer p-4 grid gap-3" style={{ borderColor: "var(--linea)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {user?.picture ? (
                      <img src={user.picture} alt="" width={38} height={38} className="w-9 h-9 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <Initials name={user?.nickname || user?.name || "V"} size={36} />
                    )}
                    <div className="min-w-0">
                      <div className="eyebrow" style={{ fontSize: "0.66rem" }}>VANTS ID</div>
                      <div className="font-bold text-sm text-white truncate">{user?.nickname || user?.name || "Mi cuenta"}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => { setOpen(false); logout(); }}
                  >
                    Salir
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/perfil" className="btn btn-sm btn-rojo justify-center">
                    Abrir Mi Perfil
                  </Link>
                  <Link href="/perfil/cuentas" className="btn btn-sm justify-center">
                    Play Juegos y Cuentas
                  </Link>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              {NAV.map((g) => (
                <div key={g.base} className="panel chamfer overflow-hidden" style={{ borderColor: "var(--linea-suave)" }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--linea-suave)", background: "rgba(255,255,255,0.02)" }}>
                    <div className="eyebrow" style={{ fontSize: "0.7rem" }}>{g.label}</div>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--linea-suave)" }}>
                    {g.links.filter((l) => !l.privado || status === "autenticado").map((l) => (
                      <Link
                        key={l.to}
                        href={l.to}
                        className="px-4 py-3 flex items-center justify-between gap-2 text-sm hover:bg-[var(--grafito-2)]"
                        style={{ color: "var(--blanco)" }}
                      >
                        <span>{l.label}</span>
                        <span className="muted" aria-hidden="true">›</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-2 border-t text-sm" style={{ borderColor: "var(--linea-suave)" }}>
              <Link href="/" className="link-arrow">Inicio</Link>
              <Link href="/workspace" className="link-arrow">Workspace Pro</Link>
              <Link href="/empresas" className="link-arrow">Empresas</Link>
              <Link href="/perfil/soporte" className="link-arrow">Soporte</Link>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}

/** Cajón modal in-app para abrir cualquier juego instalado en un toque y ver el XP de Google Play Juegos */
function CajonLanzadorTorneo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label="Lanzador rápido de juegos y experiencia Google Play Juegos"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      data-testid="modal-lanzador-juegos"
    >
      <div className="panel panel-pad chamfer grid gap-5 w-full" style={{ maxWidth: 820, maxHeight: "86vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Centro Competitivo Móvil & Tablet</div>
            <h2 className="d-2 mt-1">Abrir juego para el torneo</h2>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCerrar} aria-label="Cerrar lanzador">
            ✕ Cerrar
          </button>
        </div>
        <TarjetaExperienciaPlayGames />
        <LanzadorRapidoTorneo onLaunched={onCerrar} />
      </div>
    </div>
  );
}

/** Barra inferior nativa para Android, iOS y Tablets (< 1280px) con acceso en 1 toque a Perfil, Torneos y Lanzador */
function BarraInferiorMovil({ path, onOpenLauncher }: { path: string; onOpenLauncher: () => void }) {
  const { status, user } = useAuth();
  const perfilHref = status === "autenticado" ? "/perfil" : "/entrar";
  const enPerfil = path === "/perfil" || path.startsWith("/perfil/") || path === "/entrar" || path === "/registro";
  const enTorneos = path === "/torneos" || path.startsWith("/torneos/") || path === "/crear-torneo";
  const enRanking = path === "/ranking" || path === "/ranked" || path === "/sala";

  return (
    <nav className="vants-bottom-nav xl:hidden" aria-label="Navegación rápida móvil y tablet" data-testid="bottom-nav-movil">
      <div className="vants-bottom-nav-grid">
        <Link href="/" className={"vants-bnav-item" + (path === "/" ? " activo" : "")} data-testid="bnav-inicio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z" />
          </svg>
          <span>Inicio</span>
        </Link>

        <Link href="/torneos" className={"vants-bnav-item" + (enTorneos ? " activo" : "")} data-testid="bnav-torneos">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 4h12v5a6 6 0 0 1-12 0V4zM12 15v5M8 20h8" />
          </svg>
          <span>Torneos</span>
        </Link>

        <button type="button" className="vants-bnav-play" onClick={onOpenLauncher} data-testid="bnav-jugar">
          <span className="vants-bnav-play-pill" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="2" y="6" width="20" height="12" rx="4" />
              <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" strokeLinecap="round" />
            </svg>
          </span>
          <span>Jugar</span>
        </button>

        <Link href="/ranking" className={"vants-bnav-item" + (enRanking ? " activo" : "")} data-testid="bnav-ranking">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" />
          </svg>
          <span>Ranking</span>
        </Link>

        <Link href={perfilHref} className={"vants-bnav-item" + (enPerfil ? " activo" : "")} data-testid="bnav-perfil">
          {status === "autenticado" && user?.picture ? (
            <img src={user.picture} alt="" width={21} height={21} className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.8-3.6 5-5.5 8-5.5s6.2 1.9 8 5.5" strokeLinecap="round" />
            </svg>
          )}
          <span>{status === "autenticado" ? "Mi perfil" : "Perfil"}</span>
        </Link>
      </div>
    </nav>
  );
}

export function Header({ onOpenSearch, onOpenLauncher }: { onOpenSearch: () => void; onOpenLauncher: () => void }) {
  const [path, setLocation] = useLocation();
  const nativo = esAppNativa();
  const esRaizPrincipal = path === "/" || path === "/torneos" || path === "/ranking" || path === "/perfil";

  const volverAtras = () => {
    if (path.startsWith("/perfil/")) {
      setLocation("/perfil");
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/");
  };

  return (
    <header className="hdr">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 btn btn-sm">Saltar al contenido</a>
      <div className="wrap hdr-in">
        <div className="flex items-center gap-2 min-w-0">
          {!esRaizPrincipal && (
            <button
              type="button"
              onClick={volverAtras}
              className="btn btn-sm btn-ghost xl:hidden px-2"
              aria-label="Volver atrás"
              data-testid="btn-header-back"
            >
              ←
            </button>
          )}
          <Wordmark />
        </div>
        <nav className="hidden xl:flex items-center ml-4" aria-label="Principal">
          <Link href="/" className={"nav-btn" + (path === "/" ? " activo" : "")} data-testid="nav-inicio">Inicio</Link>
          {NAV.map((g) => <Dropdown key={g.base} {...g} path={path} />)}
          <Link href="/empresas" className={"nav-btn" + (path === "/empresas" ? " activo" : "")} data-testid="nav-empresas">Empresas</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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
            <span className="sr-only">Buscar</span>
          </button>
          {!nativo && <span className="hidden sm:inline-flex"><PWAInstallButton /></span>}
          <AccountButton />
          <MobileNav path={path} onOpenSearch={onOpenSearch} onOpenLauncher={onOpenLauncher} />
        </div>
      </div>
    </header>
  );
}

const APP_APK = "https://vants.cc/VANTSMovil.apk";

/** Columnas del footer: reflejan la navegación principal + legal y app. */
const COLUMNAS: { titulo: string; enlaces: { label: string; to: string; externo?: boolean; ocultarEnApp?: boolean }[] }[] = [
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
    { label: "Mi perfil del jugador", to: "/perfil" },
    { label: "Privacidad", to: "/privacidad" },
    { label: "Términos", to: "/terminos" },
    { label: "Soporte (abrir ticket)", to: "/perfil/soporte" },
    { label: "App Android (APK)", to: APP_APK, externo: true, ocultarEnApp: true },
  ]},
];

export function Footer() {
  const nativo = esAppNativa();
  if (nativo) {
    return (
      <footer className="mt-8 border-t" style={{ borderColor: "var(--linea-suave)", background: "var(--negro)" }}>
        <div className="wrap py-4 flex flex-wrap gap-x-4 gap-y-1.5 items-center justify-between text-xs muted">
          <span>VANTS Movil · Circuito Oficial</span>
          <span className="flex items-center gap-4">
            <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
            <Link href="/terminos" className="hover:text-white">Términos</Link>
            <Link href="/perfil/soporte" className="hover:text-white">Soporte</Link>
          </span>
        </div>
      </footer>
    );
  }
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
              {col.enlaces.filter((l) => !(nativo && l.ocultarEnApp)).map((l) => (
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
          <Link href="/perfil" className="hover:text-white">Mi perfil</Link>
        </span>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [path]);
  return (
    <div className="min-h-screen flex flex-col vants-shell-body">
      <InsigniaBienvenidaPlayGames />
      <Header onOpenSearch={() => setSearchOpen(true)} onOpenLauncher={() => setLauncherOpen(true)} />
      <main id="contenido" className="flex-1">{children}</main>
      <Footer />
      <BarraInferiorMovil path={path} onOpenLauncher={() => setLauncherOpen(true)} />
      <CajonLanzadorTorneo abierto={launcherOpen} onCerrar={() => setLauncherOpen(false)} />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <OfflineIndicator />
    </div>
  );
}
