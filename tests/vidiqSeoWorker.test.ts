import test from "node:test";
import assert from "node:assert/strict";
import { rutasVidiqSeo, parseMcpSseJson, generarSeoLocal } from "../integraciones/src/vidiqSeo.js";

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

test("parseMcpSseJson extracts JSON-RPC from SSE stream and plain JSON", () => {
  const sse = `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"titles":[{"title":"Ace en Ascent","score":92}]}}}\n\n`;
  const parsed = parseMcpSseJson(sse);
  assert.equal(parsed?.result?.structuredContent?.titles?.[0]?.score, 92);

  const plain = parseMcpSseJson(`{"jsonrpc":"2.0","id":2,"result":{"ok":true}}`);
  assert.equal(plain?.result?.ok, true);
});

const mockVidiqResponse = () =>
  new Response(
    `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        structuredContent: {
          titles: [
            { title: "No creerás cómo sobreviví a este 1v4 #valorant #shorts", score: 91 },
            { title: "Clutch 1v4 imposible en Ascent #valorant", score: 89 },
          ],
          _credits: { used: 5 },
        },
      },
    })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

test("POST /clips/seo requires auth, gates vidIQ by daily plan quota, and enforces global cap", async () => {
  const fixedNow = new Date("2026-11-22T15:00:00Z");

  // 1) Sin sesión -> 401
  const unauth = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Clutch 1v4", juego: "valorant" }),
    }),
    {},
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => {
        throw new Error("sin_sesion");
      },
    },
  );
  assert.equal(unauth?.status, 401);

  // 2) Usuario Gratis -> nunca gasta créditos vidIQ, devuelve SEO local + requiere_membresia
  let vidiqCalls = 0;
  const freeStore = new Map();
  const freeRes = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Clutch 1v4", juego: "valorant" }),
    }),
    { VIDIQ_MCP_TOKEN: "vidiq_test_secret_token", VIDIQ_DAILY_GLOBAL_CAP: "20" },
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "google-oauth2|free1" }),
      membresiaFn: async () => ({ plan: null, activo: false }),
      quotaStore: freeStore,
      now: fixedNow,
      fetchImpl: async () => {
        vidiqCalls += 1;
        return mockVidiqResponse();
      },
    },
  );
  assert.equal(freeRes?.status, 200);
  assert.equal(vidiqCalls, 0);
  const freeBody = (await freeRes!.json()) as any;
  assert.equal(freeBody.source, "vants_seo");
  assert.equal(freeBody.vidiqReason, "requiere_membresia");
  assert.equal(freeBody.quota.plan, "free");
  assert.equal(freeBody.quota.vidiq.limite, 0);

  // 3) Usuario PRO -> usa vidIQ MCP hasta su límite diario (3/día) y en el 4º cae a SEO local
  let calledUrl = "";
  let sentAuth = "";
  const proStore = new Map();
  for (let i = 1; i <= 4; i++) {
    const res = await rutasVidiqSeo(
      new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
        method: "POST",
        body: JSON.stringify({ titulo: `Clutch #${i} en Ascent`, juego: "valorant" }),
      }),
      { VIDIQ_MCP_TOKEN: "vidiq_test_secret_token", VIDIQ_DAILY_GLOBAL_CAP: "20" },
      new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
      "/clips/seo",
      "POST",
      {
        json,
        usuarioClaims: async () => ({ sub: "google-oauth2|pro1", email: "pro@vants.cc" }),
        membresiaFn: async () => ({ plan: "pro", activo: true }),
        quotaStore: proStore,
        now: fixedNow,
        fetchImpl: async (url: string, init: any) => {
          calledUrl = url;
          sentAuth = init?.headers?.Authorization || "";
          return mockVidiqResponse();
        },
      },
    );
    assert.equal(res?.status, 200);
    const body = (await res!.json()) as any;
    if (i <= 3) {
      assert.equal(body.source, "vidiq_mcp");
      assert.equal(body.titleOptions[0].score, 91);
      assert.equal(body.creditsUsed, 5);
      assert.equal(body.quota.vidiq.usados, i);
      assert.equal(body.quota.vidiq.restantes, 3 - i);
    } else {
      assert.equal(body.source, "vants_seo");
      assert.equal(body.vidiqReason, "limite_diario_usuario");
      assert.equal(body.quota.vidiq.restantes, 0);
    }
  }
  assert.equal(calledUrl, "https://mcp.vidiq.com/mcp");
  assert.equal(sentAuth, "Bearer vidiq_test_secret_token");

  // 4) Tope global diario (VIDIQ_DAILY_GLOBAL_CAP = 1) protege créditos entre distintos usuarios
  const capStore = new Map();
  const c1 = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Ace 1", juego: "cs2" }),
    }),
    { VIDIQ_MCP_TOKEN: "vidiq_test_secret_token", VIDIQ_DAILY_GLOBAL_CAP: "1" },
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "google-oauth2|creatorA" }),
      membresiaFn: async () => ({ plan: "creator", activo: true }),
      quotaStore: capStore,
      now: fixedNow,
      fetchImpl: async () => mockVidiqResponse(),
    },
  );
  assert.equal(((await c1!.json()) as any).source, "vidiq_mcp");

  let callsAfterCap = 0;
  const c2 = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Ace 2", juego: "cs2" }),
    }),
    { VIDIQ_MCP_TOKEN: "vidiq_test_secret_token", VIDIQ_DAILY_GLOBAL_CAP: "1" },
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "google-oauth2|creatorB" }),
      membresiaFn: async () => ({ plan: "creator", activo: true }),
      quotaStore: capStore,
      now: fixedNow,
      fetchImpl: async () => {
        callsAfterCap += 1;
        return mockVidiqResponse();
      },
    },
  );
  assert.equal(callsAfterCap, 0);
  const c2Body = (await c2!.json()) as any;
  assert.equal(c2Body.source, "vants_seo");
  assert.equal(c2Body.vidiqReason, "limite_diario_global");
  assert.equal(c2Body.quota.vidiq.globalDisponible, false);
});

test("GET /clips/cuota and POST /clips/cuota/consumir-short enforce daily Shorts limits by plan", async () => {
  const store = new Map();
  const fixedNow = new Date("2026-11-22T18:00:00Z");

  // Gratis -> 403 al intentar consumir Short automático
  const freeShort = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/cuota/consumir-short", { method: "POST" }),
    {},
    new URL("https://vants-integraciones.vants.workers.dev/clips/cuota/consumir-short"),
    "/clips/cuota/consumir-short",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "u|free" }),
      membresiaFn: async () => ({ plan: null, activo: false }),
      quotaStore: store,
      now: fixedNow,
    },
  );
  assert.equal(freeShort?.status, 403);

  // PASE S4 -> 2 Shorts/día, el 3º devuelve 429
  for (let i = 1; i <= 3; i++) {
    const r = await rutasVidiqSeo(
      new Request("https://vants-integraciones.vants.workers.dev/clips/cuota/consumir-short", { method: "POST" }),
      {},
      new URL("https://vants-integraciones.vants.workers.dev/clips/cuota/consumir-short"),
      "/clips/cuota/consumir-short",
      "POST",
      {
        json,
        usuarioClaims: async () => ({ sub: "u|pase" }),
        membresiaFn: async () => ({ plan: "pase", activo: true }),
        quotaStore: store,
        now: fixedNow,
      },
    );
    if (i <= 2) {
      assert.equal(r?.status, 200);
      const b = (await r!.json()) as any;
      assert.equal(b.quota.shorts.usados, i);
      assert.equal(b.quota.shorts.restantes, 2 - i);
    } else {
      assert.equal(r?.status, 429);
    }
  }

  // GET /clips/cuota refleja el uso exacto de hoy
  const qRes = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/cuota", { method: "GET" }),
    { VIDIQ_DAILY_GLOBAL_CAP: "20" },
    new URL("https://vants-integraciones.vants.workers.dev/clips/cuota"),
    "/clips/cuota",
    "GET",
    {
      json,
      usuarioClaims: async () => ({ sub: "u|pase" }),
      membresiaFn: async () => ({ plan: "pase", activo: true }),
      quotaStore: store,
      now: fixedNow,
    },
  );
  assert.equal(qRes?.status, 200);
  const qBody = (await qRes!.json()) as any;
  assert.equal(qBody.plan, "pase");
  assert.equal(qBody.shorts.usados, 2);
  assert.equal(qBody.shorts.restantes, 0);
  assert.equal(qBody.vidiq.limite, 2);
  assert.equal(qBody.fecha, "2026-11-22");
});

test("generarSeoLocal builds game-aware SEO metadata", () => {
  const seo = generarSeoLocal({ titulo: "Clutch 1v3", juego: "VALORANT", notas: "Ranked Ascent", formato: "short" });
  assert.equal(seo.gameSlug, "valorant");
  assert.ok(seo.hashtags.includes("#valorant"));
  assert.ok(seo.description.includes("Ranked Ascent"));
});
