export type MissionCategory = "torneos" | "clips" | "comunidad" | "perfil";

export interface WeeklyMissionDef {
  code: string;
  title: string;
  description: string;
  category: MissionCategory;
  target: number;
  xp: number;
  badgeTag: string;
  games?: string[];
  actionLabel: string;
  actionTo: string;
  trackingMode: "manual" | "auto_or_manual";
}

export interface MissionWithProgress extends WeeklyMissionDef {
  current: number;
  percent: number;
  completed: boolean;
  claimed: boolean;
  proofNote: string | null;
}

export interface SeasonTier {
  id: string;
  name: string;
  minXp: number;
  accent: string;
}

export interface WeeklyContributor {
  rank: number;
  userId: number;
  nick: string;
  xp: number;
  missionsCompleted: number;
  tier: SeasonTier;
  isViewer: boolean;
}

export interface WeeklyMissionsSummary {
  xpEarned: number;
  maxWeeklyXp: number;
  missionsClaimed: number;
  totalMissions: number;
  percentOverall: number;
  tier: SeasonTier;
  nextTier: SeasonTier | null;
  xpToNextTier: number;
}

export interface WeeklyMissionsResponse {
  weekKey: string;
  weekRangeLabel: string;
  resetsInLabel: string;
  missions: MissionWithProgress[];
  summary: WeeklyMissionsSummary;
  leaderboard: WeeklyContributor[];
}

export const MISSION_CATEGORIES: { id: MissionCategory; label: string }[] = [
  { id: "torneos", label: "Torneos" },
  { id: "clips", label: "Clips" },
  { id: "comunidad", label: "Comunidad" },
  { id: "perfil", label: "Perfil" },
];

export const WEEKLY_MISSIONS: WeeklyMissionDef[] = [
  {
    code: "weekly-clip",
    title: "Sube 1 clip esta semana",
    description:
      "Comparte una jugada desde tu equipo o enlaza tu clip de Twitch/Kick en el juego correspondiente.",
    category: "clips",
    target: 1,
    xp: 150,
    badgeTag: "Creador S4",
    actionLabel: "Publicar clip",
    actionTo: "/clips/publicar",
    trackingMode: "manual",
  },
  {
    code: "weekly-tournaments-val-cs2",
    title: "Juega 2 torneos de VALORANT o CS2",
    description:
      "Participa en dos torneos oficiales o comunitarios de VALORANT o Counter-Strike 2 dentro del circuito VANTS.",
    category: "torneos",
    target: 2,
    xp: 300,
    badgeTag: "Competidor S4",
    games: ["valorant", "cs2"],
    actionLabel: "Ver torneos",
    actionTo: "/torneos/competir",
    trackingMode: "manual",
  },
  {
    code: "weekly-profile-team",
    title: "Completa tu perfil y equipo",
    description:
      "Actualiza tu ficha competitiva, vincula tus cuentas y define tu equipo principal en la sala VANTS.",
    category: "perfil",
    target: 1,
    xp: 120,
    badgeTag: "Roster Activo",
    actionLabel: "Ir a mi perfil",
    actionTo: "/perfil",
    trackingMode: "manual",
  },
  {
    code: "weekly-lfg-post",
    title: "Publica en el Buscador LFG / Scrims",
    description:
      "Crea al menos 1 anuncio LFT, LFG o Scrim esta semana para activar el matchmaking comunitario. Se detecta automáticamente.",
    category: "comunidad",
    target: 1,
    xp: 110,
    badgeTag: "Scout S4",
    actionLabel: "Abrir buscador LFG",
    actionTo: "/comunidad/lfg",
    trackingMode: "auto_or_manual",
  },
  {
    code: "weekly-forum-activity",
    title: "Participa en el Muro de Comunidad",
    description:
      "Aporta 2 publicaciones o comentarios en cualquier videojuego del Muro / Foro de VANTS. Se sincroniza automáticamente.",
    category: "comunidad",
    target: 2,
    xp: 140,
    badgeTag: "Voz VANTS",
    actionLabel: "Abrir el muro",
    actionTo: "/comunidad/foro",
    trackingMode: "auto_or_manual",
  },
  {
    code: "weekly-forum-gg",
    title: "Apoya 3 hilos con GG o Fuego",
    description:
      "Reacciona a 3 publicaciones destacadas de otros jugadores en el Muro para impulsar guías y highlights.",
    category: "comunidad",
    target: 3,
    xp: 90,
    badgeTag: "Espíritu GG",
    actionLabel: "Explorar hilos",
    actionTo: "/comunidad/foro",
    trackingMode: "auto_or_manual",
  },
];

export const SEASON_TIERS: SeasonTier[] = [
  { id: "recluta", name: "Recluta S4", minXp: 0, accent: "#a3a7b0" },
  { id: "contendiente", name: "Contendiente S4", minXp: 250, accent: "#e8ecf2" },
  { id: "elite", name: "Élite S4", minXp: 500, accent: "#2bd576" },
  { id: "leyenda", name: "Leyenda VANTS S4", minXp: 750, accent: "#ff0d2e" },
];

export function getMissionByCode(code: string): WeeklyMissionDef | undefined {
  const clean = String(code || "").trim().toLowerCase();
  return WEEKLY_MISSIONS.find((m) => m.code === clean);
}

export function computeSeasonTier(xp: number): {
  tier: SeasonTier;
  nextTier: SeasonTier | null;
  xpToNextTier: number;
} {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let current = SEASON_TIERS[0];
  let next: SeasonTier | null = null;
  for (let i = 0; i < SEASON_TIERS.length; i++) {
    if (safeXp >= SEASON_TIERS[i].minXp) {
      current = SEASON_TIERS[i];
      next = SEASON_TIERS[i + 1] || null;
    }
  }
  return {
    tier: current,
    nextTier: next,
    xpToNextTier: next ? Math.max(0, next.minXp - safeXp) : 0,
  };
}

export function computeMissionPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  const clamped = Math.max(0, Math.min(target, current));
  return Math.round((clamped / target) * 100);
}

/**
 * Calcula clave ISO semanal (YYYY-Www), rango lunes-domingo UTC y cuenta regresiva al reinicio.
 */
export function getIsoWeekInfo(nowMs = Date.now()): {
  weekKey: string;
  weekStartMs: number;
  weekEndMs: number;
  weekRangeLabel: string;
  resetsInLabel: string;
} {
  const now = new Date(nowMs);
  const utcDay = now.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;

  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday, 0, 0, 0, 0),
  );
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sunday = new Date(nextMonday.getTime() - 1);

  // ISO week number via Thursday in current week
  const thursday = new Date(monday.getTime() + 3 * 24 * 60 * 60 * 1000);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 0, 0, 0, 0));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4.getTime() - (jan4Day - 1) * 24 * 60 * 60 * 1000);
  const weekNum = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weekKey = `${isoYear}-W${String(weekNum).padStart(2, "0")}`;

  const fmt = (d: Date) =>
    d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "UTC" });
  const weekRangeLabel = `${fmt(monday)} – ${fmt(sunday)}`;

  const remainingMs = Math.max(0, nextMonday.getTime() - nowMs);
  const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const resetsInLabel =
    days >= 1
      ? `Reinicia en ${days}d ${hours}h`
      : totalHours >= 1
        ? `Reinicia en ${totalHours}h`
        : "Reinicia en <1h";

  return {
    weekKey,
    weekStartMs: monday.getTime(),
    weekEndMs: nextMonday.getTime(),
    weekRangeLabel,
    resetsInLabel,
  };
}

export function validateMissionProgressNote(
  note: unknown,
): { ok: true; note: string | null } | { ok: false; error: string } {
  const cleaned = String(note ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
  if (!cleaned) return { ok: true, note: null };
  if (cleaned.length > 200) {
    return { ok: false, error: "La referencia o nota no puede superar los 200 caracteres." };
  }
  return { ok: true, note: cleaned };
}

export function filterMissionsByCategory<T extends { category: MissionCategory }>(
  missions: T[],
  category?: string,
): T[] {
  const cat = (category || "").trim().toLowerCase();
  if (!cat) return missions;
  return missions.filter((m) => m.category === cat);
}

export function missionCategoryLabel(cat: MissionCategory): string {
  return MISSION_CATEGORIES.find((c) => c.id === cat)?.label || cat;
}
