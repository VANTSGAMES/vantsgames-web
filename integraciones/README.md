# vants-integraciones

Worker de Cloudflare (`https://vants-integraciones.vants.workers.dev`) que alimenta el perfil de la web:

| Ruta | Acceso | Qué devuelve |
|---|---|---|
| `GET /salud` | público | estado de las claves |
| `GET /directos` | público | canales VANTS y de jugadores en Twitch/Kick (cron cada 2 min) |
| `GET /faceit/jugador?id=` | público | perfil FACEIT por id |
| `GET /yo` | Auth0 | FACEIT vinculado (nivel, ELO, estadísticas, partidas, equipo), estado "en partida", directos propios |
| `POST /canales` | Auth0 | guarda canal de Twitch/Kick del usuario |
| `GET /notificaciones`, `POST /notificaciones/leer` | Auth0 | campana de la web |

Cron (`*/2 * * * *`): lee `faceit_webhook_events` (webhook de FACEIT) → notificaciones de partida lista/terminada para cuentas vinculadas + aviso en Discord `#resultados`; revisa directos de Twitch/Kick → notificación global + aviso en Discord `#directos`.

Base de datos: D1 `vants-db` (tablas `integ_*`, ver `migraciones/`).
Secretos (cargados con `wrangler secret`, no en el repo): `FACEIT_API_KEY`, `TWITCH_CLIENT_SECRET`, `KICK_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.
Deploy: `.github/workflows/integraciones-deploy.yml` en cada push a `main` que toque `integraciones/` (usa el secreto `CLOUDFLARE_API_TOKEN` del repo).
