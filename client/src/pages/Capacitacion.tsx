/**
 * Centro de capacitación VANTS (skilling hub).
 *
 * Onboarding de 2 pasos inspirado en los centros de capacitación para socios:
 *   1) áreas de interés (juegos y roles)
 *   2) formatos preferidos (torneos, directos, clips, misiones, ranked, tutoriales)
 *
 * Las preferencias se guardan en localStorage para visitantes y, con sesión
 * VANTS Identity, se sincronizan en la API (/int/skilling/preferencias) para
 * que viajen entre PC, móvil y web. Después del onboarding se muestran
 * recomendaciones enlazadas a las secciones reales de la plataforma.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "vants_skilling_prefs_v1";

interface SkillingPrefs {
  areas: string[];
  formatos: string[];
  onboarded: boolean;
}

interface Opcion {
  id: string;
  label: string;
  desc: string;
}

const AREAS: Opcion[] = [
  { id: "valorant", label: "VALORANT", desc: "Táctico 5v5 · Riot ID y rangos" },
  { id: "cs2", label: "CS2", desc: "Competición FACEIT · ELO y niveles" },
  { id: "fortnite", label: "Fortnite", desc: "Battle Royale · Epic Games" },
  { id: "lol", label: "League of Legends", desc: "MOBA 5v5 · Ranked" },
  { id: "warzone", label: "Warzone", desc: "Battle Royale · Call of Duty" },
  { id: "fc27", label: "EA Sports FC", desc: "Deportes · FC 27" },
  { id: "moviles", label: "Juegos móviles", desc: "Free Fire, Wild Rift, MLBB y Clash Royale" },
  { id: "organizacion", label: "Organización de torneos", desc: "Crea y administra copas de comunidad" },
  { id: "contenido", label: "Creación de contenido", desc: "Clips, Shorts y directos" },
];

const FORMATOS: Opcion[] = [
  { id: "torneos", label: "Torneos en vivo", desc: "Inscríbete y compite en copas oficiales y de comunidad." },
  { id: "directos", label: "Directos y streamers", desc: "Sigue Twitch y Kick de la comunidad en vivo." },
  { id: "clips", label: "Clips y jugadas a demanda", desc: "Aprende de las mejores jugadas publicadas." },
  { id: "misiones", label: "Misiones y retos semanales", desc: "Progresa a tu ritmo con recompensas." },
  { id: "ranked", label: "Rutas de ranking", desc: "Sube de rango con VANTS Ranked y las ligas." },
  { id: "tutoriales", label: "Tutoriales y guías", desc: "Guías de la comunidad y creadores verificados." },
];

interface Recomendacion {
  to: string;
  titulo: string;
  desc: string;
  cta: string;
}

const POR_FORMATO: Record<string, Recomendacion> = {
  torneos: { to: "/torneos/competir", titulo: "Inscripciones abiertas", desc: "Torneos con inscripción abierta ahora mismo.", cta: "Ver torneos" },
  directos: { to: "/directos", titulo: "Directos del circuito", desc: "Canales de Twitch y Kick en vivo.", cta: "Ver directos" },
  clips: { to: "/clips", titulo: "Clips destacados", desc: "Jugadas de la comunidad listas para estudiar.", cta: "Ver clips" },
  misiones: { to: "/comunidad/misiones", titulo: "Misiones semanales", desc: "Retos con progreso y recompensas.", cta: "Ver misiones" },
  ranked: { to: "/ranked", titulo: "VANTS Ranked", desc: "Tu ruta competitiva por rangos.", cta: "Jugar Ranked" },
  tutoriales: { to: "/creadores", titulo: "Creadores y guías", desc: "Contenido formativo de creadores verificados.", cta: "Ver creadores" },
};

const POR_AREA: Record<string, Recomendacion> = {
  organizacion: { to: "/crear-torneo", titulo: "Crea tu propio torneo", desc: "Herramientas de organización con plan VANTS.", cta: "Crear torneo" },
  contenido: { to: "/clips/publicar", titulo: "Publica tu contenido", desc: "Sube clips y comparte tus jugadas.", cta: "Publicar clip" },
  moviles: { to: "/torneos", titulo: "Circuito móvil", desc: "Copas de Free Fire, Wild Rift, MLBB y Clash Royale.", cta: "Ver torneos" },
};

function leerLocal(): SkillingPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.areas) || !Array.isArray(d.formatos)) return null;
    return { areas: d.areas, formatos: d.formatos, onboarded: !!d.onboarded };
  } catch {
    return null;
  }
}

function guardarLocal(p: SkillingPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento lleno o bloqueado: la página sigue funcionando */
  }
}

export default function CapacitacionPagina() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<SkillingPrefs | null>(null);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const local = leerLocal();
    if (local) setPrefs(local);
    if (user) {
      try {
        const d = await api<{ ok: boolean; fuente: string; preferencias: SkillingPrefs }>(
          "/int/skilling/preferencias",
          { auth: true },
        );
        if (d && d.preferencias && d.fuente === "guardado") {
          setPrefs(d.preferencias);
          guardarLocal(d.preferencias);
        }
      } catch (e) {
        // 401 = sesión aún sin token disponible; el estado local sigue valiendo.
        if (!(e instanceof ApiError) || e.status !== 401) {
          setError("No pudimos cargar tus preferencias guardadas; puedes continuar igualmente.");
        }
      }
    }
    setCargando(false);
  }, [user]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (siguiente: SkillingPrefs) => {
      setPrefs(siguiente);
      guardarLocal(siguiente);
      setMensaje(null);
      if (!user) {
        setMensaje("Preferencias guardadas en este dispositivo. Inicia sesión para llevarlas contigo entre PC y móvil.");
        return;
      }
      setGuardando(true);
      try {
        await api("/int/skilling/preferencias", { method: "PUT", auth: true, body: siguiente });
        setMensaje("Preferencias sincronizadas con tu cuenta VANTS.");
      } catch {
        setMensaje("Guardadas en este dispositivo; no pudimos sincronizarlas con la cuenta. Reintenta más tarde.");
      } finally {
        setGuardando(false);
      }
    },
    [user],
  );

  const alternar = (campo: "areas" | "formatos", id: string) => {
    setPrefs((prev) => {
      const base: SkillingPrefs = prev || { areas: [], formatos: [], onboarded: false };
      const lista = base[campo].includes(id) ? base[campo].filter((x) => x !== id) : [...base[campo], id];
      return { ...base, [campo]: lista };
    });
  };

  const finalizar = async () => {
    const base: SkillingPrefs = prefs || { areas: [], formatos: [], onboarded: false };
    await guardar({ ...base, onboarded: true });
    setPaso(1);
  };

  const empezarDeNuevo = () => {
    setMensaje(null);
    setPrefs((prev) => (prev ? { ...prev, onboarded: false } : { areas: [], formatos: [], onboarded: false }));
    setPaso(1);
  };

  const actual = prefs || { areas: [], formatos: [], onboarded: false };
  const recomendaciones = useMemo(() => {
    const vistas = new Set<string>();
    const out: Recomendacion[] = [];
    for (const f of actual.formatos) {
      const r = POR_FORMATO[f];
      if (r && !vistas.has(r.to)) {
        vistas.add(r.to);
        out.push(r);
      }
    }
    for (const a of actual.areas) {
      const r = POR_AREA[a];
      if (r && !vistas.has(r.to)) {
        vistas.add(r.to);
        out.push(r);
      }
    }
    if (!out.length) {
      out.push(
        { to: "/torneos", titulo: "Circuito de torneos", desc: "Once títulos con copas abiertas y de comunidad.", cta: "Ver torneos" },
        { to: "/directos", titulo: "Directos de la comunidad", desc: "Twitch y Kick con los canales del circuito.", cta: "Ver directos" },
        { to: "/ranking", titulo: "Ranking global", desc: "ELO y niveles de los competidores VANTS.", cta: "Ver ranking" },
      );
    }
    return out;
  }, [actual.areas, actual.formatos]);

  const etiquetaArea = (id: string) => AREAS.find((a) => a.id === id)?.label || id;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10" data-testid="pagina-capacitacion">
      <header className="mb-8 max-w-3xl">
        <div className="eyebrow">CENTRO DE CAPACITACIÓN VANTS</div>
        <h1 className="mt-2 text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          Tu ruta de aprendizaje competitiva
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Elige tus áreas de interés y formatos preferidos: personalizamos torneos, directos, clips y misiones
          recomendados para ti. Puedes cambiarlo cuando quieras.
        </p>
      </header>

      {cargando ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-sm text-neutral-400">
          Cargando tus preferencias…
        </div>
      ) : !actual.onboarded ? (
        <section
          className="rounded-2xl border border-white/10 bg-[#0b0b10] p-6 sm:p-8"
          aria-label="Preferencias de aprendizaje"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-red-500">
                Paso {paso} de 2
              </div>
              <h2 className="mt-1 text-2xl font-bold">
                {paso === 1 ? "Preferencias de aprendizaje" : "Formatos preferidos"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-neutral-400">
                {paso === 1
                  ? "Seleccione las áreas que mejor se adapten a su forma de jugar y competir. Sus selecciones personalizan eventos, cursos y rutas de aprendizaje."
                  : "Elige los formatos que prefieras. Puedes cambiarlos en cualquier momento desde este centro."}
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-widest text-neutral-400">
              {actual.areas.length + actual.formatos.length} seleccionadas
            </span>
          </div>

          {paso === 1 ? (
            <div role="group" aria-label="Áreas de interés" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AREAS.map((a) => {
                const activo = actual.areas.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition " +
                      (activo
                        ? "border-red-500/70 bg-red-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-red-600"
                      checked={activo}
                      onChange={() => alternar("areas", a.id)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">{a.label}</span>
                      <span className="block text-xs text-neutral-400">{a.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div role="group" aria-label="Formatos preferidos" className="grid gap-3 sm:grid-cols-2">
              {FORMATOS.map((f) => {
                const activo = actual.formatos.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className={
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition " +
                      (activo
                        ? "border-red-500/70 bg-red-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-red-600"
                      checked={activo}
                      onChange={() => alternar("formatos", f.id)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">{f.label}</span>
                      <span className="block text-xs text-neutral-400">{f.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="text-xs text-neutral-400 underline decoration-dotted underline-offset-4 hover:text-white"
              onClick={() => void finalizar()}
              disabled={guardando}
            >
              ¿Terminar más tarde? Guardar y salir
            </button>
            <div className="flex items-center gap-2">
              {paso === 2 && (
                <button type="button" className="btn btn-sm" onClick={() => setPaso(1)}>
                  Atrás
                </button>
              )}
              {paso === 1 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-rojo"
                  onClick={() => setPaso(2)}
                  disabled={actual.areas.length === 0}
                  title={actual.areas.length === 0 ? "Selecciona al menos un área" : undefined}
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-rojo"
                  onClick={() => void finalizar()}
                  disabled={guardando || actual.formatos.length === 0}
                >
                  {guardando ? "Guardando…" : "Finalizar"}
                </button>
              )}
            </div>
          </div>

          {!user && (
            <p className="mt-4 text-xs text-neutral-500">
              Sin sesión, las preferencias quedan en este dispositivo.{" "}
              <Link href="/entrar" className="text-red-400 underline underline-offset-2">
                Inicia sesión
              </Link>{" "}
              para sincronizarlas entre PC y móvil.
            </p>
          )}
          {mensaje && <p className="mt-3 text-xs text-emerald-400">{mensaje}</p>}
          {error && <p className="mt-3 text-xs text-amber-400">{error}</p>}
        </section>
      ) : (
        <section aria-label="Recomendaciones de aprendizaje">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-red-500">TU PLAN PERSONALIZADO</div>
              <h2 className="mt-1 text-2xl font-bold">Recomendaciones para ti</h2>
              <p className="mt-1 text-sm text-neutral-400">
                {actual.areas.length > 0
                  ? `Áreas: ${actual.areas.map(etiquetaArea).join(" · ")}`
                  : "Aún sin áreas seleccionadas"}
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={empezarDeNuevo}>
              Editar preferencias
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recomendaciones.map((r) => (
              <Link
                key={r.to}
                href={r.to}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0b0b10] p-5 transition hover:border-red-500/60"
              >
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-red-400">{r.titulo}</h3>
                  <p className="mt-1 text-sm text-neutral-400">{r.desc}</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-red-400">
                  {r.cta} →
                </span>
              </Link>
            ))}
          </div>

          {mensaje && <p className="mt-4 text-xs text-emerald-400">{mensaje}</p>}
          {!user && (
            <p className="mt-4 text-xs text-neutral-500">
              Estás viendo recomendaciones guardadas en este dispositivo.{" "}
              <Link href="/entrar" className="text-red-400 underline underline-offset-2">
                Inicia sesión
              </Link>{" "}
              para llevarlas contigo entre PC y móvil.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
