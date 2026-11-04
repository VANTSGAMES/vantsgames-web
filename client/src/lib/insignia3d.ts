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

/* ---------------- visor en vivo ---------------- */
export function montarVisor(el: HTMLElement, d: DefInsignia): () => void {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const lado = () => Math.max(120, Math.min(el.clientWidth, el.clientHeight || el.clientWidth));
  r.setSize(lado(), lado());
  r.domElement.style.cursor = "grab"; r.domElement.style.touchAction = "none";
  el.appendChild(r.domElement);
  const { sc, cam, pm } = escena(r);
  const g = modeloInsignia(d); sc.add(g);
  let rx = 0.12, ry = -0.4, vy = 0.012, arrastre: { x: number; y: number } | null = null, raf = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const down = (e: PointerEvent) => { arrastre = { x: e.clientX, y: e.clientY }; r.domElement.setPointerCapture(e.pointerId); r.domElement.style.cursor = "grabbing"; };
  const move = (e: PointerEvent) => { if (!arrastre) return; const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y; arrastre = { x: e.clientX, y: e.clientY }; ry += dx * 0.012; rx = Math.max(-0.8, Math.min(0.8, rx + dy * 0.01)); vy = dx * 0.0015; };
  const up = () => { arrastre = null; r.domElement.style.cursor = "grab"; };
  r.domElement.addEventListener("pointerdown", down); r.domElement.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  const t0 = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!arrastre && !reduce) { ry += vy; vy += (0.008 - vy) * 0.02; }
    g.rotation.set(rx + (reduce ? 0 : Math.sin((performance.now() - t0) / 900) * 0.04), ry, 0);
    r.render(sc, cam);
  };
  loop();
  const ro = new ResizeObserver(() => r.setSize(lado(), lado())); ro.observe(el);
  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    r.domElement.removeEventListener("pointerdown", down); r.domElement.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    liberar(g); pm.dispose(); sc.environment?.dispose(); r.dispose(); r.domElement.remove();
  };
}
