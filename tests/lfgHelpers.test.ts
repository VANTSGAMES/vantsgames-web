import test from "node:test";
import assert from "node:assert/strict";
import { JUEGOS } from "../client/src/lib/juegos";
import {
  filterLfgListings,
  formatExpiryCountdown,
  validateLfgApplication,
  validateLfgDraft,
} from "../client/src/lib/lfgHelpers";

test("validateLfgDraft accepts all 11 VANTS games and normalizes fields", () => {
  assert.equal(JUEGOS.length, 11);
  for (const juego of JUEGOS) {
    const res = validateLfgDraft({
      type: "lfg",
      gameSlug: juego.slug,
      title: `Buscamos jugador para ${juego.label}`,
      teamName: "Caracas Five",
      roleNeeded: "Flex / IGL",
      rankLevel: "Inmortal+",
      schedule: "Lun-Vie 20:00 VET",
      region: "ve",
      slotsOpen: 2,
      contact: "discord: @capitan",
      notes: "Micrófono obligatorio.",
    });
    assert.equal(res.ok, true, `Expected valid draft for ${juego.slug}`);
    if (res.ok) {
      assert.equal(res.data.gameSlug, juego.slug);
      assert.equal(res.data.region, "VE");
      assert.equal(res.data.slotsOpen, 2);
      assert.equal(res.data.teamName, "Caracas Five");
    }
  }
});

test("validateLfgDraft forces slotsOpen=1 for LFT and clamps LFG/Scrim slots to 1..10", () => {
  const lft = validateLfgDraft({
    type: "lft",
    gameSlug: "valorant",
    title: "Duelist disponible para torneo",
    roleNeeded: "Duelist",
    rankLevel: "Ascendente 3",
    schedule: "Noches 21:00 VET",
    region: "LATAM-N",
    slotsOpen: 5,
    contact: "@player",
  });
  assert.equal(lft.ok, true);
  if (lft.ok) assert.equal(lft.data.slotsOpen, 1);

  const lfg = validateLfgDraft({
    type: "lfg",
    gameSlug: "cs2",
    title: "Roster CS2 buscando 2 riflers",
    roleNeeded: "Rifler",
    rankLevel: "FACEIT Nvl 8",
    schedule: "20:00-23:00 VET",
    region: "VE",
    slotsOpen: 99,
    contact: "discord: @igl",
  });
  assert.equal(lfg.ok, true);
  if (lfg.ok) assert.equal(lfg.data.slotsOpen, 10);
});

test("validateLfgDraft rejects invalid games, types, regions, or short fields", () => {
  const badGame = validateLfgDraft({
    type: "lft",
    gameSlug: "dota2",
    title: "Busco equipo",
    roleNeeded: "Carry",
    rankLevel: "Divine",
    schedule: "Noches",
    region: "VE",
    contact: "@dota",
  });
  assert.equal(badGame.ok, false);

  const badType = validateLfgDraft({
    type: "trade",
    gameSlug: "valorant",
    title: "Busco equipo",
    roleNeeded: "Duelist",
    rankLevel: "Oro",
    schedule: "Noches",
    region: "VE",
    contact: "@val",
  });
  assert.equal(badType.ok, false);

  const shortTitle = validateLfgDraft({
    type: "scrim",
    gameSlug: "valorant",
    title: "Bo3",
    roleNeeded: "5v5",
    rankLevel: "Platino",
    schedule: "Hoy 20:00",
    region: "VE",
    contact: "@team",
  });
  assert.equal(shortTitle.ok, false);
});

test("validateLfgApplication validates role, contact, and message", () => {
  const ok = validateLfgApplication({
    role: "Controlador",
    contact: "discord: @smoker",
    message: "Juego Omen y Viper, disponible todos los días.",
  });
  assert.equal(ok.ok, true);

  const bad = validateLfgApplication({
    role: "A",
    contact: "@a",
    message: "hola",
  });
  assert.equal(bad.ok, false);
});

test("filterLfgListings removes expired listings and filters strictly by game, type, region, and accent-insensitive search", () => {
  const nowMs = Date.parse("2026-05-10T12:00:00.000Z");
  const sample = [
    {
      gameSlug: "valorant",
      type: "lft" as const,
      region: "VE",
      title: "Duelist Inmortal buscando escuadra",
      roleNeeded: "Duelist",
      rankLevel: "Inmortal 2",
      schedule: "20:00 VET",
      teamName: null,
      authorNick: "Kael",
      notes: "Ping bajo en Bogotá",
      expiresAt: "2026-05-15T12:00:00.000Z",
    },
    {
      gameSlug: "cs2",
      type: "scrim" as const,
      region: "LATAM-N",
      title: "Scrim Bo3 nivel FACEIT 9",
      roleNeeded: "5v5 Bo3",
      rankLevel: "FACEIT 9",
      schedule: "21:00 VET",
      teamName: "Caracas Five",
      authorNick: "Miro",
      notes: null,
      expiresAt: "2026-05-14T12:00:00.000Z",
    },
    {
      gameSlug: "valorant",
      type: "lfg" as const,
      region: "VE",
      title: "Anuncio vencido hace dos días",
      roleNeeded: "IGL",
      rankLevel: "Diamante",
      schedule: "Noches",
      teamName: "Old Team",
      authorNick: "Zero",
      notes: null,
      expiresAt: "2026-05-08T12:00:00.000Z",
    },
  ];

  const active = filterLfgListings(sample, { nowMs });
  assert.equal(active.length, 2);

  const valOnly = filterLfgListings(sample, { game: "valorant", nowMs });
  assert.equal(valOnly.length, 1);
  assert.equal(valOnly[0].authorNick, "Kael");

  const accentSearch = filterLfgListings(sample, { query: "bogota", nowMs });
  assert.equal(accentSearch.length, 1);
  assert.equal(accentSearch[0].gameSlug, "valorant");

  const scrimOnly = filterLfgListings(sample, { type: "scrim", region: "LATAM-N", nowMs });
  assert.equal(scrimOnly.length, 1);
  assert.equal(scrimOnly[0].teamName, "Caracas Five");
});

test("formatExpiryCountdown formats days, hours, minutes, and expired state", () => {
  const base = Date.parse("2026-05-10T12:00:00.000Z");
  assert.equal(formatExpiryCountdown("2026-05-13T18:00:00.000Z", base), "Expira en 3d 6h");
  assert.equal(formatExpiryCountdown("2026-05-10T17:00:00.000Z", base), "Expira en 5h");
  assert.equal(formatExpiryCountdown("2026-05-10T12:25:00.000Z", base), "Expira en 25m");
  assert.equal(formatExpiryCountdown("2026-05-10T11:59:00.000Z", base), "Expirado");
});
