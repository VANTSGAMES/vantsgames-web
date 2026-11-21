import { JUEGOS } from "./juegos";

export type ForumCategory = "discusion" | "guia" | "highlight" | "torneo" | "debate";
export type ForumReactionKind = "gg" | "fire";
export type ForumSortMode = "recent" | "reactions" | "comments";

export const FORUM_CATEGORIES: { id: ForumCategory; label: string; desc: string }[] = [
  { id: "discusion", label: "Discusión", desc: "Charla abierta, parches y meta actual." },
  { id: "guia", label: "Guía / Lineup", desc: "Ejecuciones, builds, consejos y tácticas." },
  { id: "highlight", label: "Highlight", desc: "Jugadas clave, clutches y momentos épicos." },
  { id: "torneo", label: "Torneo", desc: "Seguimiento de brackets, resultados y llaves." },
  { id: "debate", label: "Debate", desc: "Opiniones competitivas y encuestas abiertas." },
];

export const FORUM_REACTIONS: { id: ForumReactionKind; label: string }[] = [
  { id: "gg", label: "GG" },
  { id: "fire", label: "Fuego" },
];

export interface ForumPostItem {
  id: number;
  userId: number;
  authorNick: string;
  gameSlug: string;
  category: ForumCategory;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  reactions: {
    gg: number;
    fire: number;
  };
  viewerReactions: ForumReactionKind[];
  commentsCount: number;
  isOwner: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface ForumCommentItem {
  id: number;
  postId: number;
  userId: number;
  authorNick: string;
  body: string;
  createdAt: string;
  isOwner: boolean;
  canDelete: boolean;
}

export interface ForumPostDraftInput {
  gameSlug: string;
  category: string;
  title: string;
  body: string;
}

export interface ForumPostValidatedDraft {
  gameSlug: string;
  category: ForumCategory;
  title: string;
  body: string;
}

const VALID_GAMES = new Set<string>(["general", ...JUEGOS.map((j) => j.slug)]);
const VALID_CATEGORIES = new Set<string>(FORUM_CATEGORIES.map((c) => c.id));
const VALID_REACTIONS = new Set<string>(FORUM_REACTIONS.map((r) => r.id));

function cleanSingleLine(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

export function isValidForumReaction(value: unknown): value is ForumReactionKind {
  return typeof value === "string" && VALID_REACTIONS.has(value.trim().toLowerCase());
}

export function validateForumPostDraft(
  input: ForumPostDraftInput,
): { ok: true; data: ForumPostValidatedDraft } | { ok: false; error: string } {
  const gameSlug = cleanSingleLine(input.gameSlug, 32).toLowerCase();
  if (!VALID_GAMES.has(gameSlug)) {
    return {
      ok: false,
      error: "Selecciona uno de los 11 videojuegos del circuito VANTS o Comunidad General.",
    };
  }

  const category = cleanSingleLine(input.category, 24).toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    return {
      ok: false,
      error: "Elige una etiqueta válida: Discusión, Guía / Lineup, Highlight, Torneo o Debate.",
    };
  }

  const title = cleanSingleLine(input.title, 120);
  if (title.length < 4) {
    return { ok: false, error: "Escribe un titular claro (mínimo 4 caracteres)." };
  }

  const body = cleanMultiline(input.body, 1500);
  if (body.length < 10) {
    return { ok: false, error: "Desarrolla tu publicación un poco más (mínimo 10 caracteres)." };
  }

  return {
    ok: true,
    data: {
      gameSlug,
      category: category as ForumCategory,
      title,
      body,
    },
  };
}

export function validateForumCommentDraft(
  bodyInput: unknown,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = cleanMultiline(bodyInput, 500);
  if (body.length < 2) {
    return { ok: false, error: "Escribe un comentario de al menos 2 caracteres." };
  }
  return { ok: true, body };
}

function normSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterAndSortForumPosts<
  T extends Pick<
    ForumPostItem,
    "gameSlug" | "category" | "title" | "body" | "authorNick" | "pinned" | "createdAt" | "reactions" | "commentsCount"
  >,
>(
  posts: T[],
  opts: {
    game?: string;
    category?: string;
    query?: string;
    sort?: ForumSortMode;
  },
): T[] {
  const game = (opts.game || "").trim().toLowerCase();
  const category = (opts.category || "").trim().toLowerCase();
  const q = normSearch(opts.query || "");
  const sort: ForumSortMode = opts.sort || "recent";

  const filtered = posts.filter((post) => {
    if (game && post.gameSlug.toLowerCase() !== game) return false;
    if (category && post.category.toLowerCase() !== category) return false;
    if (q) {
      const hay = normSearch([post.title, post.body, post.authorNick].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "reactions") {
      const totalA = (a.reactions?.gg || 0) + (a.reactions?.fire || 0);
      const totalB = (b.reactions?.gg || 0) + (b.reactions?.fire || 0);
      if (totalB !== totalA) return totalB - totalA;
    } else if (sort === "comments") {
      if (b.commentsCount !== a.commentsCount) return b.commentsCount - a.commentsCount;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function formatRelativeTimeEs(iso: string, nowMs = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Recién publicado";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "Hace un momento";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `Hace ${diffDay} d`;
  return new Date(ts).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function forumCategoryLabel(cat: string): string {
  return FORUM_CATEGORIES.find((c) => c.id === cat)?.label || cat;
}
