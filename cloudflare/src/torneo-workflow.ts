// Workflow "Torneo" para VANTS GAMES.
//
// Orquesta un torneo completo como ejecución durable: se puede dormir horas
// entre rondas y, si algo falla, reanuda desde el último paso exitoso (no
// repite lo ya hecho). Cada step.do se persiste; los reintentos de cada paso
// se declaran por paso.
//
// Registro y binding: ver cloudflare/wrangler.ejemplo.jsonc
//   workflows: [{ name: "torneo-workflow", binding: "TORNEO_WORKFLOW", class_name: "TorneoWorkflow" }]
//
// Ajusta los nombres de tablas/columnas a tu schema real de D1.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export interface WorkflowEnv {
  DB: D1Database;            // D1 del proyecto
  TORNEO_WORKFLOW: Workflow; // binding de esta clase (lo genera wrangler)
}

export type TorneoParams = { torneoId: string };

type Inscrito = { jugador_id: string; nick: string };
type Emparejamiento = { a: Inscrito; b: Inscrito | null };

export class TorneoWorkflow extends WorkflowEntrypoint<WorkflowEnv, TorneoParams> {
  async run(event: WorkflowEvent<TorneoParams>, step: WorkflowStep): Promise<void> {
    const { torneoId } = event.payload;

    // 1) Cargar y validar el torneo.
    const torneo = await step.do("cargar-torneo", async () => {
      const { results } = await this.env.DB.prepare(
        "SELECT id, nombre, juego, formato, estado FROM torneos WHERE id = ?",
      )
        .bind(torneoId)
        .all<{ id: string; nombre: string; juego: string; formato: string; estado: string }>();
      const t = results?.[0];
      if (!t) throw new Error(`Torneo ${torneoId} no existe`);
      if (t.estado === "finalizado") throw new Error("El torneo ya está finalizado");
      return t;
    });

    // 2) Inscripciones confirmadas (reintenta por si la base está en vela).
    const inscritos = await step.do(
      "validar-inscripciones",
      { retries: { limit: 3, delay: "1 minute", backoff: "linear" } },
      async () => {
        const { results } = await this.env.DB.prepare(
          "SELECT jugador_id, nick FROM inscripciones WHERE torneo_id = ? AND confirmada = 1",
        )
          .bind(torneoId)
          .all<Inscrito>();
        if (!results || results.length < 2) {
          throw new Error("Inscripciones insuficientes para armar el bracket");
        }
        return results;
      },
    );

    // 3) Bracket inicial (siembra por orden; sustituye por tu generador por MMR).
    let enfrentamientos: Emparejamiento[] = await step.do("generar-bracket", async () => {
      const pares: Emparejamiento[] = [];
      for (let i = 0; i < inscritos.length; i += 2) {
        pares.push({ a: inscritos[i], b: inscritos[i + 1] ?? null }); // impares: pase directo
      }
      await this.guardarRonda(torneoId, 1, pares);
      return pares;
    });

    // 4) Ciclo de rondas: publicar → ventana de juego → verificar → emparejar.
    let ronda = 1;
    let campeon: Inscrito | null = null;
    while (campeon === null) {
      await step.do(`publicar-ronda-${ronda}`, async () => {
        await this.env.DB.prepare("UPDATE torneos SET ronda_actual = ? WHERE id = ?")
          .bind(ronda, torneoId)
          .run();
      });

      // Ventana de juego. La Sala (Durable Object) puede avisar por WebSocket;
      // los capitanes suben resultados y los admins los marcan 'verificada'.
      await step.sleep(`ventana-ronda-${ronda}`, "2 hours");

      const ganadores = await step.do(
        `verificar-resultados-ronda-${ronda}`,
        { retries: { limit: 6, delay: "15 minutes", backoff: "exponential" } },
        async () => {
          const { results } = await this.env.DB.prepare(
            "SELECT ganador FROM partidas WHERE torneo_id = ? AND ronda = ? AND estado = 'verificada'",
          )
            .bind(torneoId, ronda)
            .all<{ ganador: string }>();
          const esperadas = enfrentamientos.filter((p) => p.b !== null).length;
          if (!results || results.length < esperadas) {
            throw new Error(`Faltan resultados verificados en la ronda ${ronda}`);
          }
          return results.map((r) => r.ganador);
        },
      );

      if (ganadores.length === 1) {
        campeon = inscritos.find((i) => i.jugador_id === ganadores[0]) ?? null;
        if (!campeon) {
          campeon = { jugador_id: ganadores[0], nick: ganadores[0] };
        }
        break;
      }

      const siguientes: Emparejamiento[] = [];
      for (let i = 0; i < ganadores.length; i += 2) {
        const a = { jugador_id: ganadores[i], nick: ganadores[i] };
        const b = ganadores[i + 1] ? { jugador_id: ganadores[i + 1], nick: ganadores[i + 1] } : null;
        siguientes.push({ a, b });
      }
      const proxima = ronda + 1;
      await step.do(`emparejar-ronda-${proxima}`, async () => {
        await this.guardarRonda(torneoId, proxima, siguientes);
        return siguientes.length;
      });
      enfrentamientos = siguientes;
      ronda = proxima;
    }

    // 5) Final: estado del torneo, insignia y aviso. La insignia champion vive
    //    en la web (client/public/assets/badges/champion); el email sale por
    //    Resend (puede encolarse con la cola de webhooks/emails).
    await step.do(
      "finalizar-torneo",
      { retries: { limit: 3, delay: "1 minute", backoff: "linear" } },
      async () => {
        await this.env.DB.prepare(
          "UPDATE torneos SET estado = 'finalizado', campeon = ?, ronda_actual = NULL WHERE id = ?",
        )
          .bind(campeon!.jugador_id, torneoId)
          .run();
        return { torneo: torneo.nombre, campeon: campeon!.nick };
      },
    );
  }

  private async guardarRonda(torneoId: string, ronda: number, pares: Emparejamiento[]): Promise<void> {
    const stmts = pares.map((p) =>
      this.env.DB.prepare(
        "INSERT INTO partidas (torneo_id, ronda, jugador_a, jugador_b, estado) VALUES (?, ?, ?, ?, 'pendiente')",
      ).bind(torneoId, ronda, p.a.jugador_id, p.b?.jugador_id ?? null),
    );
    if (stmts.length) await this.env.DB.batch(stmts);
  }
}
