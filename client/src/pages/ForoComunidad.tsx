import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Flame,
  Lock,
  MessageSquare,
  Pin,
  Plus,
  Send,
  Shield,
  ThumbsUp,
  Trash2,
  Unlock,
} from "lucide-react";
import { Empty, ErrorBox, GameTag, Initials, PageHead, Skel } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { JUEGOS } from "@/lib/juegos";
import { gameLabel } from "@/lib/format";
import { communityFetch, useCommunitySession } from "@/lib/communityApi";
import {
  FORUM_CATEGORIES,
  filterAndSortForumPosts,
  formatRelativeTimeEs,
  forumCategoryLabel,
  validateForumCommentDraft,
  validateForumPostDraft,
  type ForumCategory,
  type ForumCommentItem,
  type ForumPostItem,
  type ForumReactionKind,
  type ForumSortMode,
} from "@/lib/forumHelpers";

const CATEGORY_TONE: Record<ForumCategory, string> = {
  discusion: "tag",
  guia: "tag tag-ok",
  highlight: "tag tag-rojo",
  torneo: "tag tag-rojo",
  debate: "tag",
};

const EMPTY_POST_DRAFT = {
  gameSlug: "valorant",
  category: "discusion" as ForumCategory,
  title: "",
  body: "",
};

function CommentsSection({
  post,
  isAuthenticated,
  onRequireSignIn,
  onCountDelta,
}: {
  post: ForumPostItem;
  isAuthenticated: boolean;
  onRequireSignIn: () => void;
  onCountDelta: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<ForumCommentItem[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await communityFetch<{ comments: ForumCommentItem[] }>(
        `/api/community/forum/${post.id}/comments`,
      );
      setComments(data.comments || []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los comentarios.");
    } finally {
      setLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    const check = validateForumCommentDraft(body);
    if (!check.ok) {
      setFormError(check.error);
      return;
    }
    setSubmitting(true);
    try {
      const res = await communityFetch<{ comment: ForumCommentItem }>(
        `/api/community/forum/${post.id}/comments`,
        {
          method: "POST",
          body: { body: check.body },
          requireAuth: true,
        },
      );
      setComments((prev) => [...prev, res.comment]);
      setBody("");
      onCountDelta();
    } catch (err: any) {
      setFormError(err?.message || "No se pudo publicar el comentario.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (comment: ForumCommentItem) => {
    const ok = await confirm({
      title: "Eliminar comentario",
      description: "Este comentario desaparecerá permanentemente del hilo.",
      details: [comment.authorNick, comment.body.slice(0, 120)],
      confirmLabel: "Eliminar comentario",
      danger: true,
    });
    if (!ok) return;
    try {
      await communityFetch(`/api/community/forum/comments/${comment.id}`, {
        method: "DELETE",
        requireAuth: true,
      });
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      toast({ kind: "ok", title: "Comentario eliminado" });
      onCountDelta();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo eliminar", description: err?.message });
    }
  };

  return (
    <div
      className="mt-4 pt-4 grid gap-3"
      style={{ borderTop: "1px solid var(--linea-suave)" }}
      data-testid={`forum-comments-${post.id}`}
    >
      <div className="eyebrow">Comentarios ({comments.length})</div>

      {loading ? (
        <Skel h={44} n={2} />
      ) : error ? (
        <p className="small" style={{ color: "#ff5468" }}>{error}</p>
      ) : comments.length === 0 ? (
        <p className="small muted">Todavía no hay comentarios. Abre la conversación.</p>
      ) : (
        <div className="grid gap-2">
          {comments.map((c) => (
            <div
              key={c.id}
              className="p-3 grid gap-1.5"
              style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong className="small">{c.authorNick}</strong>
                  <span className="text-xs muted num">{formatRelativeTimeEs(c.createdAt)}</span>
                </div>
                {c.canDelete && (
                  <button
                    type="button"
                    className="text-xs muted hover:text-white inline-flex items-center gap-1"
                    onClick={() => handleDeleteComment(c)}
                    aria-label={`Eliminar comentario de ${c.authorNick}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    Eliminar
                  </button>
                )}
              </div>
              <p className="small" style={{ color: "var(--gris-1)", whiteSpace: "pre-line" }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {post.locked && !post.canModerate ? (
        <div
          className="p-3 small muted inline-flex items-center gap-2"
          style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Los comentarios de esta publicación fueron cerrados por moderación.
        </div>
      ) : isAuthenticated ? (
        <form onSubmit={handleCommentSubmit} className="grid gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              className="input w-full"
              placeholder="Escribe un comentario breve..."
              aria-label={`Comentar en ${post.title}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              required
            />
            <button
              type="submit"
              className="btn btn-sm btn-rojo shrink-0"
              disabled={submitting}
            >
              <Send className="w-3.5 h-3.5" aria-hidden />
              {submitting ? "Enviando…" : "Comentar"}
            </button>
          </div>
          {formError && (
            <p className="small" role="alert" style={{ color: "#ff5468" }}>
              {formError}
            </p>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 small" style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}>
          <span className="muted">Inicia sesión para responder en este hilo.</span>
          <button type="button" className="btn btn-sm btn-rojo" onClick={onRequireSignIn}>
            Iniciar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function ForumPostCard({
  post,
  isAuthenticated,
  onRequireSignIn,
  onMutated,
}: {
  post: ForumPostItem;
  isAuthenticated: boolean;
  onRequireSignIn: () => void;
  onMutated: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reactBusy, setReactBusy] = useState<ForumReactionKind | null>(null);
  const [modBusy, setModBusy] = useState(false);

  const hasGg = post.viewerReactions.includes("gg");
  const hasFire = post.viewerReactions.includes("fire");

  const handleReact = async (reaction: ForumReactionKind) => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    setReactBusy(reaction);
    try {
      await communityFetch(`/api/community/forum/${post.id}/react`, {
        method: "POST",
        body: { reaction },
        requireAuth: true,
      });
      onMutated();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo reaccionar", description: err?.message });
    } finally {
      setReactBusy(null);
    }
  };

  const handleModerate = async (updates: { pinned?: boolean; locked?: boolean }) => {
    setModBusy(true);
    try {
      await communityFetch(`/api/community/forum/${post.id}/moderate`, {
        method: "PATCH",
        body: updates,
        requireAuth: true,
      });
      toast({
        kind: "ok",
        title:
          updates.pinned !== undefined
            ? updates.pinned
              ? "Publicación fijada"
              : "Publicación desfijada"
            : updates.locked
              ? "Comentarios cerrados"
              : "Comentarios reabiertos",
      });
      onMutated();
    } catch (err: any) {
      toast({ kind: "error", title: "Error de moderación", description: err?.message });
    } finally {
      setModBusy(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: post.isOwner ? "Eliminar publicación" : "Moderar y eliminar publicación",
      description: "Se eliminará esta publicación junto con sus reacciones y comentarios.",
      details: [post.title, post.gameSlug === "general" ? "Comunidad General" : gameLabel(post.gameSlug)],
      confirmLabel: "Eliminar publicación",
      danger: true,
    });
    if (!ok) return;
    setModBusy(true);
    try {
      await communityFetch(`/api/community/forum/${post.id}`, {
        method: "DELETE",
        requireAuth: true,
      });
      toast({ kind: "ok", title: "Publicación eliminada" });
      onMutated();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo eliminar", description: err?.message });
    } finally {
      setModBusy(false);
    }
  };

  return (
    <article
      className="panel panel-pad grid gap-4"
      style={post.pinned ? { borderColor: "var(--linea)", boxShadow: "inset 0 2px 0 var(--rojo)" } : undefined}
      data-testid={`forum-post-${post.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Initials name={post.authorNick} size={38} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="small">{post.authorNick}</strong>
              <span className="text-xs muted num">· {formatRelativeTimeEs(post.createdAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {post.pinned && (
                <span className="tag tag-rojo inline-flex items-center gap-1">
                  <Pin className="w-3 h-3" aria-hidden /> Fijado
                </span>
              )}
              {post.locked && (
                <span className="tag inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" aria-hidden /> Cerrado
                </span>
              )}
              <span className={CATEGORY_TONE[post.category] || "tag"}>
                {forumCategoryLabel(post.category)}
              </span>
              {post.gameSlug === "general" ? (
                <span className="tag">General</span>
              ) : (
                <GameTag g={post.gameSlug} />
              )}
            </div>
          </div>
        </div>

        {(post.canModerate || post.canDelete) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {post.canModerate && (
              <>
                <button
                  type="button"
                  className={"btn btn-sm " + (post.pinned ? "btn-rojo" : "btn-ghost")}
                  disabled={modBusy}
                  onClick={() => handleModerate({ pinned: !post.pinned })}
                  aria-label={post.pinned ? `Desfijar ${post.title}` : `Fijar ${post.title}`}
                >
                  <Pin className="w-3.5 h-3.5" aria-hidden />
                  {post.pinned ? "Desfijar" : "Fijar"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={modBusy}
                  onClick={() => handleModerate({ locked: !post.locked })}
                  aria-label={post.locked ? `Abrir comentarios en ${post.title}` : `Cerrar comentarios en ${post.title}`}
                >
                  {post.locked ? (
                    <>
                      <Unlock className="w-3.5 h-3.5" aria-hidden /> Abrir
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" aria-hidden /> Cerrar
                    </>
                  )}
                </button>
              </>
            )}
            {post.canDelete && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={modBusy}
                onClick={handleDelete}
                aria-label={`Eliminar publicación ${post.title}`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="d-3">{post.title}</h3>
        <p className="small" style={{ color: "var(--gris-1)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
          {post.body}
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 pt-3"
        style={{ borderTop: "1px solid var(--linea-suave)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={"btn btn-sm " + (hasGg ? "btn-rojo" : "btn-ghost")}
            aria-pressed={hasGg}
            disabled={reactBusy === "gg"}
            onClick={() => handleReact("gg")}
            aria-label={`Reaccionar GG a ${post.title}`}
            data-testid={`forum-react-gg-${post.id}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" aria-hidden />
            GG <span className="num">{post.reactions.gg}</span>
          </button>

          <button
            type="button"
            className={"btn btn-sm " + (hasFire ? "btn-rojo" : "btn-ghost")}
            aria-pressed={hasFire}
            disabled={reactBusy === "fire"}
            onClick={() => handleReact("fire")}
            aria-label={`Reaccionar Fuego a ${post.title}`}
            data-testid={`forum-react-fire-${post.id}`}
          >
            <Flame className="w-3.5 h-3.5" aria-hidden />
            Fuego <span className="num">{post.reactions.fire}</span>
          </button>
        </div>

        <button
          type="button"
          className={"btn btn-sm " + (commentsOpen ? "" : "btn-ghost")}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((v) => !v)}
          data-testid={`forum-toggle-comments-${post.id}`}
        >
          <MessageSquare className="w-3.5 h-3.5" aria-hidden />
          Comentarios (<span className="num">{post.commentsCount}</span>)
        </button>
      </div>

      {commentsOpen && (
        <CommentsSection
          post={post}
          isAuthenticated={isAuthenticated}
          onRequireSignIn={onRequireSignIn}
          onCountDelta={onMutated}
        />
      )}
    </article>
  );
}

export default function ForoComunidad() {
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const session = useCommunitySession();

  const [game, setGame] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [sort, setSort] = useState<ForumSortMode>("recent");
  const [search, setSearch] = useState<string>("");
  const [composerOpen, setComposerOpen] = useState(false);

  const [draft, setDraft] = useState(EMPTY_POST_DRAFT);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const forumQuery = useQuery<{ posts: ForumPostItem[]; viewer?: { isModerator: boolean } }>({
    queryKey: ["community-forum", session.isAuthenticated, session.displayName],
    queryFn: () =>
      communityFetch<{ posts: ForumPostItem[]; viewer?: { isModerator: boolean } }>(
        "/api/community/forum",
      ),
    staleTime: 20_000,
  });

  const allPosts = forumQuery.data?.posts || [];
  const isModerator = Boolean(forumQuery.data?.viewer?.isModerator);

  const visiblePosts = useMemo(
    () =>
      filterAndSortForumPosts(allPosts, {
        game,
        category,
        query: search,
        sort,
      }),
    [allPosts, game, category, search, sort],
  );

  const refreshForum = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["community-forum"] });
  }, [queryClient]);

  const handleSignIn = async () => {
    try {
      await session.signIn("/comunidad/foro");
      refreshForum();
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo iniciar sesión",
        description: err?.message || "Inténtalo nuevamente.",
      });
    }
  };

  const handleToggleComposer = () => {
    if (!session.isAuthenticated) {
      handleSignIn();
      return;
    }
    setPublishError(null);
    if (game) {
      setDraft((d) => ({ ...d, gameSlug: game }));
    }
    setComposerOpen((v) => !v);
  };

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    setPublishError(null);
    const check = validateForumPostDraft(draft);
    if (!check.ok) {
      setPublishError(check.error);
      return;
    }
    setPublishBusy(true);
    try {
      await communityFetch("/api/community/forum", {
        method: "POST",
        body: check.data,
        requireAuth: true,
      });
      toast({
        kind: "ok",
        title: "Publicación creada",
        description: "Ya está visible en el muro de comunidad.",
      });
      setDraft({ ...EMPTY_POST_DRAFT, gameSlug: draft.gameSlug, category: draft.category });
      setComposerOpen(false);
      refreshForum();
    } catch (err: any) {
      setPublishError(err?.message || "No se pudo crear la publicación.");
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Fase 2"
        title={
          <>
            Muro y <span style={{ color: "var(--rojo)" }}>Foro por Juego</span>
          </>
        }
        lead="Publicaciones cortas de la comunidad VANTS organizadas por videojuego y etiqueta: discusiones, guías y lineups, highlights, seguimiento de torneos y debates."
        actions={
          <button
            type="button"
            className="btn btn-rojo"
            onClick={handleToggleComposer}
            disabled={session.authBusy}
            data-testid="forum-open-composer"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {composerOpen
              ? "Cerrar editor"
              : session.isAuthenticated
                ? "Nueva publicación"
                : session.authBusy
                  ? "Conectando…"
                  : "Iniciar sesión y publicar"}
          </button>
        }
      />

      <div className="wrap pb-16 grid gap-6 overflow-x-clip">
        {/* Session & Moderation status strip */}
        <div
          className="panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 small min-w-0"
          style={{ borderColor: "var(--linea-suave)" }}
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" style={{ color: "var(--rojo)" }} aria-hidden />
            {session.isAuthenticated ? (
              <span className="min-w-0">
                Sesión activa como{" "}
                <strong style={{ color: "var(--blanco)" }}>{session.displayName}</strong>
                {isModerator ? " · Moderación habilitada (fijar, cerrar y eliminar hilos)." : " · Puedes publicar, reaccionar (GG / Fuego) y comentar."}
              </span>
            ) : (
              <span className="muted min-w-0">
                Lee cualquier hilo libremente. Inicia sesión para publicar en el muro, reaccionar con GG/Fuego o comentar.
              </span>
            )}
          </div>
          <span className="num muted text-xs shrink-0">
            {visiblePosts.length} {visiblePosts.length === 1 ? "publicación" : "publicaciones"}
          </span>
        </div>

        {/* Publish composer */}
        {composerOpen && session.isAuthenticated && (
          <section
            className="panel panel-pad chamfer grid gap-5 min-w-0"
            aria-label="Nueva publicación en el muro de comunidad"
            style={{ borderColor: "var(--linea)", boxShadow: "inset 0 2px 0 var(--rojo)" }}
            data-testid="forum-composer"
          >
            <div>
              <div className="eyebrow">Nueva publicación</div>
              <h2 className="d-2 mt-1">Compartir en el muro</h2>
            </div>

            <form onSubmit={handlePublish} className="grid gap-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2" role="group" aria-label="Etiqueta">
                {FORUM_CATEGORIES.map((cat) => {
                  const active = draft.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, category: cat.id }))}
                      aria-pressed={active}
                      className="p-3 text-left transition-colors"
                      style={{
                        background: active ? "var(--grafito-2)" : "var(--negro)",
                        border: `1px solid ${active ? "var(--rojo)" : "var(--linea-suave)"}`,
                      }}
                      data-testid={`forum-draft-cat-${cat.id}`}
                    >
                      <div className="d-3 text-xs">{cat.label}</div>
                      <p className="text-xs muted mt-1 leading-snug">{cat.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid md:grid-cols-[240px_1fr] gap-4">
                <label className="grid gap-1.5 small">
                  <span className="muted">Videojuego *</span>
                  <select
                    className="input"
                    value={draft.gameSlug}
                    onChange={(e) => setDraft((d) => ({ ...d, gameSlug: e.target.value }))}
                    data-testid="forum-draft-game"
                  >
                    <option value="general">General · Circuito VANTS</option>
                    {JUEGOS.map((j) => (
                      <option key={j.slug} value={j.slug}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 small">
                  <span className="muted">Titular *</span>
                  <input
                    className="input"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Ej. Lineup post-plant de Sova en Ascent A / Análisis del último torneo"
                    maxLength={120}
                    required
                    data-testid="forum-draft-title"
                  />
                </label>
              </div>

              <label className="grid gap-1.5 small">
                <div className="flex items-center justify-between gap-2">
                  <span className="muted">Contenido *</span>
                  <span className="text-xs muted num">{draft.body.length}/1500</span>
                </div>
                <textarea
                  className="input"
                  rows={4}
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  placeholder="Comparte tu guía, táctica, debate o enlace a una jugada..."
                  maxLength={1500}
                  required
                  data-testid="forum-draft-body"
                />
              </label>

              {publishError && (
                <p className="small" role="alert" style={{ color: "#ff5468" }}>
                  {publishError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setComposerOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-rojo"
                  disabled={publishBusy}
                  data-testid="forum-publish-submit"
                >
                  {publishBusy ? "Publicando…" : "Publicar en el muro"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Filters: 11 games + General + Category tabs + Sort + Search */}
        <section className="grid gap-4 min-w-0" aria-label="Filtros del muro">
          <div className="flex flex-wrap gap-1.5 min-w-0" role="group" aria-label="Filtrar por videojuego">
            <button
              type="button"
              className={"btn btn-sm " + (game === "" ? "btn-rojo" : "btn-ghost")}
              aria-pressed={game === ""}
              onClick={() => setGame("")}
              data-testid="forum-game-all"
            >
              Todos los juegos
            </button>
            <button
              type="button"
              className={"btn btn-sm " + (game === "general" ? "btn-rojo" : "btn-ghost")}
              aria-pressed={game === "general"}
              onClick={() => setGame("general")}
              data-testid="forum-game-general"
            >
              General
            </button>
            {JUEGOS.map((j) => (
              <button
                key={j.slug}
                type="button"
                className={"btn btn-sm " + (game === j.slug ? "btn-rojo" : "btn-ghost")}
                aria-pressed={game === j.slug}
                onClick={() => setGame(j.slug)}
                data-testid={`forum-game-${j.slug}`}
              >
                {j.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 min-w-0">
            <div className="tabs flex-wrap max-w-full" role="tablist" aria-label="Filtrar por etiqueta">
              <button
                type="button"
                role="tab"
                aria-selected={category === ""}
                className="tab"
                onClick={() => setCategory("")}
                data-testid="forum-cat-all"
              >
                Todas
              </button>
              {FORUM_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={category === cat.id}
                  className="tab"
                  onClick={() => setCategory(cat.id)}
                  data-testid={`forum-cat-${cat.id}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-[175px_minmax(0,250px)] gap-2 w-full lg:w-auto">
              <select
                className="input w-full"
                aria-label="Ordenar publicaciones"
                value={sort}
                onChange={(e) => setSort(e.target.value as ForumSortMode)}
                data-testid="forum-sort-select"
              >
                <option value="recent">Más recientes</option>
                <option value="reactions">Más apoyados</option>
                <option value="comments">Más comentados</option>
              </select>

              <input
                type="search"
                className="input w-full"
                aria-label="Buscar en el muro por título, autor o contenido"
                placeholder="Buscar tema, guía o autor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="forum-search-input"
              />
            </div>
          </div>
        </section>

        {/* Posts Feed */}
        {forumQuery.isLoading ? (
          <Skel h={150} n={3} />
        ) : forumQuery.error ? (
          <ErrorBox
            error={{ code: "foro_error" }}
            what="el muro de comunidad"
            onRetry={() => forumQuery.refetch()}
          />
        ) : visiblePosts.length === 0 ? (
          <Empty
            code={game ? `foro · ${game}` : category ? `foro · ${category}` : "foro · 0"}
            title={
              allPosts.length === 0
                ? "El muro de comunidad aún está vacío"
                : "No hay publicaciones con estos filtros"
            }
            text={
              allPosts.length === 0
                ? "Publica una discusión, guía o lineup, highlight, debate o análisis de torneo en cualquiera de los 11 juegos de VANTS."
                : "Prueba cambiando la etiqueta o el videojuego seleccionado, o inicia un nuevo hilo ahora mismo."
            }
            action={
              <div className="flex flex-wrap gap-2 mt-1">
                {(game || category || search) && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setGame("");
                      setCategory("");
                      setSearch("");
                    }}
                  >
                    Ver todo el muro
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-rojo"
                  onClick={handleToggleComposer}
                >
                  {session.isAuthenticated ? "Nueva publicación" : "Iniciar sesión y publicar"}
                </button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-4" data-testid="forum-posts-list">
            {visiblePosts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                isAuthenticated={session.isAuthenticated}
                onRequireSignIn={handleSignIn}
                onMutated={refreshForum}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
