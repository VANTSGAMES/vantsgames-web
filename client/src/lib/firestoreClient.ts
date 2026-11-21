import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import firebaseConfig from "../../../firebase-applet-config.json";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// La app de Firebase se inicializa aquí: desde la actualización Workspace el
// login ya no pasa por Firebase Auth (es OAuth de Google Workspace), pero
// Firestore sigue necesitando la app para la base del applet.
const appFirebase = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(appFirebase);

export const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Startup connectivity probe (validates Firebase config & databaseId)
let connectionTested = false;
export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration (Firestore offline).");
    }
    // Expected permission-denied on /test/connection confirms Firestore server reachability.
  }
}

void testFirestoreConnection();

/* ---------------- Typed Domain Models ---------------- */

export type AiModelId =
  | "gemini-4-hydrogen"
  | "gemini-3.1-flash-lite"
  | "gemini-4-neon"
  | "gemini-4-carbon";

export type AiModeId = "coach" | "search" | "maps";

export interface SavedAiSession {
  id: string;
  ownerId: string;
  title: string;
  model: AiModelId;
  mode: AiModeId;
  summary: string;
  messageCount: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedVoiceNote {
  id: string;
  ownerId: string;
  title: string;
  transcript: string;
  gameSlug?: string | null;
  durationSec: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedArenaSpot {
  id: string;
  ownerId: string;
  placeId: string;
  userLabel: string;
  userNote?: string | null;
  gameSlug?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/* ---------------- AI Sessions ---------------- */

export function subscribeAiSessions(
  userId: string,
  onData: (sessions: SavedAiSession[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `users/${userId}/ai_sessions`;
  const q = query(collection(db, path), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items: SavedAiSession[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedAiSession, "id">),
      }));
      onData(items);
    },
    (err) => {
      console.error("Firestore subscribeAiSessions error:", err);
      onError?.(err);
    },
  );
}

export async function saveAiSession(
  userId: string,
  input: {
    title: string;
    model: AiModelId;
    mode: AiModeId;
    summary: string;
    messageCount: number;
  },
): Promise<string> {
  const path = `users/${userId}/ai_sessions`;
  try {
    const ref = await addDoc(collection(db, path), {
      ownerId: userId,
      title: input.title.trim().slice(0, 140),
      model: input.model,
      mode: input.mode,
      summary: input.summary.trim().slice(0, 4000),
      messageCount: Math.max(1, Math.min(200, Math.round(input.messageCount))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteAiSession(userId: string, sessionId: string): Promise<void> {
  const path = `users/${userId}/ai_sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ---------------- Voice Notes ---------------- */

export function subscribeVoiceNotes(
  userId: string,
  onData: (notes: SavedVoiceNote[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `users/${userId}/voice_notes`;
  const q = query(collection(db, path), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items: SavedVoiceNote[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedVoiceNote, "id">),
      }));
      onData(items);
    },
    (err) => {
      console.error("Firestore subscribeVoiceNotes error:", err);
      onError?.(err);
    },
  );
}

export async function saveVoiceNote(
  userId: string,
  input: {
    title: string;
    transcript: string;
    gameSlug?: string | null;
    durationSec: number;
  },
): Promise<string> {
  const path = `users/${userId}/voice_notes`;
  try {
    const payload: Record<string, unknown> = {
      ownerId: userId,
      title: input.title.trim().slice(0, 140),
      transcript: input.transcript.trim().slice(0, 8000),
      durationSec: Math.max(0, Math.min(600, Number(input.durationSec) || 0)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.gameSlug && input.gameSlug.trim()) {
      payload.gameSlug = input.gameSlug.trim().slice(0, 40);
    }
    const ref = await addDoc(collection(db, path), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteVoiceNote(userId: string, noteId: string): Promise<void> {
  const path = `users/${userId}/voice_notes/${noteId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ---------------- Arena Spots (Google Maps Place ID bookmarks) ---------------- */

export function subscribeArenaSpots(
  userId: string,
  onData: (spots: SavedArenaSpot[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `users/${userId}/arena_spots`;
  const q = query(collection(db, path), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items: SavedArenaSpot[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedArenaSpot, "id">),
      }));
      onData(items);
    },
    (err) => {
      console.error("Firestore subscribeArenaSpots error:", err);
      onError?.(err);
    },
  );
}

export async function saveArenaSpot(
  userId: string,
  input: {
    placeId: string;
    userLabel: string;
    userNote?: string | null;
    gameSlug?: string | null;
  },
): Promise<string> {
  const path = `users/${userId}/arena_spots`;
  try {
    const payload: Record<string, unknown> = {
      ownerId: userId,
      placeId: input.placeId.trim().slice(0, 200),
      userLabel: input.userLabel.trim().slice(0, 140),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.userNote && input.userNote.trim()) {
      payload.userNote = input.userNote.trim().slice(0, 1000);
    }
    if (input.gameSlug && input.gameSlug.trim()) {
      payload.gameSlug = input.gameSlug.trim().slice(0, 40);
    }
    const ref = await addDoc(collection(db, path), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteArenaSpot(userId: string, spotId: string): Promise<void> {
  const path = `users/${userId}/arena_spots/${spotId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
