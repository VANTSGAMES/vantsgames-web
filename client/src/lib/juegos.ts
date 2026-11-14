/**
 * Registro central de juegos de VANTS.
 * Un solo lugar define los juegos que admite la web: torneos, equipos, roster,
 * clips, eventos y filtros. Los datos (D1 en Cloudflare) guardan el slug;
 * aquí se declara cómo se muestra cada uno.
 *
 * Los juegos con integración de estadísticas (FACEIT / Riot) tienen
 * `integrado: true` y sus logros viven en el catálogo de 1000.
 */
export type PlataformaJuego = "PC" | "Consola" | "Móvil";

export type DefJuego = {
  /** Slug guardado en la base de datos (D1) y la API. */
  slug: string;
  /** Etiqueta corta para tags y filtros. */
  label: string;
  /** Nombre completo para títulos de sección. */
  nombre: string;
  plataforma: PlataformaJuego;
  /** Tiene integración de estadísticas/logros (FACEIT, Riot…). */
  integrado?: boolean;
  /** Portada del juego (client/public/img/juegos/{slug}.jpg). */
  img?: string;
};

export const JUEGOS: DefJuego[] = [
  { slug: "valorant", label: "VALORANT", nombre: "VALORANT", plataforma: "PC", integrado: true, img: "img/juegos/valorant.jpg" },
  { slug: "cs2", label: "CS2", nombre: "Counter-Strike 2", plataforma: "PC", integrado: true, img: "img/juegos/cs2.jpg" },
  { slug: "fortnite", label: "FORTNITE", nombre: "Fortnite", plataforma: "PC", img: "img/juegos/fortnite.jpg" },
  { slug: "fc27", label: "FC 27", nombre: "EA SPORTS FC 27", plataforma: "Consola", img: "img/juegos/fc27.jpg" },
  { slug: "smash", label: "SMASH ULTIMATE", nombre: "Super Smash Bros. Ultimate", plataforma: "Consola", img: "img/juegos/smash.jpg" },
  { slug: "warzone", label: "WARZONE", nombre: "Call of Duty: Warzone", plataforma: "PC", img: "img/juegos/warzone.jpg" },
  { slug: "freefire", label: "FREE FIRE", nombre: "Free Fire", plataforma: "Móvil", img: "img/juegos/freefire.jpg" },
  { slug: "lol", label: "LOL", nombre: "League of Legends", plataforma: "PC", img: "img/juegos/lol.jpg" },
  { slug: "wildrift", label: "WILD RIFT", nombre: "League of Legends: Wild Rift", plataforma: "Móvil", img: "img/juegos/wildrift.jpg" },
  { slug: "mlbb", label: "MOBILE LEGENDS", nombre: "Mobile Legends: Bang Bang", plataforma: "Móvil", img: "img/juegos/mlbb.jpg" },
  { slug: "clashroyale", label: "CLASH ROYALE", nombre: "Clash Royale", plataforma: "Móvil", img: "img/juegos/clashroyale.jpg" },
];

/** Mapa slug → definición. */
export const JUEGO_POR_SLUG: Record<string, DefJuego> = Object.fromEntries(JUEGOS.map((j) => [j.slug, j]));

/** Portada de un juego por slug (fallback: cadena vacía). */
export const portadaJuego = (slug?: string | null) => (slug ? JUEGO_POR_SLUG[slug]?.img || "" : "");

/** Nombre completo de un juego por slug (fallback: el slug en mayúsculas). */
export const nombreJuego = (slug?: string | null) => (slug ? JUEGO_POR_SLUG[slug]?.nombre || slug : "");

/** Etiqueta corta de un juego por slug. */
export const etiquetaJuego = (slug?: string | null) => (slug ? JUEGO_POR_SLUG[slug]?.label || slug.toUpperCase() : "");

/** Opciones `<option>` para selects con todos los juegos. */
export const opcionesJuegos = (extra?: { value: string; label: string }[]) => [
  ...JUEGOS.map((j) => ({ value: j.slug, label: j.nombre })),
  ...(extra || []),
];

/** Filtros de juego con "Todos" primero: [{ v: "", l: "Todos" }, …]. */
export const filtrosJuegos = () => [{ v: "", l: "Todos" }, ...JUEGOS.map((j) => ({ v: j.slug, l: j.label }))];
