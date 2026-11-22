import test from "node:test";
import assert from "node:assert/strict";
import {
  rutasComunidadVotaciones,
  resetComunidadVotacionesCacheForTests,
} from "../integraciones/src/comunidadVotaciones.js";

function createFakeVotacionesDb() {
  const polls = new Map<string, any>();
  const votes = new Map<string, any>();
  const matches = new Map<string, any>();
  const preds = new Map<string, any>();
  const owners = new Set<string>(["google-oauth2|owner-1"]);
  const nicks = new Map<string, string>([
    ["google-oauth2|owner-1", "Feispla"],
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
          if (q.startsWith("INSERT OR IGNORE INTO integ_community_voting_polls")) {
            const [id, kind, title, description, game_slug, badge, options_json, status, closes_at, created_at] = args;
            if (!polls.has(id)) polls.set(id, { id, kind, title, description, game_slug, badge, options_json, status, closes_at, created_by_sub: null, created_at });
          } else if (q.startsWith("INSERT INTO integ_community_voting_polls")) {
            const [id, kind, title, description, game_slug, badge, options_json, closes_at, created_by_sub, created_at] = args;
            polls.set(id, { id, kind, title, description, game_slug, badge, options_json, status: "open", closes_at, created_by_sub, created_at });
          } else if (q.startsWith("UPDATE integ_community_voting_polls SET status = ?")) {
            const row = polls.get(args[1]);
            if (row) row.status = args[0];
          } else if (q.startsWith("INSERT OR IGNORE INTO integ_community_voting_matches")) {
            const [id, stage, tournament_name, game_slug, team_a_json, team_b_json, best_of, starts_at, points, locked, winner_id, updated_at] = args;
            if (!matches.has(id)) matches.set(id, { id, stage, tournament_name, game_slug, team_a_json, team_b_json, best_of, starts_at, points, locked, winner_id, updated_at });
          } else if (q.startsWith("UPDATE integ_community_voting_matches SET winner_id = ?")) {
            const [winner_id, locked, updated_at, id] = args;
            const row = matches.get(id);
            if (row) Object.assign(row, { winner_id, locked, updated_at });
          } else if (q.startsWith("INSERT INTO integ_community_voting_votes")) {
            const [poll_id, user_sub, user_nick, option_id, updated_at] = args;
            votes.set(`${poll_id}::${user_sub}`, { poll_id, user_sub, user_nick, option_id, updated_at });
          } else if (q.startsWith("INSERT INTO integ_community_voting_predictions")) {
            const [match_id, user_sub, user_nick, picked_team_id, updated_at] = args;
            preds.set(`${match_id}::${user_sub}`, { match_id, user_sub, user_nick, picked_team_id, updated_at });
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith("SELECT id FROM integ_community_voting_polls LIMIT 1")) {
            const f = [...polls.values()][0];
            return f ? { id: f.id } : null;
          }
          if (q.startsWith("SELECT id FROM integ_community_voting_matches LIMIT 1")) {
            const f = [...matches.values()][0];
            return f ? { id: f.id } : null;
          }
          if (q.startsWith("SELECT id FROM integ_community_voting_polls WHERE id = ?")) {
            const r = polls.get(args[0]);
            return r ? { id: r.id } : null;
          }
          if (q.startsWith("SELECT * FROM integ_community_voting_polls WHERE id = ?")) return polls.get(args[0]) || null;
          if (q.startsWith("SELECT * FROM integ_community_voting_matches WHERE id = ?")) return matches.get(args[0]) || null;
          if (q.includes("FROM players WHERE auth0_sub = ? AND role = 'owner'")) return owners.has(args[0]) ? { 1: 1 } : null;
          if (q.startsWith("SELECT display_name, username FROM players WHERE auth0_sub = ?")) {
            const n = nicks.get(args[0]);
            return n ? { display_name: n, username: n } : null;
          }
          return null;
        },
        async all() {
          if (q.startsWith("SELECT * FROM integ_community_voting_polls")) return { results: [...polls.values()] };
          if (q.startsWith("SELECT * FROM integ_community_voting_votes")) return { results: [...votes.values()] };
          if (q.startsWith("SELECT * FROM integ_community_voting_matches")) return { results: [...matches.values()] };
          if (q.startsWith("SELECT * FROM integ_community_voting_predictions")) return { results: [...preds.values()] };
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
  const res = await rutasComunidadVotaciones(req, { DB: db }, url, url.pathname, method, makeHelpers(claims));
  assert.ok(res, `Expected response for ${method} ${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

const p1 = { sub: "google-oauth2|p1", email: "p1@example.com", name: "PlayerOne" };
const p2 = { sub: "google-oauth2|p2", email: "p2@example.com", name: "PlayerTwo" };
const owner = { sub: "google-oauth2|owner-1", email: "feispla@hotmail.com", name: "Feispla" };

test("Votaciones Worker D1: rutas ajenas devuelven null", async () => {
  const url = new URL("https://x.dev/community/events");
  const res = await rutasComunidadVotaciones(new Request(url), { DB: {} }, url, url.pathname, "GET", makeHelpers(null));
  assert.equal(res, null);
});

test("Votaciones Worker D1: overview, voto, voto duplicado, crear poll, pickem y permisos", async () => {
  resetComunidadVotacionesCacheForTests();
  const db = createFakeVotacionesDb();

  // overview público con seed
  const ov = await callRoute(db, "GET", "/community/voting", null);
  assert.equal(ov.status, 200);
  assert.equal(ov.data.polls.length, 4);
  assert.equal(ov.data.pickemMatches.length, 4);
  assert.equal(ov.data.viewer.isModerator, false);
  assert.equal(ov.data.polls[0].totalVotes, 0);

  // votar requiere sesión
  const noAuth = await callRoute(db, "POST", "/community/polls/next-community-tournament-game/vote", null, { optionId: "cs2" });
  assert.equal(noAuth.status, 401);

  // votar
  const v1 = await callRoute(db, "POST", "/community/polls/next-community-tournament-game/vote", p1, { optionId: "cs2" });
  assert.equal(v1.status, 200);
  const poll1 = v1.data.polls.find((p: any) => p.id === "next-community-tournament-game");
  assert.equal(poll1.totalVotes, 1);
  assert.equal(poll1.viewerOptionId, "cs2");
  assert.equal(poll1.options.find((o: any) => o.id === "cs2").percent, 100);

  // voto duplicado: no suma, cambia la opción
  const v2 = await callRoute(db, "POST", "/community/polls/next-community-tournament-game/vote", p1, { optionId: "valorant" });
  const poll2 = v2.data.polls.find((p: any) => p.id === "next-community-tournament-game");
  assert.equal(poll2.totalVotes, 1);
  assert.equal(poll2.viewerOptionId, "valorant");

  // opción inválida y encuesta inexistente
  const bad = await callRoute(db, "POST", "/community/polls/next-community-tournament-game/vote", p1, { optionId: "nope" });
  assert.equal(bad.status, 400);
  const missing = await callRoute(db, "POST", "/community/polls/zzz/vote", p1, { optionId: "cs2" });
  assert.equal(missing.status, 404);

  // permisos: jugador normal no crea ni cierra
  const draft = { title: "¿Mapa favorito de CS2?", description: "Elige el mapa para la noche de scrims.", kind: "comunidad", gameSlug: "cs2", closesInDays: 3, options: ["Mirage", "Inferno", "Mirage "] };
  const denied = await callRoute(db, "POST", "/community/polls", p1, draft);
  assert.equal(denied.status, 403);
  const deniedPatch = await callRoute(db, "PATCH", "/community/polls/next-community-tournament-game", p1, { status: "closed" });
  assert.equal(deniedPatch.status, 403);

  // owner: opciones duplicadas -> 400; luego crea
  const dup = await callRoute(db, "POST", "/community/polls", owner, draft);
  assert.equal(dup.status, 400);
  const created = await callRoute(db, "POST", "/community/polls", owner, { ...draft, options: ["Mirage", "Inferno", "Nuke"] });
  assert.equal(created.status, 201);
  assert.equal(created.data.viewer.isModerator, true);
  const newPoll = created.data.polls.find((p: any) => p.title === "¿Mapa favorito de CS2?");
  assert.ok(newPoll);
  assert.equal(newPoll.badge, "Comunidad");
  assert.equal(newPoll.options.length, 3);

  // owner cierra -> ya no admite votos (409)
  const closed = await callRoute(db, "PATCH", `/community/polls/${newPoll.id}`, owner, { status: "closed" });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.polls.find((p: any) => p.id === newPoll.id).isOpenForVoting, false);
  const blocked = await callRoute(db, "POST", `/community/polls/${newPoll.id}/vote`, p1, { optionId: newPoll.options[0].id });
  assert.equal(blocked.status, 409);

  // pickem: predecir
  const pr = await callRoute(db, "POST", "/community/pickem/val-s4-semi-1/predict", p1, { pickedTeamId: "caracas-five" });
  assert.equal(pr.status, 200);
  const m1 = pr.data.pickemMatches.find((m: any) => m.id === "val-s4-semi-1");
  assert.equal(m1.viewerPickTeamId, "caracas-five");
  assert.equal(m1.viewerOutcome, "pending");
  assert.equal(m1.teamAPercent, 100);
  assert.equal(pr.data.pickemSummary.picksSubmitted, 1);

  const wrongTeam = await callRoute(db, "POST", "/community/pickem/val-s4-semi-1/predict", p1, { pickedTeamId: "otro" });
  assert.equal(wrongTeam.status, 400);
  await callRoute(db, "POST", "/community/pickem/val-s4-semi-1/predict", p2, { pickedTeamId: "andes-vanguard" });

  // permisos pickem
  const deniedResolve = await callRoute(db, "PATCH", "/community/pickem/val-s4-semi-1", p1, { winnerId: "caracas-five" });
  assert.equal(deniedResolve.status, 403);
  const invalidWinner = await callRoute(db, "PATCH", "/community/pickem/val-s4-semi-1", owner, { winnerId: "x" });
  assert.equal(invalidWinner.status, 400);

  // owner resuelve -> puntos, leaderboard y bloqueo
  const resolved = await callRoute(db, "PATCH", "/community/pickem/val-s4-semi-1", owner, { winnerId: "caracas-five" });
  assert.equal(resolved.status, 200);
  const mr = resolved.data.pickemMatches.find((m: any) => m.id === "val-s4-semi-1");
  assert.equal(mr.winnerId, "caracas-five");
  assert.equal(mr.locked, true);
  assert.equal(resolved.data.leaderboard[0].nick, "PlayerOne");
  assert.equal(resolved.data.leaderboard[0].points, 10);

  const late = await callRoute(db, "POST", "/community/pickem/val-s4-semi-1/predict", p2, { pickedTeamId: "caracas-five" });
  assert.equal(late.status, 409);

  const p1View = await callRoute(db, "GET", "/community/voting", p1);
  assert.equal(p1View.data.pickemMatches.find((m: any) => m.id === "val-s4-semi-1").viewerOutcome, "hit");
  assert.equal(p1View.data.leaderboard.find((e: any) => e.nick === "PlayerOne").isViewer, true);
});
