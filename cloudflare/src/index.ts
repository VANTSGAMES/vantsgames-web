// Worker `vants-recursos` (`torneos-realtime` #10) — Fase 4
//
// Exporta:
//   - SalaTorneo     (Durable Object: salas en vivo, chat, roles hibernables, !arbitro IA)
//   - TorneoWorkflow (Workflow: bracket durable alineado a pt_torneos / tournament_teams / tournament_matches)
//   - handler `queue` (consumidor de webhooks-faceit con Caster IA)
//   - handler `fetch` (endpoints admin blindados, webhook receptor y pasarela WS)
import { SalaTorneo, type SalaEnv } from "./sala-torneo";
import { TorneoWorkflow, type WorkflowEnv } from "./torneo-workflow";
import { encolarWebhook, procesarLote, type ColaEnv, type WebhookFaceit } from "./webhooks-faceit";

export { SalaTorneo, TorneoWorkflow };

export interface Env
  extends SalaEnv,
    Omit<WorkflowEnv, "SALA_TORNEO">,
    Omit<ColaEnv, "SALA_TORNEO"> {
  WEBHOOK_SECRETO?: string;
  TORNEOS_ADMIN_SECRET?: string;
  VANTS_INTERNAL_SECRET?: string;
  VANTS_BUS_SERVICE?: Fetcher;
}

function secretOk(a: string | null, b: string | undefined): boolean {
  const sa = String(a || "");
  const sb = String(b || "");
  if (!sb || sa.length !== sb.length) return false;
  let d = 0;
  for (let i = 0; i < sa.length; i++) d |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return d === 0;
}

/** Valida acceso administrativo fail-closed (503 si no hay secretos configurados, 401 si no coincide). */
function verificarAdmin(request: Request, env: Env): Response | null {
  const adminSec = env.TORNEOS_ADMIN_SECRET;
  const internalSec = env.VANTS_INTERNAL_SECRET;
  if (!adminSec && !internalSec) {
    return Response.json({ ok: false, error: "TORNEOS_ADMIN_SECRET no configurado" }, { status: 503 });
  }
  const okAdmin = adminSec ? secretOk(request.headers.get("x-vants-admin"), adminSec) : false;
  const okInternal = internalSec ? secretOk(request.headers.get("x-vants-internal"), internalSec) : false;
  if (!okAdmin && !okInternal) {
    return Response.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  }
  return null;
}

type WebhookQueue = Queue<WebhookFaceit>;
type BatchQueue = MessageBatch<WebhookFaceit>;
const colaWebhooks = (env: Env): WebhookQueue => env.COLA_WEBHOOKS as WebhookQueue;
const loteWebhooks = (batch: MessageBatch): BatchQueue => batch as BatchQueue;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 0) Salud del Worker (sin secretos)
    if (url.pathname === "/salud" || url.pathname === "/") {
      return Response.json({
        ok: true,
        servicio: "torneos-realtime",
        bindings: {
          db: Boolean(env.DB),
          sala: Boolean(env.SALA_TORNEO),
          workflow: Boolean(env.TORNEO_WORKFLOW),
          queue: Boolean(env.COLA_WEBHOOKS),
          ai: Boolean(env.VANTS_INT_SERVICE),
          bus: Boolean(env.VANTS_BUS_SERVICE),
        },
        secretos: {
          admin: Boolean(env.TORNEOS_ADMIN_SECRET),
          internal: Boolean(env.VANTS_INTERNAL_SECRET),
          webhook: Boolean(env.WEBHOOK_SECRETO),
        },
      });
    }

    // 1) Receptor de webhook FACEIT: encola y responde en ms
    if (url.pathname === "/webhooks/faceit" && request.method === "POST") {
      if (!env.WEBHOOK_SECRETO) return new Response("WEBHOOK_SECRETO no configurado", { status: 503 });
      if (!secretOk(request.headers.get("x-vants-secreto"), env.WEBHOOK_SECRETO)) {
        return new Response("No autorizado", { status: 401 });
      }
      const cuerpo = (await request.json().catch(() => null)) as Partial<WebhookFaceit> | null;
      if (!cuerpo?.matchId || !cuerpo.evento) {
        return new Response("Payload inválido", { status: 400 });
      }
      await encolarWebhook(colaWebhooks(env), {
        evento: cuerpo.evento,
        matchId: cuerpo.matchId,
        torneoId: cuerpo.torneoId,
        datos: cuerpo.datos ?? {},
      });
      return Response.json({ ok: true, encolado: true });
    }

    // 2) Arrancar el workflow de un torneo (idempotente por slug/id)
    const iniciar = url.pathname.match(/^\/torneos\/([^/]+)\/iniciar$/);
    if (iniciar && request.method === "POST") {
      const denegado = verificarAdmin(request, env);
      if (denegado) return denegado;
      const torneoId = decodeURIComponent(iniciar[1]);
      const instancia = await env.TORNEO_WORKFLOW.create({
        id: `torneo-${torneoId}`,
        params: { torneoId },
      });
      return Response.json({ ok: true, instanciaId: instancia.id, torneoId });
    }

    // 3) Estado de la instancia del workflow
    const estadoInst = url.pathname.match(/^\/torneos\/([^/]+)\/estado-instancia$/);
    if (estadoInst && request.method === "GET") {
      const denegado = verificarAdmin(request, env);
      if (denegado) return denegado;
      const torneoId = decodeURIComponent(estadoInst[1]);
      const instancia = await env.TORNEO_WORKFLOW.get(`torneo-${torneoId}`);
      return Response.json(await instancia.status());
    }

    // 4) Aviso administrativo / moderación a la sala del torneo (RPC a SalaTorneo)
    const avisoRuta = url.pathname.match(/^\/torneos\/([^/]+)\/aviso$/);
    if (avisoRuta && request.method === "POST") {
      const denegado = verificarAdmin(request, env);
      if (denegado) return denegado;
      const torneoId = decodeURIComponent(avisoRuta[1]);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") {
        return Response.json({ ok: false, error: "payload_invalido" }, { status: 400 });
      }
      const stub = env.SALA_TORNEO.getByName(`torneo-${torneoId}`);
      if (body.accion === "silenciar" && typeof body.nick === "string") {
        await stub.silenciar(body.nick, Number(body.minutos || 10));
        return Response.json({ ok: true, accion: "silenciar", nick: body.nick });
      }
      await stub.avisar(body);
      return Response.json({ ok: true, enviado: true, torneoId });
    }

    // 5) Estado público de lectura de la sala (presencia + marcador persistido)
    const salaEstado = url.pathname.match(/^\/sala\/([^/]+)\/estado$/);
    if (salaEstado && request.method === "GET") {
      const torneoId = decodeURIComponent(salaEstado[1]);
      const stub = env.SALA_TORNEO.getByName(`torneo-${torneoId}`);
      const est = await stub.estado();
      return Response.json({
        ok: true,
        torneoId: est.torneoId || torneoId,
        presentes: est.presentes,
        marcador: est.marcador,
      });
    }

    // 6) Pasarela WebSocket a la sala (con verificación anti-spoofing de headers)
    const salaWs = url.pathname.match(/^\/sala\/([^/]+)\/ws$/);
    if (salaWs) {
      const torneoId = decodeURIComponent(salaWs[1]);
      const stub = env.SALA_TORNEO.getByName(`torneo-${torneoId}`);

      // Solo confiamos en x-vants-role si la llamada llega autenticada desde el proxy `vants`
      const desdeProxyOficial = Boolean(
        env.VANTS_INTERNAL_SECRET && secretOk(request.headers.get("x-vants-proxy-secret"), env.VANTS_INTERNAL_SECRET),
      );

      const h = new Headers(request.headers);
      h.delete("x-vants-proxy-secret");
      h.set("x-vants-torneo-id", torneoId);
      if (!desdeProxyOficial) {
        const nickQ = (url.searchParams.get("nick") || "").replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 20);
        h.set("x-vants-nick", nickQ || `espectador-${Math.floor(1000 + Math.random() * 9000)}`);
        h.set("x-vants-role", "spectator");
      } else {
        if (!h.get("x-vants-nick")) h.set("x-vants-nick", "espectador");
        const r = h.get("x-vants-role");
        if (r !== "staff" && r !== "player" && r !== "spectator") h.set("x-vants-role", "spectator");
      }

      const fwd = new Request(request, { headers: h });
      return stub.fetch(fwd);
    }

    return new Response("No encontrado", { status: 404 });
  },

  // 7) Consumidor de la cola webhooks-faceit
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await procesarLote(loteWebhooks(batch), env);
  },
} satisfies ExportedHandler<Env>;
