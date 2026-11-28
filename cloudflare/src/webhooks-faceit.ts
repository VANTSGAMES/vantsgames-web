// Cola de webhooks de FACEIT para VANTS GAMES (Fase 4).
//
// Alineado con el esquema real de D1 en producción:
//   - faceit_webhook_events (id, event_type, payload, created_at, processed)
//   - tournament_matches (id, tournament_id, game, ronda, slot, team_a, team_b, score_a, score_b, estado, ganador, updated_at)
//   - pt_matches (id, source, external_id, game_slug, tournament_id, equipo_a, equipo_b, score_a, score_b, estado, termino_at)
//
// Al finalizar una partida (`match_finished`), actualiza D1 y empuja marcador oficial
// + crónica del Caster IA (vants-integraciones POST /ai/torneo/caster) a SalaTorneo vía RPC.
import type { SalaTorneo } from "./sala-torneo";

export interface ColaEnv {
  COLA_WEBHOOKS: Queue;
  DB: D1Database;
  FACEIT_API_KEY?: string;
  SALA_TORNEO?: DurableObjectNamespace<SalaTorneo>;
  VANTS_INT_SERVICE?: Fetcher;
  VANTS_INTERNAL_SECRET?: string;
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

/** Empuja marcador oficial y crónica del Caster IA directo a la sala del torneo vía RPC. */
export async function anunciarCasterEnSala(
  env: Pick<ColaEnv, "SALA_TORNEO" | "VANTS_INT_SERVICE" | "VANTS_INTERNAL_SECRET">,
  torneoId: string,
  payload: Record<string, unknown>,
): Promise<{ salaAvisada: boolean; cronica: string | null }> {
  if (!torneoId || !env.SALA_TORNEO) return { salaAvisada: false, cronica: null };
  const stub = env.SALA_TORNEO.getByName(`torneo-${torneoId}`);

  // 1. Empuja marcador oficial desde backend
  await stub.avisar({ tipo: "marcador", datos: payload });

  // 2. Pide crónica al Caster IA en vants-integraciones
  if (!env.VANTS_INT_SERVICE || !env.VANTS_INTERNAL_SECRET) {
    return { salaAvisada: true, cronica: null };
  }
  const res = await env.VANTS_INT_SERVICE.fetch(
    new Request("https://int.vants.cc/ai/torneo/caster", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify(payload),
    }),
  ).catch(() => null);

  if (res?.ok) {
    const data = (await res.json().catch(() => null)) as { cronica?: string } | null;
    if (data?.cronica) {
      await stub.avisar({ tipo: "caster", texto: data.cronica, datos: payload });
      return { salaAvisada: true, cronica: data.cronica };
    }
  }
  return { salaAvisada: true, cronica: null };
}

/** PRODUCTOR — llama esto desde el receptor de webhooks. */
export async function encolarWebhook(
  cola: Queue<WebhookFaceit>,
  webhook: Omit<WebhookFaceit, "recibidoEn">,
): Promise<void> {
  await cola.send({ ...webhook, recibidoEn: new Date().toISOString() });
}

/** Enriquece el evento con datos del partido vía la API v4 de FACEIT (opcional). */
async function enriquecerConFaceit(w: WebhookFaceit, apiKey?: string): Promise<void> {
  if (!apiKey) return;
  const resp = await fetch(`https://open.faceit.com/data/v4/matches/${encodeURIComponent(w.matchId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`FACEIT v4 respondió ${resp.status} para ${w.matchId}`);
  const datos = (await resp.json()) as Record<string, unknown>;
  w.datos = { ...w.datos, faceit: { status: datos.status, results: datos.results, teams: datos.teams } };
}

/** CONSUMIDOR — handler `queue` del worker (lo llama Cloudflare por lote). */
export async function procesarLote(batch: MessageBatch<WebhookFaceit>, env: ColaEnv): Promise<void> {
  for (const mensaje of batch.messages) {
    try {
      await enriquecerConFaceit(mensaje.body, env.FACEIT_API_KEY);
      await aplicarWebhook(env, mensaje.body);
      mensaje.ack();
    } catch (error) {
      console.error("webhook en reintento:", mensaje.body.matchId, error);
      mensaje.retry();
    }
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapEstadoMatchTorneo(raw: string): "pendiente" | "en_curso" | "final" {
  const s = raw.toLowerCase();
  if (s === "finished" || s === "final" || s === "completed" || s === "terminada") return "final";
  if (s === "ongoing" || s === "live" || s === "ready" || s === "en_curso" || s === "configuring") return "en_curso";
  return "pendiente";
}

function mapEstadoPtMatch(raw: string): "upcoming" | "live" | "finished" | "cancelled" {
  const s = raw.toLowerCase();
  if (s === "finished" || s === "final" || s === "completed") return "finished";
  if (s === "cancelled" || s === "canceled" || s === "aborted") return "cancelled";
  if (s === "ongoing" || s === "live" || s === "ready" || s === "en_curso") return "live";
  return "upcoming";
}

export async function aplicarWebhook(env: ColaEnv, w: WebhookFaceit): Promise<void> {
  // Registro de auditoría en la tabla real faceit_webhook_events
  await env.DB.prepare(
    "INSERT INTO faceit_webhook_events (event_type, payload, processed) VALUES (?, ?, 1)",
  )
    .bind(w.evento, JSON.stringify({ matchId: w.matchId, torneoId: w.torneoId ?? null, datos: w.datos, recibidoEn: w.recibidoEn }))
    .run()
    .catch(() => null);

  switch (w.evento) {
    case "match_status_updated": {
      const rawStatus = String(w.datos.status ?? "en_curso");
      const estadoTorneo = mapEstadoMatchTorneo(rawStatus);
      const estadoPt = mapEstadoPtMatch(rawStatus);
      await env.DB.prepare(
        "UPDATE tournament_matches SET estado = ?, updated_at = datetime('now') WHERE id = ?",
      )
        .bind(estadoTorneo, w.matchId)
        .run();
      if (w.torneoId && typeof w.datos.ronda === "string" && w.datos.slot !== undefined) {
        await env.DB.prepare(
          "UPDATE tournament_matches SET estado = ?, updated_at = datetime('now') WHERE tournament_id = ? AND ronda = ? AND slot = ?",
        )
          .bind(estadoTorneo, w.torneoId, w.datos.ronda, Number(w.datos.slot))
          .run()
          .catch(() => null);
      }
      await env.DB.prepare(
        "UPDATE pt_matches SET estado = ? WHERE external_id = ? OR id = ?",
      )
        .bind(estadoPt, w.matchId, w.matchId)
        .run()
        .catch(() => null);
      return;
    }

    case "match_finished": {
      const faceitObj = (w.datos.faceit && typeof w.datos.faceit === "object" ? w.datos.faceit : null) as Record<string, any> | null;
      const scoresFaceit = faceitObj?.results?.score || {};
      const scoreA = numOrNull(w.datos.score_a ?? w.datos.sa ?? scoresFaceit.faction1);
      const scoreB = numOrNull(w.datos.score_b ?? w.datos.sb ?? scoresFaceit.faction2);
      const ganadorRaw = w.datos.winner_team_id ?? w.datos.ganador ?? faceitObj?.results?.winner ?? null;
      const ganador = ganadorRaw ? String(ganadorRaw).trim() : null;

      // Actualiza tournament_matches con estado válido del CHECK ('final')
      await env.DB.prepare(
        `UPDATE tournament_matches
         SET estado = 'final',
             score_a = COALESCE(?, score_a),
             score_b = COALESCE(?, score_b),
             ganador = COALESCE(?, ganador),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(scoreA, scoreB, ganador, w.matchId)
        .run();

      if (w.torneoId && typeof w.datos.ronda === "string" && w.datos.slot !== undefined) {
        await env.DB.prepare(
          `UPDATE tournament_matches
           SET estado = 'final',
               score_a = COALESCE(?, score_a),
               score_b = COALESCE(?, score_b),
               ganador = COALESCE(?, ganador),
               updated_at = datetime('now')
           WHERE tournament_id = ? AND ronda = ? AND slot = ?`,
        )
          .bind(scoreA, scoreB, ganador, w.torneoId, w.datos.ronda, Number(w.datos.slot))
          .run()
          .catch(() => null);
      }

      // Sincroniza también pt_matches si la partida existe ahí
      await env.DB.prepare(
        `UPDATE pt_matches
         SET estado = 'finished',
             score_a = COALESCE(?, score_a),
             score_b = COALESCE(?, score_b),
             termino_at = ?
         WHERE external_id = ? OR id = ?`,
      )
        .bind(scoreA, scoreB, w.recibidoEn, w.matchId, w.matchId)
        .run()
        .catch(() => null);

      // Resuelve torneoId (explícito o desde tournament_matches) y anuncia marcador + Caster IA en SalaTorneo
      let torneoId = w.torneoId ? String(w.torneoId).trim() : "";
      let matchRow: { tournament_id?: string; ronda?: string; slot?: number; team_a?: string | null; team_b?: string | null; score_a?: number | null; score_b?: number | null; ganador?: string | null } | null = null;
      matchRow = await env.DB.prepare(
        "SELECT tournament_id, ronda, slot, team_a, team_b, score_a, score_b, ganador FROM tournament_matches WHERE id = ? LIMIT 1",
      )
        .bind(w.matchId)
        .first()
        .catch(() => null);
      if (!torneoId && matchRow?.tournament_id) {
        torneoId = String(matchRow.tournament_id);
      }

      if (torneoId) {
        const equipoA = String(w.datos.team_a ?? w.datos.equipo_a ?? faceitObj?.teams?.faction1?.name ?? matchRow?.team_a ?? "Equipo A");
        const equipoB = String(w.datos.team_b ?? w.datos.equipo_b ?? faceitObj?.teams?.faction2?.name ?? matchRow?.team_b ?? "Equipo B");
        const payloadSala: Record<string, unknown> = {
          matchId: w.matchId,
          torneoId,
          ronda: (w.datos.ronda as string | undefined) ?? matchRow?.ronda ?? null,
          slot: w.datos.slot ?? matchRow?.slot ?? null,
          equipo_a: equipoA,
          equipo_b: equipoB,
          score_a: scoreA ?? matchRow?.score_a ?? 0,
          score_b: scoreB ?? matchRow?.score_b ?? 0,
          ganador: ganador ?? matchRow?.ganador ?? null,
          estado: "final",
          finalizada_en: w.recibidoEn,
        };
        await anunciarCasterEnSala(env, torneoId, payloadSala);
      }
      return;
    }

    case "match_objective_event": {
      // Ya persistido en faceit_webhook_events al inicio sin bloquear la ingestión
      return;
    }

    default:
      console.warn("evento FACEIT no manejado:", w.evento);
      return;
  }
}
