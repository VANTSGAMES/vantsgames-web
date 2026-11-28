import test from "node:test";
import assert from "node:assert/strict";
import { rutasVantsAi, preEvaluarAlianzaB2B, compactarTelemetriaJson } from "../integraciones/src/vantsAi.js";
import { datosValorant, metricasValorant, purgarDatosRiot, rutasJuegos } from "../integraciones/src/juegos.js";
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



