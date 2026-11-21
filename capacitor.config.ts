import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App VANTS GAMES (Android): shell nativo alrededor de la web en vivo.
 * server.url apunta a producción: la app siempre muestra lo que hay en
 * vants.cc (muro de miembros, torneos, Auth0) sin rebuilds por versión.
 * La web ya es PWA; este envoltorio añade icono, splash y APK con Releases.
 */
const config: CapacitorConfig = {
  appId: "cc.vants.app",
  appName: "VANTS GAMES",
  webDir: "dist-app",
  server: {
    url: "https://vants.cc",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0A0A0B",
  },
};

export default config;
