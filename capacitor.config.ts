import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App VANTS GAMES (Android / Tablets): shell nativo optimizado para Google Play.
 * server.url permite cargar la experiencia en vivo (vants.cc) o el bundle local dist-app/dist.
 * Incluye plugin nativo VantsGames para detección de juegos y Google Play Games Services v2.
 */
const config: CapacitorConfig = {
  appId: "cc.vants.app",
  appName: "VANTS Movil",
  webDir: "dist-app",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0A0A0B",
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: "#0A0A0B",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
