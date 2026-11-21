// Cola de webhooks de FACEIT para VANTS GAMES.
//
// El receptor de webhooks (vants-faceit-webhook o el worker de API) solo hace
// `await env.COLA_WEBHOOKS.send(webhook)` — responde 200 al webhook en milisegundos
// y la ingestión se procesa después, con reintentos y cola de mensajes muertos.
// Así una avalancha de webhooks (fin de partidas simultáneas) no satura la base.
//
// Regla de la guía: UN SOLO worker consumidor por cola. El consumidor vive en
// el mismo worker del scaffold (src/index.ts, handler `queue`).
//
// Config: ver cloudflare/wrangler.ejemplo.jsonc
//   queues.producers (binding COLA_WEBHOOKS) + queues.consumers (+ dead_letter_queue)

export interface ColaEnv {
  COLA_WEBHOOKS: Queue;
  DB: D1Database;
  FACEIT_API_KEY?: string; // clave de FACEIT Data API v4 (wrangler secret put FACEIT_API_KEY)
}

export type EventoFaceit =
  | "match_status_updated"
  | "match_objective_event"
  | "match_finished";

export interface WebhookFaceit {
  evento: EventoFaceit;
  matchId: string;
  torneoId?: string;
  datos: Record<string, unknown>;
  recibidoEn: string;
}

/** PRODUCTOR — llama esto desde el receptor de webhooks. */
export async function encolarWebhook(
  cola: Queue<WebhookFaceit>,
  webhook: Omit<WebhookFaceit, "recibidoEn">,
): Promise<void> {
  await cola.send({ ...webhook, recibidoEn: new Date().toISOString() });
}

/** Enriquece el evento con datos del partido vía la API v4 de FACEIT.
 *  Opcional: solo actúa si FACEIT_API_KEY está configurada como secreto. */
async function enriquecerConFaceit(w: WebhookFaceit, apiKey?: string): Promise<void> {
  if (!apiKey) return;
  const resp = await fetch(`https://open.faceit.com/data/v4/matches/${encodeURIComponent(w.matchId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`FACEIT v4 respondió ${resp.status} para ${w.matchId}`);
  const datos = (await resp.json()) as Record<string, unknown>;
  w.datos = { ...w.datos, faceit: { status: datos.status, results: datos.results } };
}

/** CONSUMIDOR — handler `queue` del worker (lo llama Cloudflare por lote). */
export async function procesarLote(batch: MessageBatch<WebhookFaceit>, env: ColaEnv): Promise<void> {
  for (const mensaje of batch.messages) {
    try {
      await enriquecerConFaceit(mensaje.body, env.FACEIT_API_KEY);
      await aplicarWebhook(env, mensaje.body);
      mensaje.ack();
    } catch (error) {
      // Fallo transitorio (D1 ocupada, red, límite): reintento con el backoff
      // de la cola; tras max_retries el mensaje cae en webhooks-faceit-dlq.
      console.error("webhook en reintento:", mensaje.body.matchId, error);
      mensaje.retry();
    }
  }
}

async function aplicarWebhook(env: ColaEnv, w: WebhookFaceit): Promise<void> {
  switch (w.evento) {
    case "match_status_updated": {
      await env.DB.prepare("UPDATE partidas SET estado = ? WHERE faceit_match_id = ?")
        .bind(String(w.datos.status ?? "actualizada"), w.matchId)
        .run();
      return;
    }
    case "match_finished": {
      // Ajusta los campos al payload real de FACEIT y a tu schema de D1.
      const ganador = String(w.datos.winner_team_id ?? "");
      await env.DB.prepare(
        "UPDATE partidas SET estado = 'terminada', ganador = ?, finalizada_en = ? WHERE faceit_match_id = ?",
      )
        .bind(ganador, w.recibidoEn, w.matchId)
        .run();
      return;
    }
    case "match_objective_event": {
      // Métricas en vivo (kills, rondas): guardar sin bloquear la ingestión.
      await env.DB.prepare(
        "INSERT INTO eventos_faceit (match_id, evento, datos, recibido_en) VALUES (?, ?, ?, ?)",
      )
        .bind(w.matchId, w.evento, JSON.stringify(w.datos), w.recibidoEn)
        .run();
      return;
    }
    default:
      // Evento desconocido: se marca procesado para no saturar los reintentos.
      console.warn("evento FACEIT no manejado:", w.evento);
      return;
  }
}
