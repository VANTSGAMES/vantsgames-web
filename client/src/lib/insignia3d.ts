/**
 * Motor 3D de insignias VANTS · V1 (Three.js, carga diferida).
 * Mismo visor que el diseño "V1 Insignias 3D": placa extruida de metal PBR con
 * el borde del color de la insignia, cara con el emblema V1 (lib/emblemaV1.ts),
 * glifo emisivo con resplandor (bloom), giro + flotación y entrada con
 * destello (escala elástica). Sin anillos ni partículas.
 * Las insignias estáticas NO usan este motor: son PNG en /insignias/<slug>.png.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { DEF_V1, VS, VR, shapePts, canvasEmblema, type DefV1 } from "./emblemaV1";

export type DefInsignia = { code: string; color: string; forma: string; icono: string; rareza: string; sinHalo?: boolean };

export function webglDisponible() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const elastico = (u: number) => (u === 0 || u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

function forma3(b: DefV1) {
  if (b.sh === "circle") { const s = new THREE.Shape(); s.absarc(50, 50, 46, 0, Math.PI * 2, false); return s; }
  return new THREE.Shape(shapePts(b.sh)!.map((q) => new THREE.Vector2(q[0], q[1])));
}

function modelo(b: DefV1) {
  const geo = new THREE.ExtrudeGeometry(forma3(b), { depth: 8, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 2, bevelSegments: 2, curveSegments: b.sh === "circle" ? 48 : 6 });
  geo.center();
  // El canvas está en y-abajo; la geometría en y-arriba: se voltea con la UV.
  const tex = (em: boolean) => { const t = new THREE.CanvasTexture(canvasEmblema(b, 512, { em })); t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(0.01, -0.01); t.offset.set(0, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const cara = new THREE.MeshPhysicalMaterial({ map: tex(false), emissiveMap: tex(true), emissive: new THREE.Color(0xffffff), emissiveIntensity: b.glow, metalness: 0.88, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const lado = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(b.trim), metalness: 1, roughness: 0.24, clearcoat: 0.9 });
  const mesh = new THREE.Mesh(geo, [cara, lado]);
  mesh.scale.set(0.019, -0.019, 0.019); // y-abajo del diseño → y-arriba
  const g = new THREE.Group(); g.add(mesh);
  if (b.gl === "v") {
    const mkv = (pts: number[][], mat: THREE.Material) => {
      const g2 = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 1 });
      g2.translate(-50, -50, 0);
      const m2 = new THREE.Mesh(g2, mat); m2.position.z = 6.3; return m2;
    };
    mesh.add(mkv(VS, new THREE.MeshPhysicalMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.18, clearcoat: 1 })));
    mesh.add(mkv(VR, new THREE.MeshPhysicalMaterial({ color: 0xff2244, metalness: 0.55, roughness: 0.3, emissive: 0xff0d2e, emissiveIntensity: 0.4 })));
  }
  return g;
}

const liberar = (g: THREE.Object3D) => g.traverse((o: any) => {
  if (o.geometry) o.geometry.dispose();
  const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
  ms.forEach((m: any) => { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); });
});

export type OpcionesVisor = { arrastre?: boolean; destello?: boolean; flotar?: boolean; velocidad?: number; resplandor?: boolean };

/**
 * Visor 3D en vivo. `code` = código de la API (SOCIO, "TOP 10", FORTNITE…).
 * Devuelve: { destello(), fin() }.
 */
export function montarVisor(el: HTMLElement, code: string, o: OpcionesVisor = {}) {
  const b = DEF_V1[code.toUpperCase()] || DEF_V1.MEMBER;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 1);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
  r.domElement.style.width = "100%"; r.domElement.style.height = "100%"; r.domElement.style.display = "block";
  // El bloom no conserva el alfa: fondo negro + "lighten" para que solo se vea la insignia y su resplandor.
  r.domElement.style.mixBlendMode = "lighten";
  const mask = "radial-gradient(circle at 50% 50%, #000 52%, transparent 71%)";
  r.domElement.style.maskImage = mask; (r.domElement.style as any).webkitMaskImage = mask;
  if (o.arrastre) { r.domElement.style.cursor = "grab"; r.domElement.style.touchAction = "none"; }
  el.appendChild(r.domElement);
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60); cam.position.set(0, 0, 4.35);
  const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  sc.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(2.5, 3, 4); sc.add(key);
  const rim = new THREE.PointLight(0xff2a47, 7, 14); rim.position.set(-2.5, -1.5, 2); sc.add(rim);
  const holder = new THREE.Group(); sc.add(holder);
  const g = modelo(b); holder.add(g);
  const ctl = o.arrastre ? new OrbitControls(cam, r.domElement) : null;
  if (ctl) { ctl.enablePan = false; ctl.enableZoom = false; ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.autoRotate = !reduce; ctl.autoRotateSpeed = 9 * (o.velocidad || 1); /* ≈ 1 rad/s con update(dt) */ }
  const comp = new EffectComposer(r); comp.addPass(new RenderPass(sc, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.55); comp.addPass(bloom); comp.addPass(new OutputPass());
  const conBloom = o.resplandor !== false;

  const resize = () => { const w = el.clientWidth || 120, h = el.clientHeight || w; r.setSize(w, h, false); comp.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  resize(); const ro = new ResizeObserver(resize); ro.observe(el);

  let t = 0, rotY = -0.4, bT0 = o.destello === false || reduce ? -1e9 : performance.now(), raf = 0, visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
  const clock = new THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible) return;
    const bu = (performance.now() - bT0) / 700;
    holder.scale.setScalar(bu < 1 ? 0.98 * (0.2 + 0.8 * elastico(Math.max(0, bu))) : 0.98);
    bloom.strength = 0.55 + 1.6 * Math.max(0, 1 - bu); // destello de entrada
    if (!reduce) {
      t += dt;
      if (ctl) ctl.update(dt); else { rotY += dt * 1.1 * (o.velocidad || 1); holder.rotation.y += (rotY - holder.rotation.y) * 0.12; }
      holder.position.y = o.flotar === false ? 0 : Math.sin(t * 1.5) * 0.06;
    } else if (ctl) ctl.update(dt);
    if (conBloom) comp.render(); else r.render(sc, cam);
  };
  loop();
  return {
    destello: () => { bT0 = performance.now(); },
    fin: () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); ctl?.dispose(); liberar(g); comp.dispose(); pm.dispose(); sc.environment?.dispose(); r.dispose(); r.domElement.remove(); },
  };
}
