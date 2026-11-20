import { normalizeText } from "./discovery";
import type { FilaFaceit, FilaXp } from "@/pages/Vants";

export type RankingSort = "elo" | "kd" | "winrate" | "partidas";
export type TeamPresenceFilter = "todos" | "con_equipo" | "agentes_libres";
export type BracketStatusFilter = "todos" | "live" | "finished" | "pending";

export interface BracketMatch {
  ronda: string;
  slot: number;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  estado: string | null;
  ganador: string | null;
}

/** Filtra y ordena la tabla FACEIT del ranking global sin mutar el arreglo original. */
export function filterAndSortRankingFaceit(
  rows: FilaFaceit[],
  opts: { query?: string; teamFilter?: TeamPresenceFilter; sort?: RankingSort } = {},
): FilaFaceit[] {
  const q = normalizeText(opts.query || "");
  const teamFilter = opts.teamFilter || "todos";
  const sort = opts.sort || "elo";

  const filtered = rows.filter((r) => {
    if (teamFilter === "con_equipo" && !r.equipo) return false;
    if (teamFilter === "agentes_libres" && r.equipo) return false;
    if (!q) return true;
    const hay = normalizeText(
      [r.vants, r.nick, r.equipo?.nombre, r.equipo?.tag, r.pais].filter(Boolean).join(" "),
    );
    return hay.includes(q);
  });

  filtered.sort((a, b) => {
    if (sort === "kd") {
      const diff = (b.kd ?? -1) - (a.kd ?? -1);
      if (diff !== 0) return diff;
    } else if (sort === "winrate") {
      const diff = (b.winrate ?? -1) - (a.winrate ?? -1);
      if (diff !== 0) return diff;
    } else if (sort === "partidas") {
      const diff = (b.partidas ?? -1) - (a.partidas ?? -1);
      if (diff !== 0) return diff;
    } else {
      const diff = (b.elo ?? -1) - (a.elo ?? -1);
      if (diff !== 0) return diff;
    }
    return a.pos - b.pos;
  });

  return filtered;
}

/** Filtra la tabla XP del ranking global. */
export function filterRankingXp(
  rows: FilaXp[],
  opts: { query?: string; teamFilter?: TeamPresenceFilter } = {},
): FilaXp[] {
  const q = normalizeText(opts.query || "");
  const teamFilter = opts.teamFilter || "todos";
  return rows.filter((r) => {
    if (teamFilter === "con_equipo" && !r.equipo) return false;
    if (teamFilter === "agentes_libres" && r.equipo) return false;
    if (!q) return true;
    const hay = normalizeText([r.nick, r.equipo?.nombre, r.equipo?.tag].filter(Boolean).join(" "));
    return hay.includes(q);
  });
}

/** Normaliza el estado de una llave de bracket a categorías de filtro. */
export function classifyBracketStatus(m: BracketMatch): Exclude<BracketStatusFilter, "todos"> {
  const st = (m.estado || "").toLowerCase();
  if (st === "live" || st === "ongoing" || st === "en_vivo") return "live";
  if (m.ganador || st === "finished" || st === "done" || st === "completed" || st === "finalizado") return "finished";
  return "pending";
}

/** Filtra llaves de un bracket por ronda, estado y equipo buscado. */
export function filterBracketMatches(
  matches: BracketMatch[],
  opts: { round?: string; status?: BracketStatusFilter; teamQuery?: string } = {},
): BracketMatch[] {
  const round = (opts.round || "").trim();
  const status = opts.status || "todos";
  const q = normalizeText(opts.teamQuery || "");

  return matches.filter((m) => {
    if (round && String(m.ronda) !== round) return false;
    if (status !== "todos" && classifyBracketStatus(m) !== status) return false;
    if (q) {
      const teams = normalizeText([m.team_a, m.team_b, m.ganador].filter(Boolean).join(" "));
      if (!teams.includes(q)) return false;
    }
    return true;
  });
}

/** Calcula porcentaje acotado [0..100] de logros o progreso. */
export function computeAchievementPercent(unlocked: number, total = 1000): number {
  if (!Number.isFinite(unlocked) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((unlocked / total) * 1000) / 10));
}

/** Construye metadatos JSON-LD BreadcrumbList para la ruta actual. */
export function buildBreadcrumbJsonLd(path: string, title: string, baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  const items: { "@type": string; position: number; name: string; item: string }[] = [
    { "@type": "ListItem", position: 1, name: "VANTS GAMES", item: cleanBase + "/" },
  ];
  if (cleanPath !== "/") {
    const cleanTitle = title.replace(/\s*—\s*VANTS GAMES$/i, "").trim() || "Sección";
    items.push({
      "@type": "ListItem",
      position: 2,
      name: cleanTitle,
      item: cleanBase + cleanPath,
    });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}
