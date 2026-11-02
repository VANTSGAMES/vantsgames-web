import { useEffect } from "react";
import { useLocation } from "wouter";

/** Títulos y descripciones por ruta. En Cloudflare el Worker inyecta los mismos metadatos en el HTML inicial. */
export const SEO: [RegExp, string, string][] = [
  [/^\/$/, "VANTS GAMES — Torneos de VALORANT y Counter-Strike 2", "Torneos, rankings, clips y comunidad competitiva de VALORANT y CS2. Compete. Connect. Dominate."],
  [/^\/torneos\/competir/, "Competir — VANTS GAMES", "Inscribe a tu equipo en torneos de VALORANT y CS2."],
  [/^\/torneos/, "Torneos — VANTS GAMES", "Torneos próximos, en curso y archivo de VALORANT y Counter-Strike 2."],
  [/^\/agenda/, "Agenda en vivo — VANTS GAMES", "Partidos en directo y próximos enfrentamientos."],
  [/^\/resultados/, "Resultados — VANTS GAMES", "Últimos resultados de los torneos de VANTS."],
  [/^\/bracket/, "Bracket principal — VANTS GAMES", "El cuadro del torneo principal en curso."],
  [/^\/sala/, "Sala de jugadores — VANTS GAMES", "Jugadores del circuito VANTS."],
  [/^\/equipos/, "Equipos — VANTS GAMES", "Equipos del circuito VANTS con plantilla e historial."],
  [/^\/equipo-vants/, "Equipo VANTS — VANTS GAMES", "El roster oficial de VANTS."],
  [/^\/ranking/, "Ranking global — VANTS GAMES", "Clasificación de equipos calculada en servidor."],
  [/^\/ranked/, "VANTS Ranked — VANTS GAMES", "Competición por rango de VANTS."],
  [/^\/clips/, "Clips — VANTS GAMES", "Las mejores jugadas de la comunidad VANTS."],
  [/^\/noticias/, "Noticias — VANTS GAMES", "Anuncios oficiales del circuito VANTS."],
  [/^\/en-vivo/, "Twitch en vivo — VANTS GAMES", "Canales de VANTS en directo."],
  [/^\/comunidad/, "Comunidad — VANTS GAMES", "Actividad, noticias y creadores de VANTS."],
  [/^\/membresias/, "Membresías — VANTS GAMES", "Planes PRO, CREATOR y Pase de temporada."],
  [/^\/insignias/, "Insignias — VANTS GAMES", "Catálogo de insignias verificadas."],
  [/^\/tienda/, "Tienda oficial — VANTS GAMES", "Ropa y accesorios oficiales de VANTS."],
  [/^\/privacidad/, "Política de privacidad — VANTS GAMES", "Qué datos trata VANTS GAMES y qué derechos tienes."],
  [/^\/terminos/, "Términos de servicio — VANTS GAMES", "Reglas de uso de VANTS GAMES."],
];

export function useSeo() {
  const [path] = useLocation();
  useEffect(() => {
    const hit = SEO.find(([re]) => re.test(path));
    document.title = hit ? hit[1] : "VANTS GAMES";
    const d = document.querySelector('meta[name="description"]');
    if (d && hit) d.setAttribute("content", hit[2]);
    const base = String(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", base + path);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", base + path);
  }, [path]);
}
