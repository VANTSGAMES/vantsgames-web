# Decisiones técnicas

1. **Repositorio separado.** La web pública vive en `VANTSGAMES/vantsgames-web`, no en `Vantsgames` ni en `VantsHubLauche`, para no tocar el despliegue de producción (`main` de Vantsgames despliega el Worker `vants`).
2. **Backend único: Cloudflare.** La web consume la API existente del Worker de Vantsgames (D1). No se crea otra base de datos.
3. **Proxy same-origin.** El Worker bloquea peticiones con `Origin` no permitido. Los GET públicos se piden servidor a servidor; las escrituras conservan el Origin y requieren que el dominio de esta web esté en `SITE_ORIGINS`.
4. **Hash routing por defecto.** La vista previa se sirve en un origen sin reescrituras; en Cloudflare se usa `VITE_ROUTER=history`.
5. **Auth desactivada en preview.** Auth0 solo admite callbacks registrados. Sin sesión, lo privado muestra "inicia sesión" y no se renderiza ningún dato privado.
6. **Integraciones con estado real.** Las cuentas vinculadas leen el diagnóstico de `/fn/linker/`: conectada, desconectada, pendiente o error. Hoy faltan los `*_CLIENT_ID` de los proveedores.
7. **Clips.** La vitrina destacada viene de `/api/clips/featured` (publicada por VANTS-Clipper); los recientes, del canal de YouTube real.
8. **Rankings.** Se muestran solo los que calcula el backend (`/api/gpr`). VANTS Ranked aparece vacío hasta que el backend publique la temporada.

## Pendiente del propietario

- Añadir el dominio de esta web a `SITE_ORIGINS` del Worker (si no, los POST devuelven 403 "Origen no permitido").
- Registrar el dominio en Auth0 (Allowed Callback URLs / Web Origins) y compilar con `VITE_AUTH_ENABLED=1`.
- Configurar las apps OAuth del linker (`FACEIT_CLIENT_ID`, etc.). El linker todavía usa Neon (`pool.query`): migrarlo a D1.
- El perfil público se guarda en `user_metadata` de Auth0; se propone migrarlo a D1 (migración 35) para garantizar la persistencia del nombre.
- El workflow de VantsHubLauche despliega sobre el mismo Worker `vants`: separarlo.

9. **Registro central de juegos.** `client/src/lib/juegos.ts` define los once juegos del circuito (slugs, etiquetas, plataforma). Torneos, sala, equipos, roster, clips, eventos y filtros toman las opciones de ahí; la D1 guarda el slug y las columnas `juego` son TEXT, así que no hace falta migración.
10. **Animaciones V1 del perfil.** El prototipo V1-Insignias-3D se portó al motor propio: el visor de insignias suma partículas, aros orbitales, bloom, flotación y destello de consecución; el sello del plan pasa de etiqueta plana a objeto 3D (`Sello3D`) junto al nombre, que además gana acabado cromado (`.nombre-cromo`). Sin WebGL o con `prefers-reduced-motion` se degrada a la versión plana.
