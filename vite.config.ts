import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { SEO, RUTAS_PRE_RENDER } from "./client/src/lib/seoRutas";
import { renderRuta } from "./script/ci/prerenderSeo";

/**
 * Pre-render de metadatos por ruta (solo en el build web de producción).
 * El servidor resuelve /torneos → torneos.html, así que cada ruta estática sale con su título,
 * descripción, canonical y Open Graph en el HTML inicial. Si falta algo, el build avisa y sigue:
 * el SEO nunca puede impedir un despliegue.
 */
function PreRenderSeo(): Plugin {
  let activo = false;
  let base = "";
  return {
    name: "vants-prerender-seo",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      const sitio = (process.env.VITE_SITE_URL || "").replace(/\/$/, "");
      // Solo la web pública: rutas limpias, dominio conocido y base absoluta. Nunca la app nativa.
      activo = process.env.VITE_ROUTER === "history" && process.env.VITE_NATIVE_APP !== "1" && !!sitio && config.base === "/";
      base = sitio;
    },
    generateBundle(_options, bundle) {
      if (!activo) return;
      const entrada = bundle["index.html"];
      if (!entrada || entrada.type !== "asset") {
        this.warn("Pre-render SEO: no se encontró index.html en el bundle; se omite");
        return;
      }
      const html = typeof entrada.source === "string" ? entrada.source : new TextDecoder().decode(entrada.source);
      let generadas = 0;
      for (const ruta of RUTAS_PRE_RENDER) {
        const hit = SEO.find(([re]) => re.test(ruta));
        if (!hit) {
          this.warn(`Pre-render SEO: ruta sin metadatos, se omite: ${ruta}`);
          continue;
        }
        this.emitFile({ type: "asset", fileName: `${ruta.slice(1)}.html`, source: renderRuta(html, { ruta, titulo: hit[1], descripcion: hit[2], base }) });
        generadas++;
      }
      this.info(`Pre-render SEO: ${generadas} rutas con sus metadatos`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      disable: process.env.VITE_NATIVE_APP === "1",
      registerType: "autoUpdate",
      includeAssets: ["brand/vants-mark.svg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png"],
      manifest: {
        id: "/",
        name: "VANTS GAMES — Esports & Torneos",
        short_name: "VANTS",
        description: "Plataforma competitiva de 11 videojuegos con torneos, rankings, clips y Centro Workspace en Venezuela y Latinoamérica.",
        theme_color: "#0A0A0B",
        background_color: "#0A0A0B",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "es",
        dir: "ltr",
        categories: ["games", "entertainment"],
        shortcuts: [
          { name: "Torneos", short_name: "Torneos", description: "Torneos del circuito VANTS", url: "/torneos" },
          { name: "Ranking global", short_name: "Ranking", description: "Ranking global de jugadores VANTS", url: "/ranking" },
        ],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["index.html"],
        // Sin fallback de navegación automático: respondía TODA navegación con el index.html
        // precacheado, así que tras cada despliegue la PWA abría la versión anterior (o en blanco
        // si sus bundles ya no existían) y también se quedaba las descargas (/VANTSMovil.apk).
        // Las navegaciones van ahora a la regla «red primero» de runtimeCaching.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            // Misma lista que antes se excluía del fallback; inline porque Workbox copia esta función al SW.
            urlPattern: ({ request, url }) => {
              if (request.mode !== "navigate") return false;
              return ![/^\/auth\//, /^\/api\//, /^\/int\//, /^\/fn\//, /^\/pro\//, /^\/\.well-known\//, /^\/assets\//].some((re) => re.test(url.pathname));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "vants-paginas",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [200] },
              // Una sola entrada para todas las rutas: la aplicación es la misma, así cualquier ruta
              // abre sin conexión (igual que antes) y la caché no crece con cada página visitada.
              plugins: [{ cacheKeyWillBeUsed: async () => "/index.html" }],
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    PreRenderSeo(),
  ],
  envDir: path.resolve(import.meta.dirname),
  define: {
    "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
    ),
    "import.meta.env.VITE_INT_ORIGIN": JSON.stringify(
      process.env.VITE_INT_ORIGIN || "https://int.vants.cc",
    ),
    "import.meta.env.VITE_FN_ORIGIN": JSON.stringify(
      process.env.VITE_FN_ORIGIN || "https://fn.vants.cc",
    ),
    "import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_ID": JSON.stringify(
      process.env.VITE_GOOGLE_CLOUD_PROJECT_ID || process.env.GCP_PROJECT_ID || "semiotic-ion-508913-r1",
    ),
    "import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER": JSON.stringify(
      process.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER || process.env.GCP_PROJECT_NUMBER || "238603325169",
    ),
    "import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID": JSON.stringify(
      process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
        "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com",
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      allow: [path.resolve(import.meta.dirname)],
      deny: ["**/.*"],
    },
  },
});
