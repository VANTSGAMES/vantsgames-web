import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index.ts";
import {
  forumComments,
  forumPosts,
  forumReactions,
  type ForumCommentRow,
  type ForumPostRow,
} from "./schema.ts";
import type { ForumCategory, ForumReactionKind } from "../../client/src/lib/forumHelpers.ts";

export interface ForumPostWithMeta extends ForumPostRow {
  reactions: { gg: number; fire: number };
  viewerReactions: ForumReactionKind[];
  commentsCount: number;
  isOwner: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface ForumCommentWithMeta extends ForumCommentRow {
  isOwner: boolean;
  canDelete: boolean;
}

const DEFAULT_OWNER_EMAILS = ["geimerjhoan099@gmail.com"];

export function isCommunityModerator(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const configured = `${process.env.VANTS_ADMIN_EMAILS || ""},${process.env.ADMIN_EMAILS || ""}`
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allowList = new Set<string>([...DEFAULT_OWNER_EMAILS, ...configured]);
  return allowList.has(normalized);
}

/* ---------------- Resilient local JSON fallback when Cloud SQL socket is unavailable ---------------- */
interface StoredPost {
  id: number;
  userId: number;
  authorNick: string;
  gameSlug: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
}

interface StoredReaction {
  id: number;
  postId: number;
  userId: number;
  reaction: ForumReactionKind;
  createdAt: string;
}

interface StoredComment {
  id: number;
  postId: number;
  userId: number;
  authorNick: string;
  body: string;
  createdAt: string;
}

interface ForumFallbackStore {
  nextPostId: number;
  nextReactionId: number;
  nextCommentId: number;
  posts: StoredPost[];
  reactions: StoredReaction[];
  comments: StoredComment[];
}

const FALLBACK_DIR = path.resolve(process.cwd(), ".data");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "community-forum.json");

function isDbConnectionOrSchemaError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const code = e?.code || e?.cause?.code || "";
  const msg = `${e?.message || ""} ${e?.cause?.message || ""}`.toLowerCase();
  if (["ENOENT", "ECONNREFUSED", "ETIMEDOUT", "57P01", "08006", "08001", "42P01"].includes(code)) {
    return true;
  }
  return (
    msg.includes("connection terminated") ||
    msg.includes("enoent") ||
    msg.includes("econnrefused") ||
    msg.includes("does not exist") ||
    msg.includes("timeout expired")
  );
}

function readFallback(): ForumFallbackStore {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")) as Partial<ForumFallbackStore>;
      return {
        nextPostId: Number(parsed.nextPostId) || 1,
        nextReactionId: Number(parsed.nextReactionId) || 1,
        nextCommentId: Number(parsed.nextCommentId) || 1,
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        reactions: Array.isArray(parsed.reactions) ? parsed.reactions : [],
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      };
    }
  } catch (err) {
    console.warn("[communityForum] fallback store read reset:", (err as Error).message);
  }
  return {
    nextPostId: 1,
    nextReactionId: 1,
    nextCommentId: 1,
    posts: [],
    reactions: [],
    comments: [],
  };
}

function writeFallback(data: ForumFallbackStore): void {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, FALLBACK_FILE);
}

function toPostRow(p: StoredPost): ForumPostRow {
  return { ...p, createdAt: new Date(p.createdAt) };
}

function toCommentRow(c: StoredComment): ForumCommentRow {
  return { ...c, createdAt: new Date(c.createdAt) };
}

export async function listForumPosts(opts: {
  gameSlug?: string;
  category?: string;
  viewerUserId?: number | null;
  viewerIsModerator?: boolean;
}): Promise<ForumPostWithMeta[]> {
  const isMod = Boolean(opts.viewerIsModerator);
  try {
    const conditions = [];
    if (opts.gameSlug) conditions.push(eq(forumPosts.gameSlug, opts.gameSlug));
    if (opts.category) conditions.push(eq(forumPosts.category, opts.category));

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(forumPosts)
            .where(and(...conditions))
            .orderBy(desc(forumPosts.pinned), desc(forumPosts.createdAt))
            .limit(120)
        : await db
            .select()
            .from(forumPosts)
            .orderBy(desc(forumPosts.pinned), desc(forumPosts.createdAt))
            .limit(120);

    if (rows.length === 0) return [];

    const reactionCounts = await db
      .select({
        postId: forumReactions.postId,
        reaction: forumReactions.reaction,
        total: sql<number>`count(*)::int`,
      })
      .from(forumReactions)
      .groupBy(forumReactions.postId, forumReactions.reaction);

    const reactionMap = new Map<number, { gg: number; fire: number }>();
    for (const r of reactionCounts) {
      const entry = reactionMap.get(r.postId) || { gg: 0, fire: 0 };
      if (r.reaction === "gg") entry.gg = Number(r.total) || 0;
      if (r.reaction === "fire") entry.fire = Number(r.total) || 0;
      reactionMap.set(r.postId, entry);
    }

    const viewerReactionsMap = new Map<number, ForumReactionKind[]>();
    if (opts.viewerUserId) {
      const viewerRows = await db
        .select({ postId: forumReactions.postId, reaction: forumReactions.reaction })
        .from(forumReactions)
        .where(eq(forumReactions.userId, opts.viewerUserId));
      for (const vr of viewerRows) {
        if (vr.reaction !== "gg" && vr.reaction !== "fire") continue;
        const arr = viewerReactionsMap.get(vr.postId) || [];
        arr.push(vr.reaction);
        viewerReactionsMap.set(vr.postId, arr);
      }
    }

    const commentCounts = await db
      .select({
        postId: forumComments.postId,
        total: sql<number>`count(*)::int`,
      })
      .from(forumComments)
      .groupBy(forumComments.postId);

    const commentMap = new Map<number, number>();
    for (const c of commentCounts) {
      commentMap.set(c.postId, Number(c.total) || 0);
    }

    return rows.map((row) => {
      const isOwner = Boolean(opts.viewerUserId && row.userId === opts.viewerUserId);
      return {
        ...row,
        reactions: reactionMap.get(row.id) || { gg: 0, fire: 0 },
        viewerReactions: viewerReactionsMap.get(row.id) || [],
        commentsCount: commentMap.get(row.id) || 0,
        isOwner,
        canDelete: isOwner || isMod,
        canModerate: isMod,
      };
    });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const filtered = store.posts
      .filter((p) => {
        if (opts.gameSlug && p.gameSlug !== opts.gameSlug) return false;
        if (opts.category && p.category !== opts.category) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 120);

    return filtered.map((p) => {
      const postReacts = store.reactions.filter((r) => r.postId === p.id);
      const gg = postReacts.filter((r) => r.reaction === "gg").length;
      const fire = postReacts.filter((r) => r.reaction === "fire").length;
      const viewerReactions = opts.viewerUserId
        ? postReacts
            .filter((r) => r.userId === opts.viewerUserId)
            .map((r) => r.reaction)
        : [];
      const commentsCount = store.comments.filter((c) => c.postId === p.id).length;
      const isOwner = Boolean(opts.viewerUserId && p.userId === opts.viewerUserId);
      return {
        ...toPostRow(p),
        reactions: { gg, fire },
        viewerReactions,
        commentsCount,
        isOwner,
        canDelete: isOwner || isMod,
        canModerate: isMod,
      };
    });
  }
}

export async function createForumPost(input: {
  userId: number;
  authorNick: string;
  gameSlug: string;
  category: ForumCategory;
  title: string;
  body: string;
  isModerator: boolean;
}): Promise<ForumPostWithMeta> {
  try {
    const [created] = await db
      .insert(forumPosts)
      .values({
        userId: input.userId,
        authorNick: input.authorNick,
        gameSlug: input.gameSlug,
        category: input.category,
        title: input.title,
        body: input.body,
        pinned: false,
        locked: false,
      })
      .returning();

    return {
      ...created,
      reactions: { gg: 0, fire: 0 },
      viewerReactions: [],
      commentsCount: 0,
      isOwner: true,
      canDelete: true,
      canModerate: input.isModerator,
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const stored: StoredPost = {
      id: store.nextPostId++,
      userId: input.userId,
      authorNick: input.authorNick,
      gameSlug: input.gameSlug,
      category: input.category,
      title: input.title,
      body: input.body,
      pinned: false,
      locked: false,
      createdAt: new Date().toISOString(),
    };
    store.posts.push(stored);
    writeFallback(store);
    return {
      ...toPostRow(stored),
      reactions: { gg: 0, fire: 0 },
      viewerReactions: [],
      commentsCount: 0,
      isOwner: true,
      canDelete: true,
      canModerate: input.isModerator,
    };
  }
}

export async function deleteForumPostAuthorized(
  actorUserId: number,
  postId: number,
  isModerator: boolean,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const [post] = await db
      .select({ id: forumPosts.id, userId: forumPosts.userId })
      .from(forumPosts)
      .where(eq(forumPosts.id, postId))
      .limit(1);

    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };
    if (post.userId !== actorUserId && !isModerator) {
      return { ok: false, status: 403, error: "No tienes permisos para eliminar esta publicación." };
    }

    await db.delete(forumPosts).where(eq(forumPosts.id, postId));
    return { ok: true };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.posts.findIndex((p) => p.id === postId);
    if (idx === -1) return { ok: false, status: 404, error: "Publicación no encontrada." };
    if (store.posts[idx].userId !== actorUserId && !isModerator) {
      return { ok: false, status: 403, error: "No tienes permisos para eliminar esta publicación." };
    }
    store.posts.splice(idx, 1);
    store.reactions = store.reactions.filter((r) => r.postId !== postId);
    store.comments = store.comments.filter((c) => c.postId !== postId);
    writeFallback(store);
    return { ok: true };
  }
}

export async function moderateForumPost(
  postId: number,
  updates: { pinned?: boolean; locked?: boolean },
): Promise<{ ok: true; post: ForumPostRow } | { ok: false; status: number; error: string }> {
  try {
    const [existing] = await db
      .select()
      .from(forumPosts)
      .where(eq(forumPosts.id, postId))
      .limit(1);
    if (!existing) return { ok: false, status: 404, error: "Publicación no encontrada." };

    const [updated] = await db
      .update(forumPosts)
      .set({
        pinned: typeof updates.pinned === "boolean" ? updates.pinned : existing.pinned,
        locked: typeof updates.locked === "boolean" ? updates.locked : existing.locked,
      })
      .where(eq(forumPosts.id, postId))
      .returning();

    return { ok: true, post: updated };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const post = store.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };
    if (typeof updates.pinned === "boolean") post.pinned = updates.pinned;
    if (typeof updates.locked === "boolean") post.locked = updates.locked;
    writeFallback(store);
    return { ok: true, post: toPostRow(post) };
  }
}

export async function toggleForumReaction(input: {
  postId: number;
  userId: number;
  reaction: ForumReactionKind;
}): Promise<
  | { ok: true; active: boolean; reactions: { gg: number; fire: number }; viewerReactions: ForumReactionKind[] }
  | { ok: false; status: number; error: string }
> {
  try {
    const [post] = await db
      .select({ id: forumPosts.id })
      .from(forumPosts)
      .where(eq(forumPosts.id, input.postId))
      .limit(1);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };

    const [existing] = await db
      .select({ id: forumReactions.id })
      .from(forumReactions)
      .where(
        and(
          eq(forumReactions.postId, input.postId),
          eq(forumReactions.userId, input.userId),
          eq(forumReactions.reaction, input.reaction),
        ),
      )
      .limit(1);

    let active: boolean;
    if (existing) {
      await db.delete(forumReactions).where(eq(forumReactions.id, existing.id));
      active = false;
    } else {
      await db.insert(forumReactions).values({
        postId: input.postId,
        userId: input.userId,
        reaction: input.reaction,
      });
      active = true;
    }

    const allReacts = await db
      .select({ userId: forumReactions.userId, reaction: forumReactions.reaction })
      .from(forumReactions)
      .where(eq(forumReactions.postId, input.postId));

    const gg = allReacts.filter((r) => r.reaction === "gg").length;
    const fire = allReacts.filter((r) => r.reaction === "fire").length;
    const viewerReactions = allReacts
      .filter((r) => r.userId === input.userId && (r.reaction === "gg" || r.reaction === "fire"))
      .map((r) => r.reaction as ForumReactionKind);

    return { ok: true, active, reactions: { gg, fire }, viewerReactions };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const post = store.posts.find((p) => p.id === input.postId);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };

    const idx = store.reactions.findIndex(
      (r) =>
        r.postId === input.postId &&
        r.userId === input.userId &&
        r.reaction === input.reaction,
    );
    let active: boolean;
    if (idx !== -1) {
      store.reactions.splice(idx, 1);
      active = false;
    } else {
      store.reactions.push({
        id: store.nextReactionId++,
        postId: input.postId,
        userId: input.userId,
        reaction: input.reaction,
        createdAt: new Date().toISOString(),
      });
      active = true;
    }
    writeFallback(store);

    const postReacts = store.reactions.filter((r) => r.postId === input.postId);
    return {
      ok: true,
      active,
      reactions: {
        gg: postReacts.filter((r) => r.reaction === "gg").length,
        fire: postReacts.filter((r) => r.reaction === "fire").length,
      },
      viewerReactions: postReacts
        .filter((r) => r.userId === input.userId)
        .map((r) => r.reaction),
    };
  }
}

export async function listForumComments(opts: {
  postId: number;
  viewerUserId?: number | null;
  viewerIsModerator?: boolean;
}): Promise<{ ok: true; comments: ForumCommentWithMeta[] } | { ok: false; status: number; error: string }> {
  const isMod = Boolean(opts.viewerIsModerator);
  try {
    const [post] = await db
      .select({ id: forumPosts.id, userId: forumPosts.userId })
      .from(forumPosts)
      .where(eq(forumPosts.id, opts.postId))
      .limit(1);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };

    const rows = await db
      .select()
      .from(forumComments)
      .where(eq(forumComments.postId, opts.postId))
      .orderBy(asc(forumComments.createdAt))
      .limit(100);

    return {
      ok: true,
      comments: rows.map((row) => {
        const isOwner = Boolean(opts.viewerUserId && row.userId === opts.viewerUserId);
        const isPostOwner = Boolean(opts.viewerUserId && post.userId === opts.viewerUserId);
        return {
          ...row,
          isOwner,
          canDelete: isOwner || isPostOwner || isMod,
        };
      }),
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const post = store.posts.find((p) => p.id === opts.postId);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };

    const rows = store.comments
      .filter((c) => c.postId === opts.postId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 100);

    return {
      ok: true,
      comments: rows.map((row) => {
        const isOwner = Boolean(opts.viewerUserId && row.userId === opts.viewerUserId);
        const isPostOwner = Boolean(opts.viewerUserId && post.userId === opts.viewerUserId);
        return {
          ...toCommentRow(row),
          isOwner,
          canDelete: isOwner || isPostOwner || isMod,
        };
      }),
    };
  }
}

export async function createForumComment(input: {
  postId: number;
  userId: number;
  authorNick: string;
  body: string;
  isModerator: boolean;
}): Promise<{ ok: true; comment: ForumCommentWithMeta } | { ok: false; status: number; error: string }> {
  try {
    const [post] = await db
      .select({ id: forumPosts.id, locked: forumPosts.locked })
      .from(forumPosts)
      .where(eq(forumPosts.id, input.postId))
      .limit(1);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };
    if (post.locked && !input.isModerator) {
      return { ok: false, status: 403, error: "Los comentarios de esta publicación están cerrados por moderación." };
    }

    const [created] = await db
      .insert(forumComments)
      .values({
        postId: input.postId,
        userId: input.userId,
        authorNick: input.authorNick,
        body: input.body,
      })
      .returning();

    return {
      ok: true,
      comment: {
        ...created,
        isOwner: true,
        canDelete: true,
      },
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const post = store.posts.find((p) => p.id === input.postId);
    if (!post) return { ok: false, status: 404, error: "Publicación no encontrada." };
    if (post.locked && !input.isModerator) {
      return { ok: false, status: 403, error: "Los comentarios de esta publicación están cerrados por moderación." };
    }

    const stored: StoredComment = {
      id: store.nextCommentId++,
      postId: input.postId,
      userId: input.userId,
      authorNick: input.authorNick,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    store.comments.push(stored);
    writeFallback(store);

    return {
      ok: true,
      comment: {
        ...toCommentRow(stored),
        isOwner: true,
        canDelete: true,
      },
    };
  }
}

export async function deleteForumCommentAuthorized(
  actorUserId: number,
  commentId: number,
  isModerator: boolean,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const [comment] = await db
      .select()
      .from(forumComments)
      .where(eq(forumComments.id, commentId))
      .limit(1);
    if (!comment) return { ok: false, status: 404, error: "Comentario no encontrado." };

    const [post] = await db
      .select({ userId: forumPosts.userId })
      .from(forumPosts)
      .where(eq(forumPosts.id, comment.postId))
      .limit(1);

    const isAllowed =
      comment.userId === actorUserId || post?.userId === actorUserId || isModerator;
    if (!isAllowed) {
      return { ok: false, status: 403, error: "No tienes permisos para eliminar este comentario." };
    }

    await db.delete(forumComments).where(eq(forumComments.id, commentId));
    return { ok: true };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return { ok: false, status: 404, error: "Comentario no encontrado." };
    const comment = store.comments[idx];
    const post = store.posts.find((p) => p.id === comment.postId);
    const isAllowed =
      comment.userId === actorUserId || post?.userId === actorUserId || isModerator;
    if (!isAllowed) {
      return { ok: false, status: 403, error: "No tienes permisos para eliminar este comentario." };
    }
    store.comments.splice(idx, 1);
    writeFallback(store);
    return { ok: true };
  }
}
