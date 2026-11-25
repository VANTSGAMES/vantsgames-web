import { useEffect, useState, type FormEvent } from "react";
import { PanelFaceit, EstadisticasFaceit, CanalesForm } from "./PerfilFaceit";
import { MisEquiposPanel, MisInscripciones, imagenEquipo, mensajeError } from "./Vants";
import { MiBiblioteca } from "./MisClips";
import { PLANES } from "./Membresias";
import { FilaInsignias, Sello3D, SelloAvatar, Insignia3D, pngInsignia, useCatalogoInsignias } from "@/components/Insignia3D";
import { useMisInsignias } from "./Membresias";
import { TarjetaEpic, PanelFortnite, useCuentaEpic } from "@/components/Fortnite";
import { ResumenLogros, PanelValorantPerfil, RiotIdForm } from "./Juegos";
import {
  IconoPlayGames,
  LanzadorRapidoTorneo,
  PanelJuegosDispositivo,
  TarjetaExperienciaPlayGames,
} from "@/components/DispositivosJuegos";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api, esAppNativa, pub } from "@/lib/api";
import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PERFIL_LINKS } from "@/lib/nav";
import { PageHead, Empty, AuthGate, Initials } from "@/components/ui-vants";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

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

interface ItemMenuPerfilAndroid {
  id: string;
  label: string;
  subtitulo: string;
  to: string;
  icono: JSX.Element;
  acento?: string;
}

interface GrupoMenuPerfilAndroid {
  id: string;
  titulo: string;
  kicker: string;
  items: ItemMenuPerfilAndroid[];
}

const GRUPOS_PERFIL_ANDROID: GrupoMenuPerfilAndroid[] = [
  {
    id: "competicion",
    kicker: "Actividad competitiva",
    titulo: "Competición y rendimiento",
    items: [
      {
        id: "estadisticas",
        label: "Estadísticas",
        subtitulo: "FACEIT CS2, VALORANT y Fortnite en tiempo real",
        to: "/perfil/estadisticas",
        acento: "#ff0d2e",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: "torneos",
        label: "Mis torneos",
        subtitulo: "Inscripciones activas, check-in y brackets",
        to: "/perfil/torneos",
        acento: "#ff0d2e",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 4h12v5a6 6 0 0 1-12 0V4zM12 15v5M8 20h8" />
          </svg>
        ),
      },
      {
        id: "equipos",
        label: "Mis equipos",
        subtitulo: "Plantillas, capitanía e invitaciones de squad",
        to: "/perfil/equipos",
        acento: "#ff0d2e",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        id: "insignias",
        label: "Insignias y logros",
        subtitulo: "Medallas 3D desbloqueadas y colección de 1.000 logros",
        to: "/perfil/insignias",
        acento: "#f59e0b",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="6" />
            <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "creadores",
    kicker: "Creadores y productividad",
    titulo: "Contenido y Workspace",
    items: [
      {
        id: "clips",
        label: "Mis clips",
        subtitulo: "Biblioteca de jugadas, YouTube Shorts y Créditos IA",
        to: "/perfil/clips",
        acento: "#38bdf8",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        ),
      },
      {
        id: "workspace",
        label: "Workspace Pro",
        subtitulo: "Drive, Docs, Sheets, Calendar, Meet y notas tácticas",
        to: "/workspace",
        acento: "#38bdf8",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "conexiones",
    kicker: "Sincronización y beneficios",
    titulo: "Cuentas y membresía",
    items: [
      {
        id: "cuentas",
        label: "Cuentas vinculadas",
        subtitulo: "Google Play Juegos, juegos del móvil, Riot, FACEIT y Epic",
        to: "/perfil/cuentas",
        acento: "#3ddc84",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        ),
      },
      {
        id: "membresia",
        label: "Membresía",
        subtitulo: "Estado de tu plan PRO / CREATOR, Pase S4 y privilegios",
        to: "/perfil/membresia",
        acento: "#ff0d2e",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "ajustes-ayuda",
    kicker: "Cuenta y asistencia",
    titulo: "Ajustes y soporte",
    items: [
      {
        id: "ajustes",
        label: "Configuración",
        subtitulo: "Nombre público, foto, banner, vitrina y redes sociales",
        to: "/perfil/ajustes",
        acento: "#c4c4c9",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
      {
        id: "soporte",
        label: "Soporte",
        subtitulo: "Abrir ticket oficial VTS y atención directa del equipo",
        to: "/perfil/soporte",
        acento: "#c4c4c9",
        icono: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        ),
      },
    ],
  },
];

function MenuPerfilAndroid({ onSelect }: { onSelect?: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="menu-perfil-android">
      {GRUPOS_PERFIL_ANDROID.map((grupo) => (
        <section
          key={grupo.id}
          className="panel chamfer overflow-hidden flex flex-col"
          style={{ borderColor: "var(--linea)" }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-2"
            style={{ borderColor: "var(--linea-suave)", background: "rgba(255,255,255,0.018)" }}
          >
            <div>
              <div className="eyebrow" style={{ fontSize: "0.68rem" }}>{grupo.kicker}</div>
              <h3 className="d-3 mt-0.5">{grupo.titulo}</h3>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--linea-suave)" }}>
            {grupo.items.map((item) => (
              <Link
                key={item.id}
                href={item.to}
                onClick={onSelect}
                className="vants-android-menu-row"
                data-testid={"android-perfil-item-" + item.id}
              >
                <span
                  className="vants-android-menu-icon"
                  style={{
                    color: item.acento || "var(--rojo)",
                    borderColor: "var(--linea)",
                  }}
                >
                  {item.icono}
                </span>
                <span className="min-w-0 flex-1 grid gap-0.5">
                  <span className="font-bold text-sm text-white leading-tight">{item.label}</span>
                  <span className="text-xs muted truncate">{item.subtitulo}</span>
                </span>
                <span className="muted text-base shrink-0 pl-1" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PerfilNav({ pathActual }: { pathActual: string }) {
  const nativo = esAppNativa();
  if (nativo) return null;
  return (
    <nav className="wrap mb-8 hidden lg:block" aria-label="Secciones del perfil">
      <div className="tabs">
        {PERFIL_LINKS.map((l) => (
          <Link
            key={l.to}
            href={l.to}
            aria-selected={pathActual === l.to}
            className="tab"
            data-testid={"perfil-tab-" + l.to.split("/").pop()}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function BarraSubseccionPerfilAndroid({ sub, titulo }: { sub: string; titulo: string }) {
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const nativo = esAppNativa();
  if (!sub) return null;

  const grupoActual = GRUPOS_PERFIL_ANDROID.find((g) => g.items.some((i) => i.id === sub));

  return (
    <>
      <div
        className={(nativo ? "block " : "lg:hidden ") + "wrap pt-4 pb-5"}
        data-testid="barra-subseccion-android"
      >
        <div
          className="panel chamfer px-3.5 py-3 flex items-center justify-between gap-2"
          style={{ borderColor: "var(--linea)", background: "var(--grafito-1)" }}
        >
          <Link href="/perfil" className="btn btn-sm btn-ghost px-2.5" data-testid="btn-volver-perfil">
            ← Mi perfil
          </Link>
          <div className="min-w-0 text-center flex-1 px-1">
            {grupoActual && (
              <div className="text-[10px] uppercase tracking-widest muted font-bold truncate">
                {grupoActual.titulo}
              </div>
            )}
            <div className="d-3 truncate text-white">{titulo}</div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setCajonAbierto(true)}
            data-testid="btn-secciones-perfil-android"
          >
            Secciones ▾
          </button>
        </div>
      </div>

      {cajonAbierto && (
        <div
          className="modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-label="Secciones del perfil"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCajonAbierto(false);
          }}
        >
          <div
            className="panel panel-pad chamfer grid gap-4 w-full"
            style={{ maxWidth: 680, maxHeight: "84vh", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Navegación del jugador</div>
                <h2 className="d-2 mt-0.5">Secciones de Mi Perfil</h2>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCajonAbierto(false)}>
                ✕ Cerrar
              </button>
            </div>
            <Link
              href="/perfil"
              onClick={() => setCajonAbierto(false)}
              className="btn btn-sm btn-rojo w-full justify-center"
            >
              Ir al resumen principal de Mi Perfil
            </Link>
            <MenuPerfilAndroid onSelect={() => setCajonAbierto(false)} />
          </div>
        </div>
      )}
    </>
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

type CuotaVantsPerfil = {
  plan: string;
  label: string;
  activo: boolean;
  shorts: { usados: number; limite: number; restantes: number };
  vidiq: { usados: number; limite: number; restantes: number };
  creditosVants?: { usados: number; limite: number; restantes: number };
};

function Resumen() {
  const { user, logout } = useAuth();
  const q = useApi<{ nickname: string | null; redes: Record<string, any> }>("/api/account/perfil", { auth: true });
  const fotoQ = useApi<{ pid: string | null; avatar: string | null; propia: boolean }>("/int/perfil/foto", { auth: true });
  const cuota = useApi<CuotaVantsPerfil>("/int/clips/cuota", { auth: true });
  // El nombre público es el nickname guardado en el servidor. Nunca se sustituye por el correo.
  const nombre = q.data?.nickname || null;
  const ins = useMisInsignias();
  const c = cuota.data;
  const cred = c?.creditosVants || c?.vidiq;
  const creditosRestantes = cred?.restantes ?? 0;
  const creditosLimite = cred?.limite ?? 0;
  const shortsRestantes = c?.shorts?.restantes ?? 0;
  const shortsLimite = c?.shorts?.limite ?? 0;
  const totalInsignias = (ins.data?.conseguidas || []).length;
  const nativo = esAppNativa();

  return (
    <div className={"wrap grid gap-6 " + (nativo ? "pt-4" : "")} data-testid="vants-id-dashboard">
      {/* Tarjeta VANTS ID adaptada a Android/Móvil y Escritorio */}
      <section
        className="panel chamfer relative overflow-hidden p-5 sm:p-7 grid gap-5"
        style={{
          background:
            "radial-gradient(circle at 14% 18%, rgba(255,13,46,0.28), transparent 52%), radial-gradient(circle at 86% 20%, rgba(61,220,132,0.14), transparent 48%), linear-gradient(135deg, #111218 0%, #0b0b0f 62%, #150c11 100%)",
          borderColor: "var(--linea)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="eyebrow">VANTS ID · Jugador</span>
            {c && (
              <span className={"tag " + (c.activo ? "tag-rojo" : "")}>
                {c.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {fotoQ.data?.pid && (
              <Link href={"/u/" + fotoQ.data.pid} className="btn btn-sm btn-ghost">
                Ficha pública
              </Link>
            )}
            <Link href="/perfil/ajustes" className="btn btn-sm">
              Editar perfil
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 text-center sm:text-left">
          <span className="relative inline-block shrink-0">
            <FotoPerfil nombre={nombre || "?"} picture={user?.picture || null} size={84} />
            <SelloAvatar s={ins.data?.sello} />
          </span>
          <div className="min-w-0 flex-1 grid gap-1.5 justify-items-center sm:justify-items-start">
            {q.isLoading ? (
              <div className="sk" style={{ height: 32, width: 200 }} />
            ) : q.error ? (
              <p className="muted small">No se pudo leer tu perfil del servidor ({q.error.code}).</p>
            ) : nombre ? (
              <h2 className="d-1 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                {nombre}
                <Sello3D s={ins.data?.sello} size={26} />
              </h2>
            ) : (
              <div>
                <p className="d-3">Sin nombre público</p>
                <Link href="/perfil/ajustes" className="link-arrow mt-1">Elegir mi Nick gamer →</Link>
              </div>
            )}
            {user?.email && <span className="text-xs muted">{user.email}</span>}
            <span className="text-xs muted">
              Tus Créditos VANTS IA y tu cupo de Shorts se renuevan automáticamente cada día.
            </span>
          </div>
        </div>

        {/* Barra compacta de métricas diarias estilo app Android */}
        <div
          className="grid grid-cols-3 gap-2 pt-3 border-t"
          style={{ borderColor: "var(--linea-suave)" }}
        >
          <Link
            href={creditosLimite > 0 ? "/perfil/clips" : "/membresias"}
            className="p-2.5 rounded-[4px] text-center transition-colors hover:bg-[var(--grafito-2)]"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.28)" }}
          >
            <div className="d-3 num" style={{ color: "#fbbf24" }}>
              {creditosRestantes}<span className="text-xs muted font-normal">/{creditosLimite}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider font-bold muted mt-0.5">Créditos IA</div>
          </Link>

          <Link
            href={shortsLimite > 0 ? "/perfil/clips" : "/membresias"}
            className="p-2.5 rounded-[4px] text-center transition-colors hover:bg-[var(--grafito-2)]"
            style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.28)" }}
          >
            <div className="d-3 num" style={{ color: "#38bdf8" }}>
              {shortsRestantes}<span className="text-xs muted font-normal">/{shortsLimite}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider font-bold muted mt-0.5">Shorts hoy</div>
          </Link>

          <Link
            href="/perfil/insignias"
            className="p-2.5 rounded-[4px] text-center transition-colors hover:bg-[var(--grafito-2)]"
            style={{ background: "rgba(255,13,46,0.1)", border: "1px solid rgba(255,13,46,0.3)" }}
          >
            <div className="d-3 num text-white">{totalInsignias}</div>
            <div className="text-[10px] uppercase tracking-wider font-bold muted mt-0.5">Insignias</div>
          </Link>
        </div>
      </section>

      {/* EXPERIENCIA GOOGLE PLAY JUEGOS + LANZADOR RÁPIDO DE TORNEO */}
      <TarjetaExperienciaPlayGames />
      <LanzadorRapidoTorneo compacto />

      {/* CENTRO ORGANIZADO DEL PERFIL (Versión Android / Móvil / Tablet siempre visible; en Web escritorio bajo el hub) */}
      <section className="grid gap-3" aria-labelledby="vants-hub-android-t">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 id="vants-hub-android-t" className="eyebrow">Centro del jugador · Todo organizado</h2>
          <span className="text-xs muted">4 categorías · Acceso en 1 toque</span>
        </div>
        <MenuPerfilAndroid />
      </section>

      {/* MIS INSIGNIAS (Vista rápida 3D) */}
      <div className="panel panel-pad chamfer grid gap-4" data-testid="perfil-insignias">
        <div className="flex justify-between items-center gap-3">
          <h2 className="d-3">Mis insignias 3D</h2>
          <Link href="/insignias" className="link-arrow">Catálogo →</Link>
        </div>
        {ins.isLoading ? <div className="sk" style={{ height: 84 }} /> : <FilaInsignias codes={ins.data?.conseguidas || []} size={68} />}
        <p className="text-xs muted">Se desbloquean automáticamente con tu plan activo, cuentas vinculadas, logros y torneos.</p>
      </div>

      {/* Tarjetas extra de escritorio solo cuando NO estamos en la app nativa Android */}
      {!nativo && (
        <div className="hidden lg:grid gap-6">
          <div className="panel panel-pad grid gap-4">
            <div className="flex justify-between items-center gap-3">
              <h2 className="d-3">Logros conseguidos</h2>
              <Link href="/logros" className="link-arrow">Ver los 1000 →</Link>
            </div>
            <ResumenLogros />
          </div>
        </div>
      )}

      {/* Pie limpio de cuenta en Android / Móvil */}
      <div className={(nativo ? "flex " : "flex lg:hidden ") + "flex-wrap items-center justify-between gap-3 pt-2"}>
        <div className="flex items-center gap-4 text-xs muted">
          <Link href="/privacidad" className="underline">Privacidad</Link>
          <Link href="/terminos" className="underline">Términos</Link>
          <Link href="/perfil/soporte" className="underline">Ayuda</Link>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => logout()}
          data-testid="btn-perfil-logout-movil"
        >
          Cerrar sesión
        </button>
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
    <div className="wrap grid gap-6">
      <PanelJuegosDispositivo />
      <div className="border-t pt-6 grid gap-4" style={{ borderColor: "var(--linea-suave)" }}>
        <h3 className="d-3">Cuentas competitivas PC & Consola (OAuth Oficial)</h3>
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
        <div className="mt-2"><RiotIdForm /></div>
      </div>
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

function InsigniasYLogrosSub() {
  const ins = useMisInsignias();
  return (
    <div className="wrap grid gap-6">
      <div className="panel panel-pad chamfer grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Colección 3D</div>
            <h2 className="d-3 mt-0.5">Mis insignias desbloqueadas</h2>
          </div>
          <Link href="/insignias" className="btn btn-sm">
            Ver catálogo completo →
          </Link>
        </div>
        {ins.isLoading ? <div className="sk" style={{ height: 84 }} /> : <FilaInsignias codes={ins.data?.conseguidas || []} size={72} />}
      </div>

      <VitrinaInsignias />

      <div className="panel panel-pad chamfer grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Progreso competitivo</div>
            <h2 className="d-3 mt-0.5">Logros conseguidos</h2>
          </div>
          <Link href="/logros" className="btn btn-sm btn-rojo">
            Explorar los 1.000 logros →
          </Link>
        </div>
        <ResumenLogros />
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
  insignias: { t: "Insignias y logros", el: InsigniasYLogrosSub },
  estadisticas: { t: "Estadísticas", el: () => <div className="grid gap-8"><EstadisticasFaceit /><div className="wrap grid gap-3"><h2 className="d-3">VALORANT</h2><PanelValorantPerfil /></div><FortnitePropio /></div> },
  equipos: { t: "Mis equipos", el: () => <div className="wrap grid gap-10"><MisEquiposPanel /></div> },
  torneos: { t: "Mis torneos", el: MisInscripciones },
  clips: { t: "Mis clips", el: () => <div className="wrap"><MiBiblioteca /></div> },
};

export default function Perfil() {
  const [path] = useLocation();
  const params = useParams<{ sub?: string }>();
  const sub = SUB[params.sub || ""] ? params.sub || "" : "";
  const S = SUB[sub];
  const nativo = esAppNativa();
  return (
    <>
      {!nativo && (
        <div className="hidden lg:block">
          <PageHead eyebrow="Mi perfil" title={S.t} />
        </div>
      )}
      <AuthGate what="tu perfil">
        <PerfilNav pathActual={path} />
        <BarraSubseccionPerfilAndroid sub={sub} titulo={S.t} />
        <S.el />
      </AuthGate>
    </>
  );
}

/* ---------------- Acceso ---------------- */
const OTP_ERR: Record<string, string> = {
  email_invalido: "Escribe un correo electrónico válido.",
  demasiados_intentos: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  email_no_configurado: "El acceso por código de correo no está habilitado todavía. Usa Google para entrar.",
  codigo_invalido: "Introduce el código de 6 dígitos que enviamos a tu correo.",
  codigo_expirado: "El código caducó (10 min). Solicita uno nuevo.",
  codigo_incorrecto: "Código incorrecto. Revisa tu bandeja o solicita uno nuevo.",
};

function safeReturnParam(): string {
  if (typeof window === "undefined") return "/perfil";
  const fromSearch = new URLSearchParams(window.location.search).get("returnTo");
  const hashQ = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const raw = fromSearch || (hashQ ? new URLSearchParams(hashQ).get("returnTo") : "") || "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/perfil";
  if (raw === "/" || raw === "/entrar" || raw === "/registro" || raw === "/recuperar") return "/perfil";
  return raw;
}

export function Acceso({ modo }: { modo: "entrar" | "registro" | "recuperar" }) {
  const [, nav] = useLocation();
  const { status, esNativo, loginWithGoogle, loginWithPlayGames, startEmailOtp, verifyEmailOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [acepta, setAcepta] = useState(false);
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const [faltaTerminos, setFaltaTerminos] = useState(false);
  useEffect(() => { setSt({ k: "idle" }); setFaltaTerminos(false); }, [modo]);
  const returnTo = safeReturnParam();
  const authErrorParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("auth_error") : null;
  const titulos = {
    entrar: "Iniciar sesión",
    registro: "Crear cuenta",
    recuperar: "Acceder con código",
  };
  const exigirTerminos = (): boolean => {
    if (modo === "registro" && !acepta) {
      setFaltaTerminos(true);
      setSt({ k: "error", m: "Marca la casilla de Términos de Servicio y Política de Privacidad para continuar." });
      return false;
    }
    setFaltaTerminos(false);
    return true;
  };
  const entrarConGoogle = () => {
    if (!exigirTerminos()) return;
    loginWithGoogle(returnTo);
  };
  const entrarConPlayGames = async () => {
    if (!exigirTerminos()) return;
    setSt({ k: "enviando" });
    try {
      await loginWithPlayGames(returnTo);
    } finally {
      setSt({ k: "idle" });
    }
  };
  const enviarOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!exigirTerminos()) return;
    setSt({ k: "enviando" });
    try {
      await startEmailOtp(email);
      setOtpStep("code");
      setSt({ k: "idle" });
    } catch (err: any) {
      const code = String(err?.message || "error");
      setSt({ k: "error", m: OTP_ERR[code] || "No se pudo enviar el código (" + code + ")." });
    }
  };
  const confirmarOtp = async (e: FormEvent) => {
    e.preventDefault();
    setSt({ k: "enviando" });
    try {
      await verifyEmailOtp(email, otpCode);
      setSt({ k: "ok" });
      nav(returnTo);
    } catch (err: any) {
      const code = String(err?.message || "error");
      setSt({ k: "error", m: OTP_ERR[code] || "No se pudo verificar el código (" + code + ")." });
    }
  };
  const qsReturn = returnTo !== "/perfil" ? "?returnTo=" + encodeURIComponent(returnTo) : "";
  return (
    <>
      <PageHead eyebrow="Cuenta · Acceso 100% en la App" title={titulos[modo]} />
      <div className="wrap">
        <div className="panel panel-pad chamfer grid gap-5 max-w-lg" data-testid={"acceso-" + modo}>
          {status === "autenticado" ? (
            <><p>Ya tienes la sesión iniciada.</p><Link href={returnTo} className="btn btn-rojo w-fit">Ir a mi perfil</Link></>
          ) : !AUTH_ENABLED || status === "no_disponible" ? (
            <>
              <p className="muted">El servicio de identidad se está inicializando en este entorno.</p>
            </>
          ) : (
            <>
              {authErrorParam && (
                <p className="small" style={{ color: "#ff5468" }} role="alert">
                  No se completó el acceso con Google ({authErrorParam}). Inténtalo de nuevo o entra con código de 6 dígitos.
                </p>
              )}
              {modo === "registro" && (
                <>
                  <p className="muted" data-testid="bienvenida-registro">
                    Bienvenido a VANTS. Crea tu cuenta gratis aquí mismo dentro de la aplicación, sincroniza tu nivel de
                    Google Play Juegos y empieza a competir.
                  </p>
                  <label
                    className="flex items-start gap-3 text-sm leading-relaxed p-3 rounded-[4px] border transition-colors"
                    style={{
                      cursor: "pointer",
                      color: "var(--gris-1)",
                      background: "rgba(255,255,255,0.02)",
                      borderColor: faltaTerminos ? "#ff5468" : "var(--linea-suave)",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={acepta}
                      onChange={(e) => {
                        setAcepta(e.target.checked);
                        if (e.target.checked) {
                          setFaltaTerminos(false);
                          if (st.k === "error") setSt({ k: "idle" });
                        }
                      }}
                      data-testid="checkbox-terminos"
                      style={{ width: 18, height: 18, accentColor: "var(--rojo)" }}
                    />
                    <span>
                      Acepto los{" "}
                      <Link href="/terminos" className="underline text-white">Términos de Servicio</Link>, la{" "}
                      <Link href="/privacidad" className="underline text-white">Política de Privacidad</Link>{" "}
                      y las normas de conducta y juego limpio de VANTS GAMES.
                    </span>
                  </label>
                </>
              )}
              {modo !== "registro" && (
                <p className="muted">
                  Inicia sesión directamente dentro de la app con Google Play Juegos, tu cuenta de Google o un código
                  instantáneo de 6 dígitos en tu correo.
                </p>
              )}
              {esNativo && (
                <button
                  type="button"
                  onClick={entrarConPlayGames}
                  disabled={status === "cargando" || st.k === "enviando"}
                  data-testid="button-playgames-signin"
                  className="inline-flex items-center justify-center gap-3 px-4 h-12 rounded-[4px] font-bold text-sm transition-opacity hover:opacity-95 cursor-pointer w-full"
                  style={{
                    backgroundColor: "#00c853",
                    color: "#06130b",
                    border: "1px solid #3ddc84",
                  }}
                >
                  <IconoPlayGames size={22} />
                  <span>{modo === "registro" ? "Registrarse con Google Play Juegos" : "Entrar con Google Play Juegos"}</span>
                </button>
              )}
              <GoogleSignInButton
                onClick={entrarConGoogle}
                disabled={status === "cargando" || st.k === "enviando"}
                className="w-full"
                label={modo === "registro" ? "Registrarse con Google" : "Continuar con Google"}
              />
              <div className="flex items-center gap-3 small muted">
                <span className="h-px flex-1" style={{ background: "var(--linea-suave)" }} />
                <span>o con correo electrónico</span>
                <span className="h-px flex-1" style={{ background: "var(--linea-suave)" }} />
              </div>
              {otpStep === "email" ? (
                <form onSubmit={enviarOtp} className="grid gap-3">
                  <div className="field">
                    <label htmlFor="otp-em">Correo electrónico</label>
                    <input id="otp-em" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="tu@correo.com" />
                  </div>
                  <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-otp-enviar">
                    {st.k === "enviando" ? "Enviando código…" : "Enviar código de acceso"}
                  </button>
                </form>
              ) : (
                <form onSubmit={confirmarOtp} className="grid gap-3">
                  <p className="small muted">Enviamos un código de 6 dígitos a <strong>{email}</strong>.</p>
                  <div className="field">
                    <label htmlFor="otp-code">Código de 6 dígitos</label>
                    <input id="otp-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="input num" required value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" autoComplete="one-time-code" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-rojo" disabled={st.k === "enviando"} data-testid="button-otp-verificar">
                      {st.k === "enviando" ? "Verificando…" : "Confirmar código"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setOtpStep("email"); setOtpCode(""); setSt({ k: "idle" }); }}>
                      Cambiar correo
                    </button>
                  </div>
                </form>
              )}
              {st.k === "error" && <p className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</p>}
              <div className="flex flex-wrap gap-4 small">
                {modo === "entrar" ? <Link href={"/registro" + qsReturn} className="underline muted">Crear cuenta</Link> : <Link href={"/entrar" + qsReturn} className="underline muted">Ya tengo cuenta</Link>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

