# Recursos Cloudflare de VANTS: Workflows, Durable Objects y Queues

Este directorio aplica las tres guías oficiales de Cloudflare al proyecto
VANTS con código listo y casos de uso reales:

| Producto (guía) | Qué es | Caso de uso en VANTS | Código |
| --- | --- | --- | --- |
| [Workflows](https://developers.cloudflare.com/workflows/) | Ejecución durable multi-paso, con pausas de horas/días y reanudación desde el último paso bueno | **Circuit de torneos**: generar bracket → publicar ronda → esperar → verificar resultados → siguiente ronda → campeón + insignia | `src/torneo-workflow.ts` |
| [Durable Objects](https://developers.cloudflare.com/durable-objects/) | Un objeto único con estado y WebSockets, uno por entidad | **Salas de torneo en vivo** (`Sala`): presencia, chat y marcador por sala, sin saturar el Worker; también locks de inscripción | `src/sala-torneo.ts` |
| [Queues](https://developers.cloudflare.com/queues/) | Cola de mensajes con reintentos y DLQ | **Webhooks de FACEIT** (fin de partidas simultáneas) y trabajo pesado fuera del receptor; también envío de emails con reintentos | `src/webhooks-faceit.ts` |

El scaffold se despliega como un worker **propio** (`vants-recursos`), para no
tocar el código del worker de API `vants` (que `web-deploy` redeplica intacto).
Después, si quieres alojar todo en el mismo worker, ver la sección
"Integración con web-deploy" más abajo.

## 1. Crear los recursos (una vez)

```bash
npx wrangler login
npx wrangler queues create webhooks-faceit        # cola principal
npx wrangler queues create webhooks-faceit-dlq    # mensajes muertos (recomendada)
# La D1 del proyecto ya existe; toma su id con:
npx wrangler d1 list
```

Los Durable Objects y Workflows **no se "crean" a mano**: la clase se registra
al desplegar el worker (DO vía `exports`, Workflow vía la clave `workflows`).

## 2. Configurar y desplegar el scaffold

```bash
cd cloudflare
cp wrangler.ejemplo.jsonc wrangler.jsonc
# edita wrangler.jsonc: database_id real de la D1
npx wrangler deploy          # primer deploy registra SalaTorneo + torneo-workflow
npx wrangler secret put WEBHOOK_SECRETO   # opcional, valida el webhook de FACEIT
npx wrangler dev             # prueba local (salas, webhook, workflow)
```

Endpoints que quedan servidos por `vants-recursos`:

- `POST /webhooks/faceit` → valida secreto, **encola** y responde 202 en ms
- `POST /torneos/:id/iniciar` → crea la instancia `torneo-<id>` del workflow
- `GET /torneos/:id/estado-instancia` → estado de cada paso (éxito/fallo/pausas)
- `GET /sala/:id/ws?nick=...` → pasarela WebSocket a la sala (los DO no reciben
  internet directo; el worker les reenvía por el binding)

## 3. Cómo funciona cada pieza (según la guía oficial)

### Workflows (`torneo-workflow`)

- Clase `extends WorkflowEntrypoint<Env, Params>` de `cloudflare:workers`, con
  `async run(event, step)`.
- Cada `step.do(...)` se **persiste**: si el paso falla, reintenta con
  `{ retries: { limit, delay, backoff } }`; si el workflow se interrumpe,
  reanuda desde el último paso exitoso (no repite lo ya hecho).
- `step.sleep("ventana-ronda-1", "2 hours")` pausa el torneo sin consumir nada;
  el workflow despierta solo. También existen `sleepUntil` y `waitForEvent`.
- Disparo: `env.TORNEO_WORKFLOW.create({ id: "torneo-<id>", params })` — el id
  fijo lo hace idempotente (reenviar no duplica el torneo).
- Observabilidad: `instance.status()` o
  `npx wrangler workflows instances describe torneo-workflow torneo-<id>`.
- Costo: se paga el uso normal del Worker; no hay cargo por "workflow".

### Durable Objects (`SalaTorneo`)

- Clase `extends DurableObject<Env>` de `cloudflare:workers`; un objeto único
  por nombre (`getByName("torneo-<id>")`): toda la sala pasa por el mismo
  objeto → sin condiciones de carrera.
- **Hibernación de WebSockets**: `ctx.acceptWebSocket(ws, [nick])` guarda el
  nick como etiqueta; las conexiones inactivas no consumen cómputo y los
  handlers `webSocketMessage` / `webSocketClose` despiertan el objeto solo al
  recibir eventos.
- Estado: `ctx.storage` (SQLite privado del objeto) guarda el marcador; el
  método RPC `estado()` lo recupera; `avisar(...)` empuja avisos desde el
  backend (p. ej. resultado verificado por el workflow).
- Costo: plan gratuito incluye DO con SQLite; en el plan pago se factura
  duración-GB y peticiones (pon un límite de gasto en el dashboard).

### Queues (`webhooks-faceit`)

- Productor: `await env.COLA_WEBHOOKS.send(webhook)` — el receptor responde al
  webhook en milisegundos y la ingestión pesada corre aparte.
- Consumidor: handler `async queue(batch, env)` en el MISMO worker; por mensaje:
  `mensaje.ack()` al procesar bien, `mensaje.retry()` en fallo transitorio.
  Tras `max_retries` (aquí 5) el mensaje cae en `webhooks-faceit-dlq`.
- Lotes: `max_batch_size` 10 (por defecto) o cada `max_batch_timeout` 5 s;
  **un solo worker consumidor por cola**.
- Retención: 24 h no configurable en plan gratuito; 4 días (hasta 14) en pago.
- Costo: gratuito incluye 10.000 operaciones/día; pago incluye 1M/mes y luego
  $0.40 por millón. Un mensaje suele costar 3 operaciones (escritura + lectura
  + borrado); cada 64 KB también cuenta. Sin cargos de salida.

## 4. Integración con el deploy de la web (web-deploy)

`script/ci/vants-config.mjs` ya **mapea los bindings nuevos** cuando el worker
`vants` los gane (dashboard o API): `queue` → `queues.producers`,
`durable_object_namespace` → `durable_objects.bindings`, `workflows` →
`workflows`. Si aparece un tipo desconocido, el deploy sigue abortando (como
siempre) para no subir una config incompleta.

Si algún día decides alojar DO/Workflow/cola **dentro del worker `vants`**
(en vez del worker separado), añade al deploy la variable de entorno
`WRANGLER_EXTRA` con el JSON que falte (se fusiona al final del wrangler.json
generado):

```json
{
  "exports": { "SalaTorneo": { "type": "durable-object", "storage": "sqlite" } },
  "queues": { "consumers": [{ "queue": "webhooks-faceit", "max_batch_size": 10, "max_batch_timeout": 5, "max_retries": 5, "dead_letter_queue": "webhooks-faceit-dlq" }] }
}
```

(El bloque `migrations` antiguo solo haría falta si esa clase DO ya existiera
en el worker con el esquema legacy; para clases nuevas basta `exports`.)

## 5. Orden de adopción sugerido

1. **Queues primero** (menor riesgo): crear las dos colas y desplegar el
   scaffold; apuntar `vants-faceit-webhook` a `POST /webhooks/faceit` o añadir
   el binding `COLA_WEBHOOKS` al worker productor.
2. **Durable Objects**: salas de la `Sala` en vivo — el cliente ya tiene la
   página; solo apunta su WebSocket a `/sala/:id/ws` en `vants-recursos`.
3. **Workflows**: arrancar `torneo-<id>` al cerrar inscripciones de un torneo;
   seguir el progreso desde `estado-instancia` o el dashboard de Workflows.
4. Migrar el código al worker `vants` solo si quieres un solo despliegue;
   mientras tanto, cada recurso evoluciona en `vants-recursos` sin tocar la
   API de producción.
