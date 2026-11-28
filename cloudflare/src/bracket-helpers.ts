// Helpers puros de bracket para TorneoWorkflow (sin dependencias de cloudflare:workers).
// Alineados al CHECK de tournament_matches en D1: ronda IN ('q','s','f'), slot 0..3.

export type RondaCode = "q" | "s" | "f";

export interface EquipoInscrito {
  id: string;
  name: string;
  tag: string;
  captain: string | null;
}

export interface EmparejamientoRonda {
  slot: number;
  a: EquipoInscrito;
  b: EquipoInscrito | null; // null = pase directo (BYE)
}

export const ETIQUETA_RONDA: Record<RondaCode, string> = {
  q: "Cuartos de Final",
  s: "Semifinales",
  f: "Gran Final",
};

/** Secuencia de rondas válidas según CHECK (ronda IN ('q','s','f')) y slot 0..3 (máx 8 plazas). */
export function secuenciaRondasPara(numEquipos: number): RondaCode[] {
  if (numEquipos <= 2) return ["f"];
  if (numEquipos <= 4) return ["s", "f"];
  return ["q", "s", "f"];
}

/**
 * Construye los enfrentamientos iniciales de una ronda con BYEs automáticos para impares.
 * Ejemplo con 3 equipos (bracket de 4): slot 0 = E0 vs BYE (final), slot 1 = E1 vs E2 (pendiente).
 * Ejemplo con 5 equipos (bracket de 8): 3 equipos con BYE + 1 duelo real (total 4 slots -> 4 ganadores).
 */
export function construirEmparejamientos(equipos: EquipoInscrito[]): EmparejamientoRonda[] {
  const n = Math.min(8, equipos.length);
  if (n < 2) return [];
  const bracketSize = n <= 2 ? 2 : n <= 4 ? 4 : 8;
  const numSlots = bracketSize / 2;
  const byes = bracketSize - n;
  const pares: EmparejamientoRonda[] = [];

  // Los primeros `byes` equipos reciben pase directo; los restantes juegan los duelos de primera ronda.
  let idx = 0;
  let slot = 0;
  for (let i = 0; i < byes && idx < n; i++) {
    pares.push({ slot: slot++, a: equipos[idx++], b: null });
  }
  while (idx < n && slot < numSlots) {
    const a = equipos[idx++];
    const b = idx < n ? equipos[idx++] : null;
    pares.push({ slot: slot++, a, b });
  }
  return pares;
}
