/**
 * Motor 3D de insignias VANTS (Three.js, carga diferida).
 *  - renderInsignia(): un único WebGLRenderer compartido dibuja cada insignia
 *    una vez y la guarda como PNG (evita decenas de contextos WebGL).
 *  - montarVisor(): visor 3D en vivo (rotación + arrastre) para el detalle.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type DefInsignia = { code: string; color: string; forma: string; icono: string; rareza: string };

/* ---------------- formas 2D (radio 1, y hacia arriba) ---------------- */
const poly = (pts: number[][]) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
const circulo = (cx: number, cy: number, r: number) => { const s = new THREE.Shape(); s.absarc(cx, cy, r, 0, Math.PI * 2, false); return s; };
const anillo = (cx: number, cy: number, r: number, ri: number) => { const s = circulo(cx, cy, r); const h = new THREE.Path(); h.absarc(cx, cy, ri, 0, Math.PI * 2, true); s.holes.push(h); return s; };
const estrellaPts = (n: number, ro: number, ri: number, rot = Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? ri : ro; const a = rot + (i * Math.PI) / n; return [Math.cos(a) * r, Math.sin(a) * r]; });

function base(forma: string): THREE.Shape {
  switch (forma) {
    case "escudo": {
      const s = new THREE.Shape();
      s.moveTo(0, 1); s.lineTo(0.86, 0.74); s.lineTo(0.86, 0.06);
      s.quadraticCurveTo(0.82, -0.58, 0, -1); s.quadraticCurveTo(-0.82, -0.58, -0.86, 0.06);
      s.lineTo(-0.86, 0.74); s.closePath(); return s;
    }
    case "estrella": return poly(estrellaPts(12, 1, 0.84));
    case "circulo": return circulo(0, 0, 0.98);
    case "diamante": return poly([[0, 1], [0.96, 0], [0, -1], [-0.96, 0]]);
    default: return poly(Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / 3; return [Math.cos(a), Math.sin(a)]; }));
  }
}

function icono(id: string): THREE.Shape[] {
  switch (id) {
    case "v": return [poly([[-0.62, 0.55], [-0.3, 0.55], [0, -0.22], [0.3, 0.55], [0.62, 0.55], [0.13, -0.62], [-0.13, -0.62]])];
    case "rayo": return [poly([[0.16, 0.8], [-0.46, -0.06], [-0.05, -0.06], [-0.18, -0.8], [0.48, 0.14], [0.07, 0.14]])];
    case "mas": return [poly([[-0.17, 0.62], [0.17, 0.62], [0.17, 0.17], [0.62, 0.17], [0.62, -0.17], [0.17, -0.17], [0.17, -0.62], [-0.17, -0.62], [-0.17, -0.17], [-0.62, -0.17], [-0.62, 0.17], [-0.17, 0.17]])];
    case "play": return [poly([[-0.34, 0.56], [0.6, 0], [-0.34, -0.56]])];
    case "diamante": { const s = poly([[0, 0.7], [0.6, 0], [0, -0.7], [-0.6, 0]]); const h = new THREE.Path(); [[0, 0.42], [-0.36, 0], [0, -0.42], [0.36, 0]].forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y))); h.closePath(); s.holes.push(h); return [s, poly([[0, 0.2], [0.17, 0], [0, -0.2], [-0.17, 0]])]; }
    case "persona": { const b = new THREE.Shape(); b.moveTo(-0.55, -0.62); b.quadraticCurveTo(-0.52, 0.02, 0, 0.02); b.quadraticCurveTo(0.52, 0.02, 0.55, -0.62); b.closePath(); return [circulo(0, 0.34, 0.25), b]; }
    case "check": return [poly([[-0.62, 0.05], [-0.4, 0.27], [-0.14, 0.01], [0.4, 0.57], [0.62, 0.35], [-0.14, -0.44]])];
    case "anillos": return [anillo(-0.24, 0, 0.42, 0.28), anillo(0.24, 0, 0.42, 0.28)];
    case "corona": return [poly([[-0.62, -0.32], [-0.62, 0.42], [-0.3, 0.1], [0, 0.6], [0.3, 0.1], [0.62, 0.42], [0.62, -0.32]]), poly([[-0.62, -0.42], [0.62, -0.42], [0.62, -0.6], [-0.62, -0.6]])];
    case "copa": { const s = new THREE.Shape(); s.moveTo(-0.46, 0.62); s.lineTo(0.46, 0.62); s.quadraticCurveTo(0.46, -0.06, 0.1, -0.16); s.lineTo(0.1, -0.4); s.lineTo(0.32, -0.46); s.lineTo(0.32, -0.62); s.lineTo(-0.32, -0.62); s.lineTo(-0.32, -0.46); s.lineTo(-0.1, -0.4); s.lineTo(-0.1, -0.16); s.quadraticCurveTo(-0.46, -0.06, -0.46, 0.62); return [s, anillo(-0.5, 0.32, 0.22, 0.12), anillo(0.5, 0.32, 0.22, 0.12)]; }
    case "estrella": return [poly(estrellaPts(5, 0.72, 0.3))];
    case "galones": return [0.42, 0.04, -0.34].map((y) => poly([[-0.6, y], [0, y + 0.3], [0.6, y], [0.6, y - 0.17], [0, y + 0.13], [-0.6, y - 0.17]]));
    case "gema": return [poly([[-0.56, 0.24], [-0.26, 0.56], [0.26, 0.56], [0.56, 0.24], [0, -0.62]])];
    case "brazalete": { const s = new THREE.Shape(); s.absarc(0, 0, 0.62, 0.75, Math.PI * 2 - 0.75, false); s.absarc(0, 0, 0.38, Math.PI * 2 - 0.75, 0.75, true); s.closePath(); return [s]; }
    case "directo": return [circulo(0, 0, 0.2), anillo(0, 0, 0.6, 0.44)];
    case "clip": { const s = poly([[-0.64, 0.44], [0.64, 0.44], [0.64, -0.44], [-0.64, -0.44]]); const h = new THREE.Path(); [[-0.16, 0.24], [-0.16, -0.24], [0.26, 0]].forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y))); h.closePath(); s.holes.push(h); return [s]; }
    default: return [poly(estrellaPts(5, 0.6, 0.26))];
  }
}

/* ---------------- modelo 3D ---------------- */
const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function modeloInsignia(d: DefInsignia): THREE.Group {
  const g = new THREE.Group();
  const col = new THREE.Color(d.color);
  const oscuro = col.clone().multiplyScalar(0.32);
  const mythic = d.rareza === "mythic" || d.rareza === "legendary";
  const marco = new THREE.MeshPhysicalMaterial({ color: mythic ? new THREE.Color("#d9b25a") : new THREE.Color("#9aa3b5"), metalness: 1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
  const cara = new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, emissive: oscuro, emissiveIntensity: 0.35 });
  const emblema = new THREE.MeshPhysicalMaterial({ color: lum(col) > 0.55 ? new THREE.Color("#1d1405") : new THREE.Color("#f4f6fb"), metalness: 0.85, roughness: 0.2, clearcoat: 1 });
  const fondo = new THREE.MeshStandardMaterial({ color: new THREE.Color("#0c0d10"), metalness: 0.6, roughness: 0.5 });

  const forma = base(d.forma);
  const ext = (s: THREE.Shape | THREE.Shape[], depth: number, bevel: number, seg = 3) => {
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 48 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  };
  // Marco metálico
  const m1 = new THREE.Mesh(ext(forma, 0.16, 0.06, 4), marco);
  g.add(m1);
  // Ranura oscura y cara de color (ligeramente adelantadas)
  const ranura = new THREE.Mesh(ext(forma, 0.02, 0.0, 1), fondo);
  ranura.scale.set(0.86, 0.86, 1); ranura.position.z = 0.13; g.add(ranura);
  const c = new THREE.Mesh(ext(forma, 0.08, 0.035, 3), cara);
  c.scale.set(0.8, 0.8, 1); c.position.z = 0.16; g.add(c);
  // Emblema en relieve
  const e = new THREE.Mesh(ext(icono(d.icono), 0.08, 0.02, 2), emblema);
  e.scale.set(0.52, 0.52, 1); e.position.z = 0.27; g.add(e);
  // Halo de rareza
  if (mythic) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 12, 96), new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }));
    halo.position.z = -0.05; g.add(halo);
    estrellaPts(4, 1.32, 1.32, Math.PI / 4).filter((_, i) => i % 2 === 0).forEach(([x, y]) => {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 1, metalness: 0.3, roughness: 0.2 }));
      p.position.set(x, y, 0); g.add(p);
    });
  }
  return g;
}

function escena(renderer: THREE.WebGLRenderer) {
  const sc = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 3, 5); sc.add(key);
  const rim = new THREE.DirectionalLight(0xff2a44, 1.4); rim.position.set(-4, -1, -2); sc.add(rim);
  sc.add(new THREE.AmbientLight(0xffffff, 0.25));
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); cam.position.set(0, 0, 6.4);
  return { sc, cam, pm };
}

const liberar = (g: THREE.Object3D) => g.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });

/* ---------------- render estático compartido ---------------- */
let compartido: { r: THREE.WebGLRenderer; sc: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
let cola: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<string | null>>();

export function webglDisponible() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export function renderInsignia(d: DefInsignia, px = 256): Promise<string | null> {
  const k = d.code + "|" + px;
  if (cache.has(k)) return cache.get(k)!;
  const p = (cola = cola.then(async () => {
    try {
      if (!compartido) {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
        const { sc, cam } = escena(r);
        compartido = { r, sc, cam };
      }
      const { r, sc, cam } = compartido;
      r.setSize(px, px, false);
      const g = modeloInsignia(d);
      g.rotation.set(0.16, -0.42, 0.02);
      sc.add(g);
      r.setClearColor(0x000000, 0);
      r.render(sc, cam);
      const url = r.domElement.toDataURL("image/png");
      sc.remove(g); liberar(g);
      return url;
    } catch { return null; }
  })) as Promise<string | null>;
  cache.set(k, p);
  return p;
}

/* ---------------- efectos V1 (partículas, anillos, bloom, flotación) ---------------- */
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type Efectos3D = { color: THREE.Color; tamano: number; grosor: number };

/** Partículas doradas orbitando (un solo draw call, blending aditivo). */
function particulas(n = 90): { puntos: THREE.Points; datos: { th: number; ph: number; r: number; sp: number }[]; geo: THREE.BufferGeometry } {
  const datos = Array.from({ length: n }, () => ({ th: Math.random() * Math.PI * 2, ph: Math.acos(2 * Math.random() - 1), r: 1.32 + Math.random() * 0.5, sp: 0.18 + Math.random() * 0.4 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const tex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,230,180,.8)"); g.addColorStop(1, "rgba(255,200,120,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.055, map: tex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  return { puntos, datos, geo };
}

/** Aros orbitales inclinados; doble aro para meta/legendaria. */
function anillos(fx: Efectos3D, doble: boolean): THREE.Group {
  const g = new THREE.Group();
  const n = doble ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.18 + 0.24 * i, 0.017, 8, 90), new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0.85 - 0.35 * i }));
    m.rotation.x = 1.25; m.rotation.z = 0.25 * i;
    (m as any).userData.sp = 0.5 - 0.37 * i;
    g.add(m);
  }
  return g;
}

/** Onda expansiva del destello de consecución. */
function onda(fx: Efectos3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  m.rotation.x = 1.25; m.visible = false;
  return m;
}

/** Escena con bloom opcional (resplandor del emblema). */
function escenaEfectos(renderer: THREE.WebGLRenderer, camZ: number, bloom: boolean) {
  const base = escena(renderer);
  base.cam.position.set(0, 0, camZ);
  if (!bloom) return { ...base, comp: null as EffectComposer | null, bloom: null as UnrealBloomPass | null, pm: base.pm };
  const comp = new EffectComposer(renderer);
  comp.addPass(new RenderPass(base.sc, base.cam));
  const bl = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.55);
  comp.addPass(bl);
  return { sc: base.sc, cam: base.cam, pm: base.pm, comp, bloom: bl };
}

/** Relajación elástica del destello (0→1 con rebote). */
const easeOutElastic = (u: number) => (u <= 0 || u >= 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1);

/* ---------------- sello 3D del plan junto al nombre ---------------- */
export type DefSello = { code: string; color: string; trim: string; glow: number };

const SELLOS: Record<string, DefSello> = {
  SOCIO: { code: "SOCIO", color: "#ff0d2e", trim: "#f5c044", glow: 0.6 },
  PRO: { code: "PRO", color: "#ff0d2e", trim: "#ff9db0", glow: 0.55 },
  CREATOR: { code: "CREATOR", color: "#b44cff", trim: "#dcaaff", glow: 0.55 },
  PLUS: { code: "PLUS", color: "#4cc9f0", trim: "#a8e4ff", glow: 0.55 },
};
export const defSello = (s: string): DefSello => SELLOS[s.toUpperCase()] || { code: s, color: "#ff0d2e", trim: "#f5c044", glow: 0.5 };

/** Placa octogonal con la V de VANTS en relieve, como el prototipo V1. */
function modeloSello(d: DefSello): THREE.Group {
  const g = new THREE.Group();
  const oct = poly([[0.62, 0.26], [0.26, 0.62], [-0.26, 0.62], [-0.62, 0.26], [-0.62, -0.26], [-0.26, -0.62], [0.26, -0.62], [0.62, -0.26]]);
  const ext = (s: THREE.Shape, depth: number, bevel: number) => {
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    geo.center();
    return geo;
  };
  const marco = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(d.trim), metalness: 1, roughness: 0.24, clearcoat: 0.9 });
  const cara = new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#171a20"), metalness: 0.88, roughness: 0.34, clearcoat: 0.6, emissive: new THREE.Color(d.color), emissiveIntensity: d.glow * 0.3 });
  const vPlata = new THREE.MeshPhysicalMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.18, clearcoat: 1 });
  const vRojo = new THREE.MeshPhysicalMaterial({ color: 0xff2244, metalness: 0.55, roughness: 0.3, emissive: new THREE.Color(d.color), emissiveIntensity: 0.4 });
  g.add(new THREE.Mesh(ext(oct, 0.16, 0.05), marco));
  const placa = new THREE.Mesh(ext(oct, 0.1, 0.03), cara); placa.scale.set(0.86, 0.86, 1); placa.position.z = 0.06; g.add(placa);
  const vGris = new THREE.Shape(); [[-0.42, 0.36], [-0.2, 0.36], [0, -0.1], [0.2, 0.36], [0.42, 0.36], [0.12, -0.4], [-0.12, -0.4]].forEach(([x, y], i) => (i ? vGris.lineTo(x, y) : vGris.moveTo(x, y))); vGris.closePath();
  const vRoj = new THREE.Shape(); [[0.42, 0.36], [0.2, 0.36], [0.02, -0.02], [0.24, -0.02]].forEach(([x, y], i) => (i ? vRoj.lineTo(x, y) : vRoj.moveTo(x, y))); vRoj.closePath();
  const extFino = (s: THREE.Shape, mat: THREE.Material, z: number) => { const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1 }); geo.center(); const m = new THREE.Mesh(geo, mat); m.position.z = z; return m; };
  g.add(extFino(vGris, vPlata, 0.11));
  g.add(extFino(vRoj, vRojo, 0.12));
  return g;
}

/**
 * Sello 3D del plan junto al nombre (prototipo V1-Insignias-3D):
 * placa octogonal con la V, partículas, aro, flotación y destello al montar.
 * Devuelve la función de desmontaje. Sin WebGL no hace nada (el llamador
 * muestra el respaldo plano).
 */
export function montarSello(el: HTMLElement, sello: string): () => void {
  const d = defSello(sello);
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return () => {}; }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const lado = () => Math.max(36, Math.min(el.clientWidth, el.clientHeight || el.clientWidth));
  r.setSize(lado(), lado());
  r.domElement.style.display = "block";
  el.appendChild(r.domElement);
  const { sc, cam, comp, pm } = escenaEfectos(r, 3.4, true);
  const g = modeloSello(d); g.scale.setScalar(0.72); sc.add(g);
  const fx: Efectos3D = { color: new THREE.Color(d.trim === "#f5c044" ? "#ffc65e" : d.color), tamano: 0, grosor: 0 };
  const parts = particulas(56); sc.add(parts.puntos);
  const aro = anillos(fx, false); sc.add(aro);
  const shock = onda(fx); sc.add(shock);
  let ry = -0.4, tRy = 0, tRx = 0, raf = 0, t0 = performance.now(), bT0 = performance.now();
  const up = (e: PointerEvent) => { const rect = el.getBoundingClientRect(); tRy = ((e.clientX - rect.left) / rect.width - 0.5) * 0.7; tRx = ((e.clientY - rect.top) / rect.height - 0.5) * 0.3; };
  const leave = () => { tRy = 0; tRx = 0; };
  el.addEventListener("pointermove", up); el.addEventListener("pointerleave", leave);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (performance.now() - t0) / 1000); t0 = performance.now();
    if (!reduce) {
      ry += dt * 0.65;
      g.rotation.y += (ry + tRy - g.rotation.y) * 0.12;
      g.rotation.x += (tRx - g.rotation.x) * 0.1;
      g.position.y = Math.sin(performance.now() / 660) * 0.045;
      aro.children.forEach((m) => (m.rotation.z += dt * (m as any).userData.sp));
      const arr = parts.geo.attributes.position.array as Float32Array;
      parts.datos.forEach((p, i) => { p.th += p.sp * dt; arr[i * 3] = p.r * Math.sin(p.ph) * Math.cos(p.th); arr[i * 3 + 1] = p.r * Math.cos(p.ph) * 0.8; arr[i * 3 + 2] = p.r * Math.sin(p.ph) * Math.sin(p.th); });
      parts.geo.attributes.position.needsUpdate = true;
    }
    const bu = (performance.now() - bT0) / 700;
    g.scale.setScalar(0.72 * (bu < 1 ? 0.2 + 0.8 * easeOutElastic(bu) : 1));
    const su = (performance.now() - bT0 - 80) / 650;
    if (su >= 0 && su < 1) { shock.visible = true; shock.scale.setScalar(0.55 + su * 2.3); (shock.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - su); }
    else shock.visible = false;
    comp ? comp.render() : r.render(sc, cam);
  };
  loop();
  const ro = new ResizeObserver(() => r.setSize(lado(), lado())); ro.observe(el);
  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    el.removeEventListener("pointermove", up); el.removeEventListener("pointerleave", leave);
    liberar(g); parts.geo.dispose(); (parts.puntos.material as THREE.Material).dispose(); pm.dispose(); sc.environment?.dispose(); r.dispose(); r.domElement.remove();
  };
}

/* ---------------- visor en vivo ---------------- */
export function montarVisor(el: HTMLElement, d: DefInsignia, conEfectos = true): () => void {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const lado = () => Math.max(120, Math.min(el.clientWidth, el.clientHeight || el.clientWidth));
  r.setSize(lado(), lado());
  r.domElement.style.cursor = "grab"; r.domElement.style.touchAction = "none";
  el.appendChild(r.domElement);
  const { sc, cam, pm, comp } = escenaEfectos(r, 6.4, conEfectos);
  const g = modeloInsignia(d); sc.add(g);
  // Efectos V1: partículas, aros orbitales, flotación, onda de destello.
  const fx: Efectos3D = { color: new THREE.Color(d.color), tamano: 0, grosor: 0 };
  const parts = conEfectos ? particulas(120) : null;
  if (parts) sc.add(parts.puntos);
  const aro = conEfectos ? anillos(fx, d.rareza === "mythic" || d.rareza === "legendary") : null;
  if (aro) sc.add(aro);
  const shock = conEfectos ? onda(fx) : null;
  if (shock) sc.add(shock);
  let rx = 0.12, ry = -0.4, vy = 0.012, arrastre: { x: number; y: number } | null = null, raf = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const down = (e: PointerEvent) => { arrastre = { x: e.clientX, y: e.clientY }; r.domElement.setPointerCapture(e.pointerId); r.domElement.style.cursor = "grabbing"; };
  const move = (e: PointerEvent) => { if (!arrastre) return; const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y; arrastre = { x: e.clientX, y: e.clientY }; ry += dx * 0.012; rx = Math.max(-0.8, Math.min(0.8, rx + dy * 0.01)); vy = dx * 0.0015; };
  const up = () => { arrastre = null; r.domElement.style.cursor = "grab"; };
  r.domElement.addEventListener("pointerdown", down); r.domElement.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  const t0 = performance.now(), bT0 = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (performance.now() - t0) / 1000);
    if (!arrastre && !reduce) { ry += vy; vy += (0.008 - vy) * 0.02; }
    g.rotation.set(rx + (reduce ? 0 : Math.sin((performance.now() - t0) / 900) * 0.04), ry, 0);
    if (conEfectos && !reduce) {
      g.position.y = Math.sin((performance.now() - t0) / 660) * 0.05;
      if (aro) aro.children.forEach((m) => (m.rotation.z += dt * (m as any).userData.sp));
      if (parts) {
        const arr = parts.geo.attributes.position.array as Float32Array;
        parts.datos.forEach((p, i) => { p.th += p.sp * dt; arr[i * 3] = p.r * Math.sin(p.ph) * Math.cos(p.th); arr[i * 3 + 1] = p.r * Math.cos(p.ph) * 0.8; arr[i * 3 + 2] = p.r * Math.sin(p.ph) * Math.sin(p.th); });
        parts.geo.attributes.position.needsUpdate = true;
      }
    }
    // Destello de consecución al abrir el visor.
    if (shock) {
      const su = (performance.now() - bT0 - 60) / 650;
      if (su >= 0 && su < 1) { shock.visible = true; shock.scale.setScalar(0.55 + su * 2.3); (shock.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - su); }
      else shock.visible = false;
    }
    comp ? comp.render() : r.render(sc, cam);
  };
  loop();
  const ro = new ResizeObserver(() => r.setSize(lado(), lado())); ro.observe(el);
  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    r.domElement.removeEventListener("pointerdown", down); r.domElement.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    liberar(g);
    if (parts) { parts.geo.dispose(); (parts.puntos.material as THREE.Material).dispose(); }
    pm.dispose(); sc.environment?.dispose(); r.dispose(); r.domElement.remove();
  };
}
