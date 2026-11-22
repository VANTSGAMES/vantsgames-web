import test from "node:test";
import assert from "node:assert/strict";
import { rutasComunidadMisiones, resetMisionesCacheForTests } from "../integraciones/src/comunidadMisiones.js";

function createFakeMisionesDb() {
  const rows = new Map<string, any>(); // key = week::sub::code
  const nicks = new Map<string, string>([
    ["google-oauth2|p1", "PlayerOne"],
    ["google-oauth2|p2", "PlayerTwo"],
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
          if (q.startsWith("INSERT INTO integ_community_missions_progress")) {
            const [week_key, user_sub, mission_code, user_nick, progress_count, claimed, xp_awarded, proof_note, updated_at] = args;
            rows.set(`${week_key}::${user_sub}::${mission_code}`, {
              week_key, user_sub, mission_code, user_nick, progress_count, claimed, xp_awarded, proof_note, updated_at,
            });
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith("SELECT display_name, username FROM players WHERE auth0_sub = ?")) {
            const nick = nicks.get(args[0]);
            return nick ? { display_name: nick, username: nick } : null;
          }
          return null;
        },
        async all() {
          if (q.startsWith("SELECT * FROM integ_community_missions_progress WHERE week_key = ?")) {
            return { results: [...rows.values()].filter((r) => r.week_key === args[0]) };
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
  const res = await rutasComunidadMisiones(req, { DB: db }, url, url.pathname, method, makeHelpers(claims));
  assert.ok(res, `Expected response for ${method} ${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

test("Misiones Worker D1: listar, progreso, claim y doble claim rechazado", async () => {
  resetMisionesCacheForTests();
  const db = createFakeMisionesDb();
  const p1 = { sub: "google-oauth2|p1", email: "p1@example.com", name: "PlayerOne" };
  const p2 = { sub: "google-oauth2|p2", email: "p2@example.com", name: "PlayerTwo" };

  // ruta ajena -> null
  const other = await rutasComunidadMisiones(
    new Request("https://x.dev/community/events"), { DB: db }, new URL("https://x.dev/community/events"),
    "/community/events", "GET", makeHelpers(null),
  );
  assert.equal(other, null);

  // GET público
  const pub = await callRoute(db, "GET", "/community/missions", null);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.missions.length, 6);
  assert.equal(pub.data.summary.xpEarned, 0);
  assert.match(pub.data.weekKey, /^\d{4}-W\d{2}$/);

  // POST sin sesión -> 401
  const noAuth = await callRoute(db, "POST", "/community/missions/weekly-clip/progress", null, {});
  assert.equal(noAuth.status, 401);

  // misión inexistente -> 404
  const nf = await callRoute(db, "POST", "/community/missions/nope/progress", p1, {});
  assert.equal(nf.status, 404);

  // claim prematuro -> 400
  const early = await callRoute(db, "POST", "/community/missions/weekly-clip/claim", p1);
  assert.equal(early.status, 400);

  // progreso de misión de 1 paso
  const prog = await callRoute(db, "POST", "/community/missions/weekly-clip/progress", p1, { note: "https://twitch.tv/clip" });
  assert.equal(prog.status, 200);
  const clip = prog.data.missions.find((m: any) => m.code === "weekly-clip");
  assert.equal(clip.current, 1);
  assert.equal(clip.completed, true);
  assert.equal(clip.claimed, false);
  assert.equal(clip.proofNote, "https://twitch.tv/clip");

  // más progreso -> 409
  const over = await callRoute(db, "POST", "/community/missions/weekly-clip/progress", p1, {});
  assert.equal(over.status, 409);

  // claim OK
  const claim = await callRoute(db, "POST", "/community/missions/weekly-clip/claim", p1);
  assert.equal(claim.status, 200);
  assert.equal(claim.data.xpAwarded, 150);
  assert.equal(claim.data.summary.xpEarned, 150);
  assert.equal(claim.data.leaderboard[0].nick, "PlayerOne");
  assert.equal(claim.data.leaderboard[0].isViewer, true);

  // doble claim rechazado
  const again = await callRoute(db, "POST", "/community/missions/weekly-clip/claim", p1);
  assert.equal(again.status, 409);

  // progreso multi-paso (target 2)
  const s1 = await callRoute(db, "POST", "/community/missions/weekly-tournaments-val-cs2/progress", p1, {});
  assert.equal(s1.data.missions.find((m: any) => m.code === "weekly-tournaments-val-cs2").current, 1);

  // otro usuario no ve el progreso de p1
  const p2view = await callRoute(db, "GET", "/community/missions", p2);
  assert.equal(p2view.data.summary.xpEarned, 0);
  assert.equal(p2view.data.missions.find((m: any) => m.code === "weekly-clip").claimed, false);
  assert.equal(p2view.data.leaderboard.length, 1);
  assert.equal(p2view.data.leaderboard[0].isViewer, false);
});
