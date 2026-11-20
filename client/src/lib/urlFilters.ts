import { JUEGO_POR_SLUG } from "./juegos";

/**
 * Lee un parámetro de consulta soportando tanto history routing (`/torneos?juego=valorant`)
 * como hash routing (`#/torneos?juego=valorant`).
 */
export function parseQueryParam(
  param: string,
  search: string = typeof window !== "undefined" ? window.location.search : "",
  hash: string = typeof window !== "undefined" ? window.location.hash : "",
): string {
  const fromSearch = new URLSearchParams(search || "").get(param);
  if (fromSearch !== null && fromSearch !== "") return fromSearch;

  const qIndex = (hash || "").indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.slice(qIndex + 1);
    const fromHash = new URLSearchParams(hashQuery).get(param);
    if (fromHash !== null && fromHash !== "") return fromHash;
  }
  return "";
}

/** Valida que el slug exista en el catálogo oficial de los 11 juegos de VANTS. */
export function normalizeJuegoSlug(raw: string | null | undefined): string {
  const slug = String(raw || "").trim().toLowerCase();
  if (!slug) return "";
  return JUEGO_POR_SLUG[slug] ? slug : "";
}

/** Construye la ruta de torneos con o sin filtro de juego. */
export function buildTorneosPath(juegoSlug: string): string {
  const clean = normalizeJuegoSlug(juegoSlug);
  return clean ? `/torneos?juego=${encodeURIComponent(clean)}` : "/torneos";
}

/** Valida una nota táctica antes de enviarla a la API. */
export function validateTacticalNote(input: {
  title: string;
  content: string;
  gameSlug?: string;
}): { ok: true; title: string; content: string; gameSlug: string } | { ok: false; error: string } {
  const title = input.title.trim();
  const content = input.content.trim();
  const gameSlug = normalizeJuegoSlug(input.gameSlug);
  if (title.length < 2) return { ok: false, error: "El título debe tener al menos 2 caracteres." };
  if (title.length > 140) return { ok: false, error: "El título no puede superar 140 caracteres." };
  if (content.length < 2) return { ok: false, error: "Escribe el contenido de la nota táctica." };
  if (content.length > 4000) return { ok: false, error: "La nota no puede superar 4000 caracteres." };
  return { ok: true, title, content, gameSlug };
}
