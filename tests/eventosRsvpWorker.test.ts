import test from "node:test";
import assert from "node:assert/strict";
import { rutasEventosRsvp, resetEventosCacheForTests } from "../integraciones/src/eventosRsvp.js";

function createFakeEventosDb() {
  const events = new Map<string, any>();
  const rsvps = new Map<string, any>(); // key = `${event_id}::${user_sub}`
  const owners = new Set<string>(["google-oauth2|owner-1"]);
  const nicks = new Map<string, string>([
    ["google-oauth2|owner-1", "Feispla"],
    ["google-oauth2|p1", "PlayerOne"],
    ["google-oauth2|p2", "PlayerTwo"],
    ["google-oauth2|p3", "PlayerThree"],
  ]);

  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim();
      let args: any[] = [];
      const stmt = {
        bind(...a: any[]) {
          args = a;
          return stmt;
        },
        async run() {
          if (q.startsWith("CREATE TABLE IF NOT EXISTS")) return { success: true };
          if (q.startsWith("INSERT OR IGNORE INTO integ_community_events")) {
            const [id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, status, host_nick, created_at] = args;
            if (!events.has(id)) {
              events.set(id, { id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, status, host_nick, created_by_sub: null, created_at });
            }
            return { success: true };
          }
          if (q.startsWith("INSERT INTO integ_community_events")) {
            const [id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, host_nick, created_by_sub, created_at] = args;
            events.set(id, { id, title, type, game_slug, modality, location, stream_url, description, starts_at, ends_at, capacity, featured, status: "open", host_nick, created_by_sub, created_at });
            return { success: true };
          }
          if (q.startsWith("UPDATE integ_community_events SET status = ? WHERE id = ?")) {
            const [status, id] = args;
            const row = events.get(id);
            if (row) row.status = status;
            return { success: true };
          }
          if (q.startsWith("INSERT INTO integ_community_event_rsvps")) {
            const [event_id, user_sub, user_nick, status, role_note, checked_in, updated_at] = args;
            const k = `${event_id}::${user_sub}`;
            const cur = rsvps.get(k);
            if (cur) {
              cur.user_nick = user_nick;
              cur.role_note = role_note;
              cur.updated_at = updated_at;
            } else {
              rsvps.set(k, { event_id, user_sub, user_nick, status, role_note, checked_in, updated_at });
            }
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?")) {
            rsvps.delete(`${args[0]}::${args[1]}`);
            return { success: true };
          }
          if (q.startsWith("UPDATE integ_community_event_rsvps SET status = 'confirmed'")) {
            const [updated_at, event_id, user_sub] = args;
            const cur = rsvps.get(`${event_id}::${user_sub}`);
            if (cur) {
              cur.status = "confirmed";
              cur.updated_at = updated_at;
            }
            return { success: true };
          }
          if (q.startsWith("UPDATE integ_community_event_rsvps SET checked_in = ?")) {
            const [checked_in, updated_at, event_id, user_sub] = args;
            const cur = rsvps.get(`${event_id}::${user_sub}`);
            if (cur) {
              cur.checked_in = checked_in;
              cur.updated_at = updated_at;
            }
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith("SELECT id FROM integ_community_events LIMIT 1")) {
            const first = [...events.values()][0];
            return first ? { id: first.id } : null;
          }
          if (q.startsWith("SELECT id FROM integ_community_events WHERE id = ?")) {
            const row = events.get(args[0]);
            return row ? { id: row.id } : null;
          }
          if (q.startsWith("SELECT id, status FROM integ_community_events WHERE id = ?")) {
            const row = events.get(args[0]);
            return row ? { id: row.id, status: row.status } : null;
          }
          if (q.startsWith("SELECT * FROM integ_community_events WHERE id = ?")) {
            return events.get(args[0]) || null;
          }
          if (q.startsWith("SELECT status FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?")) {
            const cur = rsvps.get(`${args[0]}::${args[1]}`);
            return cur ? { status: cur.status } : null;
          }
          if (q.startsWith("SELECT status, checked_in FROM integ_community_event_rsvps WHERE event_id = ? AND user_sub = ?")) {
            const cur = rsvps.get(`${args[0]}::${args[1]}`);
            return cur ? { status: cur.status, checked_in: cur.checked_in } : null;
          }
          if (q.startsWith("SELECT user_sub FROM integ_community_event_rsvps WHERE event_id = ? AND status = 'waitlist'")) {
            const wait = [...rsvps.values()]
              .filter((r) => r.event_id === args[0] && r.status === "waitlist")
              .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
            return wait[0] ? { user_sub: wait[0].user_sub } : null;
          }
          if (q.includes("FROM players WHERE auth0_sub = ? AND role = 'owner'")) {
            return owners.has(args[0]) ? { 1: 1 } : null;
          }
          if (q.startsWith("SELECT display_name, username FROM players WHERE auth0_sub = ?")) {
            const nick = nicks.get(args[0]);
            return nick ? { display_name: nick, username: nick } : null;
          }
          return null;
        },
        async all() {
          if (q === "SELECT * FROM integ_community_events") {
            return { results: [...events.values()] };
          }
          if (q.startsWith("SELECT * FROM integ_community_event_rsvps ORDER BY updated_at ASC")) {
            const rows = [...rsvps.values()].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
            return { results: rows };
          }
          if (q.startsWith("SELECT user_sub, status, role_note, checked_in FROM integ_community_event_rsvps WHERE event_id = ?")) {
            return { results: [...rsvps.values()].filter((r) => r.event_id === args[0]) };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

function makeHelpers(claims: any) {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const usuarioClaims = async () => {
    if (!claims) throw new Error("sin_sesion");
    return claims;
  };
  return { json, usuarioClaims };
}

async function callRoute(db: any, method: string, path: string, claims: any, body?: any) {
  const url = new URL("https://vants-integraciones.vants.workers.dev" + path);
  const req = new Request(url.toString(), {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await rutasEventosRsvp(req, { DB: db }, url, url.pathname, method, makeHelpers(claims));
  assert.ok(res, `Expected response for ${method} ${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

test("Fase 5 Worker D1: seed inicial, RSVP con waitlist, promoción automática, check-in y moderación", async () => {
  resetEventosCacheForTests();
  const db = createFakeEventosDb();

  // 1) GET público auto-seedea 5 eventos oficiales
  const pubList = await callRoute(db, "GET", "/community/events", null);
  assert.equal(pubList.status, 200);
  assert.equal(pubList.data.events.length, 5);
  assert.equal(pubList.data.summary.totalUpcoming, 5);
  assert.equal(pubList.data.viewer.isModerator, false);

  // 2) Jugador normal NO puede crear eventos (403)
  const p1 = { sub: "google-oauth2|p1", email: "p1@example.com", name: "PlayerOne" };
  const p2 = { sub: "google-oauth2|p2", email: "p2@example.com", name: "PlayerTwo" };
  const p3 = { sub: "google-oauth2|p3", email: "p3@example.com", name: "PlayerThree" };
  const owner = { sub: "google-oauth2|owner-1", email: "feispla@hotmail.com", name: "Feispla" };

  const denied = await callRoute(db, "POST", "/community/events", p1, {
    title: "Copa no autorizada",
    type: "showmatch",
    gameSlug: "valorant",
    modality: "online",
    location: "Discord",
    description: "Evento que debería rechazarse por permisos.",
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
    capacity: 2,
  });
  assert.equal(denied.status, 403);

  // 3) Owner crea evento de capacidad 2 cupos
  const created = await callRoute(db, "POST", "/community/events", owner, {
    title: "Copa Duo Relámpago VANTS",
    type: "torneo_relampago",
    gameSlug: "valorant",
    modality: "online",
    location: "Discord VANTS #copa",
    description: "Torneo corto de 2 cupos para probar lista de espera y promoción automática.",
    startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    capacity: 2,
    featured: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.viewer.isModerator, true);
  const customEv = created.data.events.find((e: any) => e.title === "Copa Duo Relámpago VANTS");
  assert.ok(customEv);
  assert.equal(customEv.hostNick, "Feispla");

  // 4) p1 y p2 entran confirmados; p3 cae en waitlist
  const r1 = await callRoute(db, "POST", `/community/events/${customEv.id}/rsvp`, p1, { roleNote: "Duelista" });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.rsvpStatus, "confirmed");

  const r2 = await callRoute(db, "POST", `/community/events/${customEv.id}/rsvp`, p2, { roleNote: "IGL" });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.rsvpStatus, "confirmed");

  const r3 = await callRoute(db, "POST", `/community/events/${customEv.id}/rsvp`, p3, { roleNote: "Sentinel" });
  assert.equal(r3.status, 200);
  assert.equal(r3.data.rsvpStatus, "waitlist");
  const evFull = r3.data.events.find((e: any) => e.id === customEv.id);
  assert.equal(evFull.confirmedCount, 2);
  assert.equal(evFull.waitlistCount, 1);
  assert.equal(evFull.isFull, true);

  // 5) Check-in: rechazado para waitlist (409), permitido para confirmado
  const ciWait = await callRoute(db, "POST", `/community/events/${customEv.id}/checkin`, p3);
  assert.equal(ciWait.status, 409);

  const ciOk = await callRoute(db, "POST", `/community/events/${customEv.id}/checkin`, p1);
  assert.equal(ciOk.status, 200);
  assert.equal(ciOk.data.checkedIn, true);

  // 6) p1 cancela -> p3 se promueve automáticamente de waitlist a confirmed
  const del1 = await callRoute(db, "DELETE", `/community/events/${customEv.id}/rsvp`, p1);
  assert.equal(del1.status, 200);

  const p3View = await callRoute(db, "GET", "/community/events", p3);
  const evPromoted = p3View.data.events.find((e: any) => e.id === customEv.id);
  assert.equal(evPromoted.confirmedCount, 2);
  assert.equal(evPromoted.waitlistCount, 0);
  assert.equal(evPromoted.viewerRsvp.status, "confirmed");

  // 7) Owner cierra el evento -> ya no admite nuevos RSVP (409)
  const closed = await callRoute(db, "PATCH", `/community/events/${customEv.id}`, owner, { status: "closed" });
  assert.equal(closed.status, 200);
  const evClosed = closed.data.events.find((e: any) => e.id === customEv.id);
  assert.equal(evClosed.status, "closed");
  assert.equal(evClosed.isOpenForRsvp, false);

  const blockedRsvp = await callRoute(db, "POST", `/community/events/${customEv.id}/rsvp`, p1, {});
  assert.equal(blockedRsvp.status, 409);
});
