import test from "node:test";
import assert from "node:assert/strict";
import {
  detectKickClipGame,
  filterClipsByGame,
  normalizeClipGameSlug,
} from "../client/src/lib/clipFiltering.ts";

test("normalizeClipGameSlug recognizes all 11 VANTS games accurately", () => {
  assert.equal(normalizeClipGameSlug("valorant"), "valorant");
  assert.equal(normalizeClipGameSlug("CS2"), "cs2");
  assert.equal(normalizeClipGameSlug("fortnite"), "fortnite");
  assert.equal(normalizeClipGameSlug("fc27"), "fc27");
  assert.equal(normalizeClipGameSlug("EA Sports FC 27"), "fc27");
  assert.equal(normalizeClipGameSlug("smash"), "smash");
  assert.equal(normalizeClipGameSlug("Super Smash Bros. Ultimate"), "smash");
  assert.equal(normalizeClipGameSlug("warzone"), "warzone");
  assert.equal(normalizeClipGameSlug("freefire"), "freefire");
  assert.equal(normalizeClipGameSlug("lol"), "lol");
  assert.equal(normalizeClipGameSlug("League of Legends: Wild Rift"), "wildrift");
  assert.equal(normalizeClipGameSlug("Mobile Legends: Bang Bang"), "mlbb");
  assert.equal(normalizeClipGameSlug("Clash Royale"), "clashroyale");
  assert.equal(normalizeClipGameSlug("unknown-game"), "otro");
});

test("filterClipsByGame never leaks clips from one game into another game tab", () => {
  const clips = [
    { id: "1", juego: "valorant", titulo: "Ace Jett" },
    { id: "2", juego: "fortnite", titulo: "Victory Royale" },
    { id: "3", juego: "cs2", titulo: "Clutch Mirage" },
    { id: "4", juego: "freefire", titulo: "Booyah Squad" },
    { id: "5", juego: null, titulo: "Sin juego" },
  ];

  const fortniteOnly = filterClipsByGame(clips, "fortnite");
  assert.deepEqual(
    fortniteOnly.map((c) => c.id),
    ["2"],
  );

  const valorantOnly = filterClipsByGame(clips, "valorant");
  assert.deepEqual(
    valorantOnly.map((c) => c.id),
    ["1"],
  );

  const fc27Only = filterClipsByGame(clips, "fc27");
  assert.equal(fc27Only.length, 0);

  const all = filterClipsByGame(clips, "todos");
  assert.equal(all.length, 5);
});

test("detectKickClipGame maps Kick categories for all 11 games", () => {
  assert.equal(detectKickClipGame({ slug: "fortnite", name: "Fortnite" }), "fortnite");
  assert.equal(detectKickClipGame({ slug: "call-of-duty-warzone" }), "warzone");
  assert.equal(detectKickClipGame({ name: "League of Legends" }), "lol");
  assert.equal(detectKickClipGame({ name: "Wild Rift" }), "wildrift");
  assert.equal(detectKickClipGame({ name: "Just Chatting" }), "otro");
});
