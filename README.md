# VANTS GAMES — Web Oficial, `vants-integraciones` y VANTS Movil

Plataforma competitiva oficial de **VANTS GAMES** en **[https://vants.cc](https://vants.cc)**: torneos de 11 títulos (VALORANT, CS2, Fortnite, EA Sports FC, Super Smash Bros. Ultimate, Warzone, Free Fire, League of Legends, Wild Rift, Mobile Legends y Clash Royale), sala de jugadores, clips, comunidad, eventos RSVP, misiones, votaciones, membresías e insignias 3D.

---

## Mapa del Ecosistema VANTS (`vants.cc`)

| Servicio / Worker | Dominio oficial | Repositorio |
| --- | --- | --- |
| **Web + API principal (`vants`)** | `https://vants.cc` · `https://www.vants.cc` | `VANTSGAMES/vantsgames-web` |
| **Integraciones (`vants-integraciones`)** | `https://int.vants.cc` | `VANTSGAMES/vantsgames-web` (`integraciones/`) |
| **App Android (`VANTS Movil`)** | APK firmado en GitHub Releases | `VANTSGAMES/vantsgames-web` (`capacitor.config.ts`) |
| **App Escritorio (`VANTS.exe` / PC)** | Microsoft Store + WinGet + Releases | [`VANTSGAMES/banter`](https://github.com/VANTSGAMES/banter) |
| **Bot de Discord (`vantsbot`)** | `https://bot.vants.cc` | [`VANTSGAMES/vantsbot-cf`](https://github.com/VANTSGAMES/vantsbot-cf) |
| **Webhook FACEIT (`vants-faceit-webhook`)** | `https://vants.cc/api/webhooks/faceit` | [`VANTSGAMES/vants-faceit-webhook`](https://github.com/VANTSGAMES/vants-faceit-webhook) |
| **Agente de Clips (`VANTS-Clipper`)** | WinGet + Windows CLI | [`VANTSGAMES/VANTS-Clipper`](https://github.com/VANTSGAMES/VANTS-Clipper) |
| **Funciones / Linker (`vants-functions`)** | `https://fn.vants.cc` | Cloudflare Worker |
| **Bus de eventos (`vants-bus`)** | `https://bus.vants.cc` | Cloudflare Worker |
| **Recursos / Sitemap / Verificaciones** | `recursos.vants.cc` · `sitemap.vants.cc` · `vants.cc/kick/*` · `/riot.txt` | Cloudflare Workers |

---

## Componentes en este repositorio

### 1. Frontend Web (`client/`)
- **Stack:** React + TypeScript + Vite + Tailwind CSS + wouter + TanStack Query.
- **Identidad:** VANTS Identity (Google OIDC + Email OTP + JWKS RS256 en `https://vants.cc/auth/*`, proxy first-party por Service Binding `VANTS_INT`).
- **Comunidad y juegos:** FACEIT CS2, VALORANT (Riot ID), Epic Games / Fortnite, directos Twitch & Kick, LFG, foro, misiones semanales, votaciones, eventos RSVP, Google Workspace Pro y Arenas.
- **Deploy automático:** [`.github/workflows/web-deploy.yml`](./.github/workflows/web-deploy.yml) en cada push a `main`.

### 2. Worker `vants-integraciones` (`integraciones/`)
- **Dominio:** `https://int.vants.cc`
- **Almacenamiento:** Cloudflare D1 (`DB` → `vants-db`, `ACH_DB` → `vants-logros-db`) + KV (`CLIPS_KV`).
- **Módulos principales:**
  - `src/auth.js` — VANTS Identity (Google OIDC, Email OTP, sesiones rotables, `/.well-known/openid-configuration` y `jwks.json`).
  - `src/index.js` — Perfil FACEIT, directos Twitch/Kick (cron `*/2 * * * *`), notificaciones, descarga directa sin redirección `/descargas/vants-pc/<ver>/VANTS-Setup-<ver>.exe` para Microsoft Store.
  - `src/epic.js` — OAuth 2.0 Epic Games (`https://int.vants.cc/epic/callback`) y estadísticas de Fortnite.
  - `src/juegos.js` — Catálogo de 1.000 logros (500 FACEIT CS2 + 500 VALORANT) y Riot ID.
  - `src/vidiqSeo.js` — Optimización SEO de clips/Shorts vía vidIQ MCP con cuotas diarias por membresía.
  - `src/comms.js` y `src/email.js` — Correos transaccionales (Resend) y webhooks salientes a Discord (`REGISTROS`, `COMUNIDAD`, `B2B`, `TICKETS`).
  - `src/comunidad*.js`, `src/eventosRsvp.js`, `src/extras.js`, `src/insignias.js`, `src/perfiles.js`, `src/googlePro.js`.
- **Deploy automático:** [`.github/workflows/integraciones-deploy.yml`](./.github/workflows/integraciones-deploy.yml).

### 3. App Android & Tablets — `VANTS Movil` (`capacitor.config.ts`)
- **Identificador:** `cc.vants.app` · **Nombre:** `VANTS Movil`
- **Google Play Store:** Genera tanto el bundle oficial **Android App Bundle (`.aab`)** para Play Console como el APK firmado (`.apk`).
- **Google Play Games Services v2:** Integrado con autenticación silenciosa, GamerTag y sincronización de perfil de jugador.
- **Detección de Juegos en Dispositivo:** Plugin nativo [`VantsGamesPlugin.java`](./android/app/src/main/java/cc/vants/app/VantsGamesPlugin.java) que consulta el catálogo oficial (Free Fire, Wild Rift, Mobile Legends, Clash Royale, Warzone Mobile, FC Mobile, Brawl Stars, PUBG Mobile, Fortnite) cumpliendo las políticas de Google Play mediante `<queries>` sin permisos invasivos.
- **Soporte Adaptativo:** Optimizado para smartphones, pantallas plegables y tablets (orientación, multi-window, barras oscuras `#0A0A0B`).
- **Automatización:** [`script/ci/setup-android.mjs`](./script/ci/setup-android.mjs) y [`script/ci/app-icono.mjs`](./script/ci/app-icono.mjs).
- **Release CI/CD (Canal Móvil aislado):** [`.github/workflows/app-release.yml`](./.github/workflows/app-release.yml) publica exclusivamente tags `movil-v<version>` con `VANTSMovil-<version>.aab` y `VANTSMovil-<version>.apk` en `VANTSGAMES/vantsgames-web` Releases.

### 4. Separación Estricta de Canales: PC (`banter`) vs Móvil (`vantsgames-web`)
| Canal | Repositorio | App ID | Tags de Release | Endpoints en `vants.cc` / `int.vants.cc` |
| --- | --- | --- | --- | --- |
| **PC Windows (`VANTS Desktop`)** | [`VANTSGAMES/banter`](https://github.com/VANTSGAMES/banter) | `cc.vants.desktop` | `v*` (`.github/workflows/release-desktop.yml`) | `/descargas/vants-pc/latest` y `/descargas/vants-pc/<ver>/VANTS-Setup-<ver>.exe` (solo `.exe`) |
| **Android & Tablets (`VANTS Movil`)** | `VANTSGAMES/vantsgames-web` | `cc.vants.app` | `movil-v*` (`.github/workflows/app-release.yml`) | `/VANTSMovil.apk`, `/descargas/vants-movil/latest` y `/descargas/vants-movil/<ver>/VANTSMovil-<ver>.apk` (solo `.apk` / `.aab`) |

---

## Desarrollo y pruebas locales

```bash
npm ci                 # Requiere Node 22, como CI (mejor-sqlite3 no trae binario para versiones más nuevas)
npm run dev          # Frontend + proxy local en http://localhost:5000
npm run check        # Verificación TypeScript (tsc)
node --check integraciones/src/index.js
npx tsx --test tests/*.test.ts   # Tests (varios importan sin extensión .ts y Node solo no los resuelve)
```

## Enlaces legales y soporte
- **Web:** https://vants.cc
- **Privacidad:** https://vants.cc/privacidad
- **Términos de uso:** https://vants.cc/terminos
- **Contacto:** contacto@vants.cc
