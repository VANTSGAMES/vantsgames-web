import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_CAMERA_PRESETS,
  ARENA_FINISH_SWATCHES,
  clampExplode,
  dedupeGroundingSources,
  formatRouteSummary,
  isQuotaErrorPayload,
  resolveEffectiveModel,
  sanitizeChatHistory,
} from "../client/src/lib/studioHelpers.ts";

test("resolveEffectiveModel upgrades flash-lite to gemini-4-hydrogen for grounding modes", () => {
  assert.equal(resolveEffectiveModel("gemini-3.1-flash-lite", "coach"), "gemini-3.1-flash-lite");
  assert.equal(resolveEffectiveModel("gemini-3.1-flash-lite", "search"), "gemini-4-hydrogen");
  assert.equal(resolveEffectiveModel("gemini-3.1-flash-lite", "maps"), "gemini-4-hydrogen");
  assert.equal(resolveEffectiveModel("gemini-4-neon", "search"), "gemini-4-neon");
});

test("sanitizeChatHistory strips empty turns and caps length", () => {
  const turns = [
    { role: "user" as const, text: "   " },
    { role: "user" as const, text: "Hola coach" },
    { role: "model" as const, text: "Hola, ¿qué juego analizamos?" },
    { role: "user" as const, text: "VALORANT en Ascent" },
  ];
  const out = sanitizeChatHistory(turns, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].role, "model");
  assert.equal(out[1].text, "VALORANT en Ascent");
});

test("dedupeGroundingSources deduplicates by URI and preserves maps review snippets", () => {
  const sources = dedupeGroundingSources([
    { type: "web", title: "VLR", uri: "https://vlr.gg/a" },
    { type: "web", title: "Duplicate", uri: "https://vlr.gg/a" },
    {
      type: "maps",
      title: "Cyber Arena CCS",
      uri: "https://maps.google.com/?cid=1",
      snippets: ["Excelentes PCs 240Hz", ""],
    },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[1].type, "maps");
  assert.deepEqual(sources[1].snippets, ["Excelentes PCs 240Hz"]);
});

test("clampExplode bounds exploded-view factor to [0, 1]", () => {
  assert.equal(clampExplode(-0.4), 0);
  assert.equal(clampExplode(0.55), 0.55);
  assert.equal(clampExplode(3.2), 1);
  assert.equal(clampExplode(Number.NaN), 0);
});

test("ARENA_CAMERA_PRESETS and ARENA_FINISH_SWATCHES expose valid non-empty presets", () => {
  assert.equal(ARENA_CAMERA_PRESETS.length, 4);
  assert.equal(ARENA_FINISH_SWATCHES.length, 3);
  for (const preset of ARENA_CAMERA_PRESETS) {
    assert.equal(preset.position.length, 3);
    assert.equal(preset.target.length, 3);
  }
});

test("isQuotaErrorPayload catches 429 and GMP quota signatures", () => {
  assert.equal(isQuotaErrorPayload(429, ""), true);
  assert.equal(isQuotaErrorPayload(200, "RESOURCE_EXHAUSTED: daily quota"), true);
  assert.equal(isQuotaErrorPayload(200, "OverQuotaMapError"), true);
  assert.equal(isQuotaErrorPayload(200, "OK"), false);
});

test("formatRouteSummary formats meters and seconds into readable Spanish strings", () => {
  assert.deepEqual(formatRouteSummary(850, 180), { distanceText: "850 m", durationText: "3 min" });
  assert.deepEqual(formatRouteSummary(4260, 840), { distanceText: "4.3 km", durationText: "14 min" });
  assert.deepEqual(formatRouteSummary(25400, 4500), { distanceText: "25 km", durationText: "1 h 15 min" });
  assert.deepEqual(formatRouteSummary(null, undefined), { distanceText: "—", durationText: "—" });
});
