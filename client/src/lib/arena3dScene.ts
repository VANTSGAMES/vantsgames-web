import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  ARENA_CAMERA_PRESETS,
  ARENA_FINISH_SWATCHES,
  clampExplode,
  type ArenaCameraPresetId,
  type ArenaFinishId,
} from "./studioHelpers";

export interface Arena3DController {
  setPreset: (id: ArenaCameraPresetId) => void;
  setFinish: (id: ArenaFinishId) => void;
  setExplode: (amount: number) => void;
  setAutoRotate: (enabled: boolean) => void;
  isSoftwareGl: boolean;
  dispose: () => void;
}

function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const info = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  return /SwiftShader|llvmpipe|Software|Mesa/i.test(info);
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = 110 + Math.floor(Math.sin(y * 0.7) * 18 + (Math.random() - 0.5) * 36);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createArenaFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  const cx = 512;
  const cy = 512;
  const bgGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 512);
  bgGrad.addColorStop(0, "#1c1e26");
  bgGrad.addColorStop(0.55, "#11131a");
  bgGrad.addColorStop(1, "#0b0c10");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle tactical grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
  ctx.lineWidth = 1;
  const step = 64;
  for (let i = 0; i <= 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Concentric esports stage rings
  const radii = [160, 250, 340, 440];
  radii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx === 1 ? "rgba(255, 13, 46, 0.36)" : "rgba(255, 255, 255, 0.11)";
    ctx.lineWidth = idx === 1 ? 3 : 1.5;
    ctx.stroke();
  });

  // Soft contact shadow right beneath trophy pedestal
  const shadowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 185);
  shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.72)");
  shadowGrad.addColorStop(0.65, "rgba(0, 0, 0, 0.32)");
  shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 185, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVEmblemShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.56, 0.76);
  s.lineTo(-0.24, 0.76);
  s.lineTo(0, 0.04);
  s.lineTo(0.24, 0.76);
  s.lineTo(0.56, 0.76);
  s.lineTo(0.14, -0.46);
  s.lineTo(-0.14, -0.46);
  s.closePath();
  return s;
}

function createWingFinShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.74, 0.34);
  s.lineTo(0.92, 1.56);
  s.lineTo(0.52, 1.88);
  s.lineTo(0.16, 0.88);
  s.lineTo(0, 0.44);
  s.closePath();
  return s;
}

export function mountArena3DScene(container: HTMLElement): Arena3DController {
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 320);

  // Probe WebGL context flags for software GL fallback
  const probeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  const isSoftwareGl = detectSoftwareGl(probeRenderer);
  let renderer = probeRenderer;
  if (isSoftwareGl) {
    probeRenderer.dispose();
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "default" });
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isSoftwareGl;
  if (!isSoftwareGl) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color("#0b0c10");
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2("#0b0c10", 0.022);

  // Image-Based Lighting via RoomEnvironment on all devices (essential for metallic PBR)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.82;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
  camera.position.set(...ARENA_CAMERA_PRESETS[0].position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3.6;
  controls.maxDistance = 16.5;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.target.set(...ARENA_CAMERA_PRESETS[0].target);
  controls.update();

  // Three-point + hemisphere studio lighting (warm key + cool fill + VANTS red rim)
  const hemiLight = new THREE.HemisphereLight(0x88b4ff, 0x161820, 0.95);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff1df, 2.7);
  keyLight.position.set(6.5, 11.5, 7.5);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xff2a48, 1.55);
  rimLight.position.set(-7.5, 5.2, -6.5);
  scene.add(rimLight);

  const underAccentLight = new THREE.PointLight(0xff0d2e, 2.4, 10, 1.6);
  underAccentLight.position.set(0, 1.15, 0);
  scene.add(underAccentLight);

  // Procedural PBR textures
  const brushedRoughness = createBrushedMetalTexture();
  const floorTex = createArenaFloorTexture();

  // Grounded Arena Floor (y = 0)
  const floorGeo = new THREE.CircleGeometry(18, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.72,
    metalness: 0.18,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = !isSoftwareGl;
  scene.add(floorMesh);

  // Shared materials driven by Finish Swatches
  const primaryMetalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ARENA_FINISH_SWATCHES[0].bodyHex),
    metalness: ARENA_FINISH_SWATCHES[0].metalness,
    roughness: ARENA_FINISH_SWATCHES[0].roughness,
    roughnessMap: brushedRoughness,
  });

  const secondaryMetalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2a2e39"),
    metalness: 0.88,
    roughness: 0.28,
    roughnessMap: brushedRoughness,
  });

  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#14161d"),
    metalness: 0.35,
    roughness: 0.62,
  });

  const accentGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ARENA_FINISH_SWATCHES[0].accentHex),
    emissive: new THREE.Color(ARENA_FINISH_SWATCHES[0].accentHex),
    emissiveIntensity: 1.45,
    metalness: 0.2,
    roughness: 0.25,
  });

  const crystalCoreMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#d9e4ff"),
    metalness: 0.12,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.86,
  });

  // Composite Trophy & Tactical Pedestal Assembly (grounded at y = 0)
  const trophyRoot = new THREE.Group();
  scene.add(trophyRoot);

  interface ExplodablePart {
    mesh: THREE.Object3D;
    basePos: THREE.Vector3;
    explodeOffset: THREE.Vector3;
  }
  const parts: ExplodablePart[] = [];
  const registerPart = (mesh: THREE.Object3D, explodeOffset: THREE.Vector3) => {
    trophyRoot.add(mesh);
    parts.push({ mesh, basePos: mesh.position.clone(), explodeOffset });
  };

  // Part 1: Octagonal lower podium base (height 0.38 -> center at y = 0.19 -> bottom flush at y = 0)
  const baseLower = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.75, 0.38, 8), darkCarbonMat);
  baseLower.position.set(0, 0.19, 0);
  baseLower.castShadow = !isSoftwareGl;
  baseLower.receiveShadow = !isSoftwareGl;
  registerPart(baseLower, new THREE.Vector3(0, -0.05, 0));

  // Part 2: Chamfered upper tactical plinth
  const baseUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.05, 0.32, 8), secondaryMetalMat);
  baseUpper.position.set(0, 0.54, 0);
  baseUpper.castShadow = !isSoftwareGl;
  baseUpper.receiveShadow = !isSoftwareGl;
  registerPart(baseUpper, new THREE.Vector3(0, 0.22, 0));

  // Part 3: Recessed glowing base ring
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.045, 16, 64), accentGlowMat);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.set(0, 0.7, 0);
  registerPart(baseRing, new THREE.Vector3(0, 0.48, 0));

  // Part 4: Sculpted championship stem (LatheGeometry)
  const stemPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.92, 0.0),
    new THREE.Vector2(0.84, 0.16),
    new THREE.Vector2(0.46, 0.42),
    new THREE.Vector2(0.32, 0.85),
    new THREE.Vector2(0.42, 1.18),
    new THREE.Vector2(0.68, 1.36),
    new THREE.Vector2(0.0, 1.36),
  ];
  const stemMesh = new THREE.Mesh(new THREE.LatheGeometry(stemPoints, 32), primaryMetalMat);
  stemMesh.position.set(0, 0.7, 0);
  stemMesh.castShadow = !isSoftwareGl;
  registerPart(stemMesh, new THREE.Vector3(0, 0.72, 0));

  // Part 5: Sculpted outer chalice cup (LatheGeometry)
  const cupPoints = [
    new THREE.Vector2(0.32, 0.0),
    new THREE.Vector2(0.68, 0.14),
    new THREE.Vector2(1.06, 0.58),
    new THREE.Vector2(1.18, 1.28),
    new THREE.Vector2(1.06, 1.54),
    new THREE.Vector2(0.95, 1.54),
    new THREE.Vector2(1.04, 1.24),
    new THREE.Vector2(0.88, 0.62),
    new THREE.Vector2(0.48, 0.2),
    new THREE.Vector2(0.0, 0.12),
  ];
  const cupMesh = new THREE.Mesh(new THREE.LatheGeometry(cupPoints, 40), primaryMetalMat);
  cupMesh.position.set(0, 1.98, 0);
  cupMesh.castShadow = !isSoftwareGl;
  registerPart(cupMesh, new THREE.Vector3(0, 1.25, 0));

  // Part 6: Extruded VANTS "V" Emblem Core crowning the chalice in full silhouette
  const vGeo = new THREE.ExtrudeGeometry(createVEmblemShape(), {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.045,
    bevelSegments: 4,
  });
  vGeo.center();
  const vEmblem = new THREE.Mesh(vGeo, accentGlowMat);
  vEmblem.position.set(0, 3.68, 0);
  vEmblem.castShadow = !isSoftwareGl;
  registerPart(vEmblem, new THREE.Vector3(0, 1.45, 0));

  // Part 7: Translucent crystal energy core behind the V emblem
  const crystalCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalCoreMat);
  crystalCore.position.set(0, 3.68, -0.24);
  crystalCore.scale.set(0.85, 1.35, 0.55);
  registerPart(crystalCore, new THREE.Vector3(0, 1.95, -0.35));

  // Part 8 & 9: Mirrored Aerodynamic Wing Fins
  const wingGeo = new THREE.ExtrudeGeometry(createWingFinShape(), {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 3,
  });
  wingGeo.translate(0, 0, -0.06);

  const rightWing = new THREE.Mesh(wingGeo, secondaryMetalMat);
  rightWing.position.set(0.98, 2.02, 0);
  rightWing.castShadow = !isSoftwareGl;
  registerPart(rightWing, new THREE.Vector3(1.05, 0.85, 0));

  const leftWing = new THREE.Mesh(wingGeo, secondaryMetalMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.98, 2.02, 0);
  leftWing.castShadow = !isSoftwareGl;
  registerPart(leftWing, new THREE.Vector3(-1.05, 0.85, 0));

  // Part 10: Twin Orbital Telemetry Rings & Crown Halo
  const orbitRingA = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.03, 14, 72), secondaryMetalMat);
  orbitRingA.position.set(0, 3.25, 0);
  orbitRingA.rotation.set(Math.PI * 0.36, 0.25, 0.15);
  registerPart(orbitRingA, new THREE.Vector3(0, 1.35, 0));

  const orbitRingB = new THREE.Mesh(new THREE.TorusGeometry(1.54, 0.026, 14, 72), accentGlowMat);
  orbitRingB.position.set(0, 3.35, 0);
  orbitRingB.rotation.set(-Math.PI * 0.32, -0.3, 0.4);
  registerPart(orbitRingB, new THREE.Vector3(0, 1.75, 0));

  // Perimeter Arena Light Pylons (InstancedMesh = 1 draw call for 12 towers)
  const pylonCount = 12;
  const pylonGeo = new THREE.BoxGeometry(0.18, 2.8, 0.18);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: "#1e222e",
    metalness: 0.72,
    roughness: 0.38,
  });
  const pylonInstanced = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);

  const stripGeo = new THREE.BoxGeometry(0.06, 2.2, 0.06);
  const stripInstanced = new THREE.InstancedMesh(stripGeo, accentGlowMat, pylonCount);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < pylonCount; i++) {
    const angle = (i / pylonCount) * Math.PI * 2;
    const radius = 6.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    dummy.position.set(x, 1.4, z);
    dummy.rotation.set(0, -angle, 0);
    dummy.updateMatrix();
    pylonInstanced.setMatrixAt(i, dummy.matrix);

    const innerRadius = 6.76;
    dummy.position.set(Math.cos(angle) * innerRadius, 1.45, Math.sin(angle) * innerRadius);
    dummy.updateMatrix();
    stripInstanced.setMatrixAt(i, dummy.matrix);
  }
  pylonInstanced.instanceMatrix.needsUpdate = true;
  stripInstanced.instanceMatrix.needsUpdate = true;
  scene.add(pylonInstanced);
  scene.add(stripInstanced);

  // Camera transition & animation state
  let targetExplode = 0;
  let currentExplode = 0;
  let autoRotate = true;
  let camAnimActive = false;
  const camTargetPos = new THREE.Vector3(...ARENA_CAMERA_PRESETS[0].position);
  const camTargetLook = new THREE.Vector3(...ARENA_CAMERA_PRESETS[0].target);

  let rafId = 0;
  let syncPending = false;
  let disposed = false;
  let elapsed = 0;
  let lastTime = performance.now();

  const stopCamAnim = () => {
    camAnimActive = false;
  };
  controls.addEventListener("start", stopCamAnim);

  function afterDraw(cb: () => void) {
    if (!isSoftwareGl) {
      rafId = requestAnimationFrame(cb);
      return;
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === "function") {
      syncPending = true;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        if (!sync || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) {
          if (sync) gl.deleteSync(sync);
          syncPending = false;
          rafId = requestAnimationFrame(cb);
        } else {
          setTimeout(poll, 12);
        }
      };
      setTimeout(poll, 16);
    } else {
      rafId = requestAnimationFrame(cb);
    }
  }

  function tick() {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (autoRotate) {
      elapsed += dt;
      trophyRoot.rotation.y += dt * 0.24;
      orbitRingA.rotation.z += dt * 0.52;
      orbitRingB.rotation.z -= dt * 0.68;
      vEmblem.position.y =
        parts[5].basePos.y + currentExplode * parts[5].explodeOffset.y + Math.sin(elapsed * 2.1) * 0.05;
    }

    // Damped exploded view interpolation
    const explodeDiff = targetExplode - currentExplode;
    if (Math.abs(explodeDiff) > 0.0005) {
      currentExplode += explodeDiff * Math.min(1, dt * 8);
      for (const p of parts) {
        p.mesh.position.copy(p.basePos).addScaledVector(p.explodeOffset, currentExplode);
      }
    }

    // Damped camera preset transition
    if (camAnimActive) {
      const alpha = Math.min(1, dt * 5.5);
      camera.position.lerp(camTargetPos, alpha);
      controls.target.lerp(camTargetLook, alpha);
      if (camera.position.distanceTo(camTargetPos) < 0.03 && controls.target.distanceTo(camTargetLook) < 0.03) {
        camera.position.copy(camTargetPos);
        controls.target.copy(camTargetLook);
        camAnimActive = false;
      }
    }

    controls.update();
    renderer.render(scene, camera);

    if (!syncPending) {
      afterDraw(tick);
    }
  }

  // Render first frame immediately so screenshots and initial paint are instant
  renderer.render(scene, camera);
  afterDraw(tick);

  // Responsive ResizeObserver
  const ro = new ResizeObserver((entries) => {
    if (disposed) return;
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width < 10 || rect.height < 10) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
    renderer.render(scene, camera);
  });
  ro.observe(container);

  return {
    isSoftwareGl,
    setPreset(id) {
      const found = ARENA_CAMERA_PRESETS.find((p) => p.id === id);
      if (!found) return;
      camTargetPos.set(...found.position);
      camTargetLook.set(...found.target);
      camAnimActive = true;
    },
    setFinish(id) {
      const swatch = ARENA_FINISH_SWATCHES.find((s) => s.id === id);
      if (!swatch) return;
      primaryMetalMat.color.set(swatch.bodyHex);
      primaryMetalMat.metalness = swatch.metalness;
      primaryMetalMat.roughness = swatch.roughness;
      accentGlowMat.color.set(swatch.accentHex);
      accentGlowMat.emissive.set(swatch.accentHex);
      underAccentLight.color.set(swatch.accentHex);
      rimLight.color.set(swatch.accentHex);
    },
    setExplode(amount) {
      targetExplode = clampExplode(amount);
    },
    setAutoRotate(enabled) {
      autoRotate = Boolean(enabled);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener("start", stopCamAnim);
      controls.dispose();
      envTex.dispose();
      pmrem.dispose();
      brushedRoughness.dispose();
      floorTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
