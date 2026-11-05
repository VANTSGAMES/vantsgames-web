# VANTS GAMES — Web Privada

<sub>PROJECT STATUS: ACTIVE</sub>

Web pública de **VANTS GAMES** para jugadores y visitantes: torneos de once juegos (VALORANT, CS2, Fortnite, FC 27, Super Smash Bros. Ultimate, Call of Duty: Warzone, Free Fire, League of Legends, Wild Rift, Mobile Legends y Clash Royale), sala de jugadores, clips, comunidad, membresías y perfiles con insignias y sellos 3D.

El repositorio volvió a desarrollo activo para la expansión del circuito y las nuevas animaciones del perfil (V1-Insignias-3D).

> Este repositorio es independiente de **VantsHubLauche**, el Dashboard interno de operaciones. La administración se realiza desde VantsHubLauche y se comunica con esta web mediante la API autorizada del Worker de Vantsgames. Esta web no incorpora un panel administrativo.

---

## Estado del proyecto

| Área | Estado |
|---|---|
| Desarrollo principal | Activo |
| Frontend público | En expansión |
| Arquitectura | Documentada |
| Nuevas funcionalidades | En curso |
| Mejoras | En curso |
| Mantenimiento evolutivo | Activo |
| Repositorio | Activo |

## Arquitectura

- **Frontend propio:** React + Vite + wouter + TanStack Query + Tailwind. No reutiliza páginas ni componentes de la web anterior.
- **Datos:** toda la información se obtiene de la API de Vantsgames (Cloudflare Worker + D1). Esta web no tiene base de datos propia. Sin Neon.
- **Proxy:** `server/routes.ts` reenvía `/api/*` al Worker de Vantsgames (`VANTS_API_ORIGIN`, por defecto el Worker de preview) y `/fn/*` a `vants-functions`.
- **Autenticación:** Auth0 (`vants.eu.auth0.com`). Se activa con `VITE_AUTH_ENABLED=1` únicamente en dominios registrados en Auth0. Las sesiones y permisos se validan en el servidor.
- **Pagos:** Stripe Checkout mediante `vants-functions`. La web nunca activa un plan por su cuenta.
- **Tienda:** sin carrito ni pagos hasta disponer de un catálogo conectado a un comercio real.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5000
npm run build        # dist/public (estático) + dist/index.cjs (proxy)
```

### Variables de entorno

| Variable | Uso |
|---|---|
| `VANTS_API_ORIGIN` | Origen del Worker de Vantsgames (preview por defecto) |
| `VANTS_FN_ORIGIN` | Origen de vants-functions |
| `VITE_AUTH_ENABLED` | `1` para activar Auth0 |
| `VITE_ROUTER` | `history` para URLs limpias; por defecto hash |

## Producción

La web se publica en:

**https://vants.vants.workers.dev**

Se encuentra dentro del Worker `vants` (repositorio Vantsgames, `vants-server/public`), junto a la API.

### Publicación automática

El workflow `.github/workflows/web-deploy.yml` se ejecuta en cada push a `main` y mediante `workflow_dispatch`.

Proceso:

1. Construye el cliente con `VITE_AUTH_ENABLED=1` y el Client ID de Auth0 configurado.
2. Copia el build a `vants-server/public` del repositorio Vantsgames.
3. El push resultante activa el despliegue de Cloudflare.

Este repositorio es la fuente principal del frontend. No editar `vants-server/public` manualmente.

### Archivos públicos

Los siguientes recursos viven en `client/public/` para que el build sea autocontenido:

- `assets/badges/`
- `static/`
- `.well-known/`
- Verificaciones de Google y Manicule.
- `robots.txt`
- `llms.txt`
- `_headers`
- `sw.js`
- `admin-logros.html`

El Client ID de Auth0 del login corresponde a la aplicación **VANTS** del tenant `vants.eu.auth0.com`.

### Preview

`worker/` contiene un Worker de preview independiente y opcional.

---

## Reglas del proyecto

- El trabajo se realiza exclusivamente en Preview hasta recibir autorización expresa para producción.
- No utilizar datos ficticios: cuando no exista contenido, mostrar estados vacíos.
- No mezclar este proyecto con VantsHubLauche ni con VANTS-Clipper.
- No modificar la arquitectura ni las integraciones sin autorización.
- Mantener separadas las responsabilidades de cada repositorio.

## Política de archivado

Este repositorio se conserva como versión de referencia del frontend público de VANTS GAMES.

A partir de su archivado:

- No se desarrollarán nuevas funcionalidades.
- No se implementarán mejoras visuales ni técnicas.
- No se aceptarán nuevas tareas de desarrollo.
- No se realizarán actualizaciones rutinarias.
- No se garantiza mantenimiento ni soporte evolutivo.
- El historial, código y documentación permanecerán conservados.

Las automatizaciones de GitHub Actions pueden quedar suspendidas mientras el repositorio permanezca archivado. Los servicios externos y la infraestructura de producción tienen un ciclo de vida independiente.

## Reactivación

El repositorio podrá desarchivarse si VANTS decide retomar su desarrollo.

Cualquier nueva etapa de trabajo requerirá autorización expresa y planificación independiente.

---

<p align="center">

**VANTS GAMES**

Competitive Gaming & Esports Ecosystem

`PROJECT COMPLETED` · `ARCHIVED UNTIL FURTHER NOTICE`

© VANTS GAMES

</p>
