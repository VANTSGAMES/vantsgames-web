import test from "node:test";
import assert from "node:assert/strict";
import { JUEGOS } from "../client/src/lib/juegos";
import {
  computeAnnualSavingsPercent,
  countGamesByPlatform,
  countTournamentsByGame,
  filterAndSortTournaments,
  filterGamesByPlatform,
  filterTeams,
  groupTournamentsByGame,
  searchCommandItems,
  type CommandItem,
} from "../client/src/lib/discovery";
import type { Team, Tournament } from "../client/src/lib/api";

test("filterGamesByPlatform splits all 11 VANTS games accurately", () => {
  assert.equal(filterGamesByPlatform(JUEGOS, "Todas").length, 11);
  assert.equal(filterGamesByPlatform(JUEGOS, "PC").length, 5);
  assert.equal(filterGamesByPlatform(JUEGOS, "Consola").length, 2);
  assert.equal(filterGamesByPlatform(JUEGOS, "Móvil").length, 4);

  const counts = countGamesByPlatform(JUEGOS);
  assert.equal(counts.PC + counts.Consola + counts.Móvil, counts.Todas);
});

test("filterAndSortTournaments filters accent-insensitively, strictly isolates by game, and sorts by prize/slots/date", () => {
  const sample: Tournament[] = [
    {
      slug: "copa-a",
      nombre: "Copa Relámpago Caracas",
      descripcion: null,
      estado: "upcoming",
      major: false,
      location_type: "online",
      fee: 0,
      ends_at: null,
      logo_url: null,
      formato: "BO3",
      is_demo: false,
      starts_at: "2026-08-10T18:00:00Z",
      max_teams: 16,
      region: "LATAM",
      prize: { value: 250, currency: "USD" },
      game: { slug: "valorant", nombre: "VALORANT" },
    },
    {
      slug: "major-b",
      nombre: "Major CS2 Sur",
      descripcion: null,
      estado: "upcoming",
      major: false,
      location_type: "online",
      fee: 0,
      ends_at: null,
      logo_url: null,
      formato: "BO3",
      is_demo: false,
      starts_at: "2026-07-05T18:00:00Z",
      max_teams: 32,
      region: "SA",
      prize: { value: 1200, currency: "USD" },
      game: { slug: "cs2", nombre: "Counter-Strike 2" },
    },
    {
      slug: "open-c",
      nombre: "Open Smash Weekend",
      descripcion: null,
      estado: "upcoming",
      major: false,
      location_type: "online",
      fee: 0,
      ends_at: null,
      logo_url: null,
      formato: "BO5",
      is_demo: false,
      starts_at: "2026-09-01T18:00:00Z",
      max_teams: 64,
      region: "VE",
      prize: null,
      game: { slug: "smash", nombre: "Super Smash Bros. Ultimate" },
    },
  ];

  const byText = filterAndSortTournaments(sample, { query: "relampago" });
  assert.deepEqual(byText.map((t) => t.slug), ["copa-a"]);

  const onlyValo = filterAndSortTournaments(sample, { juego: "valorant" });
  assert.deepEqual(onlyValo.map((t) => t.slug), ["copa-a"]);

  const onlyCs2 = filterAndSortTournaments(sample, { juego: "cs2" });
  assert.deepEqual(onlyCs2.map((t) => t.slug), ["major-b"]);

  const onlyFortnite = filterAndSortTournaments(sample, { juego: "fortnite" });
  assert.deepEqual(onlyFortnite, []);

  const byPrize = filterAndSortTournaments(sample, { sort: "premio" });
  assert.deepEqual(byPrize.map((t) => t.slug), ["major-b", "copa-a", "open-c"]);

  const bySlots = filterAndSortTournaments(sample, { sort: "plazas" });
  assert.deepEqual(bySlots.map((t) => t.slug), ["open-c", "major-b", "copa-a"]);

  const byDate = filterAndSortTournaments(sample, { sort: "fecha" });
  assert.deepEqual(byDate.map((t) => t.slug), ["major-b", "copa-a", "open-c"]);

  const counts = countTournamentsByGame(sample);
  assert.equal(counts.valorant, 1);
  assert.equal(counts.cs2, 1);
  assert.equal(counts.smash, 1);
  assert.equal(counts.fortnite, 0);

  const groups = groupTournamentsByGame(sample);
  assert.deepEqual(groups.map((g) => g.slug), ["valorant", "cs2", "smash"]);
  assert.equal(groups[0].tournaments.length, 1);
});

test("filterTeams combines game slug and query across name, tag, and region", () => {
  const teams: Team[] = [
    { slug: "vants-val", nombre: "VANTS Squad", tag: "VNTS", game: "valorant", region: "LATAM" },
    { slug: "orion-cs", nombre: "Orión Gaming", tag: "ORN", game: "cs2", region: "Venezuela" },
    { slug: "kobra-val", nombre: "Kobra Five", tag: "KBR", game: "valorant", region: "Andes" },
  ];

  assert.equal(filterTeams(teams, { juego: "valorant" }).length, 2);
  assert.deepEqual(
    filterTeams(teams, { query: "orion" }).map((t) => t.slug),
    ["orion-cs"],
  );
  assert.deepEqual(
    filterTeams(teams, { juego: "valorant", query: "kbr" }).map((t) => t.slug),
    ["kobra-val"],
  );
});

test("searchCommandItems ranks direct label matches first and supports accents", () => {
  const items: CommandItem[] = [
    { id: "1", label: "Membresías y planes", group: "Plataforma", to: "/membresias", hint: "VANTS PRO" },
    { id: "2", label: "Torneos de VALORANT", group: "Juegos", to: "/torneos?juego=valorant", keywords: ["pc", "riot"] },
    { id: "3", label: "Centro Workspace", group: "Operaciones", to: "/workspace", hint: "Google Drive y Calendar" },
  ];

  assert.deepEqual(searchCommandItems(items, "membresias").map((i) => i.id), ["1"]);
  assert.deepEqual(searchCommandItems(items, "riot val").map((i) => i.id), ["2"]);
  assert.deepEqual(searchCommandItems(items, "calendar").map((i) => i.id), ["3"]);
  assert.equal(searchCommandItems(items, "").length, 3);
});

test("computeAnnualSavingsPercent computes accurate annual discount", () => {
  assert.equal(computeAnnualSavingsPercent(4.99, 39.99), 33);
  assert.equal(computeAnnualSavingsPercent(9.99, 79.99), 33);
  assert.equal(computeAnnualSavingsPercent(0, 10), 0);
});
