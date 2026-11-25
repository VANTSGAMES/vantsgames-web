import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { pub } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  abrirLogrosPlayGames,
  abrirRankingsPlayGames,
  autenticarPlayGames,
  buscarJuegoDispositivo,
  calcularProgresoNivelPlayGames,
  detectarDispositivo,
  escanearJuegosInstalados,
  lanzarJuegoODescargar,
  obtenerPerfilPlayGames,
  suscribirEventoPlayGames,
  type EstadoJuegoDetectado,
  type InfoDispositivo,
  type PerfilPlayGames,
} from "@/lib/dispositivosJuegos";

/** Emblema vectorial estilo Google Play Juegos */
export function IconoPlayGames({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.2 7.5C5.1 5.8 6.9 4.8 8.9 4.8h6.2c2 0 3.8 1 4.7 2.7l1.8 3.5c1.1 2.1.4 4.7-1.6 5.9-1.6 1-3.7.6-4.9-.9l-1.3-1.6H10.2l-1.3 1.6c-1.2 1.5-3.3 1.9-4.9.9-2-1.2-2.7-3.8-1.6-5.9l1.8-3.5z"
        fill="#00C853"
      />
      <path d="M8.5 9.2v3.6M6.7 11h3.6" stroke="#0A0A0B" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15.2" cy="10.1" r="1" fill="#0A0A0B" />
      <circle cx="17.1" cy="11.9" r="1" fill="#0A0A0B" />
    </svg>
  );
}

const SESSION_BADGE_KEY = "vants_pg_welcome_shown_v1";

/**
 * Insignia flotante superior de bienvenida estilo Google Play Juegos ("Hola, GamerTag · Nivel X · XP").
 * Se muestra automáticamente al iniciar la app cuando Play Games autentica al jugador (complementando
 * el popup nativo del sistema Android) o cuando el jugador conecta su cuenta.
 */
export function InsigniaBienvenidaPlayGames() {
  const { status } = useAuth();
  const [visible, setVisible] = useState(false);
  const [perfil, setPerfil] = useState<PerfilPlayGames | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let vivo = true;

    const mostrarInsignia = (pg: PerfilPlayGames, forzar = false) => {
      if (!vivo || !pg.autenticado) return;
      try {
        if (!forzar && sessionStorage.getItem(SESSION_BADGE_KEY) === (pg.playerId || "1")) {
          return;
        }
        sessionStorage.setItem(SESSION_BADGE_KEY, pg.playerId || "1");
      } catch {
        // Ignorar
      }
      setPerfil(pg);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (vivo) setVisible(false);
      }, 5600);
    };

    obtenerPerfilPlayGames({ conSesionVants: status === "autenticado" })
      .then((pg) => {
        if (pg.autenticado) mostrarInsignia(pg, false);
      })
      .catch(() => {});

    const unsub = suscribirEventoPlayGames((pg) => {
      if (pg.autenticado) mostrarInsignia(pg, true);
    });

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [status]);

  if (!visible || !perfil?.autenticado) return null;

  const prog = calcularProgresoNivelPlayGames(perfil);

  return (
    <div
      className="vants-pg-insignia-wrap"
      role="status"
      aria-live="polite"
      data-testid="insignia-bienvenida-playgames"
    >
      <Link
        href="/perfil"
        onClick={() => setVisible(false)}
        className="vants-pg-insignia"
      >
        <span className="vants-pg-avatar">
          {perfil.iconBase64 ? (
            <img src={perfil.iconBase64} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <IconoPlayGames size={22} />
          )}
        </span>
        <span className="min-w-0 grid text-left leading-tight">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#3ddc84" }}>
            GOOGLE PLAY JUEGOS
          </span>
          <span className="text-sm font-bold text-white truncate" style={{ maxWidth: 190 }}>
            Hola, {perfil.displayName || "Jugador"}
          </span>
        </span>
        <span className="vants-pg-nivel-pill num">
          <span>NV. {prog.nivelActual}</span>
          {prog.xpTotal > 0 && (
            <small className="opacity-85 ml-1">{prog.xpTotal.toLocaleString("es-VE")} XP</small>
          )}
        </span>
      </Link>
    </div>
  );
}

/**
 * Tarjeta completa de Experiencia del Jugador de Google Play Juegos (Nivel, XP total,
 * barra de progreso al siguiente nivel, título gamer y acceso a Logros y Rankings nativos).
 */
export function TarjetaExperienciaPlayGames() {
  const { status, user } = useAuth();
  const [dispositivo, setDispositivo] = useState<InfoDispositivo | null>(null);
  const [pg, setPg] = useState<PerfilPlayGames | null>(null);
  const [cargando, setCargando] = useState(true);
  const [conectando, setConectando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [dis, perfilPg] = await Promise.all([
        detectarDispositivo(),
        obtenerPerfilPlayGames({ conSesionVants: status === "autenticado" }),
      ]);
      if (!vivo) return;
      setDispositivo(dis);
      setPg(perfilPg);
      setCargando(false);
    })();

    const unsub = suscribirEventoPlayGames((nuevo) => {
      if (vivo) setPg(nuevo);
    });
    return () => {
      vivo = false;
      unsub();
    };
  }, [status]);

  const conectar = async () => {
    setConectando(true);
    try {
      const nuevo = await autenticarPlayGames({ requestAuthCode: false, sincronizar: status === "autenticado" });
      setPg(nuevo);
    } finally {
      setConectando(false);
    }
  };

  const prog = useMemo(() => calcularProgresoNivelPlayGames(pg), [pg]);
  const avatar = pg?.iconBase64 || user?.picture || null;
  const esAndroidNativo = Boolean(dispositivo?.esNativo && dispositivo.plataforma === "android");

  return (
    <section
      className="panel panel-pad chamfer grid gap-4"
      style={{
        borderColor: pg?.autenticado ? "rgba(61, 220, 132, 0.42)" : "var(--linea)",
        background:
          "radial-gradient(circle at 92% 12%, rgba(0, 200, 83, 0.14), transparent 48%), linear-gradient(145deg, #111413 0%, #0d0e10 100%)",
      }}
      data-testid="tarjeta-experiencia-playgames"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-full grid place-items-center shrink-0 overflow-hidden"
            style={{
              background: "rgba(0, 200, 83, 0.14)",
              border: "2px solid rgba(61, 220, 132, 0.55)",
            }}
          >
            {avatar && pg?.autenticado ? (
              <img src={avatar} alt="" width={48} height={48} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <IconoPlayGames size={26} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "#3ddc84" }}>
                Google Play Juegos · Experiencia Oficial
              </span>
              {pg?.autenticado ? (
                <span className="tag tag-ok">Sincronizado</span>
              ) : (
                <span className="tag">Play Games v2</span>
              )}
            </div>
            <h3 className="d-3 mt-0.5 truncate">
              {cargando
                ? "Leyendo perfil de Play Juegos…"
                : pg?.autenticado
                  ? pg.displayName || user?.nickname || "Jugador Play Store"
                  : "Conecta tu perfil de Google Play Juegos"}
            </h3>
            {pg?.autenticado && pg.title && (
              <p className="text-xs muted mt-0.5">Rango Play Juegos: <strong className="text-white">{pg.title}</strong></p>
            )}
          </div>
        </div>

        {pg?.autenticado ? (
          <div
            className="px-3.5 py-2 rounded-[4px] text-center shrink-0"
            style={{
              background: "rgba(0, 200, 83, 0.14)",
              border: "1px solid rgba(61, 220, 132, 0.45)",
            }}
          >
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#3ddc84" }}>
              NIVEL GAMER
            </div>
            <div className="d-2 num leading-none mt-0.5 text-white">{prog.nivelActual}</div>
          </div>
        ) : esAndroidNativo ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: "#00c853", borderColor: "#00c853", color: "#07120b" }}
            disabled={conectando}
            onClick={conectar}
            data-testid="btn-vincular-playgames"
          >
            {conectando ? "Conectando…" : "Vincular Play Juegos"}
          </button>
        ) : null}
      </div>

      {pg?.autenticado ? (
        <div className="grid gap-3 pt-1">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white num">
                {prog.xpTotal.toLocaleString("es-VE")} XP acumulados
              </span>
              <span className="muted num">
                {prog.esMaximo
                  ? "Nivel máximo alcanzado"
                  : prog.xpFaltante > 0
                    ? `Faltan ${prog.xpFaltante.toLocaleString("es-VE")} XP para Nivel ${prog.nivelSiguiente}`
                    : `Nivel ${prog.nivelActual} activo`}
              </span>
            </div>
            <div
              className="w-full h-2.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
              role="progressbar"
              aria-valuenow={prog.porcentaje}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${prog.porcentaje}%`,
                  background: "linear-gradient(90deg, #00c853 0%, #3ddc84 100%)",
                  boxShadow: "0 0 12px rgba(61, 220, 132, 0.5)",
                }}
              />
            </div>
          </div>

          {esAndroidNativo && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => abrirLogrosPlayGames()}
                data-testid="btn-logros-playgames"
              >
                🏆 Logros de Play Juegos
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => abrirRankingsPlayGames()}
                data-testid="btn-rankings-playgames"
              >
                📊 Clasificaciones
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost ml-auto"
                disabled={conectando}
                onClick={conectar}
              >
                Actualizar XP
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="small muted">
          {esAndroidNativo
            ? "Activa tu insignia oficial de bienvenida de Google Play Juegos y muestra tu Nivel y puntos de experiencia (XP) en tu perfil competitivo de VANTS."
            : dispositivo?.plataforma === "ios"
              ? "En iOS / iPad tu perfil VANTS sincroniza automáticamente la experiencia de Google Play Juegos que hayas vinculado en Android y lanza tus juegos instalados al instante."
              : "Al entrar desde la app oficial VANTS Movil en Android o Tablet, leemos tu Nivel, experiencia (XP) e insignia oficial de Google Play Juegos automáticamente."}
        </p>
      )}
    </section>
  );
}

/**
 * Lanzador en un toque para abrir el juego directamente desde un torneo, el Home o el cajón rápido.
 */
export function LanzadorRapidoTorneo({
  juegoSlug,
  nombreTorneo,
  compacto = false,
  onLaunched,
}: {
  juegoSlug?: string | null;
  nombreTorneo?: string | null;
  compacto?: boolean;
  onLaunched?: () => void;
}) {
  const { status } = useAuth();
  const [dispositivo, setDispositivo] = useState<InfoDispositivo | null>(null);
  const [juegos, setJuegos] = useState<EstadoJuegoDetectado[]>([]);
  const [pg, setPg] = useState<PerfilPlayGames | null>(null);
  const [lanzando, setLanzando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [dis, escaneo, perfilPg] = await Promise.all([
        detectarDispositivo(),
        escanearJuegosInstalados(),
        obtenerPerfilPlayGames({ conSesionVants: status === "autenticado" }),
      ]);
      if (!vivo) return;
      setDispositivo(dis);
      setJuegos(escaneo);
      setPg(perfilPg);
    })();
    return () => {
      vivo = false;
    };
  }, [status]);

  const defEspecifico = useMemo(() => buscarJuegoDispositivo(juegoSlug), [juegoSlug]);
  const juegoTorneo = useMemo(() => {
    if (!defEspecifico) return null;
    return juegos.find((j) => j.slug === defEspecifico.slug) || {
      ...defEspecifico,
      instalado: false,
      puedeLanzar: false,
      fuenteDeteccion: "no_detectado" as const,
    };
  }, [defEspecifico, juegos]);

  const lanzar = async (j: EstadoJuegoDetectado) => {
    setLanzando(j.slug);
    try {
      await lanzarJuegoODescargar(j);
      onLaunched?.();
    } finally {
      setTimeout(() => setLanzando(null), 1100);
    }
  };

  const prog = calcularProgresoNivelPlayGames(pg);

  // Modo 1: Torneo de un juego específico (p. ej. dentro de /torneos/:slug o filtro de juego)
  if (juegoSlug) {
    if (!juegoTorneo) return null;
    const etiquetaBoton =
      lanzando === juegoTorneo.slug
        ? "Abriendo juego…"
        : juegoTorneo.instalado || dispositivo?.plataforma === "ios" || (dispositivo?.plataforma === "android" && !dispositivo.esNativo)
          ? `🎮 Abrir ${juegoTorneo.nombre} para el Torneo`
          : dispositivo?.esNativo
            ? `Instalar ${juegoTorneo.nombre} en Play Store`
            : `Abrir ${juegoTorneo.nombre} en móvil / tablet`;

    return (
      <div
        className="panel panel-pad chamfer flex flex-wrap items-center justify-between gap-4"
        style={{
          borderColor: juegoTorneo.instalado ? "rgba(61, 220, 132, 0.45)" : "rgba(255, 13, 46, 0.42)",
          background:
            "linear-gradient(135deg, rgba(255, 13, 46, 0.12) 0%, rgba(17, 17, 19, 0.96) 55%, rgba(0, 200, 83, 0.08) 100%)",
        }}
        data-testid={`lanzador-torneo-${juegoTorneo.slug}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {juegoTorneo.img ? (
            <img
              src={pub(juegoTorneo.img)}
              alt={juegoTorneo.nombre}
              width={52}
              height={52}
              className="w-13 h-13 rounded-[6px] object-cover shrink-0"
              style={{ width: 52, height: 52, border: "1px solid var(--linea)" }}
            />
          ) : (
            <div className="w-12 h-12 rounded-[6px] grid place-items-center font-bold text-xs" style={{ background: "var(--grafito-2)" }}>
              {juegoTorneo.etiqueta.slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Acceso directo al juego</span>
              {juegoTorneo.instalado && (
                <span className="tag tag-ok">
                  Instalado{juegoTorneo.versionName ? ` · v${juegoTorneo.versionName}` : ""}
                </span>
              )}
              {pg?.autenticado && (
                <span className="tag" style={{ borderColor: "rgba(61,220,132,0.4)", color: "#3ddc84" }}>
                  Play Juegos NV. {prog.nivelActual}
                  {prog.xpTotal > 0 ? ` · ${prog.xpTotal.toLocaleString("es-VE")} XP` : ""}
                </span>
              )}
            </div>
            <div className="d-3 mt-1 truncate">
              {nombreTorneo ? `Listo para jugar: ${nombreTorneo}` : `Lanzar ${juegoTorneo.nombre}`}
            </div>
            <p className="text-xs muted mt-0.5">
              Abre {juegoTorneo.nombre} de una vez en tu {dispositivo?.esTablet ? "tablet" : "teléfono"} con tu perfil de Google Play Juegos activo.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-rojo w-full sm:w-auto"
          disabled={lanzando === juegoTorneo.slug}
          onClick={() => lanzar(juegoTorneo)}
          data-testid={`btn-lanzar-torneo-${juegoTorneo.slug}`}
        >
          {etiquetaBoton}
        </button>
      </div>
    );
  }

  // Modo 2: Tira / cuadrícula rápida con todos los juegos instalados primero (Home, Perfil o Cajón "Jugar")
  const listaMostrar = compacto ? juegos.slice(0, 6) : juegos;
  const instaladosCount = juegos.filter((j) => j.instalado).length;

  return (
    <section className="panel panel-pad chamfer grid gap-4" data-testid="barra-lanzador-rapido">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Lanzador de Torneo</span>
            {instaladosCount > 0 && (
              <span className="tag tag-ok">{instaladosCount} instalado(s) en tu dispositivo</span>
            )}
            {pg?.autenticado && (
              <span className="tag" style={{ borderColor: "rgba(61,220,132,0.45)", color: "#3ddc84" }}>
                🎮 {pg.displayName} · NV. {prog.nivelActual}
                {prog.xpTotal > 0 ? ` (${prog.xpTotal.toLocaleString("es-VE")} XP)` : ""}
              </span>
            )}
          </div>
          <h3 className="d-3 mt-1">Abre tu juego de una vez para competir</h3>
        </div>
        <Link href="/perfil/cuentas" className="link-arrow text-xs">
          Escáner completo →
        </Link>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {listaMostrar.map((j) => (
          <div
            key={j.slug}
            className="p-3 rounded-[4px] border flex items-center justify-between gap-3"
            style={{
              borderColor: j.instalado ? "rgba(61, 220, 132, 0.4)" : "var(--linea-suave)",
              background: j.instalado ? "rgba(61, 220, 132, 0.05)" : "var(--grafito-2)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {j.img ? (
                <img src={pub(j.img)} alt="" width={38} height={38} className="w-9 h-9 rounded-[4px] object-cover shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-[4px] grid place-items-center text-[10px] font-bold shrink-0" style={{ background: "var(--negro)" }}>
                  {j.etiqueta.slice(0, 3)}
                </span>
              )}
              <div className="min-w-0">
                <div className="font-bold text-xs truncate">{j.nombre}</div>
                <div className="text-[11px] muted flex items-center gap-1.5">
                  {j.instalado ? (
                    <span style={{ color: "var(--ok)" }}>● Listo en dispositivo</span>
                  ) : (
                    <span>{j.categoria}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={"btn btn-sm shrink-0 " + (j.instalado || dispositivo?.plataforma === "ios" ? "btn-rojo" : "")}
              disabled={lanzando === j.slug}
              onClick={() => lanzar(j)}
              data-testid={`quick-launch-${j.slug}`}
            >
              {lanzando === j.slug ? "Abriendo…" : j.instalado || dispositivo?.plataforma === "ios" ? "Abrir" : "Instalar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PanelJuegosDispositivo({ compacto = false }: { compacto?: boolean }) {
  const [cargando, setCargando] = useState(true);
  const [dispositivo, setDispositivo] = useState<InfoDispositivo | null>(null);
  const [juegos, setJuegos] = useState<EstadoJuegoDetectado[]>([]);
  const [lanzando, setLanzando] = useState<string | null>(null);

  const recargarEscaneo = async () => {
    setCargando(true);
    const [dis, listaJuegos] = await Promise.all([
      detectarDispositivo(),
      escanearJuegosInstalados(),
    ]);
    setDispositivo(dis);
    setJuegos(listaJuegos);
    setCargando(false);
  };

  useEffect(() => {
    let activo = true;
    (async () => {
      const [dis, listaJuegos] = await Promise.all([
        detectarDispositivo(),
        escanearJuegosInstalados(),
      ]);
      if (!activo) return;
      setDispositivo(dis);
      setJuegos(listaJuegos);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const handleLanzar = async (juego: EstadoJuegoDetectado) => {
    setLanzando(juego.slug);
    try {
      await lanzarJuegoODescargar(juego);
    } finally {
      setTimeout(() => setLanzando(null), 1000);
    }
  };

  const instaladosCount = juegos.filter((j) => j.instalado).length;

  return (
    <div className="grid gap-6" data-testid="panel-juegos-dispositivo">
      <TarjetaExperienciaPlayGames />

      <div className="panel panel-pad chamfer grid gap-4" style={{ background: "rgba(18, 18, 20, 0.85)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <div className="eyebrow flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: dispositivo?.esNativo ? "var(--ok)" : "var(--rojo)" }} />
              <span>
                {dispositivo?.esNativo
                  ? `APP NATIVA · ${dispositivo.plataforma.toUpperCase()}${dispositivo.esTablet ? " TABLET" : ""}`
                  : `OPTIMIZADO · ${dispositivo?.plataforma?.toUpperCase() || "MULTIPLATAFORMA"}${dispositivo?.esTablet ? " TABLET" : ""}`}
              </span>
            </div>
            <h3 className="d-3">
              {dispositivo?.esTablet ? "Juegos instalados en tu Tablet" : "Juegos instalados en tu Teléfono"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {dispositivo?.esNativo && (
              <span className="tag tag-ok">
                {instaladosCount > 0 ? `${instaladosCount} detectado(s)` : "Escáner listo"}
              </span>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={recargarEscaneo} disabled={cargando}>
              {cargando ? "Escaneando…" : "Reescanear"}
            </button>
          </div>
        </div>

        {!compacto && (
          <p className="small muted" style={{ maxWidth: "75ch" }}>
            Abre tus juegos competitivos directamente desde VANTS sin buscar iconos fuera de la aplicación. En Android y
            Tablets verificamos los paquetes instalados y leemos tu experiencia oficial de Google Play Juegos; en iPhone y
            iPad abrimos cada juego mediante su enlace directo nativo.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cargando ? (
          <div className="col-span-full py-8 text-center muted small">Escaneando juegos en tu dispositivo…</div>
        ) : (
          juegos.map((j) => (
            <div
              key={j.slug}
              className="panel p-4 flex flex-col justify-between gap-3 border transition-all"
              style={{
                borderColor: j.instalado ? "rgba(61, 220, 132, 0.45)" : "var(--linea-suave)",
                background: j.instalado ? "rgba(61, 220, 132, 0.04)" : "rgba(17, 17, 19, 0.85)",
              }}
              data-testid={`card-juego-${j.slug}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {j.img ? (
                    <img
                      src={pub(j.img)}
                      alt={j.nombre}
                      width={46}
                      height={46}
                      className="rounded-[6px] object-cover shrink-0"
                      style={{ width: 46, height: 46, border: "1px solid var(--linea-suave)" }}
                    />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-[6px] flex items-center justify-center font-bold text-xs shrink-0"
                      style={{ background: "var(--grafito-2)", color: "var(--gris-1)" }}
                    >
                      {j.etiqueta.slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm leading-tight truncate">{j.nombre}</h4>
                    <span className="text-[11px] muted">{j.categoria}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  {j.instalado ? (
                    <span className="tag tag-ok">Instalado</span>
                  ) : dispositivo?.plataforma === "ios" && j.iosScheme ? (
                    <span className="tag">iOS / iPadOS</span>
                  ) : (
                    <span className="tag muted">Disponible</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--linea-suave)" }}>
                <span className="text-[11px] muted font-mono truncate" style={{ maxWidth: "155px" }}>
                  {j.instalado && j.versionName ? `v${j.versionName}` : j.etiqueta}
                </span>

                <button
                  type="button"
                  className={`btn btn-sm ${j.instalado || dispositivo?.plataforma === "ios" ? "btn-rojo" : "btn-ghost"}`}
                  disabled={lanzando === j.slug}
                  onClick={() => handleLanzar(j)}
                  data-testid={`btn-juego-${j.slug}`}
                >
                  {lanzando === j.slug
                    ? "Abriendo…"
                    : j.instalado || dispositivo?.plataforma === "ios"
                      ? "Abrir juego"
                      : "Instalar"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
