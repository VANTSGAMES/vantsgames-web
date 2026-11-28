import test from "node:test";
import assert from "node:assert/strict";
import { rutasVantsAi, preEvaluarAlianzaB2B, compactarTelemetriaJson } from "../integraciones/src/vantsAi.js";
import { datosValorant, metricasValorant, purgarDatosRiot, rutasJuegos } from "../integraciones/src/juegos.js";
import {
  canonicalHeartbeatMessage,
  hmacSha256Hex,
  resetSentinelAcCacheForTests,
} from "../integraciones/src/sentinelAc.js";
import { rutasFormularios, resetFormulariosCacheForTests } from "../integraciones/src/formularios.js";
import { vantsAiApi, VantsAiError } from "../client/src/lib/vantsAiApi.ts";

function createAiMockD1() {
  const tasks = new Map<string, any>();
  const quotas = new Map<string, number>();

  const exec = (sql: string, params: any[]) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/^CREATE (TABLE|INDEX)/i.test(q)) return { results: [] };
    if (/^SELECT usados FROM integ_ai_cuota_diaria/i.test(q)) {
      const [fecha, sub] = params;
      const usados = quotas.get(`${fecha}:${sub}`);
      return { results: usados != null ? [{ usados }] : [] };
    }
    if (/^INSERT INTO integ_ai_cuota_diaria/i.test(q)) {
      const [fecha, sub] = params;
      const k = `${fecha}:${sub}`;
      quotas.set(k, (quotas.get(k) || 0) + 1);
      return { results: [] };
    }
    if (/^SELECT auth0_sub FROM players WHERE discord_user_id/i.test(q)) {
      return { results: params[0] === "111222333" ? [{ auth0_sub: "google-oauth2|owner-1" }] : [] };
    }
    if (/^SELECT 1 FROM players WHERE auth0_sub/i.test(q) || /^SELECT role FROM players/i.test(q)) {
      return { results: params[0] === "google-oauth2|owner-1" ? [{ role: "owner", 1: 1 }] : [] };
    }
    if (/^INSERT INTO integ_ai_tasks/i.test(q)) {
      if (q.includes("'system:b2b'")) {
        const [id, prompt, response, metadata_json] = params;
        tasks.set(id, {
          id,
          auth0_sub: "system:b2b",
          user_role: "automated_b2b",
          target_agent: "sponsorship",
          priority: 4,
          status: "pending_approval",
          prompt,
          response,
          metadata_json,
          action_json: null,
        });
      } else if (q.includes("'internal_torneo'")) {
        if (q.includes("'arbitro'")) {
          const [id, auth0_sub, priority, prompt, response, metadata_json] = params;
          tasks.set(id, { id, auth0_sub, user_role: "internal_torneo", target_agent: "arbitro", priority, status: "completed", prompt, response, metadata_json, action_json: null });
        } else {
          const [id, auth0_sub, prompt, response, metadata_json] = params;
          tasks.set(id, { id, auth0_sub, user_role: "internal_torneo", target_agent: "caster", priority: 2, status: "completed", prompt, response, metadata_json, action_json: null });
        }
      } else {
        const [id, auth0_sub, user_role, target_agent, priority, status, prompt, response, metadata_json, action_json] = params;
        tasks.set(id, {
          id,
          auth0_sub,
          user_role,
          target_agent,
          priority,
          status,
          prompt,
          response,
          metadata_json,
          action_json,
        });
      }
      return { results: [] };
    }
    if (/^SELECT \* FROM integ_ai_tasks WHERE id = \?/i.test(q)) {
      const t = tasks.get(params[0]);
      return { results: t ? [t] : [] };
    }
    if (/^UPDATE integ_ai_tasks SET status = \?/i.test(q)) {
      const [status, reviewed_by, id] = params;
      const t = tasks.get(id);
      if (t) {
        t.status = status;
        t.reviewed_by = reviewed_by;
      }
      return { results: [] };
    }
    if (/^SELECT .* FROM integ_ai_tasks/i.test(q)) {
      return { results: [...tasks.values()] };
    }
    return { results: [] };
  };

  return {
    tasks,
    quotas,
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt: any = {
        bind(...p: any[]) {
          bound = p;
          return stmt;
        },
        async all() {
          return exec(sql, bound);
        },
        async first() {
          const r = exec(sql, bound);
          return r.results?.[0] ?? null;
        },
        async run() {
          exec(sql, bound);
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

const jsonHelper = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("rutasVantsAi /ai/estado supports Discord internal auth and reports config", async () => {
  const db = createAiMockD1();
  const busEvents: any[] = [];
  const env = {
    DB: db,
    GEMINI_API_KEY: "test-gemini-key",
    VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
    VANTS_BUS_SECRET: "bus-secret-32chars-xxxxxxxxxxxxxx",
    VANTS_BUS_PROJECT: "vants-ai",
    VANTS_BUS_SERVICE: {
      async fetch(req: Request) {
        busEvents.push(await req.json());
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  };
  const H = {
    json: jsonHelper,
    usuarioClaims: async () => {
      throw new Error("sin_sesion");
    },
  };

  const req = new Request("https://int.vants.cc/ai/estado", {
    headers: {
      "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
      "X-Vants-Discord-Id": "111222333",
      "X-Vants-Staff": "1",
    },
  });
  const res = await rutasVantsAi(req, env, new URL(req.url), "/ai/estado", "GET", H);
  assert.equal(res!.status, 200);
  const data = (await res!.json()) as any;
  assert.equal(data.ok, true);
  assert.equal(data.configurado, true);
  assert.equal(data.owner, true);
  assert.equal(data.origen, "discord");
  assert.equal(data.bus, true);
  assert.deepEqual(data.agentes, ["scouting", "sponsorship", "community"]);
});

test("rutasVantsAi /ai/dispatch creates pending_approval draft, publishes to VantsBus, and approves via Discord staff", async () => {
  const db = createAiMockD1();
  const busCalls: { headers: Record<string, string>; body: any }[] = [];
  const discordAnuncios: any[] = [];
  const fetchOrig = globalThis.fetch;

  let callNum = 0;
  globalThis.fetch = (async () => {
    callNum += 1;
    if (callNum === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      target_agent: "community",
                      priority: 4,
                      reasoning: "Anuncio oficial de torneo",
                      needs_external_action: true,
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "¡Inscripciones abiertas para el Torneo VANTS CS2!" }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as any;

  try {
    const env = {
      DB: db,
      GEMINI_API_KEY: "test-gemini-key",
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
      VANTS_BUS_SECRET: "bus-secret-32chars-xxxxxxxxxxxxxx",
      VANTS_BUS_PROJECT: "vants-ai",
      VANTS_BUS_SERVICE: {
        async fetch(req: Request) {
          busCalls.push({
            headers: {
              project: req.headers.get("X-VANTS-Project") || "",
              sig: req.headers.get("X-VANTS-Signature") || "",
            },
            body: await req.json(),
          });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    };
    const H = {
      json: jsonHelper,
      usuarioClaims: async () => ({ sub: "google-oauth2|owner-1" }),
      discord: async (_e: any, cat: string, payload: any) => {
        discordAnuncios.push({ cat, payload });
      },
      notificar: async () => {},
    };

    const req = new Request("https://int.vants.cc/ai/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Discord-Id": "111222333",
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({ prompt: "Publica anuncio oficial del torneo CS2", context_data: { titulo: "Torneo CS2" } }),
    });
    const res = await rutasVantsAi(req, env, new URL(req.url), "/ai/dispatch", "POST", H);
    assert.equal(res!.status, 200);
    const data = (await res!.json()) as any;
    assert.equal(data.ok, true);
    assert.equal(data.status, "pending_approval");
    assert.equal(data.requiere_aprobacion, true);
    assert.equal(busCalls.length, 1);
    assert.equal(busCalls[0].headers.project, "vants-ai");
    assert.match(busCalls[0].headers.sig, /^[0-9a-f]{64}$/);
    assert.equal(busCalls[0].body.type, "ai.draft_created");
    assert.equal(busCalls[0].body.data.task_id, data.task_id);

    // Approve the draft task
    const reqApp = new Request(`https://int.vants.cc/ai/tasks/${data.task_id}/approve`, {
      method: "POST",
      headers: {
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Discord-Id": "111222333",
        "X-Vants-Staff": "1",
      },
    });
    const resApp = await rutasVantsAi(reqApp, env, new URL(reqApp.url), `/ai/tasks/${data.task_id}/approve`, "POST", H);
    assert.equal(resApp!.status, 200);
    const appData = (await resApp!.json()) as any;
    assert.equal(appData.ok, true);
    assert.equal(appData.status, "approved");
    assert.equal(appData.ejecucion.ejecutado, true);
    assert.equal(discordAnuncios.length, 1);
    assert.equal(busCalls.length, 2);
    assert.equal(busCalls[1].body.type, "ai.task_reviewed");

    // Pre-evaluar alianza B2B
    const b2b = await preEvaluarAlianzaB2B(env, {
      empresa: "HyperX LATAM",
      tipo: "Patrocinio",
      web: "https://hyperx.com",
      mensaje: "Queremos patrocinar la copa de CS2.",
    });
    assert.ok(b2b.taskId);
    assert.equal(busCalls.length, 3);
    assert.equal(busCalls[2].body.type, "ai.draft_created");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("vantsAiApi calls /api/ai/* with Bearer JWT and maps structured VantsAiError codes", async () => {
  const fetchOrig = globalThis.fetch;
  const seen: Array<{ url: string; method?: string; auth?: string; body?: string }> = [];

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({
      url,
      method: init?.method,
      auth: headers.get("Authorization") || undefined,
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    if (url === "/api/ai/estado") {
      return new Response(
        JSON.stringify({
          ok: true,
          configurado: true,
          modelos: { router: "gemini-3.5-flash-lite", expert: "gemini-3.8-flash" },
          gateway: false,
          bus: true,
          owner: true,
          origen: "web",
          cuota: { fecha: "2026-11-27", plan: "socio", limite: 9999, usados: 1, restantes: 9998 },
          agentes: ["scouting", "sponsorship", "community"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url === "/api/ai/scout/jugador") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "limite_diario_ai",
          cuota: { fecha: "2026-11-27", plan: "free", limite: 3, usados: 3, restantes: 0 },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }

    if (url === "/api/ai/tasks?scope=admin&status=pending_approval") {
      return new Response(JSON.stringify({ ok: true, tasks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === "/api/ai/tasks/abc-123/approve") {
      return new Response(JSON.stringify({ ok: true, task_id: "abc-123", status: "approved" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "no_encontrado" }), { status: 404 });
  }) as any;

  try {
    const st = await vantsAiApi.estado("jwt-token-123");
    assert.equal(st.ok, true);
    assert.equal(st.owner, true);
    assert.equal(seen[0].url, "/api/ai/estado");
    assert.equal(seen[0].auth, "Bearer jwt-token-123");

    await assert.rejects(
      () => vantsAiApi.scoutJugador("jwt-token-123", { pid: "pid1", nick: "Feis" }),
      (err: unknown) => {
        assert.ok(err instanceof VantsAiError);
        assert.equal(err.code, "limite_diario_ai");
        assert.equal(err.status, 429);
        assert.equal(err.cuota?.restantes, 0);
        return true;
      },
    );

    const list = await vantsAiApi.listarTareas("jwt-token-123", { scope: "admin", status: "pending_approval" });
    assert.deepEqual(list.tasks, []);

    const rev = await vantsAiApi.revisarTarea("jwt-token-123", "abc-123", "approve");
    assert.equal(rev.status, "approved");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("compactarTelemetriaJson caps telemetry payload to <= 6000 chars", () => {
  const huge = {
    encontrado: true,
    pid: "p1",
    nick: "Feispla",
    insignias: Array.from({ length: 100 }, (_, i) => `INSIGNIA_LARGA_${i}_${"X".repeat(30)}`),
    equipos: Array.from({ length: 20 }, (_, i) => ({ nombre: `Team ${i}`, extra: "Y".repeat(200) })),
    vants_ranked_mm: Array.from({ length: 20 }, (_, i) => ({ game: "cs2", idx: i, note: "Z".repeat(150) })),
    valorant: {
      riot: "Feis#000",
      ultimas_5_partidas: Array.from({ length: 5 }, (_, i) => ({
        mapa: "Ascent",
        agente: "Jett",
        kills: 20 + i,
        deaths: 12,
        assists: 4,
        acs: 260,
        resultado: "W",
        extra: "W".repeat(400),
      })),
    },
    fortnite: { raw: "F".repeat(3000) },
  };
  const compact = compactarTelemetriaJson(huge, 6000);
  assert.ok(compact.length <= 6000, `Expected <= 6000 chars, got ${compact.length}`);
});

test("rutasVantsAi /ai/scout/jugador falls back to ROUTER_MODEL on EXPERT_MODEL timeout and sends maxOutputTokens 1024", async () => {
  const db = createAiMockD1();
  // Seed perfiles_publicos + players so identidades() finds player "Feispla"
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/FROM perfiles_publicos/i.test(q)) {
      const s: any = {
        bind: () => s,
        all: async () => ({ results: [{ auth0_sub: "google-oauth2|owner-1", nickname: "Feispla", redes: null, banner: null, vitrina: null, updated_at: "2026-11-27" }] }),
        first: async () => null,
        run: async () => ({ success: true }),
      };
      return s;
    }
    return origPrepare(sql);
  };

  const fetchOrig = globalThis.fetch;
  const geminiCalls: Array<{ url: string; maxOutputTokens?: number }> = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    geminiCalls.push({ url, maxOutputTokens: body?.generationConfig?.maxOutputTokens });
    if (url.includes("gemini-3.8-flash")) {
      const err: any = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    performance_score: 84,
                    tier_sugerido: "VANTS Pro",
                    rol_ideal: "Entry",
                    fortalezas: ["Consistencia"],
                    areas_mejora: ["Utilidad"],
                    plan_entrenamiento_7d: ["Día 1: Aim"],
                    recomendacion_fichaje: "Listo para tryout",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as any;

  try {
    const env = {
      DB: db,
      GEMINI_API_KEY: "test-gemini-key",
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
    };
    const H = {
      json: jsonHelper,
      usuarioClaims: async () => ({ sub: "google-oauth2|owner-1" }),
      cacheado: async (_k: string, _ms: number, fn: any) => fn(),
      fx: async () => null,
    };
    const req = new Request("https://int.vants.cc/ai/scout/jugador", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Discord-Id": "111222333",
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({ nick: "Feispla" }),
    });
    const res = await rutasVantsAi(req, env, new URL(req.url), "/ai/scout/jugador", "POST", H);
    assert.equal(res!.status, 200);
    const data = (await res!.json()) as any;
    assert.equal(data.ok, true);
    assert.equal(data.modelo, "gemini-3.5-flash-lite");
    assert.equal(data.reporte.performance_score, 84);
    assert.equal(geminiCalls.length, 2);
    assert.match(geminiCalls[0].url, /gemini-3\.8-flash:generateContent/);
    assert.match(geminiCalls[1].url, /gemini-3\.5-flash-lite:generateContent/);
    assert.equal(geminiCalls[0].maxOutputTokens, 1024);
    assert.equal(geminiCalls[1].maxOutputTokens, 1024);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("VALORANT RSO compliance: datosValorant returns rso_pendiente without opt-in/RIOT_API_KEY and purgarDatosRiot deletes cached data", async () => {
  const executedSql: string[] = [];
  let updatedStats: string | null = null;
  let fetchCalled = false;
  const fetchOrig = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("should not call external API without RSO opt-in and RIOT_API_KEY");
  }) as any;

  const mockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt: any = {
        bind(...p: any[]) {
          bound = p;
          return stmt;
        },
        async first() {
          executedSql.push(sql);
          return null;
        },
        async all() {
          executedSql.push(sql);
          if (/SELECT id, stats FROM players/i.test(sql)) {
            return { results: [{ id: "p-1", stats: JSON.stringify({ valorant: { tier_id: 21 }, faceit: { elo: 2100 } }) }] };
          }
          return { results: [] };
        },
        async run() {
          executedSql.push(sql);
          if (/UPDATE players SET stats = \?/i.test(sql)) {
            updatedStats = bound[0];
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };

  try {
    const res = await datosValorant({ DB: mockDb }, "google-oauth2|player-1", false);
    assert.equal(res.ok, false);
    assert.equal(res.motivo, "rso_pendiente");
    assert.equal(res.opt_in, false);
    assert.equal(fetchCalled, false);
    assert.equal(metricasValorant(res), null);

    // POST /riot with manual Riot ID returns rso_pendiente cleanly without writing unverified handles
    const H = { json: jsonHelper, usuario: async () => "google-oauth2|player-1" };
    const reqManual = new Request("https://int.vants.cc/riot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riot: "Feispla#000" }),
    });
    const rManual = await rutasJuegos(reqManual, { DB: mockDb }, new URL(reqManual.url), "/riot", "POST", H);
    assert.equal(rManual!.status, 200);
    const bodyManual = (await rManual!.json()) as any;
    assert.equal(bodyManual.ok, false);
    assert.equal(bodyManual.motivo, "rso_pendiente");

    // Opt-out purge deletes vants_links, integ_riot, integ_logros_ok v.%, user_game_accounts, and players.stats.valorant
    const purgeRes = await purgarDatosRiot(mockDb, "google-oauth2|player-1");
    assert.equal(purgeRes.ok, true);
    assert.ok(executedSql.some((s) => /DELETE FROM vants_links/i.test(s)));
    assert.ok(executedSql.some((s) => /DELETE FROM integ_riot/i.test(s)));
    assert.ok(executedSql.some((s) => /DELETE FROM integ_logros_ok/i.test(s) && s.includes("v.%")));
    assert.ok(executedSql.some((s) => /DELETE FROM user_game_accounts/i.test(s)));
    assert.deepEqual(JSON.parse(updatedStats!), { faceit: { elo: 2100 } });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("Fase 4: /ai/torneo/arbitro rechaza no-owner (403), devuelve veredicto JSON, audita D1 y escala disputa a VantsBus", async () => {
  const db = createAiMockD1();
  const busEvents: any[] = [];
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    accion: "escalar_staff",
                    respuesta: "Hemos registrado la denuncia de pausa ilegal y el staff ya fue notificado.",
                    motivo_staff: "Posible abuso de pausa técnica durante semifinal",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as any;

  try {
    const env = {
      DB: db,
      GEMINI_API_KEY: "test-gemini-key",
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
      VANTS_BUS_SECRET: "bus-secret-32chars-xxxxxxxxxxxxxx",
      VANTS_BUS_PROJECT: "vants-ai",
      VANTS_BUS_SERVICE: {
        async fetch(req: Request) {
          busEvents.push({
            project: req.headers.get("X-VANTS-Project"),
            sig: req.headers.get("X-VANTS-Signature"),
            body: await req.json(),
          });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    };
    const H = {
      json: jsonHelper,
      usuarioClaims: async () => ({ sub: "google-oauth2|regular-player" }),
    };

    // 1) Jugador regular por web JWT recibe 403 solo_interno
    const reqNoOwner = new Request("https://int.vants.cc/ai/torneo/arbitro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ torneoId: "copa-cs2", autor: "Player1", consulta: "Pausa ilegal" }),
    });
    const r403 = await rutasVantsAi(reqNoOwner, env, new URL(reqNoOwner.url), "/ai/torneo/arbitro", "POST", H);
    assert.equal(r403!.status, 403);
    assert.equal(((await r403!.json()) as any).error, "solo_interno");

    // 2) Llamada interna desde SalaTorneo (X-Vants-Internal + X-Vants-Staff: 1)
    const reqInt = new Request("https://int.vants.cc/ai/torneo/arbitro", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({
        torneoId: "copa-cs2",
        torneo: { id: "copa-cs2", nombre: "Copa VANTS CS2", reglas: "Pausa técnica máx 5 min" },
        autor: "CapitanA",
        consulta: "El rival lleva 12 minutos en pausa ilegal y no responde",
      }),
    });
    const rOk = await rutasVantsAi(reqInt, env, new URL(reqInt.url), "/ai/torneo/arbitro", "POST", H);
    assert.equal(rOk!.status, 200);
    const data = (await rOk!.json()) as any;
    assert.equal(data.ok, true);
    assert.equal(data.veredicto.accion, "escalar_staff");
    assert.ok(data.task_id);

    // Verifica auditoría D1 con target_agent = 'arbitro' y priority = 5
    const saved = db.tasks.get(data.task_id);
    assert.equal(saved?.target_agent, "arbitro");
    assert.equal(saved?.priority, 5);

    // Verifica escalado a VantsBus con evento tournament.dispute
    assert.equal(busEvents.length, 1);
    assert.equal(busEvents[0].body.type, "tournament.dispute");
    assert.equal(busEvents[0].body.data.torneo_id, "copa-cs2");
    assert.equal(busEvents[0].body.data.autor, "CapitanA");
    assert.match(busEvents[0].sig, /^[0-9a-f]{64}$/);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("Fase 4: /ai/torneo/caster rechaza no-owner (403), genera crónica corta y audita en D1", async () => {
  const db = createAiMockD1();
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: "¡VANTS Alpha domina 13-9 a Caracas Five y avanza a la Gran Final!" }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as any;

  try {
    const env = {
      DB: db,
      GEMINI_API_KEY: "test-gemini-key",
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
    };
    const H = {
      json: jsonHelper,
      usuarioClaims: async () => ({ sub: "google-oauth2|regular-player" }),
    };

    const reqNoOwner = new Request("https://int.vants.cc/ai/torneo/caster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ torneoId: "copa-cs2", equipo_a: "A", equipo_b: "B" }),
    });
    const r403 = await rutasVantsAi(reqNoOwner, env, new URL(reqNoOwner.url), "/ai/torneo/caster", "POST", H);
    assert.equal(r403!.status, 403);

    const reqInt = new Request("https://int.vants.cc/ai/torneo/caster", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({
        torneoId: "copa-cs2",
        matchId: "copa-cs2-s-0",
        equipo_a: "VANTS Alpha",
        equipo_b: "Caracas Five",
        score_a: 13,
        score_b: 9,
      }),
    });
    const rOk = await rutasVantsAi(reqInt, env, new URL(reqInt.url), "/ai/torneo/caster", "POST", H);
    assert.equal(rOk!.status, 200);
    const data = (await rOk!.json()) as any;
    assert.equal(data.ok, true);
    assert.match(data.cronica, /VANTS Alpha/);
    assert.equal(db.tasks.get(data.task_id)?.target_agent, "caster");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

function createSentinelAndFormsMockD1() {
  const bans: any[] = [];
  const challenges = new Map<string, any>();
  const heartbeats = new Map<string, any>();
  const formularios: any[] = [];

  const exec = (sql: string, params: any[]) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/^CREATE (TABLE|INDEX)/i.test(q)) return { results: [] };
    if (/^SELECT 1 FROM players WHERE auth0_sub/i.test(q) || /^SELECT role FROM players/i.test(q)) {
      return { results: params[0] === "google-oauth2|owner-1" ? [{ role: "owner", 1: 1 }] : [] };
    }
    if (/^SELECT .* FROM vants_bans WHERE activo = 1/i.test(q)) {
      const m = q.match(/AND \((.+)\) ORDER BY/i);
      const cols = m ? [...m[1].matchAll(/(\w+) = \?/g)].map((x) => x[1]) : [];
      const found = bans.find(
        (b) => b.activo === 1 && cols.some((col, idx) => b[col] && b[col] === params[idx]),
      );
      return { results: found ? [found] : [] };
    }
    if (/^INSERT INTO vants_bans/i.test(q)) {
      if (q.includes("'vants_pc_hard_evidence'")) {
        const [id, user_sub, nick, hwid, motivo, evidencia_json] = params;
        bans.push({ id, user_sub, nick, hwid, motivo, tipo: "vants_pc_hard_evidence", evidencia_json, activo: 1 });
      } else {
        const [id, user_sub, nick, steam_id, faceit_id, discord_id, hwid, motivo, tipo, evidencia_json] = params;
        bans.push({ id, user_sub, nick, steam_id, faceit_id, discord_id, hwid, motivo, tipo, evidencia_json, activo: 1 });
      }
      return { results: [] };
    }
    if (/^INSERT INTO vants_ac_challenges/i.test(q)) {
      const [nonce, user_sub, expires_at] = params;
      challenges.set(nonce, { nonce, user_sub, expires_at, used_at: null });
      return { results: [] };
    }
    if (/^DELETE FROM vants_ac_challenges/i.test(q)) return { results: [] };
    if (/^SELECT .* FROM vants_ac_challenges WHERE nonce = \?/i.test(q)) {
      const row = challenges.get(params[0]);
      return { results: row ? [row] : [] };
    }
    if (/^UPDATE vants_ac_challenges SET used_at/i.test(q)) {
      const row = challenges.get(params[0]);
      if (row) row.used_at = new Date().toISOString();
      return { results: [] };
    }
    if (/^INSERT INTO vants_ac_heartbeats/i.test(q)) {
      const [user_sub, hwid, app_version, vanguard_on, faceit_ac_on, eac_on, battleye_on, updated_at, expires_at] = params;
      heartbeats.set(user_sub, {
        user_sub,
        hwid,
        app_version,
        vanguard_on,
        faceit_ac_on,
        eac_on,
        battleye_on,
        updated_at,
        expires_at,
      });
      return { results: [] };
    }
    if (/^SELECT .* FROM vants_ac_heartbeats WHERE user_sub = \?/i.test(q)) {
      const row = heartbeats.get(params[0]);
      return { results: row && Number(row.expires_at) > Number(params[1]) ? [row] : [] };
    }
    if (/^INSERT INTO vants_formularios_envios/i.test(q)) {
      const [id, tipo, user_sub, nombre, email, juego, torneo_slug, organizacion, asunto, datos_json, calendar_url] = params;
      formularios.push({
        id,
        tipo,
        user_sub,
        nombre,
        email,
        juego,
        torneo_slug,
        organizacion,
        asunto,
        datos_json,
        estado: "recibido",
        calendar_url,
        creado_en: new Date().toISOString(),
      });
      return { results: [] };
    }
    if (/^SELECT .* FROM vants_formularios_envios/i.test(q)) {
      if (q.includes("WHERE tipo = ?")) {
        return { results: formularios.filter((f) => f.tipo === params[0]) };
      }
      if (q.includes("WHERE user_sub = ?")) {
        return { results: formularios.filter((f) => f.user_sub === params[0] || f.email === String(params[1] || "").toLowerCase()) };
      }
      return { results: [...formularios] };
    }
    return { results: [] };
  };

  return {
    bans,
    challenges,
    heartbeats,
    formularios,
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt: any = {
        bind(...p: any[]) {
          bound = p;
          return stmt;
        },
        async first() {
          return exec(sql, bound).results[0] ?? null;
        },
        async all() {
          return exec(sql, bound);
        },
        async run() {
          exec(sql, bound);
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

test("Módulo 3 (OBLIGATORIO): VANTS Sentinel AI NUNCA bloquea por buen aim (hs_pct 90, kd 4.0) y envía amarillo solo en reporte sin prueba dura", async () => {
  resetSentinelAcCacheForTests();
  const db = createSentinelAndFormsMockD1();
  const webhooks: any[] = [];
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async (url: string, init?: any) => {
    if (String(url).startsWith("https://discord.com/api/webhooks/")) {
      webhooks.push({ url, body: JSON.parse(String(init?.body || "{}")) });
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 200 });
  }) as any;

  try {
    const env = {
      DB: db,
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
      VANTS_PC_AC_SECRET: "pc-ac-secret-32chars-xxxxxxxxxxxx",
      DISCORD_WEBHOOK_DISPUTAS: "https://discord.com/api/webhooks/111111/fake-test-token",
    };
    const H = { json: jsonHelper, usuarioClaims: async () => ({ sub: "google-oauth2|owner-1" }) };

    // 1) Jugador pro con hs_pct: 90, kd: 4.0, adr: 145 SIN evidencia dura -> bloqueado: false
    const reqProAim = new Request("https://int.vants.cc/ai/anticheat/evaluar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({
        user_sub: "google-oauth2|aim-god-1",
        nick: "S1mpleVE",
        torneo_id: "copa-cs2",
        hs_pct: 90,
        kd: 4.0,
        adr: 145,
      }),
    });
    const resAim = await rutasVantsAi(reqProAim, env, new URL(reqProAim.url), "/ai/anticheat/evaluar", "POST", H);
    assert.equal(resAim!.status, 200);
    const bodyAim = (await resAim!.json()) as any;
    assert.equal(bodyAim.bloqueado, false);
    assert.equal(bodyAim.accion, "permitido");
    assert.equal(db.bans.length, 0);
    assert.equal(webhooks.length, 0);

    // 2) Reporte en sala sin prueba dura (incluso con hs_pct: 90, kd: 4.0) -> revision_humana + embed AMARILLO (NO bloquea)
    const reqReporte = new Request("https://int.vants.cc/ai/anticheat/evaluar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({
        user_sub: "google-oauth2|aim-god-1",
        nick: "S1mpleVE",
        torneo_id: "copa-cs2",
        hs_pct: 90,
        kd: 4.0,
        reporte_en_sala: "Tiene 90% HS y 4.0 KD en el primer mapa",
      }),
    });
    const resRep = await rutasVantsAi(reqReporte, env, new URL(reqReporte.url), "/ai/anticheat/evaluar", "POST", H);
    assert.equal(resRep!.status, 200);
    const bodyRep = (await resRep!.json()) as any;
    assert.equal(bodyRep.bloqueado, false);
    assert.equal(bodyRep.accion, "revision_humana");
    assert.equal(db.bans.length, 0);
    assert.equal(webhooks.length, 1);
    assert.deepEqual(webhooks[0].body.allowed_mentions, { parse: [] });
    assert.equal(webhooks[0].body.embeds[0].color, 16098851); // Amarillo informativo
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("Módulo 3: VANTS Sentinel AI bloquea automáticamente con evidencia dura (evasión, FACEIT/Steam VAC, VANTS PC firmado) y expulsa por RPC", async () => {
  resetSentinelAcCacheForTests();
  const db = createSentinelAndFormsMockD1();
  const webhooks: any[] = [];
  const rpcCalls: any[] = [];
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://discord.com/api/webhooks/")) {
      webhooks.push({ url: u, body: JSON.parse(String(init?.body || "{}")) });
      return new Response(null, { status: 204 });
    }
    if (u.startsWith("https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/")) {
      return new Response(
        JSON.stringify({
          players: [{ SteamId: "76561198000000001", VACBanned: true, NumberOfVACBans: 1, NumberOfGameBans: 0, DaysSinceLastBan: 5 }],
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  }) as any;

  try {
    const env = {
      DB: db,
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
      VANTS_PC_AC_SECRET: "pc-ac-secret-32chars-xxxxxxxxxxxx",
      STEAM_API_KEY: "steam-test-key",
      DISCORD_WEBHOOK_DISPUTAS: "https://discord.com/api/webhooks/111111/fake-test-token",
      TORNEOS_REALTIME: {
        async fetch(req: Request) {
          rpcCalls.push({ url: req.url, body: await req.json() });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    };
    const H = { json: jsonHelper, usuarioClaims: async () => ({ sub: "google-oauth2|owner-1" }) };
    const headers = {
      "content-type": "application/json",
      "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
      "X-Vants-Staff": "1",
    };

    // Caso B: Steam VAC Ban verificado
    const reqVac = new Request("https://int.vants.cc/ai/anticheat/evaluar", {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_sub: "google-oauth2|cheater-vac",
        nick: "VacUser",
        steam_id: "76561198000000001",
        hwid: "HWID-VAC-001",
        torneo_id: "copa-cs2",
      }),
    });
    const rVac = await rutasVantsAi(reqVac, env, new URL(reqVac.url), "/ai/anticheat/evaluar", "POST", H);
    const bVac = (await rVac!.json()) as any;
    assert.equal(bVac.bloqueado, true);
    assert.equal(bVac.tipo, "external_steam_ban");
    assert.equal(bVac.expulsado_sala, true);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].body.accion, "expulsar");
    assert.equal(webhooks[0].body.embeds[0].color, 15158332); // Rojo

    // Caso A: Evasión de ban con otra cuenta usando el mismo HWID
    const reqEvasion = new Request("https://int.vants.cc/ai/anticheat/evaluar", {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_sub: "google-oauth2|smurf-evader",
        nick: "SmurfNuevo",
        hwid: "HWID-VAC-001",
        torneo_id: "copa-cs2",
      }),
    });
    const rEv = await rutasVantsAi(reqEvasion, env, new URL(reqEvasion.url), "/ai/anticheat/evaluar", "POST", H);
    const bEv = (await rEv!.json()) as any;
    assert.equal(bEv.bloqueado, true);
    assert.equal(bEv.tipo, "ban_evasion");

    // Caso C: Evidencia técnica dura firmada desde VANTS PC
    const canonical = canonicalHeartbeatMessage({
      nonce: "n-hard-1",
      userSub: "google-oauth2|tamper-1",
      ts: "1732750000000",
      hwid: "HWID-TAMPER-9",
      vanguardOn: false,
      faceitAcOn: false,
      hardFlags: ["memory_tamper"],
    });
    const signature = await hmacSha256Hex(env.VANTS_PC_AC_SECRET, canonical);
    const reqPc = new Request("https://int.vants.cc/ai/anticheat/evaluar", {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_sub: "google-oauth2|tamper-1",
        nick: "TamperGuy",
        hwid: "HWID-TAMPER-9",
        torneo_id: "copa-valo",
        vants_pc_evidence: {
          nonce: "n-hard-1",
          ts: "1732750000000",
          flags: ["memory_tamper"],
          signature,
        },
      }),
    });
    const rPc = await rutasVantsAi(reqPc, env, new URL(reqPc.url), "/ai/anticheat/evaluar", "POST", H);
    const bPc = (await rPc!.json()) as any;
    assert.equal(bPc.bloqueado, true);
    assert.equal(bPc.tipo, "vants_pc_hard_evidence");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("Módulo 3: Puente VANTS PC challenge + heartbeat HMAC firmado (TTL 60s en KV + D1, anti-replay, firma inválida 401)", async () => {
  resetSentinelAcCacheForTests();
  const db = createSentinelAndFormsMockD1();
  const kvStore = new Map<string, { val: string; ttl?: number }>();
  const env = {
    DB: db,
    VANTS_PC_AC_SECRET: "pc-ac-secret-32chars-xxxxxxxxxxxx",
    CLIPS_KV: {
      async put(k: string, val: string, opts?: { expirationTtl?: number }) {
        kvStore.set(k, { val, ttl: opts?.expirationTtl });
      },
      async get(k: string) {
        return kvStore.get(k)?.val ?? null;
      },
    },
  };
  const H = {
    json: jsonHelper,
    usuarioClaims: async () => ({ sub: "google-oauth2|player-pc-1", email: "pc@vants.cc" }),
  };

  // 1) Obtener reto nonce
  const rCh = await rutasVantsAi(
    new Request("https://int.vants.cc/ai/anticheat/challenge"),
    env,
    new URL("https://int.vants.cc/ai/anticheat/challenge"),
    "/ai/anticheat/challenge",
    "GET",
    H,
  );
  assert.equal(rCh!.status, 200);
  const ch = (await rCh!.json()) as any;
  assert.equal(ch.expires_in, 60);
  assert.ok(ch.nonce.length >= 32);

  // 2) Firma inválida -> 401
  const ts = String(Date.now());
  const rBad = await rutasVantsAi(
    new Request("https://int.vants.cc/ai/anticheat/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vants-ac-signature": "0000deadbeef" },
      body: JSON.stringify({ nonce: ch.nonce, ts, hwid: "HWID-OK-1", vanguard_on: true, faceit_ac_on: false }),
    }),
    env,
    new URL("https://int.vants.cc/ai/anticheat/heartbeat"),
    "/ai/anticheat/heartbeat",
    "POST",
    H,
  );
  assert.equal(rBad!.status, 401);

  // 3) Firma válida -> 200, TTL 60 en KV y badge Vanguard ON
  const canonical = canonicalHeartbeatMessage({
    nonce: ch.nonce,
    userSub: "google-oauth2|player-pc-1",
    ts,
    hwid: "HWID-OK-1",
    vanguardOn: true,
    faceitAcOn: false,
    hardFlags: [],
  });
  const sig = await hmacSha256Hex(env.VANTS_PC_AC_SECRET, canonical);
  const rOk = await rutasVantsAi(
    new Request("https://int.vants.cc/ai/anticheat/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vants-ac-signature": sig },
      body: JSON.stringify({ nonce: ch.nonce, ts, hwid: "HWID-OK-1", vanguard_on: true, faceit_ac_on: false }),
    }),
    env,
    new URL("https://int.vants.cc/ai/anticheat/heartbeat"),
    "/ai/anticheat/heartbeat",
    "POST",
    H,
  );
  assert.equal(rOk!.status, 200);
  const bOk = (await rOk!.json()) as any;
  assert.equal(bOk.ttl, 60);
  assert.equal(bOk.ac.code, "vanguard");
  assert.equal(bOk.ac.badge, "Vanguard ON");
  assert.equal(kvStore.get("ac_status:google-oauth2|player-pc-1")?.ttl, 60);

  // 4) Replay del mismo nonce -> 401
  const rReplay = await rutasVantsAi(
    new Request("https://int.vants.cc/ai/anticheat/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vants-ac-signature": sig },
      body: JSON.stringify({ nonce: ch.nonce, ts, hwid: "HWID-OK-1", vanguard_on: true, faceit_ac_on: false }),
    }),
    env,
    new URL("https://int.vants.cc/ai/anticheat/heartbeat"),
    "/ai/anticheat/heartbeat",
    "POST",
    H,
  );
  assert.equal(rReplay!.status, 401);
});

test("Módulo 2: /ai/torneo/arbitro envía embed rojo directo a DISCORD_WEBHOOK_DISPUTAS al escalar a staff", async () => {
  const db = createAiMockD1();
  const webhookPosts: any[] = [];
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://discord.com/api/webhooks/")) {
      webhookPosts.push({ url: u, body: JSON.parse(String(init?.body || "{}")) });
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    accion: "escalar_staff",
                    respuesta: "Disputa escalada al staff para revisión de demo/POV.",
                    motivo_staff: "Posible desconexión reiterada y disputa de ronda",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as any;

  try {
    const env = {
      DB: db,
      GEMINI_API_KEY: "test-gemini-key",
      VANTS_INTERNAL_SECRET: "internal-secret-32chars-xxxxxxxxx",
      DISCORD_WEBHOOK_DISPUTAS: "https://discord.com/api/webhooks/111111/fake-test-token",
    };
    const H = { json: jsonHelper, usuarioClaims: async () => ({ sub: "google-oauth2|owner-1" }) };
    const req = new Request("https://int.vants.cc/ai/torneo/arbitro", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Vants-Internal": env.VANTS_INTERNAL_SECRET,
        "X-Vants-Staff": "1",
      },
      body: JSON.stringify({
        torneoId: "copa-valorant-ve",
        torneo: { id: "copa-valorant-ve", nombre: "Copa VALORANT VE" },
        autor: "CapitanB",
        consulta: "El rival desconectó y pide reiniciar mapa",
      }),
    });
    const res = await rutasVantsAi(req, env, new URL(req.url), "/ai/torneo/arbitro", "POST", H);
    assert.equal(res!.status, 200);
    assert.equal(webhookPosts.length, 1);
    const payload = webhookPosts[0].body;
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].color, 15158332);
    assert.match(payload.embeds[0].title, /Alerta de Cheater \/ Disputa/);
    assert.equal(payload.embeds[0].url, "https://vants.cc/torneos/copa-valorant-ve");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test("Módulo 4: Formularios nativos persisten en D1, generan link Calendar sin OAuth y envían correo oficial desde @vants.cc", async () => {
  resetFormulariosCacheForTests();
  const db = createSentinelAndFormsMockD1();
  const emailsSent: any[] = [];
  const fetchOrig = globalThis.fetch;

  globalThis.fetch = (async (url: string, init?: any) => {
    if (String(url) === "https://api.resend.com/emails") {
      emailsSent.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ id: "re_mock_1" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as any;

  try {
    const env = {
      DB: db,
      RESEND_API_KEY: "re_test_key",
      SITE_URL: "https://vants.cc",
    };
    const H = {
      json: jsonHelper,
      usuarioClaims: async () => ({ sub: "google-oauth2|owner-1", email: "cap@vants.cc", name: "Capitan" }),
    };

    const reqPost = new Request("https://int.vants.cc/formularios/enviar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "inscripcion_torneo",
        nombre: "Carlos",
        email: "carlos@equipo.gg",
        organizacion: "VANTS Alpha",
        tag: "VNTS",
        juego: "valorant",
        torneo_slug: "copa-valorant-ve",
        fecha_inicio: "2026-12-01T21:00:00.000Z",
      }),
    });
    const resPost = await rutasFormularios(reqPost, env, new URL(reqPost.url), "/formularios/enviar", "POST", H);
    assert.equal(resPost!.status, 201);
    const bodyPost = (await resPost!.json()) as any;
    assert.equal(bodyPost.ok, true);
    assert.equal(bodyPost.email_enviado, true);
    assert.match(bodyPost.calendar_url, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    assert.equal(db.formularios.length, 1);
    assert.equal(emailsSent.length, 2); // confirmación al remitente + aviso a torneos@vants.cc
    assert.match(emailsSent[0].from, /torneos@vants\.cc/);
    assert.match(emailsSent[0].html, /Agregar a Google Calendar/);

    // GET /formularios/envios devuelve los registros para exportar a Google Sheets
    const reqGet = new Request("https://int.vants.cc/formularios/envios");
    const resGet = await rutasFormularios(reqGet, env, new URL(reqGet.url), "/formularios/envios", "GET", H);
    assert.equal(resGet!.status, 200);
    const bodyGet = (await resGet!.json()) as any;
    assert.equal(bodyGet.envios.length, 1);
    assert.equal(bodyGet.envios[0].organizacion, "VANTS Alpha");
  } finally {
    globalThis.fetch = fetchOrig;
  }
});




