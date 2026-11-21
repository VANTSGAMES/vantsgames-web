import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultPickemMatches,
  buildDefaultPolls,
  computeOptionPercentages,
  computePickemScore,
  filterPollsByKind,
  formatPollCountdown,
  rankPickemLeaderboard,
  validateCustomPollDraft,
} from "../client/src/lib/votingHelpers";

test("buildDefaultPolls covers tournament, format, clip and MVP categories", () => {
  const polls = buildDefaultPolls(Date.UTC(2026, 10, 20, 12, 0, 0));
  assert.equal(polls.length, 4);
  assert.ok(polls.some((p) => p.kind === "torneo" && p.id === "next-community-tournament-game"));
  assert.ok(polls.some((p) => p.kind === "torneo" && p.id === "next-community-tournament-format"));
  assert.ok(polls.some((p) => p.kind === "mvp_clip" && p.id === "clip-of-the-week-s4"));
  assert.ok(polls.some((p) => p.kind === "mvp_clip" && p.id === "mvp-circuit-s4"));
});

test("computeOptionPercentages handles zero votes, valid tallies and ignores unknown ids", () => {
  const opts = [
    { id: "a", label: "VALORANT" },
    { id: "b", label: "CS2" },
    { id: "c", label: "Fortnite" },
  ];
  const empty = computeOptionPercentages(opts, {});
  assert.equal(empty.totalVotes, 0);
  assert.deepEqual(
    empty.results.map((r) => r.percent),
    [0, 0, 0],
  );

  const tallied = computeOptionPercentages(opts, { a: 3, b: 1, ghost: 99 });
  assert.equal(tallied.totalVotes, 4);
  assert.deepEqual(
    tallied.results.map((r) => ({ id: r.id, votes: r.votes, percent: r.percent })),
    [
      { id: "a", votes: 3, percent: 75 },
      { id: "b", votes: 1, percent: 25 },
      { id: "c", votes: 0, percent: 0 },
    ],
  );
});

test("computePickemScore calculates points, hits, misses, pending and accuracy accurately", () => {
  const matches = buildDefaultPickemMatches(Date.UTC(2026, 10, 20, 12, 0, 0));
  // Resolve two matches: semi 1 (10 pts) -> caracas-five, final CS2 (20 pts) -> vants-crimson
  matches[0].winnerId = "caracas-five";
  matches[2].winnerId = "vants-crimson";

  const score = computePickemScore(matches, {
    "val-s4-semi-1": "caracas-five", // hit (+10)
    "val-s4-semi-2": "zulia-apex", // pending
    "cs2-s4-final": "orinoco-wolves", // miss (0)
  });

  assert.equal(score.points, 10);
  assert.equal(score.maxPoints, 60);
  assert.equal(score.hits, 1);
  assert.equal(score.misses, 1);
  assert.equal(score.pending, 1);
  assert.equal(score.picksSubmitted, 3);
  assert.equal(score.resolvedCount, 2);
  assert.equal(score.accuracyPercent, 50);
});

test("rankPickemLeaderboard sorts by points, hits, accuracy and earliest timestamp", () => {
  const board = rankPickemLeaderboard(
    [
      {
        userId: 1,
        nick: "PlayerA",
        points: 20,
        hits: 1,
        resolvedCount: 2,
        picksSubmitted: 4,
        accuracyPercent: 50,
        firstUpdatedMs: 2000,
      },
      {
        userId: 2,
        nick: "PlayerB",
        points: 30,
        hits: 2,
        resolvedCount: 2,
        picksSubmitted: 4,
        accuracyPercent: 100,
        firstUpdatedMs: 3000,
      },
      {
        userId: 3,
        nick: "PlayerC",
        points: 20,
        hits: 2,
        resolvedCount: 2,
        picksSubmitted: 4,
        accuracyPercent: 100,
        firstUpdatedMs: 4000,
      },
      {
        userId: 4,
        nick: "EmptyUser",
        points: 0,
        hits: 0,
        resolvedCount: 0,
        picksSubmitted: 0,
        accuracyPercent: 0,
        firstUpdatedMs: 500,
      },
    ],
    3,
  );

  assert.equal(board.length, 3);
  assert.deepEqual(
    board.map((b) => ({ rank: b.rank, nick: b.nick, isViewer: b.isViewer })),
    [
      { rank: 1, nick: "PlayerB", isViewer: false },
      { rank: 2, nick: "PlayerC", isViewer: true },
      { rank: 3, nick: "PlayerA", isViewer: false },
    ],
  );
});

test("validateCustomPollDraft rejects invalid drafts and normalizes valid polls", () => {
  const shortTitle = validateCustomPollDraft({
    title: "Hola",
    description: "Descripción válida",
    kind: "torneo",
    options: ["Opción 1", "Opción 2"],
  });
  assert.equal(shortTitle.ok, false);

  const dupOpts = validateCustomPollDraft({
    title: "¿Cuál mapa abrimos en la final?",
    description: "Elige el mapa inaugural del showmatch.",
    kind: "comunidad",
    options: ["Ascent", "ascent"],
  });
  assert.equal(dupOpts.ok, false);

  const valid = validateCustomPollDraft({
    title: "¿Qué mapa prefieres para la final de VALORANT?",
    description: "Mapa inaugural para el showmatch comunitario del domingo.",
    kind: "torneo",
    gameSlug: "valorant",
    closesInDays: 7,
    options: ["Ascent", "Haven", "Bind"],
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.options.length, 3);
    assert.equal(valid.data.gameSlug, "valorant");
    assert.equal(valid.data.closesInDays, 7);
  }
});

test("filterPollsByKind and formatPollCountdown behave consistently", () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  assert.equal(formatPollCountdown(new Date(now - 1000).toISOString(), now), "Cerrada");
  assert.equal(formatPollCountdown(new Date(now + 5 * 3600 * 1000).toISOString(), now), "Cierra en 5h");
  assert.equal(formatPollCountdown(new Date(now + 50 * 3600 * 1000).toISOString(), now), "Cierra en 2d 2h");

  const polls = buildDefaultPolls(now).map((p) => ({
    ...p,
    options: p.options.map((o) => ({ ...o, votes: 0, percent: 0 })),
    totalVotes: 0,
    viewerOptionId: null,
    isExpired: false,
    isOpenForVoting: true,
  }));
  assert.equal(filterPollsByKind(polls, "all").length, 4);
  assert.equal(filterPollsByKind(polls, "torneo").length, 2);
  assert.equal(filterPollsByKind(polls, "mvp_clip").length, 2);
});
