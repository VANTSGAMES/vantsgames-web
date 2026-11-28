// Workflow "Torneo" para VANTS GAMES (Fase 4).
//
// Alineado 100% con el esquema real de D1 en producción:
//   - pt_torneos         (id, slug, nombre, game_slug, estado IN ('upcoming','ongoing','finished','cancelled'), formato, reglas)
//   - tournament_teams   (id, tournament_id [slug], game, name, tag, captain, status IN ('pendiente','confirmado','rechazado'))
//   - tournament_matches (id, tournament_id [slug], game, ronda IN ('q','s','f','l1','l2','lf'), slot 0..3, team_a, team_b, score_a, score_b, estado IN ('pendiente','en_curso','final'), ganador)
//
// Mejoras Fase 4:
//   - Avance automático determinista de BYEs impares (siembra balanceada en potencia de 2: 2, 4 u 8).
//   - Estado unificado 'final' en tournament_matches (sin choque terminada vs verificada).
//   - Avisos en tiempo real por RPC a SalaTorneo al cambiar de ronda y al coronar campeón (+ Caster IA).
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { SalaTorneo } from "./sala-torneo";
import { anunciarCasterEnSala } from "./webhooks-faceit";
import {
  ETIQUETA_RONDA,
  construirEmparejamientos,
  secuenciaRondasPara,
  type EmparejamientoRonda,
  type EquipoInscrito,
  type RondaCode,
} from "./bracket-helpers";

export {
  ETIQUETA_RONDA,
  construirEmparejamientos,
  secuenciaRondasPara,
  type EmparejamientoRonda,
  type EquipoInscrito,
  type RondaCode,
};

export interface WorkflowEnv {
  DB: D1Database;
  TORNEO_WORKFLOW: Workflow;
  SALA_TORNEO?: DurableObjectNamespace<SalaTorneo>;
  VANTS_INT_SERVICE?: Fetcher;
  VANTS_INTERNAL_SECRET?: string;
}

export type TorneoParams = { torneoId: string };

export class TorneoWorkflow extends WorkflowEntrypoint<WorkflowEnv, TorneoParams> {
  async run(event: WorkflowEvent<TorneoParams>, step: WorkflowStep): Promise<void> {
    const { torneoId } = event.payload;

    // 1) Cargar y validar el torneo real en pt_torneos (busca por slug o id).
    const torneo = await step.do("cargar-torneo", async () => {
      const t = await this.env.DB.prepare(
        "SELECT id, slug, nombre, game_slug, formato, estado FROM pt_torneos WHERE slug = ? OR id = ? LIMIT 1",
      )
        .bind(torneoId, torneoId)
        .first<{ id: string; slug: string; nombre: string; game_slug: string; formato: string | null; estado: string }>();
      if (!t) throw new Error(`Torneo ${torneoId} no existe en pt_torneos`);
      if (t.estado === "finished" || t.estado === "cancelled") {
        throw new Error(`El torneo ${t.slug} ya está en estado ${t.estado}`);
      }
      return t;
    });

    const torneoSlug = torneo.slug;

    // 2) Equipos confirmados en tournament_teams (tournament_id = pt_torneos.slug, status = 'confirmado').
    const inscritos = await step.do(
      "validar-inscripciones",
      { retries: { limit: 3, delay: "1 minute", backoff: "linear" } },
      async () => {
        const { results } = await this.env.DB.prepare(
          "SELECT id, name, tag, captain FROM tournament_teams WHERE tournament_id = ? AND status = 'confirmado' ORDER BY created_at ASC LIMIT 8",
        )
          .bind(torneoSlug)
          .all<EquipoInscrito>();
        if (!results || results.length < 2) {
          throw new Error(`Equipos confirmados insuficientes en tournament_teams para ${torneoSlug}`);
        }
        return results;
      },
    );

    const porId = new Map(inscritos.map((e) => [e.id, e]));
    const rondas = secuenciaRondasPara(inscritos.length);

    // 3) Generar primera ronda del bracket en tournament_matches (BYEs marcados 'final' automáticamente).
    let enfrentamientos: EmparejamientoRonda[] = await step.do("generar-bracket", async () => {
      const pares = construirEmparejamientos(inscritos);
      await this.guardarRonda(torneoSlug, torneo.game_slug, rondas[0], pares);
      await this.env.DB.prepare(
        "UPDATE pt_torneos SET estado = 'ongoing', updated_at = datetime('now') WHERE slug = ?",
      )
        .bind(torneoSlug)
        .run();
      return pares;
    });

    // 4) Ciclo durable por rondas ('q' -> 's' -> 'f').
    let campeon: EquipoInscrito | null = null;
    for (let idxRonda = 0; idxRonda < rondas.length; idxRonda++) {
      const ronda = rondas[idxRonda];
      const etiqueta = ETIQUETA_RONDA[ronda];

      await step.do(`publicar-ronda-${ronda}`, async () => {
        await this.notificarSala(torneoSlug, {
          tipo: "marcador",
          datos: {
            torneoId: torneoSlug,
            torneoNombre: torneo.nombre,
            ronda,
            rondaLabel: etiqueta,
            estado: "en_curso",
            partidas: enfrentamientos.map((p) => ({
              slot: p.slot,
              equipo_a: p.a.name,
              equipo_b: p.b ? p.b.name : "BYE",
              ganador: p.b ? null : p.a.id,
              estado: p.b ? "pendiente" : "final",
            })),
          },
        });
        await this.notificarSala(torneoSlug, {
          tipo: "sistema",
          texto: `🏆 ${etiqueta} en marcha en ${torneo.nombre} (${enfrentamientos.length} ${enfrentamientos.length === 1 ? "partido" : "partidos"}).`,
        });
      });

      // Solo dormimos ventana de juego si hay al menos una partida real (no todos BYEs)
      const hayPartidasReales = enfrentamientos.some((p) => p.b !== null);
      if (hayPartidasReales) {
        await step.sleep(`ventana-ronda-${ronda}`, "2 hours");
      }

      const ganadores = await step.do(
        `verificar-resultados-ronda-${ronda}`,
        { retries: { limit: 6, delay: "15 minutes", backoff: "exponential" } },
        async () => {
          const { results } = await this.env.DB.prepare(
            "SELECT slot, ganador FROM tournament_matches WHERE tournament_id = ? AND ronda = ? AND estado = 'final' AND ganador IS NOT NULL ORDER BY slot ASC",
          )
            .bind(torneoSlug, ronda)
            .all<{ slot: number; ganador: string }>();
          const esperadas = enfrentamientos.length;
          if (!results || results.length < esperadas) {
            throw new Error(`Faltan resultados finales en ronda ${ronda} (${results?.length ?? 0}/${esperadas})`);
          }
          return results.map((r) => r.ganador);
        },
      );

      if (ganadores.length === 1 || idxRonda === rondas.length - 1) {
        const gId = ganadores[0];
        campeon = porId.get(gId) ?? { id: gId, name: gId, tag: "WIN", captain: null };
        break;
      }

      const proxima = rondas[idxRonda + 1];
      const equiposSiguientes: EquipoInscrito[] = ganadores.map(
        (id) => porId.get(id) ?? { id, name: id, tag: "TBD", captain: null },
      );
      const siguientes: EmparejamientoRonda[] = [];
      for (let i = 0; i < equiposSiguientes.length; i += 2) {
        siguientes.push({
          slot: Math.floor(i / 2),
          a: equiposSiguientes[i],
          b: equiposSiguientes[i + 1] ?? null,
        });
      }

      await step.do(`emparejar-ronda-${proxima}`, async () => {
        await this.guardarRonda(torneoSlug, torneo.game_slug, proxima, siguientes);
        return siguientes.length;
      });
      enfrentamientos = siguientes;
    }

    // 5) Cierre oficial del torneo en pt_torneos + anuncio de campeón con Caster IA en SalaTorneo.
    await step.do(
      "finalizar-torneo",
      { retries: { limit: 3, delay: "1 minute", backoff: "linear" } },
      async () => {
        await this.env.DB.prepare(
          "UPDATE pt_torneos SET estado = 'finished', updated_at = datetime('now') WHERE slug = ?",
        )
          .bind(torneoSlug)
          .run();

        const payloadFinal = {
          torneoId: torneoSlug,
          torneoNombre: torneo.nombre,
          juego: torneo.game_slug,
          ronda: "f",
          rondaLabel: "Torneo Finalizado",
          estado: "finished",
          campeon: campeon!.name,
          campeonId: campeon!.id,
          campeonTag: campeon!.tag,
        };
        await anunciarCasterEnSala(this.env, torneoSlug, payloadFinal);
        await this.notificarSala(torneoSlug, {
          tipo: "sistema",
          texto: `🏆 ¡${campeon!.name} se corona campeón de ${torneo.nombre}!`,
        });
        return { torneo: torneo.nombre, campeon: campeon!.name };
      },
    );
  }

  private async notificarSala(torneoSlug: string, ev: Record<string, unknown>): Promise<void> {
    if (!this.env.SALA_TORNEO) return;
    const stub = this.env.SALA_TORNEO.getByName(`torneo-${torneoSlug}`);
    await stub.avisar(ev).catch(() => null);
  }

  private async guardarRonda(
    torneoSlug: string,
    gameSlug: string,
    ronda: RondaCode,
    pares: EmparejamientoRonda[],
  ): Promise<void> {
    const juego = gameSlug || "valorant";
    const stmts = pares.map((p) => {
      const esBye = p.b === null;
      const matchId = `${torneoSlug}-${ronda}-${p.slot}`;
      return this.env.DB.prepare(
        `INSERT INTO tournament_matches
           (id, tournament_id, game, ronda, slot, team_a, team_b, score_a, score_b, estado, ganador, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(tournament_id, ronda, slot) DO UPDATE SET
           team_a = excluded.team_a,
           team_b = excluded.team_b,
           score_a = COALESCE(tournament_matches.score_a, excluded.score_a),
           score_b = COALESCE(tournament_matches.score_b, excluded.score_b),
           estado = CASE WHEN tournament_matches.estado = 'final' THEN 'final' ELSE excluded.estado END,
           ganador = COALESCE(tournament_matches.ganador, excluded.ganador),
           updated_at = datetime('now')`,
      ).bind(
        matchId,
        torneoSlug,
        juego,
        ronda,
        p.slot,
        p.a.id,
        p.b?.id ?? null,
        esBye ? 1 : null,
        esBye ? 0 : null,
        esBye ? "final" : "pendiente",
        esBye ? p.a.id : null,
      );
    });
    if (stmts.length) await this.env.DB.batch(stmts);
  }
}
