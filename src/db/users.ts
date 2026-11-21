import { and, desc, eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
  tacticalNotes,
  tournamentBookmarks,
  users,
  workspaceLinks,
} from "./schema.ts";

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoUrl?: string | null,
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
        photoUrl: photoUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? undefined,
          photoUrl: photoUrl ?? undefined,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error("Failed to sync user in database:", error);
    throw new Error("No se pudo sincronizar el usuario.", { cause: error });
  }
}

export async function updateUserPreferences(
  uid: string,
  prefs: { preferredGame?: string | null; displayName?: string | null },
) {
  try {
    const result = await db
      .update(users)
      .set({
        preferredGame: prefs.preferredGame ?? undefined,
        displayName: prefs.displayName ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();
    return result[0] ?? null;
  } catch (error) {
    console.error("Failed to update user preferences:", error);
    throw new Error("No se pudieron guardar las preferencias.", { cause: error });
  }
}

export async function listTacticalNotesByUid(uid: string) {
  try {
    const rows = await db
      .select({
        id: tacticalNotes.id,
        title: tacticalNotes.title,
        content: tacticalNotes.content,
        gameSlug: tacticalNotes.gameSlug,
        category: tacticalNotes.category,
        createdAt: tacticalNotes.createdAt,
        updatedAt: tacticalNotes.updatedAt,
      })
      .from(tacticalNotes)
      .innerJoin(users, eq(tacticalNotes.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(tacticalNotes.updatedAt));
    return rows;
  } catch (error) {
    console.error("Failed to list tactical notes:", error);
    throw new Error("No se pudieron cargar las notas tácticas.", { cause: error });
  }
}

export async function createTacticalNote(
  userId: number,
  data: { title: string; content: string; gameSlug?: string | null; category?: string },
) {
  try {
    const [created] = await db
      .insert(tacticalNotes)
      .values({
        userId,
        title: data.title,
        content: data.content,
        gameSlug: data.gameSlug || null,
        category: data.category || "estrategia",
      })
      .returning();
    return created;
  } catch (error) {
    console.error("Failed to create tactical note:", error);
    throw new Error("No se pudo crear la nota táctica.", { cause: error });
  }
}

export async function deleteTacticalNote(userId: number, noteId: number) {
  try {
    const deleted = await db
      .delete(tacticalNotes)
      .where(and(eq(tacticalNotes.id, noteId), eq(tacticalNotes.userId, userId)))
      .returning({ id: tacticalNotes.id });
    return deleted.length > 0;
  } catch (error) {
    console.error("Failed to delete tactical note:", error);
    throw new Error("No se pudo eliminar la nota táctica.", { cause: error });
  }
}

export async function listWorkspaceLinksByUid(uid: string) {
  try {
    return await db
      .select({
        id: workspaceLinks.id,
        service: workspaceLinks.service,
        resourceId: workspaceLinks.resourceId,
        title: workspaceLinks.title,
        url: workspaceLinks.url,
        gameSlug: workspaceLinks.gameSlug,
        metadataJson: workspaceLinks.metadataJson,
        createdAt: workspaceLinks.createdAt,
      })
      .from(workspaceLinks)
      .innerJoin(users, eq(workspaceLinks.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(workspaceLinks.createdAt));
  } catch (error) {
    console.error("Failed to list workspace links:", error);
    throw new Error("No se pudieron cargar los recursos vinculados.", { cause: error });
  }
}

export async function createWorkspaceLink(
  userId: number,
  data: {
    service: string;
    resourceId: string;
    title: string;
    url?: string | null;
    gameSlug?: string | null;
    metadataJson?: string | null;
  },
) {
  try {
    const [created] = await db
      .insert(workspaceLinks)
      .values({
        userId,
        service: data.service,
        resourceId: data.resourceId,
        title: data.title,
        url: data.url || null,
        gameSlug: data.gameSlug || null,
        metadataJson: data.metadataJson || null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error("Failed to create workspace link:", error);
    throw new Error("No se pudo guardar el recurso de Workspace.", { cause: error });
  }
}

export async function deleteWorkspaceLink(userId: number, linkId: number) {
  try {
    const deleted = await db
      .delete(workspaceLinks)
      .where(and(eq(workspaceLinks.id, linkId), eq(workspaceLinks.userId, userId)))
      .returning({ id: workspaceLinks.id });
    return deleted.length > 0;
  } catch (error) {
    console.error("Failed to delete workspace link:", error);
    throw new Error("No se pudo quitar el recurso vinculado.", { cause: error });
  }
}

export async function listTournamentBookmarksByUid(uid: string) {
  try {
    return await db
      .select({
        id: tournamentBookmarks.id,
        tournamentSlug: tournamentBookmarks.tournamentSlug,
        tournamentName: tournamentBookmarks.tournamentName,
        gameSlug: tournamentBookmarks.gameSlug,
        notes: tournamentBookmarks.notes,
        createdAt: tournamentBookmarks.createdAt,
      })
      .from(tournamentBookmarks)
      .innerJoin(users, eq(tournamentBookmarks.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(tournamentBookmarks.createdAt));
  } catch (error) {
    console.error("Failed to list tournament bookmarks:", error);
    throw new Error("No se pudieron cargar los torneos guardados.", { cause: error });
  }
}

export async function createTournamentBookmark(
  userId: number,
  data: {
    tournamentSlug: string;
    tournamentName: string;
    gameSlug?: string | null;
    notes?: string | null;
  },
) {
  try {
    const [created] = await db
      .insert(tournamentBookmarks)
      .values({
        userId,
        tournamentSlug: data.tournamentSlug,
        tournamentName: data.tournamentName,
        gameSlug: data.gameSlug || null,
        notes: data.notes || null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error("Failed to create tournament bookmark:", error);
    throw new Error("No se pudo guardar el torneo.", { cause: error });
  }
}

export async function deleteTournamentBookmark(userId: number, bookmarkId: number) {
  try {
    const deleted = await db
      .delete(tournamentBookmarks)
      .where(and(eq(tournamentBookmarks.id, bookmarkId), eq(tournamentBookmarks.userId, userId)))
      .returning({ id: tournamentBookmarks.id });
    return deleted.length > 0;
  } catch (error) {
    console.error("Failed to delete tournament bookmark:", error);
    throw new Error("No se pudo eliminar el torneo guardado.", { cause: error });
  }
}
