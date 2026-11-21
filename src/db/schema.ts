import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  photoUrl: text("photo_url"),
  preferredGame: text("preferred_game"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tacticalNotes = pgTable("tactical_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  gameSlug: text("game_slug"),
  category: text("category").notNull().default("estrategia"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaceLinks = pgTable("workspace_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  service: text("service").notNull(),
  resourceId: text("resource_id").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  gameSlug: text("game_slug"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournamentBookmarks = pgTable("tournament_bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  tournamentSlug: text("tournament_slug").notNull(),
  tournamentName: text("tournament_name").notNull(),
  gameSlug: text("game_slug"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lfgListings = pgTable("lfg_listings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  authorNick: text("author_nick").notNull(),
  type: text("type").notNull(), // "lft" | "lfg" | "scrim"
  gameSlug: text("game_slug").notNull(),
  title: text("title").notNull(),
  teamName: text("team_name"),
  roleNeeded: text("role_needed").notNull(),
  rankLevel: text("rank_level").notNull(),
  schedule: text("schedule").notNull(),
  region: text("region").notNull().default("VE"),
  slotsOpen: integer("slots_open").notNull().default(1),
  contact: text("contact").notNull(),
  notes: text("notes"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lfgApplications = pgTable("lfg_applications", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => lfgListings.id, { onDelete: "cascade" })
    .notNull(),
  applicantUserId: integer("applicant_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  applicantNick: text("applicant_nick").notNull(),
  role: text("role").notNull(),
  contact: text("contact").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "accepted" | "declined"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const forumPosts = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  authorNick: text("author_nick").notNull(),
  gameSlug: text("game_slug").notNull(), // one of 11 VANTS games or "general"
  category: text("category").notNull(), // "discusion" | "guia" | "highlight" | "torneo" | "debate"
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const forumReactions = pgTable(
  "forum_reactions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => forumPosts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    reaction: text("reaction").notNull(), // "gg" | "fire"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniquePostUserReaction: uniqueIndex("forum_reactions_post_user_kind_idx").on(
      t.postId,
      t.userId,
      t.reaction,
    ),
  }),
);

export const forumComments = pgTable("forum_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .references(() => forumPosts.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  authorNick: text("author_nick").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const missionProgress = pgTable(
  "mission_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userNick: text("user_nick").notNull(),
    weekKey: text("week_key").notNull(), // e.g. "2026-W47"
    missionCode: text("mission_code").notNull(),
    progressCount: integer("progress_count").notNull().default(0),
    claimed: boolean("claimed").notNull().default(false),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    proofNote: text("proof_note"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueUserWeekMission: uniqueIndex("mission_progress_user_week_code_idx").on(
      t.userId,
      t.weekKey,
      t.missionCode,
    ),
  }),
);

export const communityPolls = pgTable("community_polls", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // "torneo" | "mvp_clip" | "comunidad"
  title: text("title").notNull(),
  description: text("description").notNull(),
  gameSlug: text("game_slug"),
  badge: text("badge").notNull(),
  optionsJson: text("options_json").notNull(),
  status: text("status").notNull().default("open"), // "open" | "closed"
  closesAt: timestamp("closes_at").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const communityPollVotes = pgTable(
  "community_poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: text("poll_id")
      .references(() => communityPolls.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userNick: text("user_nick").notNull(),
    optionId: text("option_id").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniquePollUserVote: uniqueIndex("community_poll_votes_poll_user_idx").on(
      t.pollId,
      t.userId,
    ),
  }),
);

export const pickemMatches = pgTable("pickem_matches", {
  id: text("id").primaryKey(),
  stage: text("stage").notNull(), // "semifinal" | "final"
  tournamentName: text("tournament_name").notNull(),
  gameSlug: text("game_slug").notNull(),
  teamAJson: text("team_a_json").notNull(),
  teamBJson: text("team_b_json").notNull(),
  bestOf: text("best_of").notNull().default("Bo3"),
  startsAt: timestamp("starts_at").notNull(),
  points: integer("points").notNull().default(10),
  locked: boolean("locked").notNull().default(false),
  winnerId: text("winner_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pickemPredictions = pgTable(
  "pickem_predictions",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .references(() => pickemMatches.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userNick: text("user_nick").notNull(),
    pickedTeamId: text("picked_team_id").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueMatchUserPrediction: uniqueIndex("pickem_predictions_match_user_idx").on(
      t.matchId,
      t.userId,
    ),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  tacticalNotes: many(tacticalNotes),
  workspaceLinks: many(workspaceLinks),
  tournamentBookmarks: many(tournamentBookmarks),
  lfgListings: many(lfgListings),
  lfgApplications: many(lfgApplications),
  forumPosts: many(forumPosts),
  forumReactions: many(forumReactions),
  forumComments: many(forumComments),
  missionProgress: many(missionProgress),
  communityPollVotes: many(communityPollVotes),
  pickemPredictions: many(pickemPredictions),
}));

export const tacticalNotesRelations = relations(tacticalNotes, ({ one }) => ({
  author: one(users, {
    fields: [tacticalNotes.userId],
    references: [users.id],
  }),
}));

export const workspaceLinksRelations = relations(workspaceLinks, ({ one }) => ({
  owner: one(users, {
    fields: [workspaceLinks.userId],
    references: [users.id],
  }),
}));

export const tournamentBookmarksRelations = relations(tournamentBookmarks, ({ one }) => ({
  owner: one(users, {
    fields: [tournamentBookmarks.userId],
    references: [users.id],
  }),
}));

export const lfgListingsRelations = relations(lfgListings, ({ one, many }) => ({
  author: one(users, {
    fields: [lfgListings.userId],
    references: [users.id],
  }),
  applications: many(lfgApplications),
}));

export const lfgApplicationsRelations = relations(lfgApplications, ({ one }) => ({
  listing: one(lfgListings, {
    fields: [lfgApplications.listingId],
    references: [lfgListings.id],
  }),
  applicant: one(users, {
    fields: [lfgApplications.applicantUserId],
    references: [users.id],
  }),
}));

export const forumPostsRelations = relations(forumPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [forumPosts.userId],
    references: [users.id],
  }),
  reactions: many(forumReactions),
  comments: many(forumComments),
}));

export const forumReactionsRelations = relations(forumReactions, ({ one }) => ({
  post: one(forumPosts, {
    fields: [forumReactions.postId],
    references: [forumPosts.id],
  }),
  user: one(users, {
    fields: [forumReactions.userId],
    references: [users.id],
  }),
}));

export const forumCommentsRelations = relations(forumComments, ({ one }) => ({
  post: one(forumPosts, {
    fields: [forumComments.postId],
    references: [forumPosts.id],
  }),
  author: one(users, {
    fields: [forumComments.userId],
    references: [users.id],
  }),
}));

export const missionProgressRelations = relations(missionProgress, ({ one }) => ({
  user: one(users, {
    fields: [missionProgress.userId],
    references: [users.id],
  }),
}));

export const communityPollsRelations = relations(communityPolls, ({ many }) => ({
  votes: many(communityPollVotes),
}));

export const communityPollVotesRelations = relations(communityPollVotes, ({ one }) => ({
  poll: one(communityPolls, {
    fields: [communityPollVotes.pollId],
    references: [communityPolls.id],
  }),
  user: one(users, {
    fields: [communityPollVotes.userId],
    references: [users.id],
  }),
}));

export const pickemMatchesRelations = relations(pickemMatches, ({ many }) => ({
  predictions: many(pickemPredictions),
}));

export const pickemPredictionsRelations = relations(pickemPredictions, ({ one }) => ({
  match: one(pickemMatches, {
    fields: [pickemPredictions.matchId],
    references: [pickemMatches.id],
  }),
  user: one(users, {
    fields: [pickemPredictions.userId],
    references: [users.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type TacticalNoteRow = typeof tacticalNotes.$inferSelect;
export type WorkspaceLinkRow = typeof workspaceLinks.$inferSelect;
export type TournamentBookmarkRow = typeof tournamentBookmarks.$inferSelect;
export type LfgListingRow = typeof lfgListings.$inferSelect;
export type LfgApplicationRow = typeof lfgApplications.$inferSelect;
export type ForumPostRow = typeof forumPosts.$inferSelect;
export type ForumReactionRow = typeof forumReactions.$inferSelect;
export type ForumCommentRow = typeof forumComments.$inferSelect;
export type MissionProgressRow = typeof missionProgress.$inferSelect;
export type CommunityPollRow = typeof communityPolls.$inferSelect;
export type CommunityPollVoteRow = typeof communityPollVotes.$inferSelect;
export type PickemMatchRow = typeof pickemMatches.$inferSelect;
export type PickemPredictionRow = typeof pickemPredictions.$inferSelect;
