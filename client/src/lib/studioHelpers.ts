export type StudioModelId =
  | "gemini-4-hydrogen"
  | "gemini-3.1-flash-lite"
  | "gemini-4-neon"
  | "gemini-4-carbon";

export type StudioModeId = "coach" | "search" | "maps";

export interface StudioModelMeta {
  id: StudioModelId;
  label: string;
  badge: string;
  description: string;
  supportsGrounding: boolean;
  requiresBillingKey: boolean;
}

export const AI_MODELS: StudioModelMeta[] = [
  {
    id: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    badge: "Recomendado",
    description: "Modelo general rápido con soporte completo de Google Search y Google Maps Grounding.",
    supportsGrounding: true,
    requiresBillingKey: false,
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    badge: "Ultra rápido",
    description: "Respuestas tácticas de baja latencia para consultas breves de coach.",
    supportsGrounding: false,
    requiresBillingKey: false,
  },
  {
    id: "gemini-4-neon",
    label: "Gemini 4 Neon",
    badge: "Avanzado",
    description: "Análisis estratégico profundo de composiciones, economía y VOD review (requiere clave con billing).",
    supportsGrounding: true,
    requiresBillingKey: true,
  },
  {
    id: "gemini-4-carbon",
    label: "Gemini 4 Carbon",
    badge: "Máximo",
    description: "Razonamiento de alto nivel para preparación de torneos LAN y scouting (requiere clave con billing).",
    supportsGrounding: true,
    requiresBillingKey: true,
  },
];

export function resolveEffectiveModel(requested: StudioModelId, mode: StudioModeId): StudioModelId {
  if ((mode === "search" || mode === "maps") && requested === "gemini-3.1-flash-lite") {
    return "gemini-4-hydrogen";
  }
  return requested;
}

export interface StudioChatTurn {
  role: "user" | "model";
  text: string;
}

export function sanitizeChatHistory(turns: StudioChatTurn[], maxTurns = 16): StudioChatTurn[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter(
      (t): t is StudioChatTurn =>
        Boolean(t) &&
        (t.role === "user" || t.role === "model") &&
        typeof t.text === "string" &&
        t.text.trim().length > 0,
    )
    .slice(-Math.max(1, maxTurns))
    .map((t) => ({
      role: t.role,
      text: t.text.trim().slice(0, 3000),
    }));
}

export interface StudioGroundingSource {
  type: "web" | "maps";
  title: string;
  uri: string;
  snippets?: string[];
}

export function dedupeGroundingSources(sources: StudioGroundingSource[]): StudioGroundingSource[] {
  const seen = new Set<string>();
  const out: StudioGroundingSource[] = [];
  for (const s of sources) {
    if (!s || !s.uri || seen.has(s.uri)) continue;
    seen.add(s.uri);
    out.push({
      type: s.type === "maps" ? "maps" : "web",
      title: (s.title || s.uri).trim(),
      uri: s.uri.trim(),
      snippets: Array.isArray(s.snippets)
        ? s.snippets.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
        : undefined,
    });
  }
  return out;
}

export type ArenaCameraPresetId = "escenario" | "trofeo" | "aerea" | "detalle";

export interface ArenaCameraPreset {
  id: ArenaCameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const ARENA_CAMERA_PRESETS: ArenaCameraPreset[] = [
  { id: "escenario", label: "Escenario", position: [6.8, 4.1, 8.2], target: [0, 2.2, 0] },
  { id: "trofeo", label: "Trofeo", position: [0.5, 2.9, 6.1], target: [0, 2.4, 0] },
  { id: "aerea", label: "Aérea", position: [0.1, 10.6, 5.8], target: [0, 1.4, 0] },
  { id: "detalle", label: "Detalle V", position: [-4.2, 4.3, 5.2], target: [0, 3.2, 0] },
];

export type ArenaFinishId = "obsidian-red" | "polished-titanium" | "champion-gold";

export interface ArenaFinishSwatch {
  id: ArenaFinishId;
  label: string;
  swatchHex: string;
  bodyHex: string;
  accentHex: string;
  metalness: number;
  roughness: number;
}

export const ARENA_FINISH_SWATCHES: ArenaFinishSwatch[] = [
  {
    id: "obsidian-red",
    label: "Obsidiana & Rojo VANTS",
    swatchHex: "#FF0D2E",
    bodyHex: "#1c1f28",
    accentHex: "#ff0d2e",
    metalness: 0.86,
    roughness: 0.24,
  },
  {
    id: "polished-titanium",
    label: "Titanio Pulido",
    swatchHex: "#9aa8be",
    bodyHex: "#8d99ae",
    accentHex: "#38bdf8",
    metalness: 0.94,
    roughness: 0.16,
  },
  {
    id: "champion-gold",
    label: "Oro Campeón",
    swatchHex: "#e6b84c",
    bodyHex: "#d9a93c",
    accentHex: "#ff4d2e",
    metalness: 0.92,
    roughness: 0.2,
  },
];

export function clampExplode(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function isQuotaErrorPayload(status?: number | null, message?: string | null): boolean {
  if (status === 429) return true;
  const text = String(message || "");
  return /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|OverQuotaMapError|429|quota/i.test(text);
}

export function formatRouteSummary(distanceMeters?: number | null, durationSeconds?: number | null): {
  distanceText: string;
  durationText: string;
} {
  const dist = Number(distanceMeters);
  const distanceText =
    Number.isFinite(dist) && dist > 0
      ? dist >= 1000
        ? `${(dist / 1000).toFixed(dist >= 10000 ? 0 : 1)} km`
        : `${Math.round(dist)} m`
      : "—";

  const secs = Number(durationSeconds);
  let durationText = "—";
  if (Number.isFinite(secs) && secs > 0) {
    const mins = Math.max(1, Math.round(secs / 60));
    if (mins < 60) {
      durationText = `${mins} min`;
    } else {
      const h = Math.floor(mins / 60);
      const rem = mins % 60;
      durationText = rem > 0 ? `${h} h ${rem} min` : `${h} h`;
    }
  }
  return { distanceText, durationText };
}
