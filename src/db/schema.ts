import { relations } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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

export const usersRelations = relations(users, ({ many }) => ({
  tacticalNotes: many(tacticalNotes),
  workspaceLinks: many(workspaceLinks),
  tournamentBookmarks: many(tournamentBookmarks),
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

export type UserRow = typeof users.$inferSelect;
export type TacticalNoteRow = typeof tacticalNotes.$inferSelect;
export type WorkspaceLinkRow = typeof workspaceLinks.$inferSelect;
export type TournamentBookmarkRow = typeof tournamentBookmarks.$inferSelect;
