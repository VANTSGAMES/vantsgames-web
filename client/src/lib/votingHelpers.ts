import { JUEGOS } from "./juegos";

export type PollKind = "torneo" | "mvp_clip" | "comunidad";
export type PollStatus = "open" | "closed";
export type PickemStage = "semifinal" | "final";

export interface PollOptionDef {
  id: string;
  label: string;
  subtitle?: string;
  gameSlug?: string;
  tag?: string;
}

export interface PollDef {
  id: string;
  kind: PollKind;
  title: string;
  description: string;
  gameSlug?: string | null;
  badge: string;
  closesAt: string;
  status: PollStatus;
  options: PollOptionDef[];
}

export interface PollOptionResult extends PollOptionDef {
  votes: number;
  percent: number;
}

export interface PollWithResults extends Omit<PollDef, "options"> {
  options: PollOptionResult[];
  totalVotes: number;
  viewerOptionId: string | null;
  isExpired: boolean;
  isOpenForVoting: boolean;
}

export interface PickemTeam {
  id: string;
  name: string;
  tag: string;
  seed: string;
}

export interface PickemMatchDef {
  id: string;
  stage: PickemStage;
  tournamentName: string;
  gameSlug: string;
  teamA: PickemTeam;
  teamB: PickemTeam;
  bestOf: string;
  startsAt: string;
  points: number;
  locked: boolean;
  winnerId: string | null;
}

export interface PickemMatchWithStats extends PickemMatchDef {
  totalPicks: number;
  teamAPicks: number;
  teamBPicks: number;
  teamAPercent: number;
  teamBPercent: number;
  viewerPickTeamId: string | null;
  viewerOutcome: "pending" | "hit" | "miss" | null;
}

export interface PickemUserSummary {
  points: number;
  maxPoints: number;
  hits: number;
  misses: number;
  pending: number;
  picksSubmitted: number;
  totalMatches: number;
  resolvedCount: number;
  accuracyPercent: number;
}

export interface PickemLeaderboardEntry {
  rank: number;
  userId: number;
  nick: string;
  points: number;
  hits: number;
  resolvedCount: number;
  picksSubmitted: number;
  accuracyPercent: number;
  isViewer: boolean;
}

export interface CommunityVotingResponse {
  polls: PollWithResults[];
  pickemMatches: PickemMatchWithStats[];
  pickemSummary: PickemUserSummary;
  leaderboard: PickemLeaderboardEntry[];
  viewer: {
    isModerator: boolean;
  };
}

export const POLL_KINDS: { value: PollKind; label: string }[] = [
  { value: "torneo", label: "Próximo Torneo" },
  { value: "mvp_clip", label: "Clip / MVP" },
  { value: "comunidad", label: "Comunidad" },
];

const VALID_POLL_KINDS = new Set<string>(POLL_KINDS.map((k) => k.value));
const VALID_GAME_SLUGS = new Set<string>(["general", ...JUEGOS.map((j) => j.slug)]);

export function pollKindLabel(kind: string): string {
  const hit = POLL_KINDS.find((k) => k.value === kind);
  return hit ? hit.label : "Encuesta";
}

export function pickemStageLabel(stage: PickemStage): string {
  return stage === "final" ? "Gran Final" : "Semifinal";
}

export function buildDefaultPolls(nowMs = Date.now()): PollDef[] {
  const inDays = (days: number) => new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "next-community-tournament-game",
      kind: "torneo",
      title: "¿Qué juego quieres para la Copa Comunitaria VANTS?",
      description:
        "El título más votado abrirá inscripciones gratuitas con bracket oficial y cobertura en directo este fin de semana.",
      gameSlug: null,
      badge: "Torneo Comunitario",
      closesAt: inDays(5),
      status: "open",
      options: [
        { id: "valorant", label: "VALORANT · Copa 5v5", subtitle: "Servidores Miami / Bogotá · Map pool activo", gameSlug: "valorant", tag: "5v5" },
        { id: "cs2", label: "Counter-Strike 2 · Copa FACEIT", subtitle: "5v5 MR12 · Ranking FACEIT conectado", gameSlug: "cs2", tag: "5v5" },
        { id: "fortnite", label: "Fortnite · Dúos Zero Build", subtitle: "4 partidas por puntos + bonus de eliminaciones", gameSlug: "fortnite", tag: "Dúos" },
        { id: "fc27", label: "FC 27 · Copa 1v1 Eliminación", subtitle: "Crossplay PS5 / Xbox / PC · Ida y vuelta", gameSlug: "fc27", tag: "1v1" },
        { id: "lol", label: "League of Legends · Grieta 5v5", subtitle: "Torneo Draft LAN · Eliminación directa", gameSlug: "lol", tag: "5v5" },
      ],
    },
    {
      id: "next-community-tournament-format",
      kind: "torneo",
      title: "Elige formato y horario oficial del próximo torneo",
      description:
        "Define el formato competitivo y la franja horaria (hora Venezuela / VET) que mejor se adapte a tu equipo.",
      gameSlug: null,
      badge: "Formato y Horario",
      closesAt: inDays(4),
      status: "open",
      options: [
        { id: "fri-bo1", label: "Viernes 20:00 VET · Eliminación Directa Bo1", subtitle: "Rápido, ideal para completar en una sola noche", tag: "Bo1" },
        { id: "sat-de-bo3", label: "Sábado 18:00 VET · Doble Eliminación (Final Bo3)", subtitle: "Segunda oportunidad en bracket inferior", tag: "Doble Elim." },
        { id: "sun-swiss", label: "Domingo 16:00 VET · Sistema Suizo + Top 4", subtitle: "Todos los equipos juegan al menos 3 partidas", tag: "Suizo" },
        { id: "sat-night-flash", label: "Sábado 21:00 VET · Copa Flash Relámpago", subtitle: "Cupo ágil de 16 equipos con check-in exprés", tag: "Flash" },
      ],
    },
    {
      id: "clip-of-the-week-s4",
      kind: "mvp_clip",
      title: "Vota el Clip de la Semana · Temporada 4",
      description:
        "El ganador entra a la vitrina de Clips Destacados en la portada y suma insignia de creador semanal.",
      gameSlug: null,
      badge: "Clip de la Semana",
      closesAt: inDays(3),
      status: "open",
      options: [
        { id: "clip-val-ascent", label: "Ace Clutch 1v4 en Ascent con Jett", subtitle: "Post-plant en A con 12 HP restantes", gameSlug: "valorant", tag: "Clutch" },
        { id: "clip-cs2-mirage", label: "Retake 1v3 con AWP no-scope en Mirage", subtitle: "Triple baja en sitio B en ronda decisiva", gameSlug: "cs2", tag: "AWP" },
        { id: "clip-fn-endgame", label: "Victory Royale último círculo en solitario", subtitle: "Rotación perfecta sin escudos vs 2 dúos", gameSlug: "fortnite", tag: "Endgame" },
        { id: "clip-fc27-90", label: "Gol de tiro libre al minuto 90' en semifinal", subtitle: "Remontada 3-2 en tiempo añadido", gameSlug: "fc27", tag: "Min 90'" },
      ],
    },
    {
      id: "mvp-circuit-s4",
      kind: "mvp_clip",
      title: "MVP del Circuito VANTS · Jornada S4",
      description:
        "Reconoce al jugador de mayor impacto competitivo en las series recientes del circuito oficial.",
      gameSlug: "valorant",
      badge: "MVP Oficial",
      closesAt: inDays(6),
      status: "open",
      options: [
        { id: "mvp-entry", label: "Duelista / Entry con 1.48 K/D en playoffs", subtitle: "Apertura de sitio en 72% de las rondas atacantes", gameSlug: "valorant", tag: "Entry" },
        { id: "mvp-awp", label: "AWPer dominante con +18 kills de apertura", subtitle: "Control total de medio en la serie de CS2", gameSlug: "cs2", tag: "Sniper" },
        { id: "mvp-igl", label: "IGL con lectura perfecta en mapas decisivos", subtitle: "Remontada 9-3 a 13-11 con ajustes en vivo", gameSlug: "valorant", tag: "IGL" },
        { id: "mvp-flex", label: "Jugador Flex / Soporte con 92% KAST", subtitle: "Utilidad clave y 4 clutches ganados en el torneo", gameSlug: "cs2", tag: "Soporte" },
      ],
    },
  ];
}

export function buildDefaultPickemMatches(nowMs = Date.now()): PickemMatchDef[] {
  const inHours = (hours: number) => new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "val-s4-semi-1",
      stage: "semifinal",
      tournamentName: "VANTS Masters VALORANT · S4",
      gameSlug: "valorant",
      teamA: { id: "caracas-five", name: "Caracas Five", tag: "CCS", seed: "#1" },
      teamB: { id: "andes-vanguard", name: "Andes Vanguard", tag: "AND", seed: "#4" },
      bestOf: "Bo3",
      startsAt: inHours(30),
      points: 10,
      locked: false,
      winnerId: null,
    },
    {
      id: "val-s4-semi-2",
      stage: "semifinal",
      tournamentName: "VANTS Masters VALORANT · S4",
      gameSlug: "valorant",
      teamA: { id: "zulia-apex", name: "Zulia Apex", tag: "ZUL", seed: "#2" },
      teamB: { id: "latam-eclipse", name: "LATAM Eclipse", tag: "ECL", seed: "#3" },
      bestOf: "Bo3",
      startsAt: inHours(34),
      points: 10,
      locked: false,
      winnerId: null,
    },
    {
      id: "cs2-s4-final",
      stage: "final",
      tournamentName: "Copa FACEIT CS2 Venezuela · Gran Final",
      gameSlug: "cs2",
      teamA: { id: "vants-crimson", name: "VANTS Crimson", tag: "VNT", seed: "#1" },
      teamB: { id: "orinoco-wolves", name: "Orinoco Wolves", tag: "ORN", seed: "#2" },
      bestOf: "Bo3",
      startsAt: inHours(52),
      points: 20,
      locked: false,
      winnerId: null,
    },
    {
      id: "lol-s4-final",
      stage: "final",
      tournamentName: "Liga Grieta LATAM · Gran Final",
      gameSlug: "lol",
      teamA: { id: "avila-esports", name: "Ávila Esports", tag: "AVL", seed: "#1" },
      teamB: { id: "caribe-titans", name: "Caribe Titans", tag: "CRB", seed: "#2" },
      bestOf: "Bo5",
      startsAt: inHours(60),
      points: 20,
      locked: false,
      winnerId: null,
    },
  ];
}

export function computeOptionPercentages(
  options: PollOptionDef[],
  voteCounts: Record<string, number>,
): { results: PollOptionResult[]; totalVotes: number } {
  const safeCounts = options.map((opt) => {
    const raw = Number(voteCounts[opt.id] || 0);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  const totalVotes = safeCounts.reduce((acc, n) => acc + n, 0);
  const results: PollOptionResult[] = options.map((opt, idx) => {
    const votes = safeCounts[idx];
    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    return {
      ...opt,
      votes,
      percent,
    };
  });
  return { results, totalVotes };
}

export function computePickemScore(
  matches: PickemMatchDef[],
  picksByMatchId: Record<string, string>,
): PickemUserSummary {
  let points = 0;
  let hits = 0;
  let misses = 0;
  let pending = 0;
  let picksSubmitted = 0;
  let resolvedCount = 0;
  const maxPoints = matches.reduce((acc, m) => acc + m.points, 0);

  for (const m of matches) {
    const pick = picksByMatchId[m.id];
    if (!pick) continue;
    picksSubmitted += 1;
    if (!m.winnerId) {
      pending += 1;
    } else {
      resolvedCount += 1;
      if (pick === m.winnerId) {
        hits += 1;
        points += m.points;
      } else {
        misses += 1;
      }
    }
  }

  const accuracyPercent = resolvedCount > 0 ? Math.round((hits / resolvedCount) * 100) : 0;
  return {
    points,
    maxPoints,
    hits,
    misses,
    pending,
    picksSubmitted,
    totalMatches: matches.length,
    resolvedCount,
    accuracyPercent,
  };
}

export interface RawPickemUserAggregate {
  userId: number;
  nick: string;
  points: number;
  hits: number;
  resolvedCount: number;
  picksSubmitted: number;
  accuracyPercent: number;
  firstUpdatedMs: number;
}

export function rankPickemLeaderboard(
  entries: RawPickemUserAggregate[],
  viewerUserId?: number | null,
  limit = 15,
): PickemLeaderboardEntry[] {
  return [...entries]
    .filter((e) => e.picksSubmitted > 0)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
      if (b.picksSubmitted !== a.picksSubmitted) return b.picksSubmitted - a.picksSubmitted;
      return a.firstUpdatedMs - b.firstUpdatedMs;
    })
    .slice(0, limit)
    .map((e, idx) => ({
      rank: idx + 1,
      userId: e.userId,
      nick: e.nick,
      points: e.points,
      hits: e.hits,
      resolvedCount: e.resolvedCount,
      picksSubmitted: e.picksSubmitted,
      accuracyPercent: e.accuracyPercent,
      isViewer: Boolean(viewerUserId && e.userId === viewerUserId),
    }));
}

export function filterPollsByKind(
  polls: PollWithResults[],
  kind: "all" | PollKind,
): PollWithResults[] {
  if (kind === "all") return polls;
  return polls.filter((p) => p.kind === kind);
}

export function formatPollCountdown(closesAtIso: string, nowMs = Date.now()): string {
  const diff = new Date(closesAtIso).getTime() - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return "Cerrada";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) {
    return `Cierra en ${Math.max(1, hours)}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `Cierra en ${days}d ${remHours}h`;
}

export interface CustomPollDraftInput {
  title?: unknown;
  description?: unknown;
  kind?: unknown;
  gameSlug?: unknown;
  closesInDays?: unknown;
  options?: unknown;
}

export interface ValidatedCustomPollDraft {
  title: string;
  description: string;
  kind: PollKind;
  gameSlug: string | null;
  closesInDays: number;
  options: PollOptionDef[];
}

function slugifyOption(label: string, idx: number): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return `${base || "opcion"}-${idx + 1}`;
}

export function validateCustomPollDraft(
  input: CustomPollDraftInput,
): { ok: true; data: ValidatedCustomPollDraft } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 6 || title.length > 140) {
    return { ok: false, error: "El título de la encuesta debe tener entre 6 y 140 caracteres." };
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 6 || description.length > 360) {
    return { ok: false, error: "La descripción debe tener entre 6 y 360 caracteres." };
  }

  const rawKind = typeof input.kind === "string" ? input.kind.trim().toLowerCase() : "comunidad";
  if (!VALID_POLL_KINDS.has(rawKind)) {
    return { ok: false, error: "Categoría de encuesta inválida." };
  }

  const rawGame = typeof input.gameSlug === "string" ? input.gameSlug.trim().toLowerCase() : "";
  const gameSlug = rawGame && rawGame !== "general" ? rawGame : null;
  if (gameSlug && !VALID_GAME_SLUGS.has(gameSlug)) {
    return { ok: false, error: "Videojuego seleccionado inválido." };
  }

  const rawDays = Number(input.closesInDays ?? 5);
  const closesInDays = Number.isFinite(rawDays) ? Math.min(30, Math.max(1, Math.round(rawDays))) : 5;

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const cleanedLabels: string[] = [];
  const seen = new Set<string>();
  for (const item of rawOptions) {
    const label = typeof item === "string" ? item.trim() : "";
    if (!label) continue;
    if (label.length < 2 || label.length > 90) {
      return { ok: false, error: "Cada opción debe tener entre 2 y 90 caracteres." };
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "No puede haber opciones duplicadas en la encuesta." };
    }
    seen.add(key);
    cleanedLabels.push(label);
  }

  if (cleanedLabels.length < 2 || cleanedLabels.length > 6) {
    return { ok: false, error: "Agrega entre 2 y 6 opciones para la encuesta." };
  }

  const options: PollOptionDef[] = cleanedLabels.map((label, idx) => ({
    id: slugifyOption(label, idx),
    label,
    gameSlug: gameSlug || undefined,
  }));

  return {
    ok: true,
    data: {
      title,
      description,
      kind: rawKind as PollKind,
      gameSlug,
      closesInDays,
      options,
    },
  };
}
