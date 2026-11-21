export interface NavLink { label: string; to: string; hint?: string; privado?: boolean }
export interface NavGroup { label: string; base: string; links: NavLink[] }

/**
 * Navegación principal: 4 grupos desplegables + el enlace directo Empresas
 * (ver Layout.tsx). La Tienda permanece fuera del menú hasta tener catálogo
 * activo; páginas como foro, misiones o workspace siguen accesibles desde
 * el buscador (⌘K), el perfil y enlaces internos.
 */
export const NAV: NavGroup[] = [
  { label: "Competición", base: "/torneos", links: [
    { label: "Torneos activos", to: "/torneos", hint: "Próximos, en curso y archivo" },
    { label: "Crear mi torneo", to: "/crear-torneo", hint: "Torneos de comunidad · con plan VANTS" },
    { label: "Agenda en vivo", to: "/agenda", hint: "Partidos en directo y próximos" },
    { label: "Últimos resultados", to: "/resultados" },
  ]},
  { label: "Sala & Ranking", base: "/sala", links: [
    { label: "Ranking global", to: "/ranking", hint: "Jugadores VANTS por ELO de FACEIT" },
    { label: "VANTS Ranked", to: "/ranked", hint: "Competición por rango" },
    { label: "Equipos del circuito", to: "/equipos", hint: "Plantillas y fichas" },
    { label: "Sala de jugadores", to: "/sala", hint: "Jugadores registrados en VANTS" },
  ]},
  { label: "Comunidad", base: "/comunidad", links: [
    { label: "Clips destacados", to: "/clips" },
    { label: "Directos Twitch & Kick", to: "/directos", hint: "Canales de la comunidad en vivo" },
    { label: "Noticias y anuncios", to: "/noticias" },
    { label: "Eventos", to: "/eventos" },
  ]},
  { label: "Planes", base: "/membresias", links: [
    { label: "Membresías PRO y CREATOR", to: "/membresias", hint: "Juega con ventaja" },
    { label: "Pase de Temporada S4", to: "/pase-s4", hint: "7,99 € · 180 días" },
    { label: "Insignias desbloqueables", to: "/insignias", hint: "Catálogo y 1000 logros" },
  ]},
];

export const PERFIL_LINKS: NavLink[] = [
  { label: "Mi perfil", to: "/perfil" },
  { label: "Estadísticas", to: "/perfil/estadisticas" },
  { label: "Mis equipos", to: "/perfil/equipos" },
  { label: "Mis torneos", to: "/perfil/torneos" },
  { label: "Mis clips", to: "/perfil/clips" },
  { label: "Insignias y logros", to: "/logros" },
  { label: "Membresía", to: "/perfil/membresia" },
  { label: "Cuentas vinculadas", to: "/perfil/cuentas" },
  { label: "Workspace Pro", to: "/workspace" },
  { label: "Configuración", to: "/perfil/ajustes" },
];
