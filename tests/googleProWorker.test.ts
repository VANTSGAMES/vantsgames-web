import test from "node:test";
import assert from "node:assert/strict";
import {
  rutasAuth,
  verificarJwtDual,
  resetAuthCachesForTests,
} from "../integraciones/src/auth.js";
import {
  rutasGooglePro,
  resetGoogleProCacheForTests,
} from "../integraciones/src/googlePro.js";
import { parchearVantsWorker } from "../script/ci/parchear-auth-dual.mjs";

function createFakeProDb() {
  const users = new Map<string, any>();
  const notes: any[] = [];
  const links: any[] = [];
  const bookmarks: any[] = [];
  let seq = 1;

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
          if (q.startsWith("INSERT INTO integ_pro_users")) {
            const [user_sub, email, display_name, photo_url, updated_at] = args;
            const prev = users.get(user_sub);
            users.set(user_sub, {
              user_sub,
              email,
              display_name: prev?.display_name ?? display_name,
              photo_url: photo_url ?? prev?.photo_url ?? null,
              preferred_game: prev?.preferred_game ?? null,
              updated_at,
            });
            return { success: true };
          }
          if (q.startsWith("UPDATE integ_pro_users SET preferred_game = ?")) {
            const [preferred_game, display_name, updated_at, user_sub] = args;
            const prev = users.get(user_sub);
            if (prev) {
              prev.preferred_game = preferred_game;
              prev.display_name = display_name;
              prev.updated_at = updated_at;
            }
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_pro_notes WHERE id = ? AND user_sub = ?")) {
            const [id, sub] = args;
            const idx = notes.findIndex((n) => n.id === id && n.user_sub === sub);
            if (idx >= 0) notes.splice(idx, 1);
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_pro_workspace_links WHERE id = ? AND user_sub = ?")) {
            const [id, sub] = args;
            const idx = links.findIndex((l) => l.id === id && l.user_sub === sub);
            if (idx >= 0) links.splice(idx, 1);
            return { success: true };
          }
          if (q.startsWith("DELETE FROM integ_pro_bookmarks WHERE id = ? AND user_sub = ?")) {
            const [id, sub] = args;
            const idx = bookmarks.findIndex((b) => b.id === id && b.user_sub === sub);
            if (idx >= 0) bookmarks.splice(idx, 1);
            return { success: true };
          }
          throw new Error("Unhandled run SQL: " + q);
        },
        async first() {
          if (q.startsWith("SELECT user_sub, email, display_name, photo_url, preferred_game FROM integ_pro_users")) {
            return users.get(args[0]) ?? null;
          }
          if (q.startsWith("INSERT INTO integ_pro_notes")) {
            const [user_sub, title, content, game_slug, category, created_at, updated_at] = args;
            const row = { id: seq++, user_sub, title, content, game_slug, category, created_at, updated_at };
            notes.push(row);
            return row;
          }
          if (q.startsWith("SELECT id FROM integ_pro_notes WHERE id = ? AND user_sub = ?")) {
            return notes.find((n) => n.id === args[0] && n.user_sub === args[1]) ?? null;
          }
          if (q.startsWith("INSERT INTO integ_pro_workspace_links")) {
            const [user_sub, service, resource_id, title, url, game_slug, metadata_json, created_at] = args;
            const row = { id: seq++, user_sub, service, resource_id, title, url, game_slug, metadata_json, created_at };
            links.push(row);
            return row;
          }
          if (q.startsWith("SELECT id FROM integ_pro_workspace_links WHERE id = ? AND user_sub = ?")) {
            return links.find((l) => l.id === args[0] && l.user_sub === args[1]) ?? null;
          }
          if (q.startsWith("INSERT INTO integ_pro_bookmarks")) {
            const [user_sub, tournament_slug, tournament_name, game_slug, notesVal, created_at] = args;
            const row = { id: seq++, user_sub, tournament_slug, tournament_name, game_slug, notes: notesVal, created_at };
            bookmarks.push(row);
            return row;
          }
          if (q.startsWith("SELECT id FROM integ_pro_bookmarks WHERE id = ? AND user_sub = ?")) {
            return bookmarks.find((b) => b.id === args[0] && b.user_sub === args[1]) ?? null;
          }
          throw new Error("Unhandled first SQL: " + q);
        },
        async all() {
          if (q.startsWith("SELECT id FROM integ_pro_notes WHERE user_sub = ?")) {
            return { results: notes.filter((n) => n.user_sub === args[0]) };
          }
          if (q.startsWith("SELECT id FROM integ_pro_workspace_links WHERE user_sub = ?")) {
            return { results: links.filter((l) => l.user_sub === args[0]) };
          }
          if (q.startsWith("SELECT id FROM integ_pro_bookmarks WHERE user_sub = ?")) {
            return { results: bookmarks.filter((b) => b.user_sub === args[0]) };
          }
          if (q.startsWith("SELECT id, title, content, game_slug, category, created_at, updated_at FROM integ_pro_notes")) {
            return { results: notes.filter((n) => n.user_sub === args[0]).slice().reverse() };
          }
          if (q.startsWith("SELECT id, service, resource_id, title, url, game_slug, metadata_json, created_at FROM integ_pro_workspace_links")) {
            return { results: links.filter((l) => l.user_sub === args[0]).slice().reverse() };
          }
          if (q.startsWith("SELECT id, tournament_slug, tournament_name, game_slug, notes, created_at FROM integ_pro_bookmarks")) {
            return { results: bookmarks.filter((b) => b.user_sub === args[0]).slice().reverse() };
          }
          throw new Error("Unhandled all SQL: " + q);
        },
      };
      return stmt;
    },
  };
}

test("OpenID Connect Discovery, root JWKS, userinfo, and Google OAuth 2.0 access token verification", async () => {
  resetAuthCachesForTests();
  const env = {
    VANTS_AUTH_ISSUER: "https://vants.cc",
    GOOGLE_OAUTH_CLIENT_ID: "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com",
  };
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s });

  // 1) Root /.well-known/openid-configuration and /auth/.well-known/openid-configuration
  for (const path of ["/.well-known/openid-configuration", "/auth/.well-known/openid-configuration"]) {
    const res = await rutasAuth(
      new Request("https://vants.cc" + path),
      env,
      new URL("https://vants.cc" + path),
      path,
      "GET",
      { json },
    );
    assert.equal(res?.status, 200);
    assert.equal(res?.headers.get("access-control-allow-origin"), "*");
    const body = (await res!.json()) as any;
    assert.equal(body.issuer, "https://vants.cc");
    assert.equal(body.jwks_uri, "https://vants.cc/auth/.well-known/jwks.json");
    assert.equal(body.userinfo_endpoint, "https://vants.cc/auth/userinfo");
  }

  // 2) /auth/userinfo returns standard OIDC claims or 401 WWW-Authenticate
  const uiOk = await rutasAuth(
    new Request("https://vants.cc/auth/userinfo"),
    env,
    new URL("https://vants.cc/auth/userinfo"),
    "/auth/userinfo",
    "GET",
    {
      json,
      usuarioClaims: async () => ({
        sub: "google-oauth2|1099",
        email: "feiss@vants.cc",
        email_verified: true,
        name: "FEISS",
      }),
    },
  );
  assert.equal(uiOk?.status, 200);
  const uiBody = (await uiOk!.json()) as any;
  assert.equal(uiBody.sub, "google-oauth2|1099");
  assert.equal(uiBody.email, "feiss@vants.cc");

  // 3) verificarJwtDual validates Google OAuth 2.0 access tokens (ya29.*) via Google userinfo
  const claims = await verificarJwtDual("ya29.a0AfH6SMBx_fake_google_workspace_token_12345", env, {
    fetchImpl: async (url: string) => {
      assert.equal(url, "https://www.googleapis.com/oauth2/v3/userinfo");
      return new Response(
        JSON.stringify({
          sub: "103921098105477052247",
          email: "geimerjhoan099@gmail.com",
          email_verified: true,
          name: "FEISS",
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(claims.provider, "google");
  assert.equal(claims.sub, "google-oauth2|103921098105477052247");
  assert.equal(claims.email, "geimerjhoan099@gmail.com");
});

test("Google Workspace Pro & Maps routes (/pro/me, /pro/notes, /pro/workspace-links, /pro/bookmarks, /maps/config)", async () => {
  resetGoogleProCacheForTests();
  const db = createFakeProDb();
  const env = { DB: db, GOOGLE_MAPS_API_KEY: "AIzaSyTestMapsKey" };
  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  const usuarioClaims = async () => ({
    sub: "google-oauth2|103921098105477052247",
    email: "geimerjhoan099@gmail.com",
    name: "FEISS",
  });

  // /maps/config
  const mapsRes = await rutasGooglePro(
    new Request("https://vants.cc/maps/config"),
    env,
    new URL("https://vants.cc/maps/config"),
    "/maps/config",
    "GET",
    { json, usuarioClaims },
  );
  assert.equal(mapsRes?.status, 200);
  assert.deepEqual(await mapsRes!.json(), { apiKey: "AIzaSyTestMapsKey", configured: true });

  // POST /pro/notes -> GET /pro/notes -> DELETE /pro/notes/:id
  const createNoteRes = await rutasGooglePro(
    new Request("https://vants.cc/pro/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Default Ascent A", content: "Humo en Heaven y flash para entrar.", gameSlug: "valorant" }),
    }),
    env,
    new URL("https://vants.cc/pro/notes"),
    "/pro/notes",
    "POST",
    { json, usuarioClaims },
  );
  assert.equal(createNoteRes?.status, 201);
  const { note } = (await createNoteRes!.json()) as any;
  assert.equal(note.title, "Default Ascent A");

  // POST /pro/workspace-links
  const createLinkRes = await rutasGooglePro(
    new Request("https://vants.cc/pro/workspace-links", {
      method: "POST",
      body: JSON.stringify({
        service: "sheets",
        resourceId: "sheet-123",
        title: "Scrims S4",
        url: "https://docs.google.com/spreadsheets/d/sheet-123",
      }),
    }),
    env,
    new URL("https://vants.cc/pro/workspace-links"),
    "/pro/workspace-links",
    "POST",
    { json, usuarioClaims },
  );
  assert.equal(createLinkRes?.status, 201);

  // POST /pro/bookmarks
  const createBmRes = await rutasGooglePro(
    new Request("https://vants.cc/pro/bookmarks", {
      method: "POST",
      body: JSON.stringify({
        tournamentSlug: "copa-valorant-s4",
        tournamentName: "Copa VALORANT S4",
        gameSlug: "valorant",
      }),
    }),
    env,
    new URL("https://vants.cc/pro/bookmarks"),
    "/pro/bookmarks",
    "POST",
    { json, usuarioClaims },
  );
  assert.equal(createBmRes?.status, 201);

  // GET /pro/me reflects counts
  const meRes = await rutasGooglePro(
    new Request("https://vants.cc/pro/me"),
    env,
    new URL("https://vants.cc/pro/me"),
    "/pro/me",
    "GET",
    { json, usuarioClaims },
  );
  const meBody = (await meRes!.json()) as any;
  assert.deepEqual(meBody.counts, { notes: 1, workspaceLinks: 1, bookmarks: 1 });
});

test("parchearVantsWorker proxies /.well-known/openid-configuration, /pro/*, /maps/config and adds GIS style-src", () => {
  const sample = `var AUTH0_TENANT = "vants.eu.auth0.com";
async function infoDeSesion(token) {
  if (!token) return null;
  try {
    const ui = await fetch("https://" + AUTH0_TENANT + "/userinfo", {
      headers: { [AUTH_HEADER]: "Bearer " + token }
    });
    if (!ui.ok) return null;
    const info = await ui.json();
    return info && info.sub ? info : null;
  } catch (e) {
    return null;
  }
}
async function verifySesionJwt(request, env) {
  if (payload.iss && payload.iss !== "https://" + AUTH0_TENANT + "/") return null;
  return null;
}
const CSP = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;";
async function main(request, env, ctx) {
    // 2. Activar Sitemap para Google y rutas de Kick
    const rInicial = await manejarRutasSeoYKick(request, env);
    if (rInicial) return rInicial;
      const __r301 = await fetchWorker(request, env, ctx);
}`;
  const patched = parchearVantsWorker(sample);
  assert.equal(patched.includes("/* VANTS_WELL_KNOWN_OIDC_V1 */"), true);
  assert.equal(patched.includes("/.well-known/openid-configuration"), true);
  assert.equal(patched.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com;"), true);
});
