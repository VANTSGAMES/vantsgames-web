import { useEffect, useState } from "react";
import { pub } from "@/lib/api";
import {
  detectarDispositivo,
  escanearJuegosInstalados,
  lanzarJuegoODescargar,
  obtenerPerfilPlayGames,
  autenticarPlayGames,
  type EstadoJuegoDetectado,
  type InfoDispositivo,
  type PerfilPlayGames,
} from "@/lib/dispositivosJuegos";

export function PanelJuegosDispositivo({ compacto = false }: { compacto?: boolean }) {
  const [cargando, setCargando] = useState(true);
  const [dispositivo, setDispositivo] = useState<InfoDispositivo | null>(null);
  const [juegos, setJuegos] = useState<EstadoJuegoDetectado[]>([]);
  const [playGames, setPlayGames] = useState<PerfilPlayGames | null>(null);
  const [lanzando, setLanzando] = useState<string | null>(null);
  const [conectandoPG, setConectandoPG] = useState(false);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      setCargando(true);
      const dis = await detectarDispositivo();
      if (!activo) return;
      setDispositivo(dis);

      const [listaJuegos, pg] = await Promise.all([
        escanearJuegosInstalados(),
        obtenerPerfilPlayGames(),
      ]);

      if (!activo) return;
      setJuegos(listaJuegos);
      setPlayGames(pg);
      setCargando(false);
    }

    cargar();
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

  const handleConectarPlayGames = async () => {
    setConectandoPG(true);
    try {
      const p = await autenticarPlayGames();
      setPlayGames(p);
    } finally {
      setConectandoPG(false);
    }
  };

  const instaladosCount = juegos.filter((j) => j.instalado).length;

  return (
    <div className="grid gap-6" data-testid="panel-juegos-dispositivo">
      {/* Cabecera / Estado del dispositivo */}
      <div className="panel panel-pad chamfer grid gap-4" style={{ background: "rgba(18, 18, 20, 0.75)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <div className="eyebrow flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: dispositivo?.esNativo ? "var(--ok)" : "var(--gris-3)" }} />
              <span>{dispositivo?.esNativo ? "VANTS MOVIL NATIVO" : "COMPATIBILIDAD MULTIPLATAFORMA"}</span>
            </div>
            <h3 className="h3">
              {dispositivo?.esTablet ? "📱 Juegos en tu Tablet" : "📱 Juegos en tu Teléfono / Dispositivo"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {dispositivo?.esNativo ? (
              <span className="tag tag-ok">
                {instaladosCount > 0 ? `${instaladosCount} juego(s) detectado(s)` : "Escaneo activo"}
              </span>
            ) : (
              <span className="tag" title="En la app nativa Android se detectan automáticamente los paquetes instalados">
                Modo Web / {dispositivo?.plataforma?.toUpperCase() || "DISPOSITIVO"}
              </span>
            )}
          </div>
        </div>

        {!compacto && (
          <p className="small muted" style={{ maxWidth: "75ch" }}>
            VANTS detecta los títulos competitivos conectados o instalados en tu móvil o tablet (Android / iOS)
            y te permite abrirlos en un toque para torneos, scrims o registrar estadísticas con tu perfil gamer.
          </p>
        )}

        {/* Tarjeta Google Play Games Services v2 */}
        <div
          className="p-4 rounded-[6px] border flex flex-wrap items-center justify-between gap-4"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            borderColor: playGames?.autenticado ? "rgba(46, 204, 113, 0.3)" : "var(--linea-suave)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[6px] flex items-center justify-center font-bold text-xs"
              style={{ background: "#0F9D58", color: "#fff" }}
            >
              🎮
            </div>
            <div className="grid gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Google Play Juegos</span>
                {playGames?.autenticado ? (
                  <span className="tag tag-ok tag-sm">Conectado</span>
                ) : (
                  <span className="tag tag-sm">Servicio Play Store</span>
                )}
              </div>
              <p className="small muted">
                {playGames?.autenticado
                  ? `GamerTag: ${playGames.displayName || "Jugador"} ${playGames.currentLevel ? `· Nivel ${playGames.currentLevel}` : ""}`
                  : "Sincroniza tus logros oficiales y perfil de Google Play Store."}
              </p>
            </div>
          </div>

          <div>
            {playGames?.autenticado ? (
              <span className="small font-mono muted">ID: {playGames.playerId?.slice(0, 10)}…</span>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={conectandoPG}
                onClick={handleConectarPlayGames}
              >
                {conectandoPG ? "Conectando…" : "Vincular Play Juegos"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de juegos compatibles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cargando ? (
          <div className="col-span-full py-8 text-center muted small">Escaneando juegos en tu dispositivo…</div>
        ) : (
          juegos.map((j) => (
            <div
              key={j.slug}
              className="panel p-4 flex flex-col justify-between gap-3 border transition-all"
              style={{
                borderColor: j.instalado ? "var(--linea)" : "var(--linea-suave)",
                background: j.instalado ? "rgba(255, 255, 255, 0.03)" : "rgba(10, 10, 11, 0.6)",
              }}
              data-testid={`card-juego-${j.slug}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  {j.img ? (
                    <img
                      src={pub(j.img)}
                      alt={j.nombre}
                      width={44}
                      height={44}
                      className="rounded-[6px] object-cover shrink-0"
                      style={{ border: "1px solid var(--linea-suave)" }}
                    />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-[6px] flex items-center justify-center font-bold text-xs"
                      style={{ background: "var(--grafito-1)", color: "var(--gris-2)" }}
                    >
                      {j.etiqueta.slice(0, 3)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-sm leading-tight">{j.nombre}</h4>
                    <span className="text-[11px] muted">{j.categoria}</span>
                  </div>
                </div>

                <div>
                  {j.instalado ? (
                    <span className="tag tag-ok text-[10px]">Instalado</span>
                  ) : (
                    <span className="tag text-[10px] muted">Disponible</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--linea-suave)" }}>
                <span className="text-[11px] muted font-mono truncate" style={{ maxWidth: "160px" }}>
                  {j.instalado && j.versionName ? `v${j.versionName}` : j.androidPackage}
                </span>

                <button
                  type="button"
                  className={`btn btn-sm ${j.instalado ? "btn-rojo" : "btn-ghost"}`}
                  disabled={lanzando === j.slug}
                  onClick={() => handleLanzar(j)}
                  data-testid={`btn-juego-${j.slug}`}
                >
                  {lanzando === j.slug
                    ? "Abriendo…"
                    : j.instalado
                    ? "Jugar ahora"
                    : "Obtener"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
