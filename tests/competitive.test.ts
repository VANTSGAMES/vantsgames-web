import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBreadcrumbJsonLd,
  classifyBracketStatus,
  computeAchievementPercent,
  filterAndSortRankingFaceit,
  filterBracketMatches,
  filterRankingXp,
  type BracketMatch,
} from "../client/src/lib/competitive";
import type { FilaFaceit, FilaXp } from "../client/src/pages/Vants";

const FACEIT_SAMPLE: FilaFaceit[] = [
  {
    pos: 1,
    pid: "p1",
    vants: "Feis",
    fundador: true,
    nick: "feis_cs",
    avatar: null,
    pais: "VE",
    nivel: 10,
    elo: 2350,
    partidas: 420,
    winrate: 58,
    kd: 1.32,
    url: "https://faceit.com/feis",
    equipo: { slug: "vants", nombre: "Equipo VANTS", tag: "VTS", juego: "cs2" },
    actualizado: "2026-11-20T00:00:00Z",
  },
  {
    pos: 2,
    pid: "p2",
    vants: "Águila",
    fundador: false,
    nick: "aguila99",
    avatar: null,
    pais: "CO",
    nivel: 9,
    elo: 1980,
    partidas: 610,
    winrate: 62,
    kd: 1.48,
    url: "https://faceit.com/aguila",
    equipo: null,
    actualizado: "2026-11-20T00:00:00Z",
  },
  {
    pos: 3,
    pid: "p3",
    vants: "Kobra",
    fundador: false,
    nick: "kobra_ve",
    avatar: null,
    pais: "VE",
    nivel: 8,
    elo: 1810,
    partidas: 250,
    winrate: 54,
    kd: 1.15,
    url: "https://faceit.com/kobra",
    equipo: { slug: "kobra-squad", nombre: "Kobra Squad", tag: "KBR", juego: "cs2" },
    actualizado: "2026-11-20T00:00:00Z",
  },
];

test("filterAndSortRankingFaceit handles accent-insensitive query, team filter, and metric sorting", () => {
  assert.deepEqual(
    filterAndSortRankingFaceit(FACEIT_SAMPLE, { query: "aguila" }).map((r) => r.pid),
    ["p2"],
  );
  assert.deepEqual(
    filterAndSortRankingFaceit(FACEIT_SAMPLE, { teamFilter: "con_equipo" }).map((r) => r.pid),
    ["p1", "p3"],
  );
  assert.deepEqual(
    filterAndSortRankingFaceit(FACEIT_SAMPLE, { teamFilter: "agentes_libres" }).map((r) => r.pid),
    ["p2"],
  );
  assert.deepEqual(
    filterAndSortRankingFaceit(FACEIT_SAMPLE, { sort: "kd" }).map((r) => r.pid),
    ["p2", "p1", "p3"],
  );
  assert.deepEqual(
    filterAndSortRankingFaceit(FACEIT_SAMPLE, { sort: "partidas" }).map((r) => r.pid),
    ["p2", "p1", "p3"],
  );
});

test("filterRankingXp filters by nick and team presence", () => {
  const xpRows: FilaXp[] = [
    { pos: 1, pid: "p1", avatar: null, nick: "Feis", xp: 900, fundador: true, equipo: { slug: "vants", nombre: "VANTS", tag: "VTS", juego: "cs2" } },
    { pos: 2, pid: "p2", avatar: null, nick: "Nova", xp: 500, fundador: false, equipo: null },
  ];
  assert.deepEqual(filterRankingXp(xpRows, { teamFilter: "agentes_libres" }).map((r) => r.nick), ["Nova"]);
  assert.deepEqual(filterRankingXp(xpRows, { query: "vts" }).map((r) => r.nick), ["Feis"]);
});

test("filterBracketMatches classifies status and filters by round, status, and team query", () => {
  const matches: BracketMatch[] = [
    { ronda: "Cuartos", slot: 1, team_a: "VANTS", team_b: "Orión", score_a: 2, score_b: 0, estado: "finished", ganador: "VANTS" },
    { ronda: "Cuartos", slot: 2, team_a: "Kobra", team_b: "Apex", score_a: 1, score_b: 1, estado: "live", ganador: null },
    { ronda: "Final", slot: 1, team_a: "VANTS", team_b: null, score_a: null, score_b: null, estado: "upcoming", ganador: null },
  ];

  assert.equal(classifyBracketStatus(matches[0]), "finished");
  assert.equal(classifyBracketStatus(matches[1]), "live");
  assert.equal(classifyBracketStatus(matches[2]), "pending");

  assert.equal(filterBracketMatches(matches, { round: "Cuartos" }).length, 2);
  assert.equal(filterBracketMatches(matches, { status: "live" }).length, 1);
  assert.equal(filterBracketMatches(matches, { teamQuery: "orion" }).length, 1);
  assert.equal(filterBracketMatches(matches, { teamQuery: "vants" }).length, 2);
});

test("computeAchievementPercent clamps to [0, 100] with one decimal precision", () => {
  assert.equal(computeAchievementPercent(125, 1000), 12.5);
  assert.equal(computeAchievementPercent(1500, 1000), 100);
  assert.equal(computeAchievementPercent(-5, 1000), 0);
  assert.equal(computeAchievementPercent(50, 0), 0);
});

test("buildBreadcrumbJsonLd generates valid Schema.org BreadcrumbList", () => {
  const home = buildBreadcrumbJsonLd("/", "VANTS GAMES — Inicio", "https://vants.cc/");
  assert.equal(home.itemListElement.length, 1);
  const ranking = buildBreadcrumbJsonLd("/ranking", "Ranking global — VANTS GAMES", "https://vants.cc");
  assert.equal(ranking.itemListElement.length, 2);
  assert.equal(ranking.itemListElement[1].name, "Ranking global");
  assert.equal(ranking.itemListElement[1].item, "https://vants.cc/ranking");
});
