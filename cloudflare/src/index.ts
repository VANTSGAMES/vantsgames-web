// Worker `vants-recursos` — scaffold de Workflows, Durable Objects y Queues
// para VANTS GAMES.
//
// Exporta:
//   - SalaTorneo     (Durable Object: salas en vivo, chat, marcador)
//   - TorneoWorkflow (Workflow: bracket durable por rondas)
//   - un handler `queue` (consumidor de webhooks-faceit)
//   - un handler `fetch` (webhook receptor de ejemplo, arranque de workflow
//     y pasarela WebSocket a la sala)
//
// Despliegue: ver cloudflare/README.md y cloudflare/wrangler.ejemplo.jsonc
import { SalaTorneo, type SalaEnv } from "./sala-torneo";
import { TorneoWorkflow, type WorkflowEnv } from "./torneo-workflow";
import { encolarWebhook, procesarLote, type ColaEnv, type WebhookFaceit } from "./webhooks-faceit";

export { SalaTorneo, TorneoWorkflow };

export interface Env extends SalaEnv, WorkflowEnv, ColaEnv {
  WEBHOOK_SECRETO?: string; // secreto opcional para validar el webhook de FACEIT
}

type WebhookQueue = Queue<WebhookFaceit>;
type BatchQueue = MessageBatch<WebhookFaceit>;
// El binding de colas es genérico en Env; lo afinamos al tipo de mensajes real.
const colaWebhooks = (env: Env): WebhookQueue => env.COLA_WEBHOOKS as WebhookQueue;
const loteWebhooks = (batch: MessageBatch): BatchQueue => batch as BatchQueue;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1) Receptor de webhook FACEIT: guardar el crudo y responder ya;
    //    el procesamiento pesado lo hace la cola.
    if (url.pathname === "/webhooks/faceit" && request.method === "POST") {
      if (env.WEBHOOK_SECRETO && request.headers.get("x-vants-secreto") !== env.WEBHOOK_SECRETO) {
        return new Response("No autorizado", { status: 401 });
      }
      const cuerpo = (await request.json().catch(() => null)) as Partial<WebhookFaceit> | null;
      if (!cuerpo?.matchId || !cuerpo.evento) {
        return new Response("Payload inválido", { status: 400 });
      }
      await encolarWebhook(
        colaWebhooks(env),
        { evento: cuerpo.evento, matchId: cuerpo.matchId, torneoId: cuerpo.torneoId, datos: cuerpo.datos ?? {} },
      );
      return Response.json({ ok: true, encolado: true });
    }

    // 2) Arrancar el workflow de un torneo (idempotente por id de instancia).
    const iniciar = url.pathname.match(/^\/torneos\/([^/]+)\/iniciar$/);
    if (iniciar && request.method === "POST") {
      const torneoId = iniciar[1];
      const instancia = await env.TORNEO_WORKFLOW.create({
        id: `torneo-${torneoId}`,
        params: { torneoId },
      });
      return Response.json({ ok: true, instanciaId: instancia.id });
    }

    // 3) Estado del workflow (qué ronda corre, qué paso falló, reintentos...).
    const estado = url.pathname.match(/^\/torneos\/([^/]+)\/estado-instancia$/);
    if (estado && request.method === "GET") {
      const instancia = await env.TORNEO_WORKFLOW.get(`torneo-${estado[1]}`);
      return Response.json(await instancia.status());
    }

    // 4) Pasarela WebSocket a la sala (los DO no reciben internet directo).
    const sala = url.pathname.match(/^\/sala\/([^/]+)\/ws$/);
    if (sala) {
      const nick = url.searchParams.get("nick") || "anon";
      const stub = env.SALA_TORNEO.getByName(`torneo-${sala[1]}`);
      return stub.fetch(
        new Request(`https://sala.local/join?nick=${encodeURIComponent(nick)}`, {
          headers: request.headers,
        }),
      );
    }

    return new Response("No encontrado", { status: 404 });
  },

  // 5) Consumidor de la cola webhooks-faceit (un solo consumidor por cola).
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await procesarLote(loteWebhooks(batch), env);
  },
} satisfies ExportedHandler<Env>;
