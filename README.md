# VANTS GAMES — Web pública

Web pública de VANTS GAMES para jugadores y visitantes: torneos de VALORANT y Counter-Strike 2, sala de jugadores, clips, comunidad, membresías y perfil.

> Este repositorio es independiente de **VantsHubLauche** (Dashboard interno). La administración se hace en VantsHubLauche y se comunica con esta web mediante la API autorizada del Worker de Vantsgames. Aquí no hay panel administrativo.

## Arquitectura

- **Frontend propio**: React + Vite + wouter + TanStack Query + Tailwind. No reutiliza páginas ni componentes de la web anterior.
- **Datos**: todo se lee de la API de Vantsgames (Cloudflare Worker + D1). Esta web no tiene base de datos propia. Sin Neon.
- **Proxy**: `server/routes.ts` reenvía `/api/*` al Worker de Vantsgames (`VANTS_API_ORIGIN`, por defecto el Worker de preview) y `/fn/*` a `vants-functions`.
- **Autenticación**: Auth0 (`vants.eu.auth0.com`). Se activa con `VITE_AUTH_ENABLED=1` solo en dominios registrados en Auth0. Sesiones y permisos se validan en el servidor.
- **Pagos**: Stripe Checkout real vía `vants-functions`. La web nunca activa un plan por su cuenta.
- **Tienda**: sin carrito ni pagos hasta que exista un catálogo conectado a comercio real.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5000
npm run build        # dist/public (estático) + dist/index.cjs (proxy)
```

Variables:

| Variable | Uso |
|---|---|
| `VANTS_API_ORIGIN` | Origen del Worker de Vantsgames (preview por defecto) |
| `VANTS_FN_ORIGIN` | Origen de vants-functions |
| `VITE_AUTH_ENABLED` | `1` para activar Auth0 |
| `VITE_ROUTER` | `history` para URLs limpias; por defecto hash |

## Preview en Cloudflare

Worker **`vantsgames-web-preview`** → https://vantsgames-web-preview.vants.workers.dev

- `npm run build:worker` genera `dist/worker-public` (URLs limpias) y lo embebe en `worker/assets.js`.
- `worker/index.js` sirve los estáticos y reenvía `/api/*` a `vantscc-preview` y `/fn/*` a `vants-functions` mediante service bindings (`worker/meta.json`).
- Se sube con la API de Cloudflare (`PUT /accounts/:id/workers/scripts/vantsgames-web-preview`). No toca el Worker `vants` de producción.

## Reglas

- Trabajo solo en Preview hasta autorización expresa para producción.
- Sin datos ficticios: si no hay contenido, estado vacío.
- No mezclar con el Dashboard ni con VANTS-Clipper.
