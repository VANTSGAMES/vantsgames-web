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

## Producción

La web se publica en **https://vants.vants.workers.dev** dentro del Worker `vants` (repo Vantsgames, `vants-server/public`), junto a la API.

**Publicación automática**: el workflow `.github/workflows/web-deploy.yml` se ejecuta en cada push a `main` (y con `workflow_dispatch`): construye el cliente con `VITE_AUTH_ENABLED=1` y `VITE_AUTH0_CLIENT_ID=totrP3GBWQpdi7IqWv2zhbVLe0xSyaMo`, copia el build a `vants-server/public` del repo Vantsgames y ese push dispara el deploy de Cloudflare. Usar este repo como única fuente del frontend; no editar `vants-server/public` a mano.

Los archivos extra que el Worker sirve (`assets/badges/`, `static/`, `.well-known/`, verificaciones de Google/Manicule, `robots.txt`, `llms.txt`, `_headers`, `sw.js`, `admin-logros.html`) viven ahora en `client/public/` para que el build sea autocontenido. El Client ID de Auth0 del login es el de la app **VANTS** del tenant `vants.eu.auth0.com`.

`worker/` contiene el Worker de preview independiente (opcional).

## Reglas

- Trabajo solo en Preview hasta autorización expresa para producción.
- Sin datos ficticios: si no hay contenido, estado vacío.
- No mezclar con el Dashboard ni con VANTS-Clipper.
