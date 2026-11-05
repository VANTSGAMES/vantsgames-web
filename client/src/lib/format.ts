import { JUEGOS } from "@/lib/juegos";
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export function fecha(iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  if (!iso) return "Por anunciar";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Por anunciar";
  return d.toLocaleDateString("es-ES", { timeZone: TZ, ...opts });
}
export function hora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
export function dinero(v?: number | null, cur = "USD") {
  if (v == null || !isFinite(Number(v))) return null;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Number(v));
}
export function hace(iso?: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return "";
  if (s < 3600) return "hace " + Math.max(1, Math.round(s / 60)) + " min";
  if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
  return "hace " + Math.round(s / 86400) + " d";
}
export const GAME_LABEL: Record<string, string> = Object.fromEntries(JUEGOS.map((j) => [j.slug, j.label]));
export const gameLabel = (g?: string | null | { slug?: string; nombre?: string }) => {
  if (!g) return "";
  if (typeof g === "string") return GAME_LABEL[g] || g.toUpperCase();
  return GAME_LABEL[g.slug || ""] || (g.nombre || "").toUpperCase();
};
