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
      "VANTS Clipper PC → 3 YouTube Shorts/día + 3 Créditos VANTS IA/día",
      "Sin anuncios en Banter Desktop, Web y Android",
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
      "Insignia y sello CREATOR + canal de clips verificado",
      "VANTS Clipper PC → 5 YouTube Shorts/día + 5 Créditos VANTS IA/día",
      "Auto-publicación en vants.cc + aviso automático en Discord",
      "Sin anuncios + destacado en la sala de jugadores",
      "Kit de overlays de marca y soporte directo",
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
      "VANTS Clipper PC → 2 YouTube Shorts/día + 2 Créditos VANTS IA/día",
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
      "Hasta 15 Shorts/día + 15 Créditos VANTS IA/día + descuentos en tienda",
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
  { feature: "Perfil competitivo y estadísticas oficiales (FACEIT / Riot RSO)", gratis: "100 % gratis", pro: "100 % gratis", creator: "100 % gratis", pase: "100 % gratis" },
  { feature: "Inscripción a torneos abiertos", gratis: "Estándar", pro: "Sin fee", creator: "Sin fee", pase: "Sin fee" },
  { feature: "Crear torneos propios de comunidad", gratis: "—", pro: "Incluido", creator: "Incluido", pase: "Temporada S4" },
  { feature: "App VANTS Clipper PC + recorte local 9:16", gratis: "Local gratis", pro: "Incluido", creator: "Incluido", pase: "Incluido" },
  { feature: "Subida automática a YouTube Shorts / día", gratis: "Manual", pro: "3 / día", creator: "5 / día", pase: "2 / día" },
  { feature: "Créditos VANTS IA (renovados cada día al entrar)", gratis: "SEO básico", pro: "3 / día", creator: "5 / día", pase: "2 / día" },
  { feature: "Publicación automática en Discord + canal verificado", gratis: "—", pro: "—", creator: "Incluido", pase: "—" },
  { feature: "Experiencia sin anuncios en Banter (PC y móvil)", gratis: "Con anuncios", pro: "0 anuncios", creator: "0 anuncios", pase: "—" },
  { feature: "Cola prioritaria en VANTS Ranked", gratis: "—", pro: "Prioritaria", creator: "Prioritaria", pase: "—" },
  { feature: "Insignia 3D y sello junto al nick", gratis: "Miembro", pro: "PRO", creator: "CREATOR", pase: "PLUS / PRO" },
  { feature: "Kit de overlays oficiales y soporte directo", gratis: "—", pro: "—", creator: "Incluido", pase: "—" },
];
