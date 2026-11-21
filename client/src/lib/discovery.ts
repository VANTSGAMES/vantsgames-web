import { JUEGOS, JUEGO_POR_SLUG, type DefJuego, type PlataformaJuego } from "./juegos";
import type { Team, Tournament } from "./api";

export type PlataformaFiltro = "Todas" | PlataformaJuego;
export type TorneoOrden = "fecha" | "premio" | "plazas";

export interface TournamentGameGroup {
  slug: string;
  game: DefJuego | null;
  label: string;
  nombre: string;
  tournaments: Tournament[];
}

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  to: string;
  group: string;
  keywords?: string[];
}

/** Normaliza texto eliminando tildes y pasando a minúsculas para búsquedas en español. */
export function normalizeText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrae y normaliza el slug oficial del videojuego de un torneo. */
export function resolveTournamentGameSlug(t: Pick<Tournament, "game">): string {
  const rawSlug = typeof t.game === "string" ? t.game : t.game?.slug || "";
  const clean = normalizeText(rawSlug);
  if (clean && JUEGO_POR_SLUG[clean]) return clean;

  const rawName = typeof t.game === "string" ? t.game : t.game?.nombre || "";
  const name = normalizeText(rawName);
  if (!name) return clean;
  if (name.includes("valorant")) return "valorant";
  if (name.includes("counter-strike") || name === "cs2" || name.includes("csgo")) return "cs2";
  if (name.includes("fortnite")) return "fortnite";
  if (name.includes("fc 27") || name.includes("fc27") || name.includes("ea sports fc")) return "fc27";
  if (name.includes("smash")) return "smash";
  if (name.includes("warzone") || name.includes("call of duty")) return "warzone";
  if (name.includes("free fire") || name.includes("freefire")) return "freefire";
  if (name.includes("wild rift") || name.includes("wildrift")) return "wildrift";
  if (name.includes("league of legends") || name === "lol") return "lol";
  if (name.includes("mobile legends") || name === "mlbb") return "mlbb";
  if (name.includes("clash royale") || name === "clashroyale") return "clashroyale";
  return clean;
}

/** Filtra el catálogo de juegos por plataforma ("Todas" | "PC" | "Consola" | "Móvil"). */
export function filterGamesByPlatform(games: DefJuego[], platform: PlataformaFiltro): DefJuego[] {
  if (platform === "Todas") return games;
  return games.filter((g) => g.plataforma === platform);
}

/** Cuenta cuántos juegos corresponden a cada plataforma. */
export function countGamesByPlatform(games: DefJuego[]): Record<PlataformaFiltro, number> {
  const counts: Record<PlataformaFiltro, number> = {
    Todas: games.length,
    PC: 0,
    Consola: 0,
    Móvil: 0,
  };
  for (const g of games) {
    if (g.plataforma in counts) {
      counts[g.plataforma] += 1;
    }
  }
  return counts;
}

/** Cuenta cuántos torneos hay publicados por cada slug de juego. */
export function countTournamentsByGame(items: Tournament[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const j of JUEGOS) counts[j.slug] = 0;
  for (const t of items) {
    const slug = resolveTournamentGameSlug(t);
    if (!slug) continue;
    counts[slug] = (counts[slug] || 0) + 1;
  }
  return counts;
}

/** Agrupa torneos por videojuego respetando el orden oficial del catálogo VANTS. */
export function groupTournamentsByGame(items: Tournament[]): TournamentGameGroup[] {
  const bySlug = new Map<string, Tournament[]>();
  for (const t of items) {
    const slug = resolveTournamentGameSlug(t) || "otros";
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(t);
  }

  const groups: TournamentGameGroup[] = [];
  for (const j of JUEGOS) {
    const list = bySlug.get(j.slug);
    if (list && list.length > 0) {
      groups.push({
        slug: j.slug,
        game: j,
        label: j.label,
        nombre: j.nombre,
        tournaments: list,
      });
      bySlug.delete(j.slug);
    }
  }

  bySlug.forEach((list, slug) => {
    const first = list[0];
    groups.push({
      slug,
      game: null,
      label: (first?.game?.nombre || slug).toUpperCase(),
      nombre: first?.game?.nombre || slug,
      tournaments: list,
    });
  });

  return groups;
}

/** Filtra torneos por juego (estricto), texto (nombre, región, formato o juego) y ordena según criterio elegido. */
export function filterAndSortTournaments(
  items: Tournament[],
  opts: { juego?: string; query?: string; sort?: TorneoOrden },
): Tournament[] {
  const selectedGame = normalizeText(opts.juego || "");
  const q = normalizeText(opts.query || "");
  const filtered = items.filter((t) => {
    if (selectedGame && resolveTournamentGameSlug(t) !== selectedGame) {
      return false;
    }
    if (!q) return true;
    const haystack = normalizeText(
      [t.nombre, t.region, t.formato, t.game?.nombre, t.game?.slug].filter(Boolean).join(" "),
    );
    return haystack.includes(q);
  });

  const sort = opts.sort || "fecha";
  filtered.sort((a, b) => {
    if (sort === "premio") {
      const pa = Number(a.prize?.value ?? -1);
      const pb = Number(b.prize?.value ?? -1);
      if (pb !== pa) return pb - pa;
    } else if (sort === "plazas") {
      const ma = Number(a.max_teams ?? -1);
      const mb = Number(b.max_teams ?? -1);
      if (mb !== ma) return mb - ma;
    }
    const da = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return filtered;
}

/** Filtra equipos por slug de juego y consulta de texto (nombre, tag o región). */
export function filterTeams(teams: Team[], opts: { juego?: string; query?: string }): Team[] {
  const juego = (opts.juego || "").trim().toLowerCase();
  const q = normalizeText(opts.query || "");
  return teams.filter((t) => {
    const teamGame = typeof t.game === "string" ? t.game.toLowerCase() : "";
    if (juego && teamGame !== juego) return false;
    if (!q) return true;
    const haystack = normalizeText([t.nombre, t.tag, t.region, t.slug].filter(Boolean).join(" "));
    return haystack.includes(q);
  });
}

/** Busca elementos en la paleta de comandos ignorando tildes y soportando múltiples palabras clave. */
export function searchCommandItems(items: CommandItem[], query: string): CommandItem[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;

  const scored: { item: CommandItem; score: number }[] = [];
  for (const item of items) {
    const labelNorm = normalizeText(item.label);
    const fullNorm = normalizeText(
      [item.label, item.hint, item.group, item.to, ...(item.keywords || [])].filter(Boolean).join(" "),
    );
    if (!tokens.every((tok) => fullNorm.includes(tok))) continue;
    let score = 1;
    if (labelNorm.startsWith(tokens[0])) score += 3;
    else if (labelNorm.includes(tokens[0])) score += 2;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/** Calcula porcentaje de ahorro anual redondeado frente al pago mensual × 12. */
export function computeAnnualSavingsPercent(monthlyPrice: number, annualPrice: number): number {
  if (monthlyPrice <= 0 || annualPrice <= 0) return 0;
  const fullYear = monthlyPrice * 12;
  if (annualPrice >= fullYear) return 0;
  return Math.round(((fullYear - annualPrice) / fullYear) * 100);
}
