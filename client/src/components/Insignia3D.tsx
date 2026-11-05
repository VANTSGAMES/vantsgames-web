/**
 * Insignias VANTS en 3D (Three.js) con respaldo 2D en SVG.
 * El motor (lib/insignia3d.ts) se carga solo cuando hay insignias en pantalla.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/lib/useApi";
import type { DefInsignia } from "@/lib/insignia3d";
import { DEF_V1, slugInsignia } from "@/lib/emblemaV1";
import { pub } from "@/lib/api";

export type Insignia = DefInsignia & {
  nombre: string; categoria: string; descripcion: string; requisito: string; titulares?: number; manual?: boolean; meta?: number;
};
export type EstadoInsignia = { code: string; ok: boolean; progreso?: { actual: number; meta: number }; manual?: boolean };

const motor = () => import("@/lib/insignia3d");

/** PNG oficial V1 de la insignia (client/public/insignias, generado con script/insignias-png.mjs). */
export function pngInsignia(code: string, size: number, conseguida = true) {
  const s = slugInsignia(code);
  return pub("insignias/" + s + (conseguida ? (size > 128 ? "" : "-256") : "-bloqueada") + ".png");
}

/** Insignia estática: PNG del diseño V1 + brillo CSS (aura, barrido y destello). */
export function Insignia3D({ d, size = 72, conseguida = true, titulo }: { d: DefInsignia; size?: number; conseguida?: boolean; titulo?: string }) {
  const [fallo, setFallo] = useState(false);
  const src = pngInsignia(d.code, size, conseguida);
  const color = (DEF_V1[d.code.toUpperCase()]?.col) || d.color;
  const img = <img src={src} alt={titulo || d.code} width={size} height={size} loading="lazy" decoding="async" onError={() => setFallo(true)} style={{ width: size, height: size, filter: conseguida ? "drop-shadow(0 6px 14px rgba(0,0,0,.55))" : "none" }} draggable={false} />;
  return (
    <span className="inline-block shrink-0 relative" style={{ width: size, height: size }} title={titulo} data-testid={"insignia3d-" + d.code}>
      {fallo ? <span className="grid place-items-center rounded-full font-bold" style={{ width: size, height: size, fontSize: size * 0.3, background: "#111318", border: "2px solid " + color, color, opacity: conseguida ? 1 : 0.5 }}>{d.code.slice(0, 2)}</span> : conseguida ? <SelloBrillo src={src} color={color}>{img}</SelloBrillo> : img}
    </span>
  );
}

/** Visor 3D en vivo (motor V1): entra con destello, gira solo y se puede arrastrar. */
export function VisorInsignia({ d, size = 260, arrastre = true }: { d: DefInsignia; size?: number; arrastre?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const visor = useRef<{ destello: () => void; fin: () => void } | null>(null);
  const [sin, setSin] = useState(false);
  useEffect(() => {
    let vivo = true;
    motor().then((m) => { if (!vivo || !ref.current) return; if (!m.webglDisponible()) { setSin(true); return; } visor.current = m.montarVisor(ref.current, d.code, { arrastre }); }).catch(() => setSin(true));
    return () => { vivo = false; visor.current?.fin(); visor.current = null; };
  }, [d.code]);
  return (
    <div ref={ref} style={{ width: size, height: size }} className="mx-auto relative" aria-label={"Insignia " + d.code + " en 3D"} onDoubleClick={() => visor.current?.destello()} data-testid={"visor3d-" + d.code}>
      {sin && <Insignia3D d={d} size={size} />}
    </div>
  );
}

/** Catálogo público de insignias. */
export function useCatalogoInsignias() {
  return useApi<{ catalogo: Insignia[] }>("/int/insignias");
}

const RAREZA: Record<string, string> = { common: "Común", rare: "Rara", epic: "Épica", legendary: "Legendaria", mythic: "Mítica" };
export const rareza = (r: string) => RAREZA[r] || r;

/** Fila de insignias conseguidas (perfil y ficha pública). */
export function FilaInsignias({ codes, size = 56, vacio }: { codes: string[]; size?: number; vacio?: string }) {
  const cat = useCatalogoInsignias();
  const [abierta, setAbierta] = useState<Insignia | null>(null);
  const xs = (cat.data?.catalogo || []).filter((b) => codes.includes(b.code));
  if (cat.isLoading) return <div className="flex gap-2">{Array.from({ length: 5 }, (_, i) => <span key={i} className="sk" style={{ width: size, height: size }} />)}</div>;
  if (!xs.length) return <p className="small muted">{vacio || "Sin insignias todavía."}</p>;
  return (
    <>
      <div className="flex flex-wrap gap-3" data-testid="fila-insignias">
        {xs.map((b) => (
          <button key={b.code} type="button" onClick={() => setAbierta(b)} className="grid justify-items-center gap-1 hover:-translate-y-0.5 transition-transform" title={b.nombre}>
            <Insignia3D d={b} size={size} titulo={b.nombre} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: b.color }}>{b.nombre}</span>
          </button>
        ))}
      </div>
      {abierta && <DetalleInsignia b={abierta} conseguida onCerrar={() => setAbierta(null)} />}
    </>
  );
}

export function DetalleInsignia({ b, conseguida, estado, onCerrar, sinEstado }: { b: Insignia; conseguida: boolean; estado?: EstadoInsignia; onCerrar: () => void; sinEstado?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onCerrar(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label={"Insignia " + b.nombre} className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(5,5,7,.82)", backdropFilter: "blur(6px)" }} onClick={onCerrar}>
      <div className="panel panel-pad w-full max-w-md grid gap-4 text-center relative" onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 0 0 1px " + b.color + "55, 0 30px 80px -20px " + b.color + "66" }}>
        <button className="absolute right-3 top-3 text-xl muted hover:text-white" onClick={onCerrar} aria-label="Cerrar">×</button>
        <VisorInsignia d={b} size={240} />
        <div>
          <div className="d-2" style={{ color: b.color }}>{b.nombre}</div>
          <div className="flex justify-center gap-1.5 mt-2"><span className="tag">{rareza(b.rareza)}</span>{sinEstado ? null : conseguida ? <span className="tag" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Conseguida</span> : <span className="tag">Bloqueada</span>}{b.manual && <span className="tag">Por invitación</span>}</div>
        </div>
        <p className="small">{b.descripcion}</p>
        <p className="small muted">Requisito: {b.requisito}</p>
        {estado?.progreso && !conseguida && (
          <div className="grid gap-1 text-left">
            <div className="flex justify-between text-xs muted"><span>Progreso</span><span className="num">{estado.progreso.actual} / {estado.progreso.meta}</span></div>
            <div style={{ height: 6, background: "var(--grafito-3, #222)" }}><div style={{ height: 6, width: (100 * estado.progreso.actual) / estado.progreso.meta + "%", background: b.color }} /></div>
          </div>
        )}
        {typeof b.titulares === "number" && <p className="text-xs muted">{b.titulares === 1 ? "1 jugador la tiene" : b.titulares + " jugadores la tienen"}</p>}
        <p className="text-xs muted">Arrastra para girarla · doble clic para el destello.</p>
      </div>
    </div>
  );
}

/* ---------------- sello del plan (V1 · como el preview) ---------------- */

/** Sello de cada plan = su insignia V1. */
const SELLOS: Record<string, DefInsignia> = {
  SOCIO: { code: "SOCIO", color: "#FF0D2E", forma: "oct", icono: "v", rareza: "mythic" },
  CREATOR: { code: "CREATOR", color: "#B44CFF", forma: "hex", icono: "play", rareza: "epic" },
  PRO: { code: "PRO", color: "#FF0D2E", forma: "hex", icono: "zap", rareza: "epic" },
};
/** Brillo del sello/insignia: aura que respira + barrido de luz (CSS puro, sin canvas). */
export function SelloBrillo({ src, color, children }: { src: string; color: string; children: ReactNode }) {
  const rgba = (hex: string, a: number) => { const f = parseInt(hex.slice(1), 16); return `rgba(${(f >> 16) & 255},${(f >> 8) & 255},${f & 255},${a})`; };
  return (
    <span className="sello-brillo" style={{ "--sello-glow": rgba(color, 0.42) } as React.CSSProperties}>
      <span className="aura" aria-hidden />
      {children}
      <span className="brillo" aria-hidden style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }} />
    </span>
  );
}

/** Sello plano de respaldo (sin WebGL). */
export function Sello({ s }: { s: string | null | undefined }) {
  if (!s) return null;
  const c = s === "SOCIO" ? "#ff0d2e" : s === "CREATOR" ? "#b44cff" : "#ff2d4a";
  return <span className="tag" style={{ color: "#fff", background: c, borderColor: c, letterSpacing: ".08em" }} title={"Sello " + s} data-testid={"sello-" + s}>{s}</span>;
}

/** Sello del plan junto al nombre: PNG V1 + entrada 3D con destello (como el video) + brillo CSS. Clic → visor 3D. */
export function Sello3D({ s, size = 26 }: { s: string | null | undefined; size?: number }) {
  const d = s ? SELLOS[s.toUpperCase()] : undefined;
  const [abierto, setAbierto] = useState(false);
  if (!s) return null;
  if (!d) return <Sello s={s} />;
  const src = pngInsignia(d.code, size * 2);
  return (
    <>
      <button type="button" className="sello-entrada inline-grid" onClick={() => setAbierto(true)} title={"Sello " + s + " · ver en 3D"} aria-label={"Sello " + s + ", ver en 3D"}>
        <SelloBrillo src={src} color={d.color}>
          <img src={src} alt={"Sello " + s} width={size} height={size} style={{ width: size, height: size, filter: "drop-shadow(0 3px 8px rgba(0,0,0,.45))" }} data-testid={"sello-" + s} draggable={false} />
        </SelloBrillo>
      </button>
      {abierto && <VisorModal d={d} titulo={s === "CREATOR" ? "VANTS CREADOR" : s === "SOCIO" ? "SOCIO VANTS" : "VANTS PRO"} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

/** Visor 3D a pantalla completa del sello del plan. */
function VisorModal({ d, titulo, onCerrar }: { d: DefInsignia; titulo: string; onCerrar: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onCerrar(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label={"Sello " + titulo} className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(5,5,7,.86)", backdropFilter: "blur(6px)" }} onClick={onCerrar}>
      <div className="grid gap-3 text-center" onClick={(e) => e.stopPropagation()}>
        <VisorInsignia d={d} size={320} />
        <div className="d-2" style={{ color: d.color }}>{titulo}</div>
        <p className="text-xs muted">Arrastra para girarlo · doble clic para el destello · Esc para cerrar</p>
      </div>
    </div>
  );
}

/** Sello del plan en la esquina del avatar. */
export function SelloAvatar({ s, size = 36 }: { s: string | null | undefined; size?: number }) {
  const d = s ? SELLOS[s.toUpperCase()] : undefined;
  if (!s || !d) return null;
  const p = Math.round(size * 0.22), inner = size - 8;
  const src = pngInsignia(d.code, inner * 2);
  return (
    <span className="absolute z-10 grid place-items-center rounded-full sello-entrada" style={{ top: -p, right: -p, width: size, height: size, background: "var(--grafito-1, #111318)", border: "2px solid rgba(255,255,255,.16)", boxShadow: "0 4px 12px rgba(0,0,0,.6)" }} title={"Plan " + s} data-testid={"sello-avatar-" + s}>
      <SelloBrillo src={src} color={d.color}>
        <img src={src} alt={"Plan " + s} width={inner} height={inner} style={{ width: inner, height: inner }} draggable={false} />
      </SelloBrillo>
    </span>
  );
}
