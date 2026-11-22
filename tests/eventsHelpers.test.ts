import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultEvents,
  computeEventCapacityState,
  filterCommunityEvents,
  formatEventCountdown,
  isSafeHttpUrl,
  sortCommunityEvents,
  validateEventDraft,
  validateRsvpRoleNote,
  type CommunityEventItem,
} from "../client/src/lib/eventsHelpers";

test("buildDefaultEvents returns official showmatches, scrims, watch parties and flash cups", () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const evs = buildDefaultEvents(now);
  assert.equal(evs.length, 5);
  assert.ok(evs.some((e) => e.type === "showmatch" && e.gameSlug === "valorant"));
  assert.ok(evs.some((e) => e.type === "scrim_abierta" && e.gameSlug === "cs2"));
  assert.ok(evs.some((e) => e.type === "watchparty"));
});

test("computeEventCapacityState switches cleanly between confirmed and waitlist", () => {
  const open = computeEventCapacityState(20, 5);
  assert.equal(open.spotsLeft, 15);
  assert.equal(open.fillPercent, 25);
  assert.equal(open.isFull, false);
  assert.equal(open.nextRsvpStatus, "confirmed");

  const full = computeEventCapacityState(16, 16);
  assert.equal(full.spotsLeft, 0);
  assert.equal(full.fillPercent, 100);
  assert.equal(full.isFull, true);
  assert.equal(full.nextRsvpStatus, "waitlist");
});

test("filterCommunityEvents and sortCommunityEvents handle type, game, onlyMine and ordering", () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const items: CommunityEventItem[] = buildDefaultEvents(now).map((e, idx) => ({
    ...e,
    confirmedCount: idx,
    waitlistCount: 0,
    spotsLeft: e.capacity - idx,
    fillPercent: Math.round((idx / e.capacity) * 100),
    isFull: false,
    isPast: idx === 4,
    isOpenForRsvp: idx !== 4,
    viewerRsvp: idx === 1 ? { status: "confirmed", roleNote: "Rifler", checkedIn: false, updatedAt: e.createdAt } : null,
    attendeesPreview: [],
  }));

  assert.equal(filterCommunityEvents(items, { type: "showmatch" }).length, 1);
  assert.equal(filterCommunityEvents(items, { gameSlug: "cs2" }).length, 1);
  assert.equal(filterCommunityEvents(items, { onlyMine: true }).length, 1);

  const sorted = sortCommunityEvents(items);
  assert.equal(sorted[0].featured, true);
  assert.equal(sorted[sorted.length - 1].isPast, true);
});

test("validateEventDraft enforces safe URLs, valid dates and capacity bounds", () => {
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,hi"), false);
  assert.equal(isSafeHttpUrl("https://www.twitch.tv/feisreal"), true);

  const badUrl = validateEventDraft({
    title: "Showmatch CS2 Nocturno",
    type: "showmatch",
    gameSlug: "cs2",
    modality: "online",
    location: "Discord VANTS",
    streamUrl: "javascript:alert(1)",
    description: "Partida abierta con premios para la comunidad.",
    startsAt: "2026-12-01T20:00:00.000Z",
    capacity: 20,
  });
  assert.equal(badUrl.ok, false);

  const badEnd = validateEventDraft({
    title: "Showmatch CS2 Nocturno",
    type: "showmatch",
    gameSlug: "cs2",
    modality: "online",
    location: "Discord VANTS",
    description: "Partida abierta con premios para la comunidad.",
    startsAt: "2026-12-01T20:00:00.000Z",
    endsAt: "2026-12-01T19:00:00.000Z",
    capacity: 20,
  });
  assert.equal(badEnd.ok, false);

  const valid = validateEventDraft({
    title: "Showmatch CS2 Nocturno",
    type: "showmatch",
    gameSlug: "cs2",
    modality: "online",
    location: "Discord VANTS",
    streamUrl: "https://www.twitch.tv/feisreal",
    description: "Partida abierta con premios para la comunidad.",
    startsAt: "2026-12-01T20:00:00.000Z",
    endsAt: "2026-12-01T22:00:00.000Z",
    capacity: 24,
    featured: true,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.capacity, 24);
    assert.equal(valid.data.featured, true);
  }
});

test("validateRsvpRoleNote and formatEventCountdown work accurately", () => {
  assert.deepEqual(validateRsvpRoleNote(""), { ok: true, roleNote: null });
  assert.deepEqual(validateRsvpRoleNote("  Duelista / Riot#VEN  "), {
    ok: true,
    roleNote: "Duelista / Riot#VEN",
  });
  assert.equal(validateRsvpRoleNote("x".repeat(121)).ok, false);

  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  assert.equal(formatEventCountdown(new Date(now - 5000).toISOString(), now), "En curso / Iniciado");
  assert.equal(formatEventCountdown(new Date(now + 45 * 60 * 1000).toISOString(), now), "Empieza en 45m");
  assert.equal(formatEventCountdown(new Date(now + 50 * 3600 * 1000).toISOString(), now), "En 2d 2h");
});
