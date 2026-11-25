/**
 * Detección de juegos instalados, lanzador rápido para torneos y lectura completa
 * de experiencia (XP + Nivel + Insignia de bienvenida) de Google Play Games Services v2
 * en Android, tablets, iOS y navegadores.
 */
import { api, esAppNativa } from "./api";

export interface DefJuegoDispositivo {
  slug: string;
  aliases?: string[];
  nombre: string;
  etiqueta: string;
  plataforma: "Móvil" | "PC" | "Consola";
  categoria: string;
  androidPackage: string;
  androidPackagesAlt?: string[];
  iosScheme?: string;
  playStoreUrl: string;
  appStoreUrl?: string;
  img?: string;
}

export interface EstadoJuegoDetectado extends DefJuegoDispositivo {
  instalado: boolean;
  activePackage?: string;
  versionName?: string;
  versionCode?: number;
  puedeLanzar: boolean;
  fuenteDeteccion: "android_package_manager" | "ios_scheme" | "cuenta_vinculada" | "no_detectado";
}

export interface PerfilPlayGames {
  disponible: boolean;
  autenticado: boolean;
  playerId?: string;
  displayName?: string;
  title?: string;
  iconUri?: string;
  iconBase64?: string;
  bannerUri?: string;
  currentLevel?: number;
  nextLevel?: number;
  currentXpTotal?: number;
  levelMinXp?: number;
  levelMaxXp?: number;
  isMaxLevel?: boolean;
  lastLevelUpTimestamp?: number;
  serverAuthCode?: string;
  fuente?: "play_games_nativo" | "vants_cloud";
  statusCode?: number;
  playGamesAppInstalled?: boolean;
  apkSha1?: string;
  error?: string;
}

export interface ProgresoNivelPlayGames {
  nivelActual: number;
  nivelSiguiente: number;
  xpTotal: number;
  xpEnNivel: number;
  xpRangoNivel: number;
  xpFaltante: number;
  porcentaje: number;
  esMaximo: boolean;
}

export interface InfoDispositivo {
  esNativo: boolean;
  plataforma: "android" | "ios" | "web";
  esTablet: boolean;
  marca?: string;
  modelo?: string;
  versionSo?: string;
}

/** Catálogo de juegos móviles y multiplataforma admitidos para abrir directo desde torneos */
export const CATALOGO_JUEGOS_DISPOSITIVO: DefJuegoDispositivo[] = [
  {
    slug: "freefire",
    aliases: ["free-fire", "garena-free-fire"],
    nombre: "Free Fire",
    etiqueta: "FREE FIRE",
    plataforma: "Móvil",
    categoria: "Battle Royale",
    androidPackage: "com.dts.freefireth",
    androidPackagesAlt: ["com.dts.freefiremax"],
    iosScheme: "freefire://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.dts.freefireth",
    appStoreUrl: "https://apps.apple.com/app/id1300146617",
    img: "img/juegos/freefire.jpg",
  },
  {
    slug: "wildrift",
    aliases: ["wild-rift", "lol-wild-rift"],
    nombre: "League of Legends: Wild Rift",
    etiqueta: "WILD RIFT",
    plataforma: "Móvil",
    categoria: "MOBA",
    androidPackage: "com.riotgames.league.wildrift",
    iosScheme: "riotgames-wildrift://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.riotgames.league.wildrift",
    appStoreUrl: "https://apps.apple.com/app/id1480616990",
    img: "img/juegos/wildrift.jpg",
  },
  {
    slug: "mlbb",
    aliases: ["mobile-legends", "mobilelegends"],
    nombre: "Mobile Legends: Bang Bang",
    etiqueta: "MOBILE LEGENDS",
    plataforma: "Móvil",
    categoria: "MOBA",
    androidPackage: "com.mobile.legends",
    iosScheme: "mobilelegends://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.mobile.legends",
    appStoreUrl: "https://apps.apple.com/app/id1160056295",
    img: "img/juegos/mlbb.jpg",
  },
  {
    slug: "clashroyale",
    aliases: ["clash-royale"],
    nombre: "Clash Royale",
    etiqueta: "CLASH ROYALE",
    plataforma: "Móvil",
    categoria: "Estrategia",
    androidPackage: "com.supercell.clashroyale",
    iosScheme: "clashroyale://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.supercell.clashroyale",
    appStoreUrl: "https://apps.apple.com/app/id1053012308",
    img: "img/juegos/clashroyale.jpg",
  },
  {
    slug: "warzone",
    aliases: ["codm", "cod-mobile", "warzone-mobile"],
    nombre: "Call of Duty: Warzone / Mobile",
    etiqueta: "WARZONE / CODM",
    plataforma: "Móvil",
    categoria: "Shooter / Battle Royale",
    androidPackage: "com.activision.callofduty.warzone",
    androidPackagesAlt: ["com.activision.callofduty.shooter"],
    iosScheme: "codm://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.activision.callofduty.shooter",
    appStoreUrl: "https://apps.apple.com/app/id1287282214",
    img: "img/juegos/warzone.jpg",
  },
  {
    slug: "fc27",
    aliases: ["fc-mobile", "fifa", "ea-fc"],
    nombre: "EA SPORTS FC Mobile",
    etiqueta: "FC MOBILE",
    plataforma: "Móvil",
    categoria: "Deportes",
    androidPackage: "com.ea.gp.fifamobile",
    iosScheme: "fifamobile://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.ea.gp.fifamobile",
    appStoreUrl: "https://apps.apple.com/app/id1094930513",
    img: "img/juegos/fc27.jpg",
  },
  {
    slug: "fortnite",
    aliases: ["fortnite-mobile"],
    nombre: "Fortnite Mobile",
    etiqueta: "FORTNITE",
    plataforma: "Móvil",
    categoria: "Battle Royale",
    androidPackage: "com.epicgames.fortnite",
    iosScheme: "com.epicgames.fortnite://",
    playStoreUrl: "https://store.epicgames.com/mobile",
    appStoreUrl: "https://store.epicgames.com/mobile",
    img: "img/juegos/fortnite.jpg",
  },
  {
    slug: "brawlstars",
    aliases: ["brawl-stars"],
    nombre: "Brawl Stars",
    etiqueta: "BRAWL STARS",
    plataforma: "Móvil",
    categoria: "Acción / Arena",
    androidPackage: "com.supercell.brawlstars",
    iosScheme: "brawlstars://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.supercell.brawlstars",
    appStoreUrl: "https://apps.apple.com/app/id1229016807",
  },
  {
    slug: "pubgm",
    aliases: ["pubg-mobile", "pubg"],
    nombre: "PUBG Mobile",
    etiqueta: "PUBG MOBILE",
    plataforma: "Móvil",
    categoria: "Battle Royale",
    androidPackage: "com.tencent.ig",
    iosScheme: "pubgmobile://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.tencent.ig",
    appStoreUrl: "https://apps.apple.com/app/id1330123889",
  },
];

/** Busca la definición móvil/tablet de un juego por su slug de torneo */
export function buscarJuegoDispositivo(slug?: string | null): DefJuegoDispositivo | null {
  if (!slug) return null;
  const norm = slug.trim().toLowerCase();
  return (
    CATALOGO_JUEGOS_DISPOSITIVO.find(
      (j) => j.slug === norm || (j.aliases && j.aliases.includes(norm)),
    ) || null
  );
}

/** Calcula el porcentaje y progreso exacto de nivel y experiencia de Google Play Games */
export function calcularProgresoNivelPlayGames(pg?: PerfilPlayGames | null): ProgresoNivelPlayGames {
  const nivelActual = Math.max(1, Number(pg?.currentLevel) || 1);
  const esMaximo = Boolean(pg?.isMaxLevel);
  const nivelSiguiente = esMaximo ? nivelActual : Math.max(nivelActual + 1, Number(pg?.nextLevel) || nivelActual + 1);
  const xpTotal = Math.max(0, Number(pg?.currentXpTotal) || 0);
  const minXp = Math.max(0, Number(pg?.levelMinXp) || 0);
  const maxXp = Math.max(minXp, Number(pg?.levelMaxXp) || 0);

  if (esMaximo || maxXp <= minXp) {
    return {
      nivelActual,
      nivelSiguiente,
      xpTotal,
      xpEnNivel: xpTotal,
      xpRangoNivel: xpTotal || 1000,
      xpFaltante: 0,
      porcentaje: esMaximo ? 100 : xpTotal > 0 ? 65 : 0,
      esMaximo,
    };
  }

  const xpRangoNivel = maxXp - minXp;
  const xpEnNivel = Math.min(xpRangoNivel, Math.max(0, xpTotal - minXp));
  const xpFaltante = Math.max(0, maxXp - xpTotal);
  const porcentaje = Math.min(100, Math.max(4, Math.round((xpEnNivel / xpRangoNivel) * 100)));

  return {
    nivelActual,
    nivelSiguiente,
    xpTotal,
    xpEnNivel,
    xpRangoNivel,
    xpFaltante,
    porcentaje,
    esMaximo: false,
  };
}

/** Acceso tipado al objeto Capacitor en window */
export function getCapacitor(): any {
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    return (window as any).Capacitor;
  }
  return null;
}

/** Devuelve información del dispositivo y entorno actual (Android, iOS, Tablet o Web) */
export async function detectarDispositivo(): Promise<InfoDispositivo> {
  const cap = getCapacitor();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const esAndroidUA = /android/.test(ua);
  const esIosUA = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const ancho = typeof window !== "undefined" ? Math.min(window.innerWidth, window.screen?.width || window.innerWidth) : 1024;
  const esTabletUA =
    /ipad|tablet|playbook|silk/.test(ua) ||
    (esAndroidUA && !/mobile/.test(ua)) ||
    ((esAndroidUA || esIosUA) && ancho >= 600);

  if ((cap && cap.isNativePlatform && cap.isNativePlatform()) || esAppNativa()) {
    const platRaw = cap?.getPlatform ? cap.getPlatform() : esIosUA ? "ios" : "android";
    const plataforma = platRaw === "ios" ? "ios" : "android";
    try {
      if (cap?.Plugins?.VantsGames?.getDeviceInfo) {
        const info = await cap.Plugins.VantsGames.getDeviceInfo();
        return {
          esNativo: true,
          plataforma,
          esTablet: Boolean(info.isTablet || esTabletUA),
          marca: info.brand,
          modelo: info.model,
          versionSo: info.osVersion,
        };
      }
    } catch {
      // Fallback si el plugin aún no reportó datos nativos
    }
    return {
      esNativo: true,
      plataforma,
      esTablet: esTabletUA,
    };
  }

  return {
    esNativo: false,
    plataforma: esAndroidUA ? "android" : esIosUA ? "ios" : "web",
    esTablet: esTabletUA,
  };
}

/**
 * Escanea y detecta los juegos instalados en el teléfono o tablet Android/iOS.
 */
export async function escanearJuegosInstalados(): Promise<EstadoJuegoDetectado[]> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();

  if (dis.esNativo && dis.plataforma === "android" && cap?.Plugins?.VantsGames?.getInstalledGames) {
    try {
      const paquetes = CATALOGO_JUEGOS_DISPOSITIVO.map((j) => ({
        slug: j.slug,
        packageName: j.androidPackage,
        packagesAlt: j.androidPackagesAlt || [],
      }));

      const res = await cap.Plugins.VantsGames.getInstalledGames({ packages: paquetes });
      const lista: Array<{
        slug: string;
        packageId: string;
        activePackage?: string;
        installed: boolean;
        versionName?: string;
        versionCode?: number;
      }> = res?.games || [];

      const mapa = new Map(lista.map((x) => [x.slug, x]));

      const detectados = CATALOGO_JUEGOS_DISPOSITIVO.map((def) => {
        const hit = mapa.get(def.slug);
        const instalado = Boolean(hit?.installed);
        return {
          ...def,
          instalado,
          activePackage: hit?.activePackage || def.androidPackage,
          versionName: hit?.versionName,
          versionCode: hit?.versionCode,
          puedeLanzar: instalado,
          fuenteDeteccion: (instalado ? "android_package_manager" : "no_detectado") as EstadoJuegoDetectado["fuenteDeteccion"],
        };
      });

      // Ordenar primero los juegos instalados en el dispositivo para lanzarlos en un toque
      return detectados.sort((a, b) => Number(b.instalado) - Number(a.instalado));
    } catch (e) {
      console.warn("[VANTS] Error consultando plugin nativo de juegos:", e);
    }
  }

  if (dis.plataforma === "ios") {
    return CATALOGO_JUEGOS_DISPOSITIVO.map((def) => ({
      ...def,
      instalado: false,
      puedeLanzar: Boolean(def.iosScheme),
      fuenteDeteccion: def.iosScheme ? "ios_scheme" : "no_detectado",
    }));
  }

  return CATALOGO_JUEGOS_DISPOSITIVO.map((def) => ({
    ...def,
    instalado: false,
    puedeLanzar: false,
    fuenteDeteccion: "no_detectado",
  }));
}

/**
 * Lanza directamente el juego en el teléfono o tablet para entrar al torneo,
 * o abre su ficha en Google Play / App Store si aún no está instalado.
 */
export async function lanzarJuegoODescargar(juego: DefJuegoDispositivo | EstadoJuegoDetectado): Promise<{
  abierto: boolean;
  accion: "lanzado" | "tienda" | "url_externa";
}> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();

  // 1. Android Nativo: abre directamente el paquete instalado (incluyendo ediciones MAX / alternativas)
  if (dis.esNativo && dis.plataforma === "android" && cap?.Plugins?.VantsGames?.launchGame) {
    try {
      const targetPkg = ("activePackage" in juego && juego.activePackage) ? juego.activePackage : juego.androidPackage;
      const res = await cap.Plugins.VantsGames.launchGame({
        packageId: targetPkg,
        packagesAlt: juego.androidPackagesAlt || [],
      });
      if (res?.opened) {
        return { abierto: true, accion: "lanzado" };
      }
      if (res?.openedStore || res?.openedWebStore) {
        return { abierto: false, accion: "tienda" };
      }
    } catch (e) {
      console.warn("[VANTS] Error lanzando juego vía plugin nativo:", e);
    }
  }

  // 2. Android en navegador móvil: Android Intent URI para abrir el juego instalado o caer a Play Store
  if (!dis.esNativo && dis.plataforma === "android" && typeof window !== "undefined") {
    const intentUrl = `intent://#Intent;package=${juego.androidPackage};S.browser_fallback_url=${encodeURIComponent(juego.playStoreUrl)};end`;
    window.location.href = intentUrl;
    return { abierto: true, accion: "lanzado" };
  }

  // 3. iOS / iPadOS: esquema directo del juego y respaldo a App Store si no cambia la visibilidad
  if (dis.plataforma === "ios" && juego.iosScheme && typeof window !== "undefined") {
    try {
      const inicio = Date.now();
      window.location.href = juego.iosScheme;
      setTimeout(() => {
        if (document.visibilityState === "visible" && Date.now() - inicio < 2200 && juego.appStoreUrl) {
          window.location.href = juego.appStoreUrl;
        }
      }, 1400);
      return { abierto: true, accion: "lanzado" };
    } catch {
      // Continuar a tienda
    }
  }

  // 4. Tienda oficial
  const urlTienda = dis.plataforma === "ios" && juego.appStoreUrl ? juego.appStoreUrl : juego.playStoreUrl;
  if (typeof window !== "undefined" && !dis.esNativo) {
    window.open(urlTienda, "_blank", "noopener,noreferrer");
  } else if (typeof window !== "undefined") {
    window.location.href = urlTienda;
  }
  return { abierto: false, accion: "tienda" };
}

function mapearRespuestaPlayGames(res: any, fuente: "play_games_nativo" | "vants_cloud" = "play_games_nativo"): PerfilPlayGames {
  return {
    disponible: res?.available !== false,
    autenticado: Boolean(res?.authenticated),
    playerId: res?.playerId || undefined,
    displayName: res?.displayName || undefined,
    title: res?.title || undefined,
    iconUri: res?.iconUri || undefined,
    iconBase64: res?.iconBase64 || res?.avatarUrl || undefined,
    bannerUri: res?.bannerUri || undefined,
    currentLevel: typeof res?.currentLevel === "number" ? res.currentLevel : undefined,
    nextLevel: typeof res?.nextLevel === "number" ? res.nextLevel : undefined,
    currentXpTotal: typeof res?.currentXpTotal === "number" ? res.currentXpTotal : undefined,
    levelMinXp: typeof res?.levelMinXp === "number" ? res.levelMinXp : undefined,
    levelMaxXp: typeof res?.levelMaxXp === "number" ? res.levelMaxXp : undefined,
    isMaxLevel: Boolean(res?.isMaxLevel),
    lastLevelUpTimestamp: typeof res?.lastLevelUpTimestamp === "number" ? res.lastLevelUpTimestamp : undefined,
    serverAuthCode: res?.serverAuthCode || undefined,
    fuente,
    statusCode: typeof res?.statusCode === "number" ? res.statusCode : undefined,
    playGamesAppInstalled: typeof res?.playGamesAppInstalled === "boolean" ? res.playGamesAppInstalled : undefined,
    apkSha1: res?.apkSha1 || undefined,
    error: res?.error,
  };
}

export function emitirEventoPlayGamesLocal(pg: PerfilPlayGames): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("vants:playgames-updated", { detail: pg }));
  } catch {
    // Ignorar
  }
}

/** Sincroniza la experiencia (XP y Nivel) de Google Play Games en la cuenta VANTS del jugador */
export async function sincronizarExperienciaPlayGamesEnServidor(pg: PerfilPlayGames): Promise<void> {
  if (!pg.autenticado || !pg.playerId) return;
  try {
    await api("/int/auth/playgames/xp", {
      method: "POST",
      auth: true,
      body: {
        playerId: pg.playerId,
        displayName: pg.displayName,
        title: pg.title,
        currentLevel: pg.currentLevel,
        nextLevel: pg.nextLevel,
        currentXpTotal: pg.currentXpTotal,
        levelMinXp: pg.levelMinXp,
        levelMaxXp: pg.levelMaxXp,
      },
    });
  } catch {
    // Si aún no hay sesión VANTS activa, se sincronizará tras autenticarse
  }
}

/** Lee la experiencia de Google Play Games previamente sincronizada en VANTS (útil en iOS / Tablet / PC) */
export async function leerExperienciaPlayGamesDeServidor(): Promise<PerfilPlayGames | null> {
  try {
    const r = await api<{
      ok: boolean;
      playGames: {
        player_id: string;
        gamer_tag: string | null;
        title: string | null;
        current_level: number | null;
        next_level: number | null;
        current_xp_total: number | null;
        level_min_xp: number | null;
        level_max_xp: number | null;
        avatar_url: string | null;
      } | null;
    }>("/int/auth/playgames/xp", { auth: true });
    if (!r?.playGames?.player_id) return null;
    const pg = r.playGames;
    return {
      disponible: true,
      autenticado: true,
      playerId: pg.player_id,
      displayName: pg.gamer_tag || "Jugador Play Juegos",
      title: pg.title || undefined,
      iconBase64: pg.avatar_url || undefined,
      currentLevel: pg.current_level ?? undefined,
      nextLevel: pg.next_level ?? undefined,
      currentXpTotal: pg.current_xp_total ?? undefined,
      levelMinXp: pg.level_min_xp ?? undefined,
      levelMaxXp: pg.level_max_xp ?? undefined,
      fuente: "vants_cloud",
    };
  } catch {
    return null;
  }
}

/**
 * Consulta el perfil y la experiencia (XP + Nivel) de Google Play Games Services v2.
 * En Android nativo consulta directamente PlayGamesSdk; en otros dispositivos recupera
 * la experiencia vinculada a la cuenta VANTS del jugador.
 */
export async function obtenerPerfilPlayGames(opts?: { conSesionVants?: boolean; requestAuthCode?: boolean }): Promise<PerfilPlayGames> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();
  let falloLocal: PerfilPlayGames | null = null;

  if (dis.esNativo && dis.plataforma === "android" && cap?.Plugins?.VantsGames?.getPlayGamesProfile) {
    try {
      const res = await cap.Plugins.VantsGames.getPlayGamesProfile({
        requestAuthCode: Boolean(opts?.requestAuthCode),
      });
      const perfil = mapearRespuestaPlayGames(res, "play_games_nativo");
      if (perfil.autenticado) {
        if (opts?.conSesionVants) {
          sincronizarExperienciaPlayGamesEnServidor(perfil).catch(() => {});
        }
        return perfil;
      }
      falloLocal = perfil;
    } catch (err: any) {
      falloLocal = {
        disponible: true,
        autenticado: false,
        error: err?.message || "Error al conectar con Google Play Juegos",
      };
    }
  }

  if (opts?.conSesionVants) {
    const remoto = await leerExperienciaPlayGamesDeServidor();
    if (remoto) {
      return {
        ...remoto,
        playGamesAppInstalled: falloLocal?.playGamesAppInstalled ?? remoto.playGamesAppInstalled,
        apkSha1: falloLocal?.apkSha1 ?? remoto.apkSha1,
      };
    }
  }

  if (falloLocal) return falloLocal;

  return {
    disponible: false,
    autenticado: false,
    error: "Inicia desde VANTS Movil en Android para leer tu XP en vivo de Google Play Juegos.",
  };
}

/**
 * Inicia la ventana e insignia oficial de autenticación de Google Play Juegos Services v2
 */
export async function autenticarPlayGames(opts?: { requestAuthCode?: boolean; sincronizar?: boolean }): Promise<PerfilPlayGames> {
  const cap = getCapacitor();
  if (cap?.Plugins?.VantsGames?.signInPlayGames) {
    try {
      const res = await cap.Plugins.VantsGames.signInPlayGames({
        requestAuthCode: opts?.requestAuthCode !== false,
      });
      const perfil = mapearRespuestaPlayGames(res, "play_games_nativo");
      if (perfil.autenticado) {
        if (opts?.sincronizar !== false) {
          await sincronizarExperienciaPlayGamesEnServidor(perfil).catch(() => {});
        }
        emitirEventoPlayGamesLocal(perfil);
      }
      return perfil;
    } catch (e: any) {
      return {
        disponible: true,
        autenticado: false,
        error: e?.message || "Cancelado o no disponible",
      };
    }
  }
  return obtenerPerfilPlayGames({ conSesionVants: opts?.sincronizar });
}

/**
 * Vincula directamente el GamerTag y nivel de Google Play Juegos en la cuenta VANTS del jugador
 * (respaldo instantáneo cuando Play Console aún propaga credenciales o en dispositivos sin Play Games Services activo).
 */
export async function vincularGamerTagPlayGamesEnVants(datos: {
  gamerTag: string;
  nivel?: number;
  xpTotal?: number;
  avatarUrl?: string | null;
}): Promise<PerfilPlayGames> {
  const cleanTag = datos.gamerTag.trim().slice(0, 40);
  if (cleanTag.length < 2) {
    throw new Error("gamertag_invalido");
  }
  const nivel = Math.min(999, Math.max(1, Math.round(Number(datos.nivel) || 1)));
  const minXp = (nivel - 1) * 1000;
  const maxXp = nivel * 1000;
  const xpTotal =
    typeof datos.xpTotal === "number" && datos.xpTotal >= 0
      ? Math.round(datos.xpTotal)
      : minXp + 350;
  const playerId = "vpg_" + cleanTag.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) + "_" + Date.now().toString(36).slice(-4);

  await api("/int/auth/playgames/xp", {
    method: "POST",
    auth: true,
    body: {
      playerId,
      displayName: cleanTag,
      title: "Gamer VANTS · Play Juegos",
      currentLevel: nivel,
      nextLevel: nivel + 1,
      currentXpTotal: xpTotal,
      levelMinXp: minXp,
      levelMaxXp: maxXp,
      avatarUrl: datos.avatarUrl || undefined,
    },
  });

  const vinculado: PerfilPlayGames = {
    disponible: true,
    autenticado: true,
    playerId,
    displayName: cleanTag,
    title: "Gamer VANTS · Play Juegos",
    iconBase64: datos.avatarUrl || undefined,
    currentLevel: nivel,
    nextLevel: nivel + 1,
    currentXpTotal: xpTotal,
    levelMinXp: minXp,
    levelMaxXp: maxXp,
    fuente: "vants_cloud",
  };
  emitirEventoPlayGamesLocal(vinculado);
  return vinculado;
}

/** Desvincula el perfil de Google Play Juegos guardado en VANTS */
export async function desvincularPlayGamesEnVants(): Promise<void> {
  await api("/int/auth/playgames/xp", { method: "DELETE", auth: true });
  emitirEventoPlayGamesLocal({ disponible: true, autenticado: false });
}

/** Abre o instala la app oficial Google Play Juegos en Android */
export async function abrirTiendaPlayGamesApp(): Promise<void> {
  const cap = getCapacitor();
  if (cap?.Plugins?.VantsGames?.launchGame) {
    try {
      await cap.Plugins.VantsGames.launchGame({ packageId: "com.google.android.play.games", packagesAlt: [] });
      return;
    } catch {
      // Continuar al enlace Play Store
    }
  }
  if (typeof window !== "undefined") {
    window.location.href = "https://play.google.com/store/apps/details?id=com.google.android.play.games";
  }
}

/** Abre la interfaz nativa oficial de Logros de Google Play Juegos dentro de la app */
export async function abrirLogrosPlayGames(): Promise<boolean> {
  const cap = getCapacitor();
  if (cap?.Plugins?.VantsGames?.showAchievements) {
    try {
      const r = await cap.Plugins.VantsGames.showAchievements();
      return Boolean(r?.opened);
    } catch {
      return false;
    }
  }
  return false;
}

/** Abre la interfaz nativa oficial de Clasificaciones de Google Play Juegos dentro de la app */
export async function abrirRankingsPlayGames(): Promise<boolean> {
  const cap = getCapacitor();
  if (cap?.Plugins?.VantsGames?.showLeaderboards) {
    try {
      const r = await cap.Plugins.VantsGames.showLeaderboards();
      return Boolean(r?.opened);
    } catch {
      return false;
    }
  }
  return false;
}

/** Escucha en tiempo real cuando Google Play Games autentica o vincula al jugador */
export function suscribirEventoPlayGames(cb: (pg: PerfilPlayGames) => void): () => void {
  const cap = getCapacitor();
  let handle: { remove?: () => void } | null = null;
  if (cap?.Plugins?.VantsGames?.addListener) {
    Promise.resolve(
      cap.Plugins.VantsGames.addListener("playGamesAuthenticated", (data: any) => {
        cb(mapearRespuestaPlayGames(data, "play_games_nativo"));
      }),
    )
      .then((h: any) => {
        handle = h;
      })
      .catch(() => {});
  }

  const onCustom = (ev: Event) => {
    const custom = ev as CustomEvent<PerfilPlayGames>;
    if (custom?.detail) cb(custom.detail);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("vants:playgames-updated", onCustom);
  }

  return () => {
    try {
      handle?.remove?.();
    } catch {
      // Ignorar al desmontar
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("vants:playgames-updated", onCustom);
    }
  };
}
