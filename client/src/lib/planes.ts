export interface PlanCheckoutOption {
  period: "mo" | "yr" | "one_time";
  label: string;
}

export interface PlanDef {
  id: "pro" | "creator" | "pase" | "socio";
  kicker: string;
  nombre: string;
  precio: string;
  monthlyPrice?: number;
  annualPrice?: number;
  oneTimePrice?: number;
  lema: string;
  beneficios: readonly string[];
  checkout: readonly PlanCheckoutOption[] | null;
}

/** Planes del catálogo live de Stripe (vants-functions/stripe-checkout). El alta la confirma el webhook. */
export const PLANES: readonly PlanDef[] = [
  {
    id: "pro",
    kicker: "Competitivo",
    nombre: "VANTS PRO",
    precio: "4,99 € / mes · 39,99 € / año",
    monthlyPrice: 4.99,
    annualPrice: 39.99,
    lema: "Todo lo competitivo desbloqueado para subir de rango.",
    beneficios: [
      "Insignia PRO en tu ficha",
      "Sello PRO junto a tu nick",
      "Cola prioritaria en VANTS Ranked",
      "Inscripciones sin fee en torneos abiertos",
      "Marcos y tarjetas premium",
    ],
    checkout: [
      { period: "mo", label: "Mensual · 4,99 €" },
      { period: "yr", label: "Anual · 39,99 €" },
    ],
  },
  {
    id: "creator",
    kicker: "Creadores",
    nombre: "VANTS CREATOR",
    precio: "9,99 € / mes · 79,99 € / año",
    monthlyPrice: 9.99,
    annualPrice: 79.99,
    lema: "Para quienes muestran la arena: clips, streams y comunidad.",
    beneficios: [
      "Insignia y sello CREATOR",
      "Canal de clips verificado",
      "Destacado en la sala de jugadores",
      "Soporte directo con el equipo",
      "Kit de overlays de marca",
    ],
    checkout: [
      { period: "mo", label: "Mensual · 9,99 €" },
      { period: "yr", label: "Anual · 79,99 €" },
    ],
  },
  {
    id: "pase",
    kicker: "Temporada",
    nombre: "PASE S4",
    precio: "7,99 € · pago único",
    oneTimePrice: 7.99,
    lema: "Un solo pago para toda la temporada S4 (180 días).",
    beneficios: [
      "Insignia PLUS en tu ficha",
      "Sello PRO junto a tu nick",
      "Inscripciones sin fee en torneos abiertos",
    ],
    checkout: [{ period: "one_time", label: "Comprar pase · 7,99 €" }],
  },
  {
    id: "socio",
    kicker: "Invitación",
    nombre: "SOCIO VANTS",
    precio: "Solo por invitación",
    lema: "El programa de socios de la marca.",
    beneficios: [
      "Insignia SOCIO VANTS",
      "Voto en decisiones del circuito",
      "Acceso al Discord privado",
      "Descuentos en la tienda oficial",
    ],
    checkout: null,
  },
];

export interface ComparisonRow {
  feature: string;
  gratis: string;
  pro: string;
  creator: string;
  pase: string;
}

export const PLAN_COMPARISON: readonly ComparisonRow[] = [
  { feature: "Perfil competitivo y ranking FACEIT / Riot", gratis: "Incluido", pro: "Incluido", creator: "Incluido", pase: "Incluido" },
  { feature: "Inscripción a torneos abiertos", gratis: "Estándar", pro: "Sin fee", creator: "Sin fee", pase: "Sin fee" },
  { feature: "Crear torneos propios de comunidad", gratis: "—", pro: "Incluido", creator: "Incluido", pase: "Temporada S4" },
  { feature: "Cola prioritaria en VANTS Ranked", gratis: "—", pro: "Prioritaria", creator: "Prioritaria", pase: "—" },
  { feature: "Insignia 3D y sello junto al nick", gratis: "Miembro", pro: "PRO", creator: "CREATOR", pase: "PLUS / PRO" },
  { feature: "Canal de clips verificado y destacado en sala", gratis: "—", pro: "—", creator: "Incluido", pase: "—" },
  { feature: "Kit de overlays oficiales y soporte directo", gratis: "—", pro: "—", creator: "Incluido", pase: "—" },
];
