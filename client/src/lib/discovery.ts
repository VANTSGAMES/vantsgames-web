import type { DefJuego, PlataformaJuego } from "./juegos";
import type { Team, Tournament } from "./api";

export type PlataformaFiltro = "Todas" | PlataformaJuego;
export type TorneoOrden = "fecha" | "premio" | "plazas";

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

/** Filtra torneos por texto (nombre, región, formato o juego) y ordena según criterio elegido. */
export function filterAndSortTournaments(
  items: Tournament[],
  opts: { query?: string; sort?: TorneoOrden },
): Tournament[] {
  const q = normalizeText(opts.query || "");
  const filtered = q
    ? items.filter((t) => {
        const haystack = normalizeText(
          [t.nombre, t.region, t.formato, t.game?.nombre, t.game?.slug].filter(Boolean).join(" "),
        );
        return haystack.includes(q);
      })
    : [...items];

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
