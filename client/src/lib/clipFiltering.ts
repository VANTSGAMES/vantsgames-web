import { JUEGOS } from "./juegos.ts";

const VALID_CLIP_GAMES = new Set<string>([...JUEGOS.map((j) => j.slug), "otro"]);

export function normalizeClipGameSlug(raw?: string | null): string {
  const clean = String(raw || "").trim().toLowerCase();
  if (VALID_CLIP_GAMES.has(clean)) return clean;
  if (/counter[- ]?strike|cs-?2/.test(clean)) return "cs2";
  if (clean.includes("valorant")) return "valorant";
  if (clean.includes("fortnite")) return "fortnite";
  if (/ea[- ]?sports[- ]?fc|\bfc[- ]?2[4-9]\b|fifa/.test(clean)) return "fc27";
  if (clean.includes("smash")) return "smash";
  if (/warzone|call[- ]?of[- ]?duty|\bcod\b/.test(clean)) return "warzone";
  if (/free[- ]?fire/.test(clean)) return "freefire";
  if (/wild[- ]?rift/.test(clean)) return "wildrift";
  if (/league[- ]?of[- ]?legends|\blol\b/.test(clean)) return "lol";
  if (/mobile[- ]?legends|mlbb/.test(clean)) return "mlbb";
  if (/clash[- ]?royale/.test(clean)) return "clashroyale";
  return "otro";
}

export function detectKickClipGame(category?: { name?: string; slug?: string } | null): string {
  const raw = `${category?.slug || ""} ${category?.name || ""}`.trim();
  return normalizeClipGameSlug(raw);
}

/**
 * Filtra estrictamente clips por el juego seleccionado para garantizar que un clip
 * subido para un videojuego nunca aparezca en la pestaña de otro juego.
 */
export function filterClipsByGame<T extends { juego?: string | null }>(
  clips: T[] | undefined | null,
  selectedGame?: string | null,
): T[] {
  const list = Array.isArray(clips) ? clips : [];
  const target = String(selectedGame || "").trim().toLowerCase();
  if (!target || target === "todos") return list;
  return list.filter((clip) => normalizeClipGameSlug(clip.juego) === target);
}
