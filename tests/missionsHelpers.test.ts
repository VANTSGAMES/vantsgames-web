import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEKLY_MISSIONS,
  computeMissionPercent,
  computeSeasonTier,
  filterMissionsByCategory,
  getIsoWeekInfo,
  getMissionByCode,
  validateMissionProgressNote,
} from "../client/src/lib/missionsHelpers";

test("WEEKLY_MISSIONS includes clips, VALORANT/CS2 tournaments, profile/team, and community missions with valid XP", () => {
  assert.equal(WEEKLY_MISSIONS.length, 6);
  assert.ok(getMissionByCode("weekly-clip"));
  assert.ok(getMissionByCode("weekly-tournaments-val-cs2"));
  assert.ok(getMissionByCode("weekly-profile-team"));
  for (const m of WEEKLY_MISSIONS) {
    assert.ok(m.xp >= 50, `Expected positive XP for ${m.code}`);
    assert.ok(m.target >= 1, `Expected target >= 1 for ${m.code}`);
  }
});

test("computeSeasonTier resolves tiers and remaining XP accurately", () => {
  const r0 = computeSeasonTier(0);
  assert.equal(r0.tier.id, "recluta");
  assert.equal(r0.nextTier?.id, "contendiente");
  assert.equal(r0.xpToNextTier, 250);

  const r300 = computeSeasonTier(300);
  assert.equal(r300.tier.id, "contendiente");
  assert.equal(r300.nextTier?.id, "elite");
  assert.equal(r300.xpToNextTier, 200);

  const r900 = computeSeasonTier(900);
  assert.equal(r900.tier.id, "leyenda");
  assert.equal(r900.nextTier, null);
  assert.equal(r900.xpToNextTier, 0);
});

test("computeMissionPercent clamps cleanly to [0, 100]", () => {
  assert.equal(computeMissionPercent(0, 2), 0);
  assert.equal(computeMissionPercent(1, 2), 50);
  assert.equal(computeMissionPercent(2, 2), 100);
  assert.equal(computeMissionPercent(5, 2), 100);
  assert.equal(computeMissionPercent(-1, 3), 0);
});

test("getIsoWeekInfo produces consistent ISO week keys and reset countdown", () => {
  // Wednesday 2026-05-13 12:00 UTC -> Week 2026-W20, resets Monday 2026-05-18 00:00 UTC (4d 12h)
  const info = getIsoWeekInfo(Date.parse("2026-05-13T12:00:00.000Z"));
  assert.equal(info.weekKey, "2026-W20");
  assert.equal(info.resetsInLabel, "Reinicia en 4d 12h");

  // Sunday 2026-05-17 20:00 UTC -> still same ISO week, resets in 4h
  const sun = getIsoWeekInfo(Date.parse("2026-05-17T20:00:00.000Z"));
  assert.equal(sun.weekKey, "2026-W20");
  assert.equal(sun.resetsInLabel, "Reinicia en 4h");
});

test("filterMissionsByCategory and validateMissionProgressNote enforce bounds", () => {
  assert.equal(filterMissionsByCategory(WEEKLY_MISSIONS, "").length, 6);
  assert.equal(filterMissionsByCategory(WEEKLY_MISSIONS, "torneos").length, 1);
  assert.equal(filterMissionsByCategory(WEEKLY_MISSIONS, "comunidad").length, 3);

  assert.deepEqual(validateMissionProgressNote("   "), { ok: true, note: null });
  assert.deepEqual(validateMissionProgressNote("Copa VANTS R1"), {
    ok: true,
    note: "Copa VANTS R1",
  });
  assert.equal(validateMissionProgressNote("a".repeat(201)).ok, false);
});
