import test from "node:test";
import assert from "node:assert/strict";
import { JUEGOS } from "../client/src/lib/juegos";
import {
  FORUM_CATEGORIES,
  filterAndSortForumPosts,
  formatRelativeTimeEs,
  isValidForumReaction,
  validateForumCommentDraft,
  validateForumPostDraft,
} from "../client/src/lib/forumHelpers";

test("validateForumPostDraft accepts all 11 VANTS games + general and all 5 categories", () => {
  assert.equal(FORUM_CATEGORIES.length, 5);
  for (const juego of [...JUEGOS.map((j) => j.slug), "general"]) {
    const res = validateForumPostDraft({
      gameSlug: juego,
      category: "guia",
      title: `Guía táctica para ${juego}`,
      body: "Posicionamiento inicial, economía y rotaciones clave para torneos VANTS.",
    });
    assert.equal(res.ok, true, `Expected valid post for ${juego}`);
  }
  for (const cat of FORUM_CATEGORIES) {
    const res = validateForumPostDraft({
      gameSlug: "valorant",
      category: cat.id,
      title: `Tema de ${cat.label}`,
      body: "Contenido suficientemente detallado para validar la publicación del muro.",
    });
    assert.equal(res.ok, true, `Expected valid category ${cat.id}`);
  }
});

test("validateForumPostDraft rejects unknown game, unknown category, or short title/body", () => {
  assert.equal(
    validateForumPostDraft({
      gameSlug: "overwatch",
      category: "discusion",
      title: "Hilo inválido",
      body: "Este juego no pertenece al circuito de 11 títulos de VANTS.",
    }).ok,
    false,
  );
  assert.equal(
    validateForumPostDraft({
      gameSlug: "cs2",
      category: "spam",
      title: "Etiqueta inválida",
      body: "Contenido con categoría fuera de la lista blanca.",
    }).ok,
    false,
  );
  assert.equal(
    validateForumPostDraft({
      gameSlug: "cs2",
      category: "debate",
      title: "Hey",
      body: "Demasiado corto",
    }).ok,
    false,
  );
  assert.equal(
    validateForumPostDraft({
      gameSlug: "cs2",
      category: "debate",
      title: "Titular correcto",
      body: "Corto",
    }).ok,
    false,
  );
});

test("validateForumCommentDraft and isValidForumReaction enforce bounds", () => {
  assert.equal(validateForumCommentDraft("Excelente lineup!").ok, true);
  assert.equal(validateForumCommentDraft("x").ok, false);
  assert.equal(isValidForumReaction("gg"), true);
  assert.equal(isValidForumReaction("fire"), true);
  assert.equal(isValidForumReaction("dislike"), false);
});

test("filterAndSortForumPosts keeps pinned posts first, isolates by game/category, and supports sorting + accent-insensitive search", () => {
  const posts = [
    {
      id: 1,
      gameSlug: "valorant",
      category: "guia" as const,
      title: "Lineups de Sova en Ascent",
      body: "Flechas para retomar sitio A desde árbol.",
      authorNick: "Kael",
      pinned: false,
      createdAt: "2026-05-10T10:00:00.000Z",
      reactions: { gg: 8, fire: 4 },
      commentsCount: 2,
    },
    {
      id: 2,
      gameSlug: "cs2",
      category: "torneo" as const,
      title: "Reglamento Copa Caracas CS2",
      body: "Check-in 30 minutos antes en servidor Miami.",
      authorNick: "AdminVANTS",
      pinned: true,
      createdAt: "2026-05-08T10:00:00.000Z",
      reactions: { gg: 2, fire: 1 },
      commentsCount: 1,
    },
    {
      id: 3,
      gameSlug: "valorant",
      category: "debate" as const,
      title: "Mejor duelista del parche actual",
      body: "Opiniones sobre Neon vs Jett en competitivo.",
      authorNick: "Miro",
      pinned: false,
      createdAt: "2026-05-11T10:00:00.000Z",
      reactions: { gg: 1, fire: 1 },
      commentsCount: 14,
    },
  ];

  // Pinned stays first regardless of sort
  const recent = filterAndSortForumPosts(posts, { sort: "recent" });
  assert.deepEqual(recent.map((p) => p.id), [2, 3, 1]);

  const byReactions = filterAndSortForumPosts(posts, { sort: "reactions" });
  assert.deepEqual(byReactions.map((p) => p.id), [2, 1, 3]);

  const byComments = filterAndSortForumPosts(posts, { sort: "comments" });
  assert.deepEqual(byComments.map((p) => p.id), [2, 3, 1]);

  // Strict game isolation
  const valOnly = filterAndSortForumPosts(posts, { game: "valorant" });
  assert.deepEqual(valOnly.map((p) => p.id), [3, 1]);

  // Accent-insensitive search
  const treeSearch = filterAndSortForumPosts(posts, { query: "arbol" });
  assert.deepEqual(treeSearch.map((p) => p.id), [1]);
});

test("formatRelativeTimeEs formats recent timestamps cleanly", () => {
  const now = Date.parse("2026-05-10T12:00:00.000Z");
  assert.equal(formatRelativeTimeEs("2026-05-10T11:59:30.000Z", now), "Hace un momento");
  assert.equal(formatRelativeTimeEs("2026-05-10T11:45:00.000Z", now), "Hace 15 min");
  assert.equal(formatRelativeTimeEs("2026-05-10T09:00:00.000Z", now), "Hace 3 h");
  assert.equal(formatRelativeTimeEs("2026-05-07T12:00:00.000Z", now), "Hace 3 d");
});
