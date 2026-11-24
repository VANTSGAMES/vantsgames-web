/**
 * Detección de juegos instalados y servicios de Google Play Juegos en Android,
 * tablets, iOS y navegadores.
 *
 * En Android / Tablet (Capacitor nativo):
 * - Consulta al plugin nativo `VantsGames` que usa PackageManager + `<queries>`.
 * - Interactúa con Google Play Games Services v2 (PlayGamesSdk).
 *
 * En iOS (Capacitor nativo o navegador):
 * - Consulta esquemas de URL registrados y enlaces universales.
 *
 * En Web / Escritorio:
 * - Proporciona estado de vinculación (Riot, FACEIT, Epic Games, Steam) y
 *   guía de descarga oficial en Google Play Store / App Store.
 */

export interface DefJuegoDispositivo {
  slug: string;
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
  bannerUri?: string;
  currentLevel?: number;
  error?: string;
}

export interface InfoDispositivo {
  esNativo: boolean;
  plataforma: "android" | "ios" | "web";
  esTablet: boolean;
  marca?: string;
  modelo?: string;
  versionSo?: string;
}

/** Catálogo de juegos móviles y multiplataforma admitidos con sus identificadores de tienda */
export const CATALOGO_JUEGOS_DISPOSITIVO: DefJuegoDispositivo[] = [
  {
    slug: "freefire",
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
    nombre: "Call of Duty: Warzone Mobile",
    etiqueta: "WARZONE MOBILE",
    plataforma: "Móvil",
    categoria: "Shooter / Battle Royale",
    androidPackage: "com.activision.callofduty.warzone",
    androidPackagesAlt: ["com.activision.callofduty.shooter"],
    iosScheme: "codm://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.activision.callofduty.warzone",
    appStoreUrl: "https://apps.apple.com/app/id1638368439",
    img: "img/juegos/warzone.jpg",
  },
  {
    slug: "fc27",
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
    slug: "brawlstars",
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
    nombre: "PUBG Mobile",
    etiqueta: "PUBG MOBILE",
    plataforma: "Móvil",
    categoria: "Battle Royale",
    androidPackage: "com.tencent.ig",
    iosScheme: "pubgmobile://",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.tencent.ig",
    appStoreUrl: "https://apps.apple.com/app/id1330123889",
  },
  {
    slug: "fortnite",
    nombre: "Fortnite Mobile",
    etiqueta: "FORTNITE",
    plataforma: "Móvil",
    categoria: "Battle Royale",
    androidPackage: "com.epicgames.fortnite",
    playStoreUrl: "https://store.epicgames.com/mobile",
    img: "img/juegos/fortnite.jpg",
  },
];

/** Acceso tipado al objeto Capacitor en window */
function getCapacitor(): any {
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    return (window as any).Capacitor;
  }
  return null;
}

/** Devuelve información del dispositivo y entorno actual */
export async function detectarDispositivo(): Promise<InfoDispositivo> {
  const cap = getCapacitor();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const esAndroidUA = /android/.test(ua);
  const esIosUA = /iphone|ipad|ipod/.test(ua);
  const esTabletUA = /ipad/.test(ua) || (esAndroidUA && !/mobile/.test(ua)) || (typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth <= 1366 && "ontouchstart" in window);

  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const plataforma = cap.getPlatform ? cap.getPlatform() : (esAndroidUA ? "android" : "ios");
    try {
      if (cap.Plugins?.VantsGames?.getDeviceInfo) {
        const info = await cap.Plugins.VantsGames.getDeviceInfo();
        return {
          esNativo: true,
          plataforma: plataforma === "android" ? "android" : "ios",
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
      plataforma: plataforma === "android" ? "android" : "ios",
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
 * Escanea y detecta los juegos instalados en el dispositivo Android/Tablet/iOS.
 */
export async function escanearJuegosInstalados(): Promise<EstadoJuegoDetectado[]> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();

  // 1. Android Nativo con Plugin VantsGames
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
        installed: boolean;
        versionName?: string;
        versionCode?: number;
      }> = res?.games || [];

      const mapa = new Map(lista.map((x) => [x.slug, x]));

      return CATALOGO_JUEGOS_DISPOSITIVO.map((def) => {
        const hit = mapa.get(def.slug);
        const instalado = Boolean(hit?.installed);
        return {
          ...def,
          instalado,
          versionName: hit?.versionName,
          versionCode: hit?.versionCode,
          puedeLanzar: instalado,
          fuenteDeteccion: instalado ? "android_package_manager" : "no_detectado",
        };
      });
    } catch (e) {
      console.warn("[VANTS] Error consultando plugin nativo de juegos:", e);
    }
  }

  // 2. Fallback estándar (Web, iOS o nativo sin respuesta del plugin)
  return CATALOGO_JUEGOS_DISPOSITIVO.map((def) => ({
    ...def,
    instalado: false,
    puedeLanzar: false,
    fuenteDeteccion: "no_detectado",
  }));
}

/**
 * Lanza un juego directamente en el dispositivo o redirige a su tienda de descarga
 */
export async function lanzarJuegoODescargar(juego: DefJuegoDispositivo | EstadoJuegoDetectado): Promise<{
  abierto: boolean;
  accion: "lanzado" | "tienda" | "url_externa";
}> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();

  // En Android nativo: pedir al plugin abrir el juego por su packageId
  if (dis.esNativo && dis.plataforma === "android" && cap?.Plugins?.VantsGames?.launchGame) {
    try {
      const res = await cap.Plugins.VantsGames.launchGame({ packageId: juego.androidPackage });
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

  // En iOS con esquema de URL
  if (dis.plataforma === "ios" && juego.iosScheme && typeof window !== "undefined") {
    try {
      window.location.href = juego.iosScheme;
      setTimeout(() => {
        if (juego.appStoreUrl) window.open(juego.appStoreUrl, "_blank");
      }, 1500);
      return { abierto: true, accion: "lanzado" };
    } catch {
      // Ignorar
    }
  }

  // Redirección a tienda según plataforma
  const urlTienda = dis.plataforma === "ios" && juego.appStoreUrl ? juego.appStoreUrl : juego.playStoreUrl;
  if (typeof window !== "undefined") {
    window.open(urlTienda, "_blank", "noopener,noreferrer");
  }
  return { abierto: false, accion: "tienda" };
}

/**
 * Consulta el estado y perfil de Google Play Games Services v2
 */
export async function obtenerPerfilPlayGames(): Promise<PerfilPlayGames> {
  const cap = getCapacitor();
  const dis = await detectarDispositivo();

  if (!dis.esNativo || dis.plataforma !== "android" || !cap?.Plugins?.VantsGames?.getPlayGamesProfile) {
    return {
      disponible: false,
      autenticado: false,
      error: "Google Play Games Services requiere la app nativa VANTS Movil en Android.",
    };
  }

  try {
    const res = await cap.Plugins.VantsGames.getPlayGamesProfile();
    return {
      disponible: true,
      autenticado: Boolean(res?.authenticated),
      playerId: res?.playerId,
      displayName: res?.displayName,
      title: res?.title,
      iconUri: res?.iconUri,
      bannerUri: res?.bannerUri,
      currentLevel: res?.currentLevel,
      error: res?.error,
    };
  } catch (err: any) {
    return {
      disponible: true,
      autenticado: false,
      error: err?.message || "Error al conectar con Google Play Juegos",
    };
  }
}

/**
 * Inicia la ventana oficial de autenticación de Google Play Juegos Services
 */
export async function autenticarPlayGames(): Promise<PerfilPlayGames> {
  const cap = getCapacitor();
  if (cap?.Plugins?.VantsGames?.signInPlayGames) {
    try {
      const res = await cap.Plugins.VantsGames.signInPlayGames();
      return {
        disponible: true,
        autenticado: Boolean(res?.authenticated),
        playerId: res?.playerId,
        displayName: res?.displayName,
        iconUri: res?.iconUri,
        currentLevel: res?.currentLevel,
      };
    } catch (e: any) {
      return {
        disponible: true,
        autenticado: false,
        error: e?.message || "Cancelado o no disponible",
      };
    }
  }
  return obtenerPerfilPlayGames();
}
