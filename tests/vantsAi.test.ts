import test from "node:test";
import assert from "node:assert/strict";
import { rutasVantsAi, preEvaluarAlianzaB2B } from "../integraciones/src/vantsAi.js";

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
