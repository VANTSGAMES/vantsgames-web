import { useEffect, useRef, useState } from "react";
import { RotateCw, Pause, SlidersHorizontal, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { mountArena3DScene, type Arena3DController } from "@/lib/arena3dScene";
import {
  ARENA_CAMERA_PRESETS,
  ARENA_FINISH_SWATCHES,
  type ArenaCameraPresetId,
  type ArenaFinishId,
} from "@/lib/studioHelpers";

export default function Arena3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Arena3DController | null>(null);

  const [preset, setPreset] = useState<ArenaCameraPresetId>("escenario");
  const [finish, setFinish] = useState<ArenaFinishId>("obsidian-red");
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  );
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const ctrl = mountArena3DScene(el);
      controllerRef.current = ctrl;
      return () => {
        ctrl.dispose();
        controllerRef.current = null;
      };
    } catch (err: any) {
      setWebglError(err?.message || "No se pudo inicializar el motor WebGL 3D en este navegador.");
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "h") {
        setControlsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handlePreset = (id: ArenaCameraPresetId) => {
    setPreset(id);
    controllerRef.current?.setPreset(id);
  };

  const handleFinish = (id: ArenaFinishId) => {
    setFinish(id);
    controllerRef.current?.setFinish(id);
  };

  const handleExplode = (val: number) => {
    setExplode(val);
    controllerRef.current?.setExplode(val);
  };

  const handleToggleRotate = () => {
    setAutoRotate((prev) => {
      const next = !prev;
      controllerRef.current?.setAutoRotate(next);
      return next;
    });
  };

  return (
    <section
      className="relative w-full overflow-hidden select-none"
      style={{ height: "calc(100vh - 64px)", minHeight: "560px", background: "#0b0c10" }}
      data-testid="arena-3d-page"
    >
      {/* Full-bleed WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Visor 3D interactivo del Trofeo Oficial VANTS GAMES"
        data-testid="arena-3d-canvas-host"
      />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#0b0c10]">
          <div className="panel max-w-md text-center space-y-3">
            <h1 className="h2">Visor 3D no disponible</h1>
            <p className="small muted">{webglError}</p>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Corner Title (no blocking card) */}
      <div className="pointer-events-none absolute top-5 left-5 sm:top-6 sm:left-7 z-10 max-w-sm">
        <div
          className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-1"
          style={{ color: "var(--rojo)", fontFamily: "var(--f-mono)" }}
        >
          VANTS ARENA 3D · TEMPORADA 4
        </div>
        <h1
          className="text-2xl sm:text-3xl font-bold uppercase tracking-tight leading-none text-white"
          style={{ fontFamily: "var(--f-display)", textShadow: "0 2px 14px rgba(0,0,0,0.8)" }}
        >
          Trofeo Oficial del Circuito
        </h1>
        <p className="text-xs sm:text-sm text-zinc-300 mt-1.5" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.9)" }}>
          Arrastra para orbitar · Rueda para zoom · Tecla H para controles
        </p>
      </div>

      {/* Unified Collapsible Bottom Control Dock (solid surface, no backdrop-filter over WebGL) */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-24px)] max-w-4xl"
        data-testid="arena-3d-dock"
      >
        <div
          className="border"
          style={{
            background: "#111217",
            borderColor: "#262833",
            boxShadow: "0 16px 40px rgba(0,0,0,0.75)",
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b" style={{ borderColor: controlsOpen ? "#22242e" : "transparent" }}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-300" style={{ fontFamily: "var(--f-mono)" }}>
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF0D2E]" aria-hidden="true" />
              <span>Controles de Escena</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleRotate}
                data-testid="arena-3d-toggle-rotate"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors cursor-pointer"
                style={{
                  background: autoRotate ? "#1d1f28" : "#14151b",
                  borderColor: autoRotate ? "#FF0D2E" : "#2c2f3b",
                  color: "#f4f4f6",
                  fontFamily: "var(--f-mono)",
                }}
              >
                {autoRotate ? <Pause className="w-3 h-3" /> : <RotateCw className="w-3 h-3" />}
                <span>{autoRotate ? "Pausar giro" : "Reanudar giro"}</span>
              </button>
              <button
                type="button"
                onClick={() => setControlsOpen((v) => !v)}
                data-testid="arena-3d-toggle-dock"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-[#2c2f3b] bg-[#161820] text-zinc-200 hover:border-zinc-400 transition-colors cursor-pointer"
                style={{ fontFamily: "var(--f-mono)" }}
              >
                {controlsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                <span>{controlsOpen ? "Ocultar" : "Mostrar"}</span>
              </button>
            </div>
          </div>

          {controlsOpen && (
            <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Camera Presets */}
              <div className="md:col-span-5">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1.5" style={{ fontFamily: "var(--f-mono)" }}>
                  Cámara
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ARENA_CAMERA_PRESETS.map((p) => {
                    const active = preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePreset(p.id)}
                        data-testid={`arena-preset-${p.id}`}
                        className="px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer"
                        style={{
                          background: active ? "#FF0D2E" : "#181a22",
                          borderColor: active ? "#FF0D2E" : "#2a2d3a",
                          color: active ? "#ffffff" : "#d4d4dc",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exploded View Slider */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400 mb-1.5" style={{ fontFamily: "var(--f-mono)" }}>
                  <span>Vista explotada</span>
                  <span className="text-zinc-200">{Math.round(explode * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explode}
                  onChange={(e) => handleExplode(Number(e.target.value))}
                  aria-label="Separación de piezas del trofeo"
                  data-testid="arena-explode-slider"
                  className="w-full accent-[#FF0D2E] cursor-pointer"
                />
              </div>

              {/* Finish Swatches */}
              <div className="md:col-span-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1.5 flex items-center gap-1" style={{ fontFamily: "var(--f-mono)" }}>
                  <Sparkles className="w-3 h-3 text-[#FF0D2E]" aria-hidden="true" />
                  <span>Acabado PBR</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ARENA_FINISH_SWATCHES.map((s) => {
                    const active = finish === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleFinish(s.id)}
                        data-testid={`arena-finish-${s.id}`}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border transition-colors cursor-pointer"
                        style={{
                          background: active ? "#222531" : "#161820",
                          borderColor: active ? "#ffffff" : "#2a2d3a",
                          color: active ? "#ffffff" : "#c7c8d1",
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 inline-block border border-white/30"
                          style={{ background: s.swatchHex }}
                        />
                        <span>{s.label.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
