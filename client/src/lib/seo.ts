import { useEffect } from "react";
import { useLocation } from "wouter";
import { buildBreadcrumbJsonLd } from "./competitive";

/** Títulos y descripciones por ruta. En Cloudflare el Worker inyecta los mismos metadatos en el HTML inicial. */
export const SEO: [RegExp, string, string][] = [
  [/^\/$/, "VANTS GAMES — Torneos, Rankings y Esports en LATAM", "Compite en 11 videojuegos con VANTS GAMES: torneos con bracket, rankings verificados de FACEIT y Riot, clips y comunidad esports en Venezuela y LATAM."],
  [/^\/torneos\/competir/, "Competir — VANTS GAMES", "Inscribe a tu equipo en torneos abiertos de los once juegos del circuito VANTS y compite por premios."],
  [/^\/torneos\/crear/, "Crear mi torneo — VANTS GAMES", "Organiza tu propio torneo de comunidad con bracket y gestión en servidor dentro del circuito VANTS."],
  [/^\/crear-torneo/, "Crear mi torneo — VANTS GAMES", "Organiza tu propio torneo de comunidad con bracket y gestión en servidor dentro del circuito VANTS."],
  [/^\/directos/, "Twitch y Kick en vivo — VANTS GAMES", "Canales registrados de la comunidad VANTS emitiendo en directo en Twitch y Kick."],
  [/^\/pase-s4/, "Pase de Temporada S4 — VANTS GAMES", "Un solo pago de 7,99 € para toda la temporada S4 (180 días): insignia PLUS, sello PRO e inscripciones sin fee."],
  [/^\/empresas/, "VANTS para Empresas — VANTS GAMES", "Torneos patrocinados, perfil de empresa verificado y eventos a medida para marcas de la industria gamer en Latinoamérica."],
  [/^\/torneos/, "Torneos — VANTS GAMES", "Explora torneos próximos, en curso y archivados de los once videojuegos competitivos del circuito VANTS."],
  [/^\/workspace/, "Centro Workspace — VANTS GAMES", "Gestiona reglamentos, hojas de torneo, scrims en Calendar, salas Meet, tareas y comunicaciones con Google Workspace."],
  [/^\/arena-3d/, "Arena 3D — VANTS GAMES", "Explora el trofeo oficial de la Temporada 4 en un visor 3D interactivo con vista explotada y acabados PBR."],
  [/^\/agenda/, "Agenda en vivo — VANTS GAMES", "Consulta partidos en directo y próximos enfrentamientos del circuito competitivo VANTS GAMES."],
  [/^\/resultados/, "Resultados — VANTS GAMES", "Revisa los últimos resultados oficiales registrados en los torneos de VANTS GAMES."],
  [/^\/bracket/, "Bracket principal — VANTS GAMES", "Sigue el cuadro interactivo y avance de rondas del torneo principal en curso."],
  [/^\/sala/, "Sala de jugadores — VANTS GAMES", "Descubre jugadores del circuito VANTS y cuentas competitivas registradas con estadísticas reales."],
  [/^\/equipos/, "Equipos — VANTS GAMES", "Equipos del circuito VANTS por videojuego con su plantilla, historial y resultados."],
  [/^\/equipo-vants/, "Equipo VANTS — VANTS GAMES", "Conoce al roster oficial de VANTS GAMES y sus jugadores competitivos."],
  [/^\/ranking/, "Ranking global — VANTS GAMES", "Clasificación en vivo de jugadores VANTS por ELO de FACEIT, K/D, winrate y XP de plataforma."],
  [/^\/ranked/, "VANTS Ranked — VANTS GAMES", "Competición por rango propio de VANTS para VALORANT y Counter-Strike 2."],
  [/^\/clips/, "Clips — VANTS GAMES", "Las mejores jugadas destacadas y recientes de la comunidad VANTS por videojuego."],
  [/^\/noticias/, "Noticias — VANTS GAMES", "Anuncios oficiales, novedades de temporada y comunicados del circuito VANTS."],
  [/^\/en-vivo/, "Twitch y Kick en vivo — VANTS GAMES", "Canales registrados de la comunidad VANTS emitiendo en directo en Twitch y Kick."],
  [/^\/comunidad\/lfg/, "Buscador de Equipo y Scrims (LFG / LFT) — VANTS GAMES", "Encuentra equipo, recluta jugadores o pacta scrims en los 11 videojuegos del circuito VANTS con expiración automática a 7 días."],
  [/^\/comunidad\/foro/, "Muro y Foro por Juego — VANTS GAMES", "Publicaciones cortas de la comunidad VANTS con etiquetas de Discusión, Guía / Lineup, Highlight, Torneo y Debate, reacciones GG/Fuego y comentarios."],
  [/^\/comunidad\/misiones/, "Retos y Misiones Semanales — VANTS GAMES", "Completa misiones semanales de clips, torneos, perfil y comunidad para sumar XP de Temporada 4 y entrar al Top de contribuidores."],
  [/^\/comunidad\/votaciones/, "Encuestas Oficiales y Pick'em — VANTS GAMES", "Vota por el próximo torneo comunitario, elige el Clip de la Semana o MVP y compite en el Pick'em oficial de finales con ranking de aciertos."],
  [/^\/(comunidad\/)?eventos/, "Eventos y Showmatches (RSVP) — VANTS GAMES", "Reserva tu cupo con RSVP y check-in en vivo para showmatches, scrims abiertas, copas relámpago y watch parties oficiales de VANTS GAMES."],
  [/^\/comunidad/, "Comunidad — VANTS GAMES", "Actividad reciente, buscador LFG/LFT, muro por juego, misiones semanales, votaciones Pick'em, eventos RSVP, noticias y creadores oficiales de VANTS GAMES."],
  [/^\/membresias/, "Membresías — VANTS GAMES", "Compara planes VANTS PRO, VANTS CREATOR y Pase de temporada S4 para competir sin límites."],
  [/^\/insignias/, "Insignias — VANTS GAMES", "Catálogo completo de insignias 3D verificadas y los 1000 logros competitivos de VANTS."],
  [/^\/tienda/, "Tienda oficial — VANTS GAMES", "Ropa, jerseys y accesorios oficiales de la marca VANTS GAMES."],
  [/^\/entrar/, "Iniciar sesión — VANTS GAMES", "Accede a tu cuenta de VANTS GAMES con Google o con un código de 6 dígitos en tu correo."],
  [/^\/registro/, "Crear cuenta — VANTS GAMES", "Crea tu cuenta gratis en VANTS GAMES con Google o correo electrónico para competir en torneos y rankings."],
  [/^\/recuperar/, "Acceder con código — VANTS GAMES", "Entra a tu cuenta de VANTS GAMES con un código temporal de 6 dígitos enviado a tu correo."],
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
