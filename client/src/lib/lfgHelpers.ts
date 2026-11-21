import { JUEGOS } from "./juegos";

export type LfgType = "lft" | "lfg" | "scrim";

export const LFG_TYPE_OPTIONS: { id: LfgType; label: string; shortLabel: string; desc: string }[] = [
  {
    id: "lft",
    label: "Busco equipo (LFT)",
    shortLabel: "LFT · Busco equipo",
    desc: "Jugador disponible buscando roster competitivo.",
  },
  {
    id: "lfg",
    label: "Busco jugador (LFG)",
    shortLabel: "LFG · Busco jugador",
    desc: "Equipo o dúo buscando completar plantilla.",
  },
  {
    id: "scrim",
    label: "Busco Scrim",
    shortLabel: "SCRIM · Entreno",
    desc: "Equipo buscando rival para práctica o bo3.",
  },
];

export const LFG_REGIONS = [
  { id: "VE", label: "Venezuela (VE)" },
  { id: "LATAM-N", label: "LATAM Norte" },
  { id: "LATAM-S", label: "LATAM Sur" },
  { id: "BR", label: "Brasil (BR)" },
  { id: "NA", label: "Norteamérica (NA)" },
] as const;

export type LfgRegion = (typeof LFG_REGIONS)[number]["id"];

export interface LfgListingItem {
  id: number;
  userId: number;
  authorNick: string;
  type: LfgType;
  gameSlug: string;
  title: string;
  teamName: string | null;
  roleNeeded: string;
  rankLevel: string;
  schedule: string;
  region: string;
  slotsOpen: number;
  contact: string;
  notes: string | null;
  expiresAt: string;
  createdAt: string;
  applicationsCount: number;
  isOwner: boolean;
  hasApplied: boolean;
}

export interface LfgApplicationItem {
  id: number;
  listingId: number;
  applicantUserId: number;
  applicantNick: string;
  role: string;
  contact: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface LfgDraftInput {
  type: string;
  gameSlug: string;
  title: string;
  teamName?: string;
  roleNeeded: string;
  rankLevel: string;
  schedule: string;
  region: string;
  slotsOpen?: number | string;
  contact: string;
  notes?: string;
}

export interface LfgValidatedDraft {
  type: LfgType;
  gameSlug: string;
  title: string;
  teamName: string | null;
  roleNeeded: string;
  rankLevel: string;
  schedule: string;
  region: LfgRegion;
  slotsOpen: number;
  contact: string;
  notes: string | null;
}

const VALID_GAMES = new Set(JUEGOS.map((j) => j.slug));
const VALID_TYPES = new Set<string>(["lft", "lfg", "scrim"]);
const VALID_REGIONS = new Set<string>(LFG_REGIONS.map((r) => r.id));

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}

export function validateLfgDraft(
  input: LfgDraftInput,
): { ok: true; data: LfgValidatedDraft } | { ok: false; error: string } {
  const type = cleanText(input.type, 16).toLowerCase();
  if (!VALID_TYPES.has(type)) {
    return { ok: false, error: "Selecciona si buscas equipo (LFT), jugador (LFG) o scrim." };
  }

  const gameSlug = cleanText(input.gameSlug, 32).toLowerCase();
  if (!VALID_GAMES.has(gameSlug)) {
    return { ok: false, error: "Selecciona uno de los 11 videojuegos del circuito VANTS." };
  }

  const title = cleanText(input.title, 90);
  if (title.length < 4) {
    return { ok: false, error: "Escribe un titular claro (mínimo 4 caracteres)." };
  }

  const roleNeeded = cleanText(input.roleNeeded, 60);
  if (roleNeeded.length < 2) {
    return { ok: false, error: "Indica el rol o posición (ej. Duelist, IGL, AWPer, Flex)." };
  }

  const rankLevel = cleanText(input.rankLevel, 50);
  if (rankLevel.length < 2) {
    return { ok: false, error: "Indica tu rango o nivel requerido (ej. Ascendente+, FACEIT Nvl 8)." };
  }

  const schedule = cleanText(input.schedule, 80);
  if (schedule.length < 3) {
    return { ok: false, error: "Indica tu horario habitual (ej. Lunes a Viernes 20:00–23:00 VET)." };
  }

  const regionRaw = cleanText(input.region || "VE", 16).toUpperCase();
  if (!VALID_REGIONS.has(regionRaw)) {
    return { ok: false, error: "Selecciona una región válida." };
  }

  const contact = cleanText(input.contact, 80);
  if (contact.length < 3) {
    return { ok: false, error: "Agrega un contacto (usuario de Discord, Riot ID o X)." };
  }

  const rawSlots = Number(input.slotsOpen ?? 1);
  const slotsOpen =
    type === "lft"
      ? 1
      : Number.isFinite(rawSlots)
        ? Math.max(1, Math.min(10, Math.round(rawSlots)))
        : 1;

  const teamName = cleanText(input.teamName, 60) || null;
  const notes = cleanText(input.notes, 400) || null;

  return {
    ok: true,
    data: {
      type: type as LfgType,
      gameSlug,
      title,
      teamName,
      roleNeeded,
      rankLevel,
      schedule,
      region: regionRaw as LfgRegion,
      slotsOpen,
      contact,
      notes,
    },
  };
}

export function validateLfgApplication(input: {
  role: string;
  contact: string;
  message: string;
}): { ok: true; data: { role: string; contact: string; message: string } } | { ok: false; error: string } {
  const role = cleanText(input.role, 60);
  if (role.length < 2) {
    return { ok: false, error: "Indica tu rol o especialidad." };
  }
  const contact = cleanText(input.contact, 80);
  if (contact.length < 3) {
    return { ok: false, error: "Incluye tu usuario de Discord o contacto." };
  }
  const message = cleanText(input.message, 320);
  if (message.length < 6) {
    return { ok: false, error: "Escribe un mensaje breve (mínimo 6 caracteres)." };
  }
  return { ok: true, data: { role, contact, message } };
}

function normSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterLfgListings<
  T extends Pick<
    LfgListingItem,
    "gameSlug" | "type" | "region" | "title" | "roleNeeded" | "rankLevel" | "schedule" | "teamName" | "authorNick" | "notes" | "expiresAt"
  >,
>(
  items: T[],
  filters: { game?: string; type?: string; region?: string; query?: string; nowMs?: number },
): T[] {
  const now = filters.nowMs ?? Date.now();
  const game = (filters.game || "").trim().toLowerCase();
  const type = (filters.type || "").trim().toLowerCase();
  const region = (filters.region || "").trim().toUpperCase();
  const q = normSearch(filters.query || "");

  return items.filter((item) => {
    const exp = new Date(item.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) return false;
    if (game && item.gameSlug.toLowerCase() !== game) return false;
    if (type && item.type.toLowerCase() !== type) return false;
    if (region && item.region.toUpperCase() !== region) return false;
    if (q) {
      const hay = normSearch(
        [
          item.title,
          item.roleNeeded,
          item.rankLevel,
          item.schedule,
          item.teamName || "",
          item.authorNick,
          item.notes || "",
        ].join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function formatExpiryCountdown(expiresAtIso: string, nowMs = Date.now()): string {
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return "Activo";
  const diffMs = exp - nowMs;
  if (diffMs <= 0) return "Expirado";
  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days >= 1) return `Expira en ${days}d ${hours}h`;
  const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (totalHours >= 1) return `Expira en ${totalHours}h`;
  return `Expira en ${mins}m`;
}
