import test from "node:test";
import assert from "node:assert/strict";
import { rutasComunidadLfg, resetComunidadLfgCacheForTests } from "../integraciones/src/comunidadLfg.js";

function createFakeLfgDb() {
  const listings: any[] = [];
  const apps: any[] = [];
  let nextL = 1;
  let nextA = 1;
  const nicks = new Map<string, string>([["google-oauth2|owner", "OwnerNick"]]);

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
          if (q.startsWith("INSERT INTO integ_community_lfg_listings")) {
            const [user_sub, author_nick, type, game_slug, title, team_name, role_needed, rank_level, schedule, region, slots_open, contact, notes, expires_at, created_at] = args;
            const id = nextL++;
            listings.push({ id, user_sub, author_nick, type, game_slug, title, team_name, role_needed, rank_level, schedule, region, slots_open, contact, notes, expires_at, created_at });
            return { success: true, meta: { last_row_id: id } };
          }
          if (q.startsWith("INSERT INTO integ_community_lfg_applications")) {
            const [listing_id, applicant_sub, applicant_nick, role, contact, message, created_at] = args;
            const id = nextA++;
            apps.push({ id, listing_id, applicant_sub, applicant_nick, role, contact, message, status: "pending", created_at });
            return { success: true, meta: { last_row_id: id } };
          }
          if (q.startsWith("UPDATE integ_community_lfg_applications SET status = ? WHERE id = ?")) {
            const a = apps.find((x) => x.id === args[1]);
            if (a) a.status = args[0];
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_community_lfg_applications WHERE listing_id = ?")) {
            for (let i = apps.length - 1; i >= 0; i--) if (apps[i].listing_id === args[0]) apps.splice(i, 1);
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_community_lfg_listings WHERE id = ?")) {
            const i = listings.findIndex((l) => l.id === args[0]);
            if (i >= 0) listings.splice(i, 1);
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith("SELECT * FROM integ_community_lfg_listings WHERE id = ?") || q.startsWith("SELECT id, user_sub FROM integ_community_lfg_listings WHERE id = ?")) {
            return listings.find((l) => l.id === args[0]) || null;
          }
          if (q.startsWith("SELECT * FROM integ_community_lfg_applications WHERE id = ?")) {
            return apps.find((a) => a.id === args[0]) || null;
          }
          if (q.startsWith("SELECT id FROM integ_community_lfg_applications WHERE listing_id = ? AND applicant_sub = ?")) {
            return apps.find((a) => a.listing_id === args[0] && a.applicant_sub === args[1]) || null;
          }
          if (q.startsWith("SELECT display_name, username FROM players WHERE auth0_sub = ?")) {
            const n = nicks.get(args[0]);
            return n ? { display_name: n, username: n } : null;
          }
          return null;
        },
        async all() {
          if (q.startsWith("SELECT * FROM integ_community_lfg_listings WHERE expires_at > ?")) {
            return { results: listings.filter((l) => l.expires_at > args[0]).sort((a, b) => b.id - a.id) };
          }
          if (q.startsWith("SELECT listing_id, COUNT(*)")) {
            const m = new Map<number, number>();
            for (const a of apps) m.set(a.listing_id, (m.get(a.listing_id) || 0) + 1);
            return { results: [...m.entries()].map(([listing_id, total]) => ({ listing_id, total })) };
          }
          if (q.startsWith("SELECT listing_id FROM integ_community_lfg_applications WHERE applicant_sub = ?")) {
            return { results: apps.filter((a) => a.applicant_sub === args[0]) };
          }
          if (q.startsWith("SELECT * FROM integ_community_lfg_applications WHERE listing_id = ?")) {
            return { results: apps.filter((a) => a.listing_id === args[0]).sort((a, b) => b.id - a.id) };
          }
          return { results: [] };
        },
        _listings: listings,
      };
      return stmt;
    },
    _listings: listings,
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
  const res = await rutasComunidadLfg(req, { DB: db }, url, url.pathname, method, makeHelpers(claims));
  assert.ok(res, `Expected response for ${method} ${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

const owner = { sub: "google-oauth2|owner", email: "owner@example.com", name: "Owner" };
const p1 = { sub: "google-oauth2|p1", email: "p1@example.com", name: "PlayerOne" };
const p2 = { sub: "google-oauth2|p2", email: "p2@example.com", name: "PlayerTwo" };

const draft = {
  type: "lfg",
  gameSlug: "valorant",
  title: "Buscamos duelista",
  roleNeeded: "Duelist",
  rankLevel: "Ascendente+",
  schedule: "Lun-Vie 20:00",
  region: "VE",
  slotsOpen: 2,
  contact: "owner#1234",
};

test("LFG Worker D1: rutas ajenas devuelven null", async () => {
  const url = new URL("https://x.dev/community/events");
  const res = await rutasComunidadLfg(new Request(url), { DB: createFakeLfgDb() }, url, url.pathname, "GET", makeHelpers(null));
  assert.equal(res, null);
});

test("LFG Worker D1: listar, crear, aplicar, aceptar/rechazar, borrar y permisos", async () => {
  resetComunidadLfgCacheForTests();
  const db = createFakeLfgDb();

  // listar vacío (público)
  const empty = await callRoute(db, "GET", "/community/lfg", null);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.listings, []);

  // crear: 401 sin sesión, 400 inválido, 201 ok
  assert.equal((await callRoute(db, "POST", "/community/lfg", null, draft)).status, 401);
  assert.equal((await callRoute(db, "POST", "/community/lfg", owner, { ...draft, title: "x" })).status, 400);
  const created = await callRoute(db, "POST", "/community/lfg", owner, draft);
  assert.equal(created.status, 201);
  const l = created.data.listing;
  assert.equal(l.authorNick, "OwnerNick");
  assert.equal(l.isOwner, true);
  assert.equal(l.applicationsCount, 0);
  assert.equal(l.type, "lfg");
  assert.equal(l.slotsOpen, 2);
  assert.ok(new Date(l.expiresAt).getTime() > Date.now());

  // listar con filtros y viewer
  const asOwner = await callRoute(db, "GET", "/community/lfg?game=valorant&type=lfg&region=ve", owner);
  assert.equal(asOwner.data.listings.length, 1);
  assert.equal(asOwner.data.listings[0].isOwner, true);
  const asOther = await callRoute(db, "GET", "/community/lfg?game=cs2", p1);
  assert.equal(asOther.data.listings.length, 0);

  // aplicar: 401, 400, propio anuncio, 404, ok, duplicado 409
  const appBody = { role: "Duelist", contact: "p1#1", message: "Quiero entrar al roster" };
  assert.equal((await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, null, appBody)).status, 401);
  assert.equal((await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, p1, { ...appBody, message: "hi" })).status, 400);
  assert.equal((await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, owner, appBody)).status, 400);
  assert.equal((await callRoute(db, "POST", `/community/lfg/999/apply`, p1, appBody)).status, 404);
  const applied = await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, p1, appBody);
  assert.equal(applied.status, 201);
  assert.equal(applied.data.application.status, "pending");
  assert.equal(applied.data.application.applicantNick, "PlayerOne");
  assert.equal((await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, p1, appBody)).status, 409);
  const p2app = await callRoute(db, "POST", `/community/lfg/${l.id}/apply`, p2, appBody);
  assert.equal(p2app.status, 201);

  const asP1 = await callRoute(db, "GET", "/community/lfg", p1);
  assert.equal(asP1.data.listings[0].hasApplied, true);
  assert.equal(asP1.data.listings[0].applicationsCount, 2);
  assert.equal(asP1.data.listings[0].isOwner, false);

  // ver solicitudes: solo autor
  assert.equal((await callRoute(db, "GET", `/community/lfg/${l.id}/applications`, null)).status, 401);
  assert.equal((await callRoute(db, "GET", `/community/lfg/${l.id}/applications`, p1)).status, 403);
  assert.equal((await callRoute(db, "GET", `/community/lfg/999/applications`, owner)).status, 404);
  const list = await callRoute(db, "GET", `/community/lfg/${l.id}/applications`, owner);
  assert.equal(list.status, 200);
  assert.equal(list.data.applications.length, 2);

  // aceptar / rechazar: permisos y validación
  const aid1 = applied.data.application.id;
  const aid2 = p2app.data.application.id;
  assert.equal((await callRoute(db, "PATCH", `/community/lfg/applications/${aid1}`, null, { status: "accepted" })).status, 401);
  assert.equal((await callRoute(db, "PATCH", `/community/lfg/applications/${aid1}`, p2, { status: "accepted" })).status, 403);
  assert.equal((await callRoute(db, "PATCH", `/community/lfg/applications/${aid1}`, owner, { status: "maybe" })).status, 400);
  assert.equal((await callRoute(db, "PATCH", `/community/lfg/applications/999`, owner, { status: "accepted" })).status, 404);
  const acc = await callRoute(db, "PATCH", `/community/lfg/applications/${aid1}`, owner, { status: "accepted" });
  assert.equal(acc.status, 200);
  assert.equal(acc.data.application.status, "accepted");
  const dec = await callRoute(db, "PATCH", `/community/lfg/applications/${aid2}`, owner, { status: "declined" });
  assert.equal(dec.data.application.status, "declined");

  // borrar: 401, 400, ajeno 404, ok y desaparece
  assert.equal((await callRoute(db, "DELETE", `/community/lfg/${l.id}`, null)).status, 401);
  assert.equal((await callRoute(db, "DELETE", `/community/lfg/abc`, owner)).status, 400);
  assert.equal((await callRoute(db, "DELETE", `/community/lfg/${l.id}`, p1)).status, 404);
  const del = await callRoute(db, "DELETE", `/community/lfg/${l.id}`, owner);
  assert.equal(del.status, 200);
  assert.deepEqual(del.data, { deleted: true, id: l.id });
  const after = await callRoute(db, "GET", "/community/lfg", owner);
  assert.equal(after.data.listings.length, 0);
});
