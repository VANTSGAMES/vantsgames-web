import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  construirEmparejamientos,
  secuenciaRondasPara,
  type EquipoInscrito,
} from "../cloudflare/src/bracket-helpers.ts";
import { aplicarWebhook, type ColaEnv, type WebhookFaceit } from "../cloudflare/src/webhooks-faceit.ts";

function equipos(n: number): EquipoInscrito[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `Equipo ${i + 1}`,
    tag: `E${i + 1}`,
    captain: `Cap${i + 1}`,
  }));
}

test("secuenciaRondasPara y construirEmparejamientos respetan CHECK (ronda q/s/f, slot 0..3) y BYEs impares", () => {
  assert.deepEqual(secuenciaRondasPara(2), ["f"]);
  assert.deepEqual(secuenciaRondasPara(3), ["s", "f"]);
  assert.deepEqual(secuenciaRondasPara(4), ["s", "f"]);
  assert.deepEqual(secuenciaRondasPara(5), ["q", "s", "f"]);
  assert.deepEqual(secuenciaRondasPara(7), ["q", "s", "f"]);
  assert.deepEqual(secuenciaRondasPara(8), ["q", "s", "f"]);

  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const eq = equipos(n);
    const pares = construirEmparejamientos(eq);
    const bracketSize = n <= 2 ? 2 : n <= 4 ? 4 : 8;
    assert.equal(pares.length, bracketSize / 2, `slots para ${n} equipos`);

    const byes = pares.filter((p) => p.b === null);
    assert.equal(byes.length, bracketSize - n, `BYEs para ${n} equipos`);

    const vistos = new Set<string>();
    for (const p of pares) {
      assert.ok(p.slot >= 0 && p.slot <= 3, `slot fuera de rango: ${p.slot}`);
      vistos.add(p.a.id);
      if (p.b) vistos.add(p.b.id);
    }
    assert.equal(vistos.size, n, `todos los ${n} equipos deben aparecer exactamente una vez`);
  }
});

test("aplicarWebhook match_finished actualiza D1 (estado 'final') y empuja marcador + crónica Caster IA por RPC", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const avisosSala: Array<{ sala: string; ev: Record<string, unknown> }> = [];
  const llamadasCaster: Array<{ url: string; internal: string | null; staff: string | null; body: any }> = [];

  const mockDb: any = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt: any = {
        bind(...p: unknown[]) {
          bound = p;
          return stmt;
        },
        async run() {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params: bound });
          return { success: true };
        },
        async first() {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params: bound });
          if (/SELECT tournament_id, ronda, slot/i.test(sql)) {
            return {
              tournament_id: "copa-cs2-vants",
              ronda: "f",
              slot: 0,
              team_a: "VANTS Alpha",
              team_b: "Caracas Five",
              score_a: 13,
              score_b: 9,
              ganador: "VANTS Alpha",
            };
          }
          return null;
        },
      };
      return stmt;
    },
  };

  const env: ColaEnv = {
    COLA_WEBHOOKS: {} as any,
    DB: mockDb,
    SALA_TORNEO: {
      getByName(name: string) {
        return {
          async avisar(ev: Record<string, unknown>) {
            avisosSala.push({ sala: name, ev });
          },
        } as any;
      },
    } as any,
    VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
    VANTS_INT_SERVICE: {
      async fetch(req: Request) {
        llamadasCaster.push({
          url: req.url,
          internal: req.headers.get("X-Vants-Internal"),
          staff: req.headers.get("X-Vants-Staff"),
          body: await req.json(),
        });
        return new Response(
          JSON.stringify({
            ok: true,
            cronica: "¡VANTS Alpha cierra la Gran Final 13-9 frente a Caracas Five!",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    } as any,
  };

  const webhook: WebhookFaceit = {
    evento: "match_finished",
    matchId: "copa-cs2-vants-f-0",
    torneoId: "copa-cs2-vants",
    datos: {
      ronda: "f",
      slot: 0,
      team_a: "VANTS Alpha",
      team_b: "Caracas Five",
      score_a: 13,
      score_b: 9,
      winner_team_id: "VANTS Alpha",
    },
    recibidoEn: "2026-11-27T20:00:00.000Z",
  };

  await aplicarWebhook(env, webhook);

  // 1) Auditoría en faceit_webhook_events
  assert.ok(queries.some((q) => /^INSERT INTO faceit_webhook_events/i.test(q.sql)));
  // 2) Actualización con estado 'final' en tournament_matches (no 'terminada' ni 'verificada')
  assert.ok(queries.some((q) => /^UPDATE tournament_matches SET estado = 'final'/i.test(q.sql)));
  // 3) Sincronización con estado 'finished' en pt_matches
  assert.ok(queries.some((q) => /^UPDATE pt_matches SET estado = 'finished'/i.test(q.sql)));
  // 4) Llamada al Caster IA en vants-integraciones
  assert.equal(llamadasCaster.length, 1);
  assert.equal(llamadasCaster[0].url, "https://int.vants.cc/ai/torneo/caster");
  assert.equal(llamadasCaster[0].internal, env.VANTS_INTERNAL_SECRET);
  assert.equal(llamadasCaster[0].staff, "1");
  assert.equal(llamadasCaster[0].body.score_a, 13);
  // 5) Dos RPC a SalaTorneo: marcador oficial + crónica del Caster IA
  assert.equal(avisosSala.length, 2);
  assert.equal(avisosSala[0].sala, "torneo-copa-cs2-vants");
  assert.equal(avisosSala[0].ev.tipo, "marcador");
  assert.equal(avisosSala[1].ev.tipo, "caster");
  assert.match(String(avisosSala[1].ev.texto), /VANTS Alpha/);
});

test("aplicarWebhook match_status_updated mapea estados a CHECK válidos de tournament_matches y pt_matches", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const mockDb: any = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt: any = {
        bind(...p: unknown[]) {
          bound = p;
          return stmt;
        },
        async run() {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params: bound });
          return { success: true };
        },
      };
      return stmt;
    },
  };

  await aplicarWebhook(
    { COLA_WEBHOOKS: {} as any, DB: mockDb },
    {
      evento: "match_status_updated",
      matchId: "m-1",
      torneoId: "copa-valo",
      datos: { status: "ongoing", ronda: "s", slot: 1 },
      recibidoEn: "2026-11-27T19:00:00.000Z",
    },
  );

  const tmUpd = queries.find((q) => /^UPDATE tournament_matches SET estado = \?/i.test(q.sql));
  const ptUpd = queries.find((q) => /^UPDATE pt_matches SET estado = \?/i.test(q.sql));
  assert.equal(tmUpd?.params[0], "en_curso");
  assert.equal(ptUpd?.params[0], "live");
});

test("Módulo 1 & 3: SalaTorneo tiene chat 100% efímero (0 KB storage), expulsa por RPC y conserva el botón !ARBITRO", () => {
  const salaSrc = readFileSync("cloudflare/src/sala-torneo.ts", "utf8");
  const liveUiSrc = readFileSync("client/src/components/torneos/SalaTorneoLive.tsx", "utf8");

  // Chat 100% efímero: sin guardarHistorial ni lecturas/escrituras de chat_hist en storage
  assert.equal(/guardarHistorial/.test(salaSrc), false);
  assert.equal(/storage\.put\(\s*['"]chat_hist['"]/.test(salaSrc), false);
  assert.equal(/storage\.get[^)]*['"]chat_hist['"]/.test(salaSrc), false);
  assert.match(salaSrc, /historial:\s*\[\]/);
  // Al cerrar el último socket limpia el buffer RAM y borra legacy chat_hist
  assert.match(salaSrc, /restantes\.length === 0/);
  assert.match(salaSrc, /this\.memoriaChat = \[\]/);
  assert.match(salaSrc, /expulsar\(/);
  // Conserva intacto el disparador !arbitro y el botón !arbitro en UI
  assert.match(salaSrc, /!arbitro/);
  assert.match(liveUiSrc, /data-testid="sala-live-btn-arbitro"/);
  assert.match(liveUiSrc, /⚖️ !arbitro/);
});
