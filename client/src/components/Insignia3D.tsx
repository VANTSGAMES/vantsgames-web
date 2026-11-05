/**
 * Insignias VANTS en 3D (Three.js) con respaldo 2D en SVG.
 * El motor (lib/insignia3d.ts) se carga solo cuando hay insignias en pantalla.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/lib/useApi";
import type { DefInsignia } from "@/lib/insignia3d";

export type Insignia = DefInsignia & {
  nombre: string; categoria: string; descripcion: string; requisito: string; titulares?: number; manual?: boolean; meta?: number;
};
export type EstadoInsignia = { code: string; ok: boolean; progreso?: { actual: number; meta: number }; manual?: boolean };

const motor = () => import("@/lib/insignia3d");

/** Silueta 2D (respaldo sin WebGL y marcador mientras se renderiza). */
function Insignia2D({ d, size }: { d: DefInsignia; size: number }) {
  const formas: Record<string, string> = {
    hex: "50,4 90,27 90,73 50,96 10,73 10,27",
    diamante: "50,3 97,50 50,97 3,50",
  };
  const escudo = "M50 4 L90 16 L90 50 Q88 80 50 96 Q12 80 10 50 L10 16 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={"g-" + d.code.replace(/\W/g, "")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".45" stopColor={d.color} /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
      </defs>
      {d.forma === "escudo" ? <path d={escudo} fill={d.color} stroke="#c9ced8" strokeWidth="4" /> : d.forma === "circulo" || d.forma === "estrella" ? <circle cx="50" cy="50" r="45" fill={d.color} stroke="#c9ced8" strokeWidth="4" /> : <polygon points={formas[d.forma] || formas.hex} fill={d.color} stroke="#c9ced8" strokeWidth="4" />}
      {d.forma === "escudo" ? <path d={escudo} fill={"url(#g-" + d.code.replace(/\W/g, "") + ")"} opacity=".6" /> : null}
      <text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" fontFamily="system-ui">{d.code.slice(0, 2)}</text>
    </svg>
  );
}

/** Insignia 3D estática (PNG renderizado una vez con Three.js). */
export function Insignia3D({ d, size = 72, conseguida = true, titulo }: { d: DefInsignia; size?: number; conseguida?: boolean; titulo?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    motor().then((m) => (m.webglDisponible() ? m.renderInsignia(d, size > 96 ? 512 : 256) : null)).then((u) => { if (vivo) { if (u) setSrc(u); else setFallo(true); } }).catch(() => vivo && setFallo(true));
    return () => { vivo = false; };
  }, [d.code, size > 96]);
  const estilo = { width: size, height: size, filter: conseguida ? "drop-shadow(0 6px 14px rgba(0,0,0,.55))" : "grayscale(1) brightness(.45)", opacity: conseguida ? 1 : 0.7 } as const;
  return (
    <span className="inline-block shrink-0 relative" style={{ width: size, height: size }} title={titulo} data-testid={"insignia3d-" + d.code}>
      {src ? <SelloBrillo src={src} color={d.color}><img src={src} alt={titulo || d.code} width={size} height={size} style={estilo} draggable={false} /></SelloBrillo> : <span style={{ ...estilo, display: "block", opacity: fallo ? estilo.opacity : 0.35 }}><Insignia2D d={d} size={size} /></span>}
      {!conseguida && <span className="absolute inset-0 flex items-center justify-center" aria-hidden><svg width={size * 0.28} height={size * 0.28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" fill="rgba(0,0,0,.5)" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>}
    </span>
  );
}

/** Visor 3D en vivo: gira solo y se puede arrastrar. */
export function VisorInsignia({ d, size = 260 }: { d: DefInsignia; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sin, setSin] = useState(false);
  useEffect(() => {
    let fin: (() => void) | null = null, vivo = true;
    motor().then((m) => { if (!vivo || !ref.current) return; if (!m.webglDisponible()) { setSin(true); return; } fin = m.montarVisor(ref.current, d); }).catch(() => setSin(true));
    return () => { vivo = false; fin && fin(); };
  }, [d.code]);
  return <div ref={ref} style={{ width: size, height: size }} className="mx-auto flex items-center justify-center" aria-label={"Insignia " + d.code + " en 3D"}>{sin && <Insignia3D d={d} size={size} />}</div>;
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
        <p className="text-xs muted">Arrastra para girarla.</p>
      </div>
    </div>
  );
}

/* ---------------- sello del plan (V1 · como el preview) ---------------- */

/** Definiciones del sello de cada plan. */
const SELLOS: Record<string, DefInsignia> = {
  SOCIO: { code: "sello-socio", color: "#ff0d2e", forma: "escudo", icono: "v", rareza: "mythic", sinHalo: true },
  CREATOR: { code: "sello-creator", color: "#b44cff", forma: "hex", icono: "play", rareza: "epic" },
  PRO: { code: "sello-pro", color: "#ff2d4a", forma: "hex", icono: "rayo", rareza: "epic" },
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

/** Sello 3D del plan junto al nombre: PNG renderizado una vez + brillo CSS (como el preview). */
export function Sello3D({ s, size = 26 }: { s: string | null | undefined; size?: number }) {
  const d = s ? SELLOS[s.toUpperCase()] : undefined;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!d) return;
    motor().then((m) => (m.webglDisponible() ? m.renderInsignia(d, 256) : null)).then((u) => { if (vivo && u) setSrc(u); }).catch(() => {});
    return () => { vivo = false; };
  }, [d?.code]);
  if (!s) return null;
  if (!d || !src) return <Sello s={s} />;
  return (
    <SelloBrillo src={src} color={d.color}>
      <img src={src} alt={"Sello " + s} width={size} height={size} style={{ width: size, height: size, filter: "drop-shadow(0 3px 8px rgba(0,0,0,.45))" }} title={"Sello " + s} data-testid={"sello-" + s} draggable={false} />
    </SelloBrillo>
  );
}

/** Sello del plan en la esquina del avatar (como el preview). */
export function SelloAvatar({ s, size = 36 }: { s: string | null | undefined; size?: number }) {
  const d = s ? SELLOS[s.toUpperCase()] : undefined;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!d) return;
    motor().then((m) => (m.webglDisponible() ? m.renderInsignia(d, 256) : null)).then((u) => { if (vivo && u) setSrc(u); }).catch(() => {});
    return () => { vivo = false; };
  }, [d?.code]);
  if (!s || !d || !src) return null;
  const p = Math.round(size * 0.22), inner = size - 8;
  return (
    <span className="absolute z-10 grid place-items-center rounded-full" style={{ top: -p, right: -p, width: size, height: size, background: "var(--grafito-1, #111318)", border: "2px solid rgba(255,255,255,.16)", boxShadow: "0 4px 12px rgba(0,0,0,.6)" }} title={"Plan " + s} data-testid={"sello-avatar-" + s}>
      <SelloBrillo src={src} color={d.color}>
        <img src={src} alt={"Plan " + s} width={inner} height={inner} style={{ width: inner, height: inner }} draggable={false} />
      </SelloBrillo>
    </span>
  );
}
