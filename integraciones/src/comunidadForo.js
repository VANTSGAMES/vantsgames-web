// VANTS · Comunidad Fase 2: Muro / Foro por videojuego (port del API Express a D1)
// -----------------------------------------------------------------------------
// Persiste en D1 (`vants-db`) con autocreación de tablas `integ_community_forum_*`.
// Contrato JSON idéntico al de Express (`/api/community/forum*`), compatible con
// `client/src/lib/forumHelpers.ts` y las páginas del foro:
//
//   GET    /community/forum?game=&category=      (público + JWT opcional)
//   POST   /community/forum                      (sesión)
//   DELETE /community/forum/:id                  (autor o moderador)
//   PATCH  /community/forum/:id/moderate         (owner/moderador)
//   POST   /community/forum/:id/react            (sesión; alterna reacción gg/fire)
//   GET    /community/forum/:id/comments         (público + JWT opcional)
//   POST   /community/forum/:id/comments         (sesión)
//   DELETE /community/forum/comments/:commentId  (autor, dueño del post o moderador)
//
// Los errores usan la forma de Express: { error: "..." }.

import { esOwner } from './comunidad.js';

const VALID_GAMES = new Set([
  'general', 'valorant', 'cs2', 'fortnite', 'fc27', 'smash',
  'warzone', 'freefire', 'lol', 'wildrift', 'mlbb', 'clashroyale',
]);
const VALID_CATEGORIES = new Set(['discusion', 'guia', 'highlight', 'torneo', 'debate']);
const VALID_REACTIONS = new Set(['gg', 'fire']);
const DEFAULT_OWNER_EMAILS = new Set(['geimerjhoan099@gmail.com']);

let tablasListas = false;
export function resetForoCacheForTests() {
  tablasListas = false;
}

async function ensureTablasForo(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_sub TEXT NOT NULL,
    author_nick TEXT NOT NULL,
    game_slug TEXT NOT NULL DEFAULT 'general',
    category TEXT NOT NULL DEFAULT 'discusion',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_forum_reactions (
    post_id INTEGER NOT NULL,
    user_sub TEXT NOT NULL,
    reaction TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (post_id, user_sub, reaction)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_forum_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_sub TEXT NOT NULL,
    author_nick TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  tablasListas = true;
}

function cleanSingleLine(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function validarPost(input) {
  const gameSlug = cleanSingleLine(input.gameSlug, 32).toLowerCase();
  if (!VALID_GAMES.has(gameSlug)) {
    return { ok: false, error: 'Selecciona uno de los 11 videojuegos del circuito VANTS o Comunidad General.' };
  }
  const category = cleanSingleLine(input.category, 24).toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    return { ok: false, error: 'Elige una etiqueta válida: Discusión, Guía / Lineup, Highlight, Torneo o Debate.' };
  }
  const title = cleanSingleLine(input.title, 120);
  if (title.length < 4) return { ok: false, error: 'Escribe un titular claro (mínimo 4 caracteres).' };
  const body = cleanMultiline(input.body, 1500);
  if (body.length < 10) return { ok: false, error: 'Desarrolla tu publicación un poco más (mínimo 10 caracteres).' };
  return { ok: true, data: { gameSlug, category, title, body } };
}

function validarComentario(raw) {
  const body = cleanMultiline(raw, 500);
  if (body.length < 2) return { ok: false, error: 'Escribe un comentario de al menos 2 caracteres.' };
  return { ok: true, body };
}

async function esModeradorForo(env, claims) {
  if (!claims || !claims.sub) return false;
  const email = String(claims.email || '').trim().toLowerCase();
  if (email && DEFAULT_OWNER_EMAILS.has(email)) return true;
  const extra = `${env.VANTS_ADMIN_EMAILS || ''},${env.ADMIN_EMAILS || ''}`
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email && extra.includes(email)) return true;
  return esOwner(env.DB, claims.sub).catch(() => false);
}

async function resolverNickJugador(db, claims) {
  const sub = claims && claims.sub ? String(claims.sub) : '';
  if (sub) {
    const p = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (p && (p.display_name || p.username)) return String(p.display_name || p.username).trim().slice(0, 60);
    const rk = await db.prepare('SELECT nick FROM integ_ranking WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (rk && rk.nick) return String(rk.nick).trim().slice(0, 60);
  }
  const fallback = (claims && claims.name) || (claims && claims.email ? String(claims.email).split('@')[0] : '') || 'Jugador';
  return String(fallback).trim().slice(0, 60) || 'Jugador';
}

function parseId(raw) {
  let s = '';
  try { s = decodeURIComponent(String(raw || '')); } catch { s = ''; }
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// El contrato Express expone userId numérico; aquí la identidad es el `sub`,
// que no se filtra al cliente (se usa isOwner/canDelete para permisos en UI).
function postRowBase(r) {
  return {
    id: Number(r.id),
    userId: 0,
    authorNick: r.author_nick,
    gameSlug: r.game_slug,
    category: r.category,
    title: r.title,
    body: r.body,
    pinned: Boolean(r.pinned),
    locked: Boolean(r.locked),
    createdAt: r.created_at,
  };
}

function commentRowBase(r) {
  return {
    id: Number(r.id),
    postId: Number(r.post_id),
    userId: 0,
    authorNick: r.author_nick,
    body: r.body,
    createdAt: r.created_at,
  };
}

function contarReacciones(rows) {
  const out = { gg: 0, fire: 0 };
  for (const r of rows) {
    if (r.reaction === 'gg') out.gg += 1;
    if (r.reaction === 'fire') out.fire += 1;
  }
  return out;
}

const err = (json, status, error) => json({ error }, status);

export async function rutasComunidadForo(req, env, url, p, m, { json, usuarioClaims }) {
  if (p !== '/community/forum' && !p.startsWith('/community/forum/')) return null;

  const db = env.DB;
  await ensureTablasForo(db);

  const opcional = async () => {
    const c = await usuarioClaims(req, env).catch(() => null);
    return c && c.sub ? c : null;
  };
  const requerida = async () => {
    const c = await usuarioClaims(req, env).catch(() => null);
    return c && c.sub ? c : null;
  };

  // GET /community/forum
  if (p === '/community/forum' && m === 'GET') {
    try {
      const claims = await opcional();
      const isMod = await esModeradorForo(env, claims);
      const viewerSub = claims ? String(claims.sub) : null;
      const game = (url.searchParams.get('game') || '').trim().toLowerCase();
      const category = (url.searchParams.get('category') || '').trim().toLowerCase();

      const where = [];
      const args = [];
      if (game) { where.push('game_slug = ?'); args.push(game); }
      if (category) { where.push('category = ?'); args.push(category); }
      const sql = `SELECT * FROM integ_community_forum_posts${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 120`;
      const postsRes = await db.prepare(sql).bind(...args).all();
      const rows = postsRes.results || [];
      if (rows.length === 0) return json({ posts: [], viewer: { isModerator: isMod } });

      const reactRes = await db.prepare('SELECT post_id, user_sub, reaction FROM integ_community_forum_reactions').all();
      const byPost = new Map();
      for (const r of reactRes.results || []) {
        const list = byPost.get(Number(r.post_id)) || [];
        list.push(r);
        byPost.set(Number(r.post_id), list);
      }
      const cntRes = await db.prepare('SELECT post_id, COUNT(*) AS total FROM integ_community_forum_comments GROUP BY post_id').all();
      const cmap = new Map();
      for (const c of cntRes.results || []) cmap.set(Number(c.post_id), Number(c.total) || 0);

      const posts = rows.map((row) => {
        const reacts = byPost.get(Number(row.id)) || [];
        const isOwner = Boolean(viewerSub && row.user_sub === viewerSub);
        return {
          ...postRowBase(row),
          reactions: contarReacciones(reacts),
          viewerReactions: viewerSub ? reacts.filter((r) => r.user_sub === viewerSub).map((r) => r.reaction) : [],
          commentsCount: cmap.get(Number(row.id)) || 0,
          isOwner,
          canDelete: isOwner || isMod,
          canModerate: isMod,
        };
      });
      return json({ posts, viewer: { isModerator: isMod } });
    } catch (e) {
      console.error('GET /community/forum failed:', e);
      return err(json, 500, 'No se pudieron cargar las publicaciones del muro.');
    }
  }

  // POST /community/forum
  if (p === '/community/forum' && m === 'POST') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para publicar en el muro.');
    try {
      const body = await req.json().catch(() => ({}));
      const v = validarPost({
        gameSlug: body?.gameSlug, category: body?.category, title: body?.title, body: body?.body,
      });
      if (!v.ok) return err(json, 400, v.error);
      const nick = await resolverNickJugador(db, claims);
      const isMod = await esModeradorForo(env, claims);
      const d = v.data;
      const row = await db.prepare(
        `INSERT INTO integ_community_forum_posts (user_sub, author_nick, game_slug, category, title, body, pinned, locked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?) RETURNING *`
      ).bind(String(claims.sub), nick, d.gameSlug, d.category, d.title, d.body, new Date().toISOString()).first();
      return json({
        post: {
          ...postRowBase(row),
          reactions: { gg: 0, fire: 0 },
          viewerReactions: [],
          commentsCount: 0,
          isOwner: true,
          canDelete: true,
          canModerate: isMod,
        },
      }, 201);
    } catch (e) {
      console.error('POST /community/forum failed:', e);
      return err(json, 500, 'No se pudo crear la publicación.');
    }
  }

  const parts = p.slice('/community/forum/'.length).split('/').filter(Boolean);

  // DELETE /community/forum/comments/:commentId
  if (parts[0] === 'comments' && parts.length === 2 && m === 'DELETE') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para continuar.');
    const commentId = parseId(parts[1]);
    if (!commentId) return err(json, 400, 'ID de comentario inválido.');
    try {
      const sub = String(claims.sub);
      const comment = await db.prepare('SELECT * FROM integ_community_forum_comments WHERE id = ?').bind(commentId).first();
      if (!comment) return err(json, 404, 'Comentario no encontrado.');
      const post = await db.prepare('SELECT user_sub FROM integ_community_forum_posts WHERE id = ?').bind(comment.post_id).first();
      const allowed = comment.user_sub === sub || (post && post.user_sub === sub) || (await esModeradorForo(env, claims));
      if (!allowed) return err(json, 403, 'No tienes permisos para eliminar este comentario.');
      await db.prepare('DELETE FROM integ_community_forum_comments WHERE id = ?').bind(commentId).run();
      return json({ deleted: true, id: commentId });
    } catch (e) {
      console.error('DELETE /community/forum/comments/:commentId failed:', e);
      return err(json, 500, 'No se pudo eliminar el comentario.');
    }
  }

  if (parts.length < 1 || parts.length > 2) return err(json, 404, 'no_encontrado');
  const action = parts[1] || '';

  // DELETE /community/forum/:id
  if (!action && m === 'DELETE') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para continuar.');
    const postId = parseId(parts[0]);
    if (!postId) return err(json, 400, 'ID de publicación inválido.');
    try {
      const post = await db.prepare('SELECT id, user_sub FROM integ_community_forum_posts WHERE id = ?').bind(postId).first();
      if (!post) return err(json, 404, 'Publicación no encontrada.');
      if (post.user_sub !== String(claims.sub) && !(await esModeradorForo(env, claims))) {
        return err(json, 403, 'No tienes permisos para eliminar esta publicación.');
      }
      await db.prepare('DELETE FROM integ_community_forum_reactions WHERE post_id = ?').bind(postId).run();
      await db.prepare('DELETE FROM integ_community_forum_comments WHERE post_id = ?').bind(postId).run();
      await db.prepare('DELETE FROM integ_community_forum_posts WHERE id = ?').bind(postId).run();
      return json({ deleted: true, id: postId });
    } catch (e) {
      console.error('DELETE /community/forum/:id failed:', e);
      return err(json, 500, 'No se pudo eliminar la publicación.');
    }
  }

  // PATCH /community/forum/:id/moderate
  if (action === 'moderate' && m === 'PATCH') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para continuar.');
    if (!(await esModeradorForo(env, claims))) {
      return err(json, 403, 'Solo administradores u owners pueden moderar publicaciones.');
    }
    const postId = parseId(parts[0]);
    if (!postId) return err(json, 400, 'ID de publicación inválido.');
    try {
      const body = await req.json().catch(() => ({}));
      const pinned = typeof body?.pinned === 'boolean' ? body.pinned : undefined;
      const locked = typeof body?.locked === 'boolean' ? body.locked : undefined;
      if (pinned === undefined && locked === undefined) {
        return err(json, 400, 'Indica si deseas fijar o bloquear la publicación.');
      }
      const existing = await db.prepare('SELECT * FROM integ_community_forum_posts WHERE id = ?').bind(postId).first();
      if (!existing) return err(json, 404, 'Publicación no encontrada.');
      const nextPinned = pinned === undefined ? Number(existing.pinned) : (pinned ? 1 : 0);
      const nextLocked = locked === undefined ? Number(existing.locked) : (locked ? 1 : 0);
      await db.prepare('UPDATE integ_community_forum_posts SET pinned = ?, locked = ? WHERE id = ?')
        .bind(nextPinned, nextLocked, postId).run();
      return json({ post: postRowBase({ ...existing, pinned: nextPinned, locked: nextLocked }) });
    } catch (e) {
      console.error('PATCH /community/forum/:id/moderate failed:', e);
      return err(json, 500, 'No se pudo moderar la publicación.');
    }
  }

  // POST /community/forum/:id/react
  if (action === 'react' && m === 'POST') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para reaccionar.');
    const postId = parseId(parts[0]);
    if (!postId) return err(json, 400, 'ID de publicación inválido.');
    try {
      const body = await req.json().catch(() => ({}));
      const reaction = String(body?.reaction || '').trim().toLowerCase();
      if (!VALID_REACTIONS.has(reaction)) return err(json, 400, "Reacción inválida. Usa 'gg' o 'fire'.");
      const sub = String(claims.sub);
      const post = await db.prepare('SELECT id FROM integ_community_forum_posts WHERE id = ?').bind(postId).first();
      if (!post) return err(json, 404, 'Publicación no encontrada.');
      const existing = await db.prepare(
        'SELECT reaction FROM integ_community_forum_reactions WHERE post_id = ? AND user_sub = ? AND reaction = ?'
      ).bind(postId, sub, reaction).first();
      let active;
      if (existing) {
        await db.prepare('DELETE FROM integ_community_forum_reactions WHERE post_id = ? AND user_sub = ? AND reaction = ?')
          .bind(postId, sub, reaction).run();
        active = false;
      } else {
        await db.prepare('INSERT INTO integ_community_forum_reactions (post_id, user_sub, reaction, created_at) VALUES (?, ?, ?, ?)')
          .bind(postId, sub, reaction, new Date().toISOString()).run();
        active = true;
      }
      const all = await db.prepare('SELECT user_sub, reaction FROM integ_community_forum_reactions WHERE post_id = ?').bind(postId).all();
      const rows = all.results || [];
      return json({
        ok: true,
        active,
        reactions: contarReacciones(rows),
        viewerReactions: rows.filter((r) => r.user_sub === sub).map((r) => r.reaction),
      });
    } catch (e) {
      console.error('POST /community/forum/:id/react failed:', e);
      return err(json, 500, 'No se pudo registrar la reacción.');
    }
  }

  // GET /community/forum/:id/comments
  if (action === 'comments' && m === 'GET') {
    const postId = parseId(parts[0]);
    if (!postId) return err(json, 400, 'ID de publicación inválido.');
    try {
      const claims = await opcional();
      const isMod = await esModeradorForo(env, claims);
      const viewerSub = claims ? String(claims.sub) : null;
      const post = await db.prepare('SELECT id, user_sub FROM integ_community_forum_posts WHERE id = ?').bind(postId).first();
      if (!post) return err(json, 404, 'Publicación no encontrada.');
      const res = await db.prepare(
        'SELECT * FROM integ_community_forum_comments WHERE post_id = ? ORDER BY created_at ASC, id ASC LIMIT 100'
      ).bind(postId).all();
      const isPostOwner = Boolean(viewerSub && post.user_sub === viewerSub);
      const comments = (res.results || []).map((row) => {
        const isOwner = Boolean(viewerSub && row.user_sub === viewerSub);
        return { ...commentRowBase(row), isOwner, canDelete: isOwner || isPostOwner || isMod };
      });
      return json({ comments });
    } catch (e) {
      console.error('GET /community/forum/:id/comments failed:', e);
      return err(json, 500, 'No se pudieron cargar los comentarios.');
    }
  }

  // POST /community/forum/:id/comments
  if (action === 'comments' && m === 'POST') {
    const claims = await requerida();
    if (!claims) return err(json, 401, 'Inicia sesión para comentar.');
    const postId = parseId(parts[0]);
    if (!postId) return err(json, 400, 'ID de publicación inválido.');
    try {
      const body = await req.json().catch(() => ({}));
      const v = validarComentario(body?.body);
      if (!v.ok) return err(json, 400, v.error);
      const isMod = await esModeradorForo(env, claims);
      const post = await db.prepare('SELECT id, locked FROM integ_community_forum_posts WHERE id = ?').bind(postId).first();
      if (!post) return err(json, 404, 'Publicación no encontrada.');
      if (post.locked && !isMod) {
        return err(json, 403, 'Los comentarios de esta publicación están cerrados por moderación.');
      }
      const nick = await resolverNickJugador(db, claims);
      const row = await db.prepare(
        `INSERT INTO integ_community_forum_comments (post_id, user_sub, author_nick, body, created_at)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      ).bind(postId, String(claims.sub), nick, v.body, new Date().toISOString()).first();
      return json({ comment: { ...commentRowBase(row), isOwner: true, canDelete: true } }, 201);
    } catch (e) {
      console.error('POST /community/forum/:id/comments failed:', e);
      return err(json, 500, 'No se pudo publicar el comentario.');
    }
  }

  return err(json, 404, 'no_encontrado');
}
