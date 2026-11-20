import { useEffect } from "react";
import { useLocation } from "wouter";
import { buildBreadcrumbJsonLd } from "./competitive";

/** Títulos y descripciones por ruta. En Cloudflare el Worker inyecta los mismos metadatos en el HTML inicial. */
export const SEO: [RegExp, string, string][] = [
  [/^\/$/, "VANTS GAMES — Torneos, Rankings y Esports en LATAM", "Compite en 11 videojuegos con VANTS GAMES: torneos con bracket, rankings verificados de FACEIT y Riot, clips y comunidad esports en Venezuela y LATAM."],
  [/^\/torneos\/competir/, "Competir — VANTS GAMES", "Inscribe a tu equipo en torneos abiertos de los once juegos del circuito VANTS y compite por premios."],
  [/^\/torneos\/crear/, "Crear mi torneo — VANTS GAMES", "Organiza tu propio torneo de comunidad con bracket y gestión en servidor dentro del circuito VANTS."],
  [/^\/torneos/, "Torneos — VANTS GAMES", "Explora torneos próximos, en curso y archivados de los once videojuegos competitivos del circuito VANTS."],
  [/^\/workspace/, "Centro Workspace — VANTS GAMES", "Gestiona reglamentos, hojas de torneo, scrims en Calendar, salas Meet, tareas y comunicaciones con Google Workspace."],
  [/^\/arena-3d/, "Arena 3D — VANTS GAMES", "Explora el trofeo oficial de la Temporada 4 en un visor 3D interactivo con vista explotada y acabados PBR."],
  [/^\/ai-studio/, "VANTS AI Studio — VANTS GAMES", "Coach táctico con Gemini, citas de Google Search y Google Maps, transcripción de voz y estudio creativo multimedia."],
  [/^\/arenas/, "Mapa de Arenas LAN — VANTS GAMES", "Encuentra cybercafés competitivos, gaming centers y sedes LAN reales con Google Maps Platform y calcula tu ruta."],
  [/^\/agenda/, "Agenda en vivo — VANTS GAMES", "Consulta partidos en directo y próximos enfrentamientos del circuito competitivo VANTS GAMES."],
  [/^\/resultados/, "Resultados — VANTS GAMES", "Revisa los últimos resultados oficiales registrados en los torneos de VANTS GAMES."],
  [/^\/bracket/, "Bracket principal — VANTS GAMES", "Sigue el cuadro interactivo y avance de rondas del torneo principal en curso."],
  [/^\/sala/, "Sala de jugadores — VANTS GAMES", "Descubre jugadores del circuito VANTS y cuentas competitivas registradas con estadísticas reales."],
  [/^\/equipos/, "Equipos — VANTS GAMES", "Equipos del circuito VANTS y plantillas CS2 en FACEIT con historial y resultados."],
  [/^\/equipo-vants/, "Equipo VANTS — VANTS GAMES", "Conoce al roster oficial de VANTS GAMES y sus jugadores competitivos."],
  [/^\/ranking/, "Ranking global — VANTS GAMES", "Clasificación en vivo de jugadores VANTS por ELO de FACEIT, K/D, winrate y XP de plataforma."],
  [/^\/ranked/, "VANTS Ranked — VANTS GAMES", "Competición por rango propio de VANTS para VALORANT y Counter-Strike 2."],
  [/^\/clips/, "Clips — VANTS GAMES", "Las mejores jugadas destacadas y recientes de la comunidad VANTS por videojuego."],
  [/^\/noticias/, "Noticias — VANTS GAMES", "Anuncios oficiales, novedades de temporada y comunicados del circuito VANTS."],
  [/^\/en-vivo/, "Twitch y Kick en vivo — VANTS GAMES", "Canales registrados de la comunidad VANTS emitiendo en directo en Twitch y Kick."],
  [/^\/comunidad/, "Comunidad — VANTS GAMES", "Actividad reciente, noticias, eventos y creadores oficiales de VANTS GAMES."],
  [/^\/membresias/, "Membresías — VANTS GAMES", "Compara planes VANTS PRO, VANTS CREATOR y Pase de temporada S4 para competir sin límites."],
  [/^\/insignias/, "Insignias — VANTS GAMES", "Catálogo completo de insignias 3D verificadas y los 1000 logros competitivos de VANTS."],
  [/^\/tienda/, "Tienda oficial — VANTS GAMES", "Ropa, jerseys y accesorios oficiales de la marca VANTS GAMES."],
  [/^\/privacidad/, "Política de privacidad — VANTS GAMES", "Qué datos trata VANTS GAMES y qué derechos tienes sobre tu cuenta."],
  [/^\/terminos/, "Términos de servicio — VANTS GAMES", "Reglas de uso y participación en la plataforma VANTS GAMES."],
];

function setMeta(selector: string, attr: string, value: string) {
  document.querySelector(selector)?.setAttribute(attr, value);
}

export function useSeo() {
  const [path] = useLocation();
  useEffect(() => {
    const hit = SEO.find(([re]) => re.test(path));
    const title = hit ? hit[1] : "VANTS GAMES — Esports & Torneos";
    const desc = hit
      ? hit[2]
      : "Plataforma competitiva de esports en Venezuela y Latinoamérica para 11 videojuegos.";
    const base = String(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonical = base + (path.startsWith("/") ? path : "/" + path);

    document.title = title;
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:url"]', "content", canonical);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", canonical);

    const ldId = "vants-route-ld";
    let script = document.getElementById(ldId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = ldId;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(buildBreadcrumbJsonLd(path, title, base));
  }, [path]);
}
