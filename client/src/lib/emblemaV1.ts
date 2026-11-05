/**
 * Motor de insignias V1 (diseño "V1 Insignias 3D").
 * - emblema(): dibuja la insignia en un canvas 2D (espacio 0–100). Con él se
 *   generaron los PNG de client/public/insignias/ (script/insignias-png.mjs) y
 *   la textura de la cara del modelo 3D (lib/insignia3d.ts).
 * - DEF_V1: diseño de cada código de insignia de la API.
 */
export type DefV1 = { n: string; col: string; trim: string; sh: "oct" | "hex" | "shield" | "star" | "circle"; gl: string; glow: number; r: string };

export const DEF_V1: Record<string, DefV1> = {
  SOCIO: { n: "SOCIO VANTS", r: "META", col: "#FF0D2E", trim: "#F5C044", sh: "oct", gl: "v", glow: 0.6 },
  PRO: { n: "PRO", r: "ÉPICA", col: "#FF0D2E", trim: "#ff9db0", sh: "hex", gl: "zap", glow: 0.55 },
  PLUS: { n: "PLUS", r: "RARA", col: "#4CC9F0", trim: "#a8e4ff", sh: "hex", gl: "plus", glow: 0.55 },
  CREATOR: { n: "CREADOR", r: "ÉPICA", col: "#B44CFF", trim: "#dcaaff", sh: "hex", gl: "play", glow: 0.55 },
  FOUNDER: { n: "FUNDADOR", r: "META", col: "#F5C044", trim: "#ffe6a1", sh: "circle", gl: "crown", glow: 0.5 },
  MEMBER: { n: "MEMBER", r: "CANJE", col: "#aebfce", trim: "#e8eef5", sh: "hex", gl: "user", glow: 0.4 },
  VERIFIED: { n: "VERIFIED", r: "META", col: "#4CC9F0", trim: "#bfeaff", sh: "shield", gl: "check", glow: 0.5 },
  PARTNER: { n: "PARTNER", r: "LEYENDA", col: "#F5C044", trim: "#c8a24a", sh: "circle", gl: "mono", glow: 0.55 },
  ELITE: { n: "ELITE", r: "LEYENDA", col: "#aebfce", trim: "#eef2f7", sh: "shield", gl: "laurel", glow: 0.5 },
  CHAMPION: { n: "CHAMPION", r: "LEYENDA", col: "#F5C044", trim: "#8d949e", sh: "shield", gl: "trophy", glow: 0.5 },
  "TOP 10": { n: "TOP 10", r: "ÉPICA", col: "#FF0D2E", trim: "#ff5d70", sh: "shield", gl: "ten", glow: 0.55 },
  "RISING STAR": { n: "RISING STAR", r: "RARA", col: "#4CC9F0", trim: "#a8e4ff", sh: "star", gl: "star", glow: 0.5 },
  VETERAN: { n: "VETERAN", r: "RARA", col: "#8d949e", trim: "#b8c0ca", sh: "shield", gl: "medal", glow: 0.4 },
  COLECCIONISTA: { n: "COLECCIONISTA", r: "ÉPICA", col: "#8d949e", trim: "#b8c0ca", sh: "shield", gl: "box", glow: 0.4 },
  CAPITAN: { n: "CAPITÁN", r: "RANGO", col: "#FF9E2C", trim: "#ffd9a3", sh: "circle", gl: "c", glow: 0.5 },
  ROSTER: { n: "ROSTER VANTS", r: "LEYENDA", col: "#8d949e", trim: "#b8c0ca", sh: "circle", gl: "lock", glow: 0.4 },
  STREAMER: { n: "STREAMER", r: "CONDICIÓN", col: "#B44CFF", trim: "#dcaaff", sh: "circle", gl: "s", glow: 0.5 },
  CLIPPER: { n: "CLIPPER", r: "RANGO", col: "#41d98d", trim: "#a9f2cf", sh: "circle", gl: "clip", glow: 0.45 },
  FORTNITE: { n: "FORTNITE", r: "RARA", col: "#9D4DFF", trim: "#d9b8ff", sh: "shield", gl: "f", glow: 0.55 },
};
/** Diseño bloqueado (gris) del V1. */
export const bloqueada = (b: DefV1): DefV1 => ({ ...b, col: "#5f6873", trim: "#3c434d" });

/** Nombre de archivo del PNG: "TOP 10" → "top-10". */
export const slugInsignia = (code: string) => code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Ctx = CanvasRenderingContext2D;
const FFS = "Arial, 'Liberation Sans', sans-serif";
export const VS = [[14, 22], [36, 22], [54, 70], [50, 81]], VR = [[86, 22], [64, 22], [51, 58], [66, 58]];
function pth(x: Ctx, pts: number[][]) { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath(); }

export const GL: Record<string, (x: Ctx) => void> = {
  v: (x) => { pth(x, [[16, 24], [35, 24], [50, 62], [65, 24], [84, 24], [59, 80], [41, 80]]); x.fill(); },
  zap: (x) => { pth(x, [[56, 10], [28, 54], [46, 54], [40, 90], [72, 42], [53, 42]]); x.fill(); },
  plus: (x) => { x.fillRect(41, 20, 18, 60); x.fillRect(20, 41, 60, 18); },
  play: (x) => { pth(x, [[36, 24], [76, 50], [36, 76]]); x.fill(); },
  crown: (x) => { pth(x, [[18, 64], [15, 30], [34, 44], [50, 20], [66, 44], [85, 30], [82, 64]]); x.fill(); x.fillRect(18, 68, 64, 10); },
  user: (x) => { x.beginPath(); x.arc(50, 34, 15, 0, 7); x.fill(); pth(x, [[25, 82], [25, 70], [33, 56], [67, 56], [75, 70], [75, 82]]); x.fill(); },
  check: (x) => { x.lineWidth = 11; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath(); x.moveTo(24, 52); x.lineTo(43, 71); x.lineTo(78, 30); x.stroke(); },
  laurel: (x) => { x.lineWidth = 9; x.lineCap = "round"; x.beginPath(); x.arc(50, 56, 32, Math.PI * 0.15, Math.PI * 0.85); x.stroke(); x.beginPath(); x.arc(50, 56, 32, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); pth(x, [[50, 14], [41, 28], [59, 28]]); x.fill(); },
  trophy: (x) => { x.beginPath(); x.moveTo(30, 16); x.lineTo(70, 16); x.lineTo(66, 52); x.quadraticCurveTo(50, 66, 34, 52); x.closePath(); x.fill(); x.lineWidth = 8; x.lineCap = "round"; x.beginPath(); x.moveTo(50, 60); x.lineTo(50, 72); x.stroke(); x.fillRect(32, 76, 36, 8); x.lineWidth = 7; x.beginPath(); x.moveTo(30, 22); x.quadraticCurveTo(13, 25, 18, 42); x.stroke(); x.beginPath(); x.moveTo(70, 22); x.quadraticCurveTo(87, 25, 82, 42); x.stroke(); },
  ten: (x) => { x.font = "800 46px " + FFS; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("10", 50, 53); },
  star: (x) => { const q: number[][] = []; for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 19 : 36; q.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]); } pth(x, q); x.fill(); },
  medal: (x) => { pth(x, [[34, 12], [46, 12], [50, 26], [54, 12], [66, 12], [60, 38], [40, 38]]); x.fill(); x.beginPath(); x.arc(50, 60, 20, 0, 7); x.fill(); },
  box: (x) => { x.fillRect(20, 20, 27, 27); x.fillRect(53, 20, 27, 27); x.fillRect(20, 53, 27, 27); x.fillRect(53, 53, 27, 27); },
  mono: (x) => { x.lineWidth = 9; x.beginPath(); x.arc(50, 50, 32, 0, 7); x.stroke(); pth(x, [[50, 24], [68, 50], [50, 76], [32, 50]]); x.fill(); },
  lock: (x) => { x.lineWidth = 10; x.beginPath(); x.arc(50, 38, 15, Math.PI, 0); x.stroke(); x.fillRect(27, 38, 46, 38); },
  s: (x) => { x.lineWidth = 11; x.lineCap = "round"; x.beginPath(); x.moveTo(30, 68); x.bezierCurveTo(34, 42, 48, 40, 52, 50); x.bezierCurveTo(56, 60, 70, 58, 72, 32); x.stroke(); },
  clip: (x) => { x.fillRect(22, 28, 56, 14); pth(x, [[22, 42], [78, 42], [72, 78], [28, 78]]); x.fill(); },
  c: (x) => { x.font = "800 58px " + FFS; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("C", 50, 54); },
  // FORTNITE (nuevo, mismo lenguaje que C y 10)
  f: (x) => { pth(x, [[33, 20], [70, 20], [70, 34], [49, 34], [49, 45], [65, 45], [65, 58], [49, 58], [49, 80], [33, 80]]); x.fill(); },
};

export function shapePts(sh: string): number[][] | null {
  if (sh === "oct") return [[35, 4], [65, 4], [96, 35], [96, 65], [65, 96], [35, 96], [4, 65], [4, 35]];
  if (sh === "hex") return [[50, 3], [90, 26.5], [90, 73.5], [50, 97], [10, 73.5], [10, 26.5]];
  if (sh === "shield") return [[50, 5], [88, 19], [88, 50], [84, 68], [50, 95], [16, 68], [12, 50], [12, 19]];
  if (sh === "star") { const q: number[][] = []; for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8 - Math.PI / 2, r = i % 2 ? 27 : 48; q.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]); } return q; }
  return null;
}
function shPath(x: Ctx, b: DefV1) { const p = shapePts(b.sh); if (!p) { x.beginPath(); x.arc(50, 50, 46, 0, 7); } else pth(x, p); }

/**
 * Dibuja la insignia en el espacio 0–100 (el canvas ya debe estar escalado).
 * `escala` = píxeles por unidad, para que el resplandor del glifo se vea igual a cualquier tamaño.
 * `em` = mapa de emisión (glifo blanco sobre negro) para el modelo 3D.
 */
export function emblema(x: Ctx, b: DefV1, o: { em?: boolean; escala?: number } = {}) {
  const em = !!o.em, esc = o.escala || 2.2;
  if (!em) {
    shPath(x, b);
    const g = x.createRadialGradient(38, 18, 4, 50, 58, 86); g.addColorStop(0, "#262c38"); g.addColorStop(1, "#0a0c10"); x.fillStyle = g; x.fill();
    const lg = x.createLinearGradient(0, 0, 100, 100); lg.addColorStop(0, b.trim); lg.addColorStop(0.5, "#2a2f38"); lg.addColorStop(1, b.col);
    x.lineWidth = 4.5; x.lineJoin = "round"; x.strokeStyle = lg; x.stroke();
    x.save(); x.globalAlpha = 0.22; x.translate(50, 50); x.scale(0.85, 0.85); x.translate(-50, -50); shPath(x, b); x.lineWidth = 2; x.strokeStyle = b.col; x.stroke(); x.restore();
  } else { x.fillStyle = "#000"; x.fillRect(0, 0, 100, 100); }
  if (b.gl === "v") {
    const st = x.createLinearGradient(0, 10, 0, 85); st.addColorStop(0, em ? "#fff" : "#f2f5f8"); st.addColorStop(1, em ? "#999" : "#8b95a1");
    const rd = x.createLinearGradient(0, 10, 0, 85); rd.addColorStop(0, em ? "#fff" : "#ff5d70"); rd.addColorStop(1, em ? "#777" : "#a30018");
    x.fillStyle = st; pth(x, VS); x.fill(); x.fillStyle = rd; pth(x, VR); x.fill();
  } else {
    x.save();
    if (em) { x.fillStyle = "#fff"; x.strokeStyle = "#fff"; } else { x.fillStyle = b.col; x.strokeStyle = b.col; x.shadowColor = b.col; x.shadowBlur = (9 * esc) / 2.2; }
    (GL[b.gl] || GL.v)(x);
    x.restore();
  }
  if (!em) { x.save(); x.globalAlpha = 0.13; x.fillStyle = "#fff"; x.beginPath(); x.ellipse(37, 15, 29, 10, -0.4, 0, 7); x.fill(); x.restore(); }
}

/** Candado del V1 sobre la insignia bloqueada. */
export function candado(x: Ctx) {
  x.beginPath(); x.arc(74, 74, 15, 0, 7); x.fillStyle = "#12151c"; x.fill(); x.lineWidth = 2; x.strokeStyle = "#4a5261"; x.stroke();
  x.save(); x.translate(59, 59); x.scale(0.3, 0.3); x.fillStyle = "#c3ccd9"; x.strokeStyle = "#c3ccd9"; GL.lock(x); x.restore();
}

/** Canvas con la insignia a `px` píxeles. */
export function canvasEmblema(b: DefV1, px: number, o: { em?: boolean; bloqueada?: boolean } = {}) {
  const c = document.createElement("canvas"); c.width = c.height = px;
  const x = c.getContext("2d")!; const esc = px / 100; x.scale(esc, esc);
  emblema(x, o.bloqueada ? bloqueada(b) : b, { em: o.em, escala: esc });
  if (o.bloqueada) candado(x);
  return c;
}
