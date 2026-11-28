// client/src/pages/Arena3D.tsx
// Vista informativa liviana en web (0 KB de Three.js/WebGL cargados por defecto)
// con carga opcional bajo demanda y CTA hacia VANTS PC para gráficos pesados.
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import type { Arena3DController } from "@/lib/arena3dScene";
import {
  ARENA_CAMERA_PRESETS,
  ARENA_FINISH_SWATCHES,
  type ArenaCameraPresetId,
  type ArenaFinishId,
} from "@/lib/studioHelpers";

const VANTS_PC_RELEASES = "https://github.com/VANTSGAMES/banter/releases/latest";

export default function Arena3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Arena3DController | null>(null);
  const [visorActivo, setVisorActivo] = useState(false);
  const [cargando3d, setCargando3d] = useState(false);
  const [preset, setPreset] = useState<ArenaCameraPresetId>("escenario");
  const [finish, setFinish] = useState<ArenaFinishId>("obsidian-red");
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!visorActivo) return;
    const el = containerRef.current;
    if (!el) return;
    let cancelado = false;
    setCargando3d(true);
    setWebglError(null);

    import("@/lib/arena3dScene")
      .then(({ mountArena3DScene }) => {
        if (cancelado || !containerRef.current) return;
        controllerRef.current = mountArena3DScene(containerRef.current);
      })
      .catch((err: any) => {
        if (!cancelado) setWebglError(err?.message || "No se pudo inicializar el motor WebGL 3D.");
      })
      .finally(() => {
        if (!cancelado) setCargando3d(false);
      });

    return () => {
      cancelado = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [visorActivo]);

  if (!visorActivo) {
    return (
      <section className="wrap py-12 grid gap-6" data-testid="arena-3d-page">
        <div
          className="panel panel-pad grid gap-5"
          style={{ background: "#111113", borderTop: "2px solid #ff0d2e" }}
        >
          <div className="grid gap-2 max-w-2xl">
            <span className="eyebrow" style={{ color: "#ff5468" }}>VANTS ARENA 3D · MODO LIGERO WEB</span>
            <h1 className="d-1">Trofeo Oficial del Circuito</h1>
            <p className="lead">
              Para mantener <strong>vants.cc</strong> ultrarrápida, el motor WebGL 3D no se descarga automáticamente al navegar.
              Puedes disfrutar la experiencia competitiva completa en <strong>VANTS PC</strong> o activar el visor 3D bajo demanda.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={VANTS_PC_RELEASES}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-rojo"
            >
              Descargar VANTS PC ↗
            </a>
            <button
              type="button"
              onClick={() => setVisorActivo(true)}
              className="btn"
              data-testid="btn-activar-arena-3d"
            >
              Activar visor 3D bajo demanda
            </button>
            <Link href="/torneos" className="btn btn-ghost">
              Ver torneos activos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative w-full overflow-hidden select-none"
      style={{ height: "calc(100vh - 64px)", minHeight: "520px", background: "#0b0c10" }}
      data-testid="arena-3d-page"
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Visor 3D interactivo del Trofeo Oficial VANTS GAMES"
        data-testid="arena-3d-canvas-host"
      />

      {cargando3d && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0c10]/80 text-sm text-zinc-300">
          Cargando visor WebGL 3D…
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#0b0c10]">
          <div className="panel panel-pad max-w-md text-center grid gap-3">
            <h1 className="d-3">Visor 3D no disponible</h1>
            <p className="small muted">{webglError}</p>
            <button type="button" className="btn btn-sm" onClick={() => setVisorActivo(false)}>
              Volver al modo ligero
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-20 flex flex-wrap gap-2">
        {ARENA_CAMERA_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"btn btn-sm " + (preset === p.id ? "btn-rojo" : "")}
            onClick={() => {
              setPreset(p.id);
              controllerRef.current?.setPreset(p.id);
            }}
          >
            {p.label}
          </button>
        ))}
        {ARENA_FINISH_SWATCHES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={"btn btn-sm " + (finish === s.id ? "btn-rojo" : "btn-ghost")}
            onClick={() => {
              setFinish(s.id);
              controllerRef.current?.setFinish(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVisorActivo(false)}>
          Cerrar 3D
        </button>
      </div>
    </section>
  );
}
