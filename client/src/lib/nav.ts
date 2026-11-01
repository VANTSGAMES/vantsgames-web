export interface NavLink { label: string; to: string; hint?: string; privado?: boolean }
export interface NavGroup { label: string; base: string; links: NavLink[] }

export const NAV: NavGroup[] = [
  { label: "Sala", base: "/sala", links: [
    { label: "Sala de jugadores", to: "/sala", hint: "Jugadores registrados en VANTS" },
    { label: "Equipos del circuito", to: "/equipos", hint: "Plantillas y fichas" },
    { label: "Equipo VANTS", to: "/equipo-vants", hint: "El roster oficial" },
    { label: "Ranking global", to: "/ranking", hint: "Clasificación calculada en servidor" },
    { label: "VANTS Ranked", to: "/ranked", hint: "Competición por rango" },
  ]},
  { label: "Torneos", base: "/torneos", links: [
    { label: "Competir", to: "/torneos/competir", hint: "Inscripciones abiertas" },
    { label: "Descubrir torneos", to: "/torneos", hint: "Próximos, en curso y archivo" },
    { label: "Agenda en vivo", to: "/agenda", hint: "Partidos en directo y próximos" },
    { label: "Últimos resultados", to: "/resultados" },
    { label: "Tu calendario", to: "/mi-calendario", privado: true },
    { label: "Bracket principal", to: "/bracket" },
    { label: "Ligas y temporadas", to: "/ligas" },
  ]},
  { label: "Clips", base: "/clips", links: [
    { label: "Clips destacados", to: "/clips" },
    { label: "Clips recientes", to: "/clips/recientes" },
    { label: "Por videojuego", to: "/clips/juego" },
    { label: "Publicar clip", to: "/clips/publicar", privado: true },
    { label: "Mi biblioteca", to: "/clips/biblioteca", privado: true },
  ]},
  { label: "Comunidad", base: "/comunidad", links: [
    { label: "Comunidad", to: "/comunidad" },
    { label: "Noticias y anuncios", to: "/noticias" },
    { label: "Eventos", to: "/eventos" },
    { label: "Twitch en vivo", to: "/en-vivo" },
    { label: "Creadores destacados", to: "/creadores" },
  ]},
  { label: "Membresías", base: "/membresias", links: [
    { label: "Planes", to: "/membresias" },
    { label: "Insignias", to: "/insignias" },
    { label: "Logros", to: "/logros", privado: true },
    { label: "Progreso", to: "/progreso", privado: true },
  ]},
  { label: "Tienda", base: "/tienda", links: [
    { label: "Tienda oficial", to: "/tienda" },
    { label: "Camisetas", to: "/tienda/camisetas" },
    { label: "Hoodies", to: "/tienda/hoodies" },
    { label: "Jerseys", to: "/tienda/jerseys" },
    { label: "Accesorios", to: "/tienda/accesorios" },
  ]},
];

export const PERFIL_LINKS: NavLink[] = [
  { label: "Mi perfil", to: "/perfil" },
  { label: "Estadísticas", to: "/perfil/estadisticas" },
  { label: "Mis equipos", to: "/perfil/equipos" },
  { label: "Mis torneos", to: "/perfil/torneos" },
  { label: "Mis clips", to: "/clips/biblioteca" },
  { label: "Insignias y logros", to: "/logros" },
  { label: "Membresía", to: "/perfil/membresia" },
  { label: "Cuentas vinculadas", to: "/perfil/cuentas" },
  { label: "Configuración", to: "/perfil/ajustes" },
];
