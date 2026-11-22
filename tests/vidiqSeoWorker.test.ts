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

test("POST /clips/seo requires auth and calls vidIQ MCP when VIDIQ_MCP_TOKEN is configured", async () => {
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

  // 2) Con sesión + VIDIQ_MCP_TOKEN -> usa vidIQ MCP y devuelve títulos con score
  let calledUrl = "";
  let sentAuth = "";
  const okRes = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Clutch 1v4 en Ascent", juego: "valorant" }),
    }),
    { VIDIQ_MCP_TOKEN: "vidiq_test_secret_token" },
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "google-oauth2|1039", email: "feiss@vants.cc" }),
      fetchImpl: async (url: string, init: any) => {
        calledUrl = url;
        sentAuth = init?.headers?.Authorization || "";
        return new Response(
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
      },
    },
  );
  assert.equal(okRes?.status, 200);
  assert.equal(calledUrl, "https://mcp.vidiq.com/mcp");
  assert.equal(sentAuth, "Bearer vidiq_test_secret_token");
  const body = (await okRes!.json()) as any;
  assert.equal(body.ok, true);
  assert.equal(body.source, "vidiq_mcp");
  assert.equal(body.titleOptions[0].score, 91);
  assert.equal(body.creditsUsed, 5);
  assert.ok(body.tags.includes("valorant"));
  assert.ok(body.description.includes("https://vants.cc"));

  // 3) Fallback limpio a vants_seo si vidIQ falla o no hay token
  const fallbackRes = await rutasVidiqSeo(
    new Request("https://vants-integraciones.vants.workers.dev/clips/seo", {
      method: "POST",
      body: JSON.stringify({ titulo: "Ace con AWP", juego: "cs2" }),
    }),
    {},
    new URL("https://vants-integraciones.vants.workers.dev/clips/seo"),
    "/clips/seo",
    "POST",
    {
      json,
      usuarioClaims: async () => ({ sub: "google-oauth2|1039" }),
    },
  );
  assert.equal(fallbackRes?.status, 200);
  const fbBody = (await fallbackRes!.json()) as any;
  assert.equal(fbBody.source, "vants_seo");
  assert.equal(fbBody.gameSlug, "cs2");
  assert.equal(fbBody.titleOptions.length, 3);
});

test("generarSeoLocal builds game-aware SEO metadata", () => {
  const seo = generarSeoLocal({ titulo: "Clutch 1v3", juego: "VALORANT", notas: "Ranked Ascent", formato: "short" });
  assert.equal(seo.gameSlug, "valorant");
  assert.ok(seo.hashtags.includes("#valorant"));
  assert.ok(seo.description.includes("Ranked Ascent"));
});
