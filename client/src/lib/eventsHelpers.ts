import { JUEGOS } from "./juegos";

export type EventType =
  | "showmatch"
  | "scrim_abierta"
  | "quedada"
  | "watchparty"
  | "torneo_relampago";

export type EventModality = "online" | "presencial" | "hibrido";
export type EventStatus = "open" | "closed" | "cancelled";
export type RsvpStatus = "confirmed" | "waitlist";

export interface CommunityEventDef {
  id: string;
  title: string;
  type: EventType;
  gameSlug: string; // one of 11 VANTS games or "general"
  modality: EventModality;
  location: string;
  streamUrl: string | null;
  description: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  featured: boolean;
  status: EventStatus;
  hostNick: string;
  createdAt: string;
}

export interface EventAttendeePreview {
  nick: string;
  status: RsvpStatus;
  checkedIn: boolean;
}

export interface ViewerRsvpInfo {
  status: RsvpStatus;
  roleNote: string | null;
  checkedIn: boolean;
  updatedAt: string;
}

export interface CommunityEventItem extends CommunityEventDef {
  confirmedCount: number;
  waitlistCount: number;
  spotsLeft: number;
  fillPercent: number;
  isFull: boolean;
  isPast: boolean;
  isOpenForRsvp: boolean;
  viewerRsvp: ViewerRsvpInfo | null;
  attendeesPreview: EventAttendeePreview[];
}

export interface CommunityEventsSummary {
  totalUpcoming: number;
  totalRsvps: number;
  userConfirmedCount: number;
  userWaitlistCount: number;
}

export interface CommunityEventsResponse {
  events: CommunityEventItem[];
  summary: CommunityEventsSummary;
  viewer: {
    isModerator: boolean;
  };
}

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "showmatch", label: "Showmatch" },
  { value: "scrim_abierta", label: "Scrim abierta" },
  { value: "torneo_relampago", label: "Copa relámpago" },
  { value: "watchparty", label: "Watch Party" },
  { value: "quedada", label: "Quedada" },
];

export const EVENT_MODALITIES: { value: EventModality; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "presencial", label: "Presencial" },
  { value: "hibrido", label: "Híbrido" },
];

const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPES.map((t) => t.value));
const VALID_MODALITIES = new Set<string>(EVENT_MODALITIES.map((m) => m.value));
const VALID_GAMES = new Set<string>(["general", ...JUEGOS.map((j) => j.slug)]);

export function eventTypeLabel(type: string): string {
  const hit = EVENT_TYPES.find((t) => t.value === type);
  return hit ? hit.label : "Evento";
}

export function eventModalityLabel(modality: string): string {
  const hit = EVENT_MODALITIES.find((m) => m.value === modality);
  return hit ? hit.label : "Online";
}

export function buildDefaultEvents(nowMs = Date.now()): CommunityEventDef[] {
  const inHours = (h: number) => new Date(nowMs + h * 60 * 60 * 1000).toISOString();
  const created = new Date(nowMs - 6 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "showmatch-valorant-allstars-s4",
      title: "Showmatch Estelar VALORANT · VANTS All-Stars vs Comunidad",
      type: "showmatch",
      gameSlug: "valorant",
      modality: "online",
      location: "Discord Oficial VANTS · Canal #showmatch + Directo Twitch",
      streamUrl: "https://www.twitch.tv/feisreal",
      description:
        "Serie Bo3 con capitanes elegidos por la comunidad, casters en vivo y sorteo de insignias de temporada entre los asistentes con check-in confirmado.",
      startsAt: inHours(28),
      endsAt: inHours(31),
      capacity: 20,
      featured: true,
      status: "open",
      hostNick: "Organización VANTS",
      createdAt: created,
    },
    {
      id: "scrim-abierta-cs2-10man-s4",
      title: "Noche de 10-Man CS2 · Scrims Abiertas FACEIT",
      type: "scrim_abierta",
      gameSlug: "cs2",
      modality: "online",
      location: "Hub CS2 VANTS · Salas balanceadas por ELO",
      streamUrl: null,
      description:
        "Partidas competitivas 5v5 con capitanes rotativos, veto de mapas en vivo y práctica ideal para armar equipo antes de los torneos semanales.",
      startsAt: inHours(46),
      endsAt: inHours(50),
      capacity: 30,
      featured: false,
      status: "open",
      hostNick: "Staff CS2 VANTS",
      createdAt: created,
    },
    {
      id: "copa-relampago-fc27-1v1",
      title: "Copa Relámpago FC 27 · 1v1 Nocturna Crossplay",
      type: "torneo_relampago",
      gameSlug: "fc27",
      modality: "online",
      location: "PS5 / Xbox Series / PC · Check-in 30 min antes",
      streamUrl: null,
      description:
        "Eliminación directa ágil de 16 jugadores en una sola noche. Confirma tu cupo por RSVP y deja tu EA ID en la nota de registro.",
      startsAt: inHours(72),
      endsAt: inHours(75),
      capacity: 16,
      featured: false,
      status: "open",
      hostNick: "Comunidad FC 27",
      createdAt: created,
    },
    {
      id: "watchparty-finales-s4",
      title: "Watch Party Oficial · Finales del Circuito VANTS S4",
      type: "watchparty",
      gameSlug: "general",
      modality: "hibrido",
      location: "Twitch VANTS + Sala de Voz Comunidad",
      streamUrl: "https://www.twitch.tv/feisreal",
      description:
        "Seguimiento en vivo de las Grandes Finales de VALORANT y CS2 con análisis táctico, Pick'em en tiempo real y dinámicas con la comunidad.",
      startsAt: inHours(96),
      endsAt: inHours(100),
      capacity: 100,
      featured: true,
      status: "open",
      hostNick: "VANTS Broadcast",
      createdAt: created,
    },
    {
      id: "quedada-fortnite-custom-s4",
      title: "Quedada Fortnite Zero Build · Salas Personalizadas",
      type: "quedada",
      gameSlug: "fortnite",
      modality: "online",
      location: "Salas Privadas · Código publicado al hacer check-in",
      streamUrl: null,
      description:
        "Cuatro partidas personalizadas en modo Dúos y Solos Zero Build para jugadores registrados en VANTS. Abierto a todos los niveles.",
      startsAt: inHours(120),
      endsAt: inHours(123),
      capacity: 60,
      featured: false,
      status: "open",
      hostNick: "Staff Fortnite VANTS",
      createdAt: created,
    },
  ];
}

export function computeEventCapacityState(
  capacity: number,
  confirmedCount: number,
): {
  spotsLeft: number;
  fillPercent: number;
  isFull: boolean;
  nextRsvpStatus: RsvpStatus;
} {
  const safeCap = Math.max(1, Math.floor(capacity));
  const safeConfirmed = Math.max(0, Math.floor(confirmedCount));
  const spotsLeft = Math.max(0, safeCap - safeConfirmed);
  const fillPercent = Math.min(100, Math.round((safeConfirmed / safeCap) * 100));
  const isFull = spotsLeft === 0;
  return {
    spotsLeft,
    fillPercent,
    isFull,
    nextRsvpStatus: isFull ? "waitlist" : "confirmed",
  };
}

export function formatEventCountdown(startsAtIso: string, nowMs = Date.now()): string {
  const startMs = new Date(startsAtIso).getTime();
  if (!Number.isFinite(startMs)) return "Fecha por confirmar";
  const diff = startMs - nowMs;
  if (diff <= 0) return "En curso / Iniciado";
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) return `Empieza en ${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const remMins = mins % 60;
    return `Empieza en ${hours}h ${remMins}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `En ${days}d ${remHours}h`;
}

export function filterCommunityEvents(
  events: CommunityEventItem[],
  opts: { type?: string; gameSlug?: string; onlyMine?: boolean },
): CommunityEventItem[] {
  const type = (opts.type || "").trim().toLowerCase();
  const game = (opts.gameSlug || "").trim().toLowerCase();
  const onlyMine = Boolean(opts.onlyMine);

  return events.filter((ev) => {
    if (type && type !== "all" && ev.type !== type) return false;
    if (game && game !== "all" && ev.gameSlug !== game) return false;
    if (onlyMine && !ev.viewerRsvp) return false;
    return true;
  });
}

export function sortCommunityEvents(events: CommunityEventItem[]): CommunityEventItem[] {
  return [...events].sort((a, b) => {
    const aInactive = a.isPast || a.status !== "open" ? 1 : 0;
    const bInactive = b.isPast || b.status !== "open" ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
}

export function validateRsvpRoleNote(
  raw: unknown,
): { ok: true; roleNote: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, roleNote: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "La nota de inscripción debe ser texto." };
  }
  const clean = raw.trim();
  if (clean.length > 120) {
    return { ok: false, error: "La nota de inscripción no puede superar los 120 caracteres." };
  }
  return { ok: true, roleNote: clean || null };
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface EventDraftInput {
  title?: unknown;
  type?: unknown;
  gameSlug?: unknown;
  modality?: unknown;
  location?: unknown;
  streamUrl?: unknown;
  description?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  capacity?: unknown;
  featured?: unknown;
}

export interface ValidatedEventDraft {
  title: string;
  type: EventType;
  gameSlug: string;
  modality: EventModality;
  location: string;
  streamUrl: string | null;
  description: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  featured: boolean;
}

export function validateEventDraft(
  input: EventDraftInput,
): { ok: true; data: ValidatedEventDraft } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 5 || title.length > 120) {
    return { ok: false, error: "El título del evento debe tener entre 5 y 120 caracteres." };
  }

  const rawType = typeof input.type === "string" ? input.type.trim().toLowerCase() : "showmatch";
  if (!VALID_EVENT_TYPES.has(rawType)) {
    return { ok: false, error: "Tipo de evento inválido." };
  }

  const rawGame = typeof input.gameSlug === "string" ? input.gameSlug.trim().toLowerCase() : "general";
  if (!VALID_GAMES.has(rawGame)) {
    return { ok: false, error: "Videojuego inválido." };
  }

  const rawModality = typeof input.modality === "string" ? input.modality.trim().toLowerCase() : "online";
  if (!VALID_MODALITIES.has(rawModality)) {
    return { ok: false, error: "Modalidad inválida." };
  }

  const location = typeof input.location === "string" ? input.location.trim() : "";
  if (location.length < 3 || location.length > 140) {
    return { ok: false, error: "Indica el lugar o plataforma del evento (3 a 140 caracteres)." };
  }

  let streamUrl: string | null = null;
  if (typeof input.streamUrl === "string" && input.streamUrl.trim()) {
    const candidate = input.streamUrl.trim();
    if (candidate.length > 400 || !isSafeHttpUrl(candidate)) {
      return { ok: false, error: "El enlace de transmisión debe empezar por https:// o http://." };
    }
    streamUrl = candidate;
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 10 || description.length > 600) {
    return { ok: false, error: "La descripción debe tener entre 10 y 600 caracteres." };
  }

  const startsRaw = typeof input.startsAt === "string" ? input.startsAt.trim() : "";
  const startDate = new Date(startsRaw);
  if (!startsRaw || Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "Indica una fecha y hora de inicio válida." };
  }

  let endsAt: string | null = null;
  if (typeof input.endsAt === "string" && input.endsAt.trim()) {
    const endDate = new Date(input.endsAt.trim());
    if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return { ok: false, error: "La fecha de fin debe ser posterior a la de inicio." };
    }
    endsAt = endDate.toISOString();
  }

  const capNum = Number(input.capacity ?? 20);
  if (!Number.isFinite(capNum) || capNum < 2 || capNum > 500) {
    return { ok: false, error: "La capacidad debe estar entre 2 y 500 cupos." };
  }

  return {
    ok: true,
    data: {
      title,
      type: rawType as EventType,
      gameSlug: rawGame,
      modality: rawModality as EventModality,
      location,
      streamUrl,
      description,
      startsAt: startDate.toISOString(),
      endsAt,
      capacity: Math.round(capNum),
      featured: Boolean(input.featured),
    },
  };
}
