import test from "node:test";
import assert from "node:assert/strict";
import { rutasComunidadForo, resetForoCacheForTests } from "../integraciones/src/comunidadForo.js";

function createFakeForoDb() {
  const posts: any[] = [];
  const reacts: any[] = [];
  const comments: any[] = [];
  let postSeq = 1;
  let commentSeq = 1;
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
          if (q.startsWith("UPDATE integ_community_forum_posts SET pinned = ?, locked = ? WHERE id = ?")) {
            const row = posts.find((p) => p.id === args[2]);
            if (row) { row.pinned = args[0]; row.locked = args[1]; }
          } else if (q.startsWith("INSERT INTO integ_community_forum_reactions")) {
            reacts.push({ post_id: args[0], user_sub: args[1], reaction: args[2] });
          } else if (q.startsWith("DELETE FROM integ_community_forum_reactions WHERE post_id = ? AND user_sub")) {
            const i = reacts.findIndex((r) => r.post_id === args[0] && r.user_sub === args[1] && r.reaction === args[2]);
            if (i >= 0) reacts.splice(i, 1);
          } else if (q.startsWith("DELETE FROM integ_community_forum_reactions WHERE post_id = ?")) {
            for (let i = reacts.length - 1; i >= 0; i--) if (reacts[i].post_id === args[0]) reacts.splice(i, 1);
          } else if (q.startsWith("DELETE FROM integ_community_forum_comments WHERE post_id = ?")) {
            for (let i = comments.length - 1; i >= 0; i--) if (comments[i].post_id === args[0]) comments.splice(i, 1);
          } else if (q.startsWith("DELETE FROM integ_community_forum_comments WHERE id = ?")) {
            const i = comments.findIndex((c) => c.id === args[0]);
            if (i >= 0) comments.splice(i, 1);
          } else if (q.startsWith("DELETE FROM integ_community_forum_posts WHERE id = ?")) {
            const i = posts.findIndex((p) => p.id === args[0]);
            if (i >= 0) posts.splice(i, 1);
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith("INSERT INTO integ_community_forum_posts")) {
            const [user_sub, author_nick, game_slug, category, title, body, created_at] = args;
            const row = { id: postSeq++, user_sub, author_nick, game_slug, category, title, body, pinned: 0, locked: 0, created_at };
            posts.push(row);
            return { ...row };
          }
          if (q.startsWith("INSERT INTO integ_community_forum_comments")) {
            const [post_id, user_sub, author_nick, body, created_at] = args;
            const row = { id: commentSeq++, post_id, user_sub, author_nick, body, created_at };
            comments.push(row);
            return { ...row };
          }
          if (q.startsWith("SELECT * FROM integ_community_forum_posts WHERE id = ?")
            || q.startsWith("SELECT id, user_sub FROM integ_community_forum_posts WHERE id = ?")
            || q.startsWith("SELECT id, locked FROM integ_community_forum_posts WHERE id = ?")
            || q.startsWith("SELECT user_sub FROM integ_community_forum_posts WHERE id = ?")
            || q.startsWith("SELECT id FROM integ_community_forum_posts WHERE id = ?")) {
            const row = posts.find((p) => p.id === args[0]);
            return row ? { ...row } : null;
          }
          if (q.startsWith("SELECT * FROM integ_community_forum_comments WHERE id = ?")) {
            const row = comments.find((c) => c.id === args[0]);
            return row ? { ...row } : null;
          }
          if (q.startsWith("SELECT reaction FROM integ_community_forum_reactions WHERE post_id = ?")) {
            return reacts.find((r) => r.post_id === args[0] && r.user_sub === args[1] && r.reaction === args[2]) || null;
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
          if (q.startsWith("SELECT * FROM integ_community_forum_posts")) {
            let rows = [...posts];
            let i = 0;
            if (q.includes("game_slug = ?")) { const g = args[i++]; rows = rows.filter((p) => p.game_slug === g); }
            if (q.includes("category = ?")) { const c = args[i++]; rows = rows.filter((p) => p.category === c); }
            rows.sort((a, b) => b.pinned - a.pinned || String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
            return { results: rows.slice(0, 120) };
          }
          if (q.startsWith("SELECT post_id, user_sub, reaction FROM integ_community_forum_reactions")) {
            return { results: [...reacts] };
          }
          if (q.startsWith("SELECT user_sub, reaction FROM integ_community_forum_reactions WHERE post_id = ?")) {
            return { results: reacts.filter((r) => r.post_id === args[0]) };
          }
          if (q.startsWith("SELECT post_id, COUNT(*) AS total FROM integ_community_forum_comments")) {
            const m = new Map<number, number>();
            for (const c of comments) m.set(c.post_id, (m.get(c.post_id) || 0) + 1);
            return { results: [...m.entries()].map(([post_id, total]) => ({ post_id, total })) };
          }
          if (q.startsWith("SELECT * FROM integ_community_forum_comments WHERE post_id = ?")) {
            return { results: comments.filter((c) => c.post_id === args[0]) };
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
  const res = await rutasComunidadForo(req, { DB: db }, url, url.pathname, method, makeHelpers(claims));
  assert.ok(res, `Expected response for ${method} ${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

const p1 = { sub: "google-oauth2|p1", email: "p1@example.com", name: "PlayerOne" };
const p2 = { sub: "google-oauth2|p2", email: "p2@example.com", name: "PlayerTwo" };
const owner = { sub: "google-oauth2|owner-1", email: "feispla@hotmail.com", name: "Feispla" };

test("Foro Worker D1: ignora rutas ajenas", async () => {
  resetForoCacheForTests();
  const url = new URL("https://x.dev/community/events");
  const res = await rutasComunidadForo(new Request(url), { DB: createFakeForoDb() }, url, url.pathname, "GET", makeHelpers(null));
  assert.equal(res, null);
});

test("Foro Worker D1: crear, listar, comentar, reaccionar, moderar y permisos", async () => {
  resetForoCacheForTests();
  const db = createFakeForoDb();

  // Sin sesión: lectura pública OK, escritura 401
  const empty = await callRoute(db, "GET", "/community/forum", null);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data, { posts: [], viewer: { isModerator: false } });
  assert.equal((await callRoute(db, "POST", "/community/forum", null, {})).status, 401);

  // Validación
  const bad = await callRoute(db, "POST", "/community/forum", p1, { gameSlug: "nope", category: "guia", title: "Hola mundo", body: "cuerpo largo suficiente" });
  assert.equal(bad.status, 400);

  // Crear
  const created = await callRoute(db, "POST", "/community/forum", p1, {
    gameSlug: "valorant", category: "guia", title: "Lineup de Bind", body: "Guía completa de lineups para Bind.",
  });
  assert.equal(created.status, 201);
  const post = created.data.post;
  assert.equal(post.authorNick, "PlayerOne");
  assert.equal(post.isOwner, true);
  assert.equal(post.canModerate, false);
  assert.deepEqual(post.reactions, { gg: 0, fire: 0 });

  await callRoute(db, "POST", "/community/forum", p2, {
    gameSlug: "cs2", category: "debate", title: "Mejor mapa", body: "¿Cuál es el mejor mapa de CS2?",
  });

  // Listar con filtros y vista del espectador
  const listP1 = await callRoute(db, "GET", "/community/forum", p1);
  assert.equal(listP1.data.posts.length, 2);
  assert.equal(listP1.data.posts.find((x: any) => x.id === post.id).isOwner, true);
  assert.equal(listP1.data.posts.find((x: any) => x.id !== post.id).canDelete, false);
  const filtered = await callRoute(db, "GET", "/community/forum?game=cs2&category=debate", null);
  assert.equal(filtered.data.posts.length, 1);
  assert.equal(filtered.data.posts[0].gameSlug, "cs2");

  // Comentar
  assert.equal((await callRoute(db, "POST", `/community/forum/${post.id}/comments`, null, { body: "hola" })).status, 401);
  assert.equal((await callRoute(db, "POST", `/community/forum/${post.id}/comments`, p2, { body: "a" })).status, 400);
  assert.equal((await callRoute(db, "POST", "/community/forum/999/comments", p2, { body: "hola" })).status, 404);
  const c1 = await callRoute(db, "POST", `/community/forum/${post.id}/comments`, p2, { body: "Muy útil, gracias" });
  assert.equal(c1.status, 201);
  assert.equal(c1.data.comment.authorNick, "PlayerTwo");
  const comments = await callRoute(db, "GET", `/community/forum/${post.id}/comments`, p1);
  assert.equal(comments.data.comments.length, 1);
  assert.equal(comments.data.comments[0].isOwner, false);
  assert.equal(comments.data.comments[0].canDelete, true); // dueño del post
  const anon = await callRoute(db, "GET", `/community/forum/${post.id}/comments`, null);
  assert.equal(anon.data.comments[0].canDelete, false);

  // Reaccionar (toggle)
  assert.equal((await callRoute(db, "POST", `/community/forum/${post.id}/react`, p2, { reaction: "meh" })).status, 400);
  const r1 = await callRoute(db, "POST", `/community/forum/${post.id}/react`, p2, { reaction: "GG" });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.active, true);
  assert.deepEqual(r1.data.reactions, { gg: 1, fire: 0 });
  assert.deepEqual(r1.data.viewerReactions, ["gg"]);
  const r2 = await callRoute(db, "POST", `/community/forum/${post.id}/react`, p2, { reaction: "gg" });
  assert.equal(r2.data.active, false);
  assert.deepEqual(r2.data.reactions, { gg: 0, fire: 0 });
  await callRoute(db, "POST", `/community/forum/${post.id}/react`, p1, { reaction: "fire" });
  const listCounts = await callRoute(db, "GET", "/community/forum", null);
  const counted = listCounts.data.posts.find((x: any) => x.id === post.id);
  assert.equal(counted.reactions.fire, 1);
  assert.equal(counted.commentsCount, 1);

  // Moderación: jugador normal 403, owner OK
  assert.equal((await callRoute(db, "PATCH", `/community/forum/${post.id}/moderate`, p1, { pinned: true })).status, 403);
  assert.equal((await callRoute(db, "PATCH", `/community/forum/${post.id}/moderate`, owner, {})).status, 400);
  const pinned = await callRoute(db, "PATCH", `/community/forum/${post.id}/moderate`, owner, { pinned: true, locked: true });
  assert.equal(pinned.status, 200);
  assert.equal(pinned.data.post.pinned, true);
  assert.equal(pinned.data.post.locked, true);
  const listPinned = await callRoute(db, "GET", "/community/forum", owner);
  assert.equal(listPinned.data.viewer.isModerator, true);
  assert.equal(listPinned.data.posts[0].id, post.id);
  assert.equal(listPinned.data.posts[0].canModerate, true);

  // Bloqueado: usuario 403, moderador puede comentar
  const lockedTry = await callRoute(db, "POST", `/community/forum/${post.id}/comments`, p2, { body: "otro comentario" });
  assert.equal(lockedTry.status, 403);
  const modComment = await callRoute(db, "POST", `/community/forum/${post.id}/comments`, owner, { body: "Cerrado por staff" });
  assert.equal(modComment.status, 201);

  // Borrar comentario: ajeno 403 / autor, dueño del post
  const p3 = { sub: "google-oauth2|p3", email: "p3@example.com" };
  assert.equal((await callRoute(db, "DELETE", `/community/forum/comments/${c1.data.comment.id}`, p3)).status, 403);
  assert.equal((await callRoute(db, "DELETE", "/community/forum/comments/abc", p1)).status, 400);
  assert.equal((await callRoute(db, "DELETE", "/community/forum/comments/999", p1)).status, 404);
  const delC = await callRoute(db, "DELETE", `/community/forum/comments/${c1.data.comment.id}`, p1);
  assert.deepEqual(delC.data, { deleted: true, id: c1.data.comment.id });

  // Borrar post: ajeno 403, autor OK (limpia comentarios/reacciones)
  assert.equal((await callRoute(db, "DELETE", `/community/forum/${post.id}`, p2)).status, 403);
  assert.equal((await callRoute(db, "DELETE", `/community/forum/${post.id}`, null)).status, 401);
  const delP = await callRoute(db, "DELETE", `/community/forum/${post.id}`, p1);
  assert.deepEqual(delP.data, { deleted: true, id: post.id });
  assert.equal((await callRoute(db, "GET", `/community/forum/${post.id}/comments`, null)).status, 404);

  // Moderador borra post ajeno
  const other = (await callRoute(db, "GET", "/community/forum", null)).data.posts[0];
  const delByMod = await callRoute(db, "DELETE", `/community/forum/${other.id}`, owner);
  assert.equal(delByMod.status, 200);
  assert.equal((await callRoute(db, "GET", "/community/forum", null)).data.posts.length, 0);
});
