import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "./index.ts";
import {
  lfgApplications,
  lfgListings,
  type LfgApplicationRow,
  type LfgListingRow,
} from "./schema.ts";
import { getOrCreateUser } from "./users.ts";

export const LFG_TTL_DAYS = 7;

export interface LfgListingWithMeta extends LfgListingRow {
  applicationsCount: number;
  isOwner: boolean;
  hasApplied: boolean;
}

export interface CommunityUserRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
}

/* ---------------- Resilient local JSON fallback when Cloud SQL socket is unavailable ---------------- */
interface StoredUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
}

interface StoredListing {
  id: number;
  userId: number;
  authorNick: string;
  type: string;
  gameSlug: string;
  title: string;
  teamName: string | null;
  roleNeeded: string;
  rankLevel: string;
  schedule: string;
  region: string;
  slotsOpen: number;
  contact: string;
  notes: string | null;
  expiresAt: string;
  createdAt: string;
}

interface StoredApplication {
  id: number;
  listingId: number;
  applicantUserId: number;
  applicantNick: string;
  role: string;
  contact: string;
  message: string;
  status: string;
  createdAt: string;
}

interface FallbackStoreData {
  nextUserId: number;
  nextListingId: number;
  nextApplicationId: number;
  users: StoredUser[];
  listings: StoredListing[];
  applications: StoredApplication[];
}

const FALLBACK_DIR = path.resolve(process.cwd(), ".data");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "community-lfg.json");

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
    msg.includes("timeout expired") ||
    msg.includes("no se pudo sincronizar el usuario")
  );
}

function readFallbackStore(): FallbackStoreData {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")) as Partial<FallbackStoreData>;
      return {
        nextUserId: Number(parsed.nextUserId) || 1,
        nextListingId: Number(parsed.nextListingId) || 1,
        nextApplicationId: Number(parsed.nextApplicationId) || 1,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings : [],
        applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      };
    }
  } catch (err) {
    console.warn("[communityLfg] fallback store read reset:", (err as Error).message);
  }
  return {
    nextUserId: 1,
    nextListingId: 1,
    nextApplicationId: 1,
    users: [],
    listings: [],
    applications: [],
  };
}

function writeFallbackStore(data: FallbackStoreData): void {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, FALLBACK_FILE);
}

function toListingRow(item: StoredListing): LfgListingRow {
  return {
    ...item,
    expiresAt: new Date(item.expiresAt),
    createdAt: new Date(item.createdAt),
  };
}

function toApplicationRow(item: StoredApplication): LfgApplicationRow {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
  };
}

export async function resolveCommunityUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoUrl?: string | null,
): Promise<CommunityUserRecord> {
  try {
    const user = await getOrCreateUser(uid, email, displayName ?? null, photoUrl ?? null);
    return {
      id: user.id,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    let existing = store.users.find((u) => u.uid === uid);
    if (!existing) {
      existing = {
        id: store.nextUserId++,
        uid,
        email,
        displayName: displayName ?? null,
      };
      store.users.push(existing);
    } else {
      existing.email = email;
      if (displayName) existing.displayName = displayName;
    }
    writeFallbackStore(store);
    return existing;
  }
}

export async function listActiveLfgListings(opts: {
  gameSlug?: string;
  type?: string;
  region?: string;
  viewerUserId?: number | null;
}): Promise<LfgListingWithMeta[]> {
  try {
    const now = new Date();
    const conditions = [gt(lfgListings.expiresAt, now)];

    if (opts.gameSlug) {
      conditions.push(eq(lfgListings.gameSlug, opts.gameSlug));
    }
    if (opts.type) {
      conditions.push(eq(lfgListings.type, opts.type));
    }
    if (opts.region) {
      conditions.push(eq(lfgListings.region, opts.region));
    }

    const rows = await db
      .select()
      .from(lfgListings)
      .where(and(...conditions))
      .orderBy(desc(lfgListings.createdAt))
      .limit(100);

    if (rows.length === 0) return [];

    const countsRows = await db
      .select({
        listingId: lfgApplications.listingId,
        total: sql<number>`count(*)::int`,
      })
      .from(lfgApplications)
      .groupBy(lfgApplications.listingId);

    const countMap = new Map<number, number>();
    for (const r of countsRows) {
      countMap.set(r.listingId, Number(r.total) || 0);
    }

    const appliedSet = new Set<number>();
    if (opts.viewerUserId) {
      const viewerApps = await db
        .select({ listingId: lfgApplications.listingId })
        .from(lfgApplications)
        .where(eq(lfgApplications.applicantUserId, opts.viewerUserId));
      for (const a of viewerApps) {
        appliedSet.add(a.listingId);
      }
    }

    return rows.map((row) => ({
      ...row,
      applicationsCount: countMap.get(row.id) || 0,
      isOwner: Boolean(opts.viewerUserId && row.userId === opts.viewerUserId),
      hasApplied: appliedSet.has(row.id),
    }));
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const nowMs = Date.now();
    const filtered = store.listings
      .filter((row) => {
        if (new Date(row.expiresAt).getTime() <= nowMs) return false;
        if (opts.gameSlug && row.gameSlug !== opts.gameSlug) return false;
        if (opts.type && row.type !== opts.type) return false;
        if (opts.region && row.region !== opts.region) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);

    return filtered.map((row) => {
      const apps = store.applications.filter((a) => a.listingId === row.id);
      return {
        ...toListingRow(row),
        applicationsCount: apps.length,
        isOwner: Boolean(opts.viewerUserId && row.userId === opts.viewerUserId),
        hasApplied: Boolean(
          opts.viewerUserId && apps.some((a) => a.applicantUserId === opts.viewerUserId),
        ),
      };
    });
  }
}

export async function createLfgListing(input: {
  userId: number;
  authorNick: string;
  type: "lft" | "lfg" | "scrim";
  gameSlug: string;
  title: string;
  teamName?: string | null;
  roleNeeded: string;
  rankLevel: string;
  schedule: string;
  region: string;
  slotsOpen: number;
  contact: string;
  notes?: string | null;
}): Promise<LfgListingRow> {
  const expiresAt = new Date(Date.now() + LFG_TTL_DAYS * 24 * 60 * 60 * 1000);
  try {
    const [created] = await db
      .insert(lfgListings)
      .values({
        userId: input.userId,
        authorNick: input.authorNick,
        type: input.type,
        gameSlug: input.gameSlug,
        title: input.title,
        teamName: input.teamName || null,
        roleNeeded: input.roleNeeded,
        rankLevel: input.rankLevel,
        schedule: input.schedule,
        region: input.region,
        slotsOpen: input.slotsOpen,
        contact: input.contact,
        notes: input.notes || null,
        expiresAt,
      })
      .returning();
    return created;
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const stored: StoredListing = {
      id: store.nextListingId++,
      userId: input.userId,
      authorNick: input.authorNick,
      type: input.type,
      gameSlug: input.gameSlug,
      title: input.title,
      teamName: input.teamName || null,
      roleNeeded: input.roleNeeded,
      rankLevel: input.rankLevel,
      schedule: input.schedule,
      region: input.region,
      slotsOpen: input.slotsOpen,
      contact: input.contact,
      notes: input.notes || null,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.listings.push(stored);
    writeFallbackStore(store);
    return toListingRow(stored);
  }
}

export async function deleteLfgListingOwned(userId: number, listingId: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(lfgListings)
      .where(and(eq(lfgListings.id, listingId), eq(lfgListings.userId, userId)))
      .returning({ id: lfgListings.id });
    return deleted.length > 0;
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const idx = store.listings.findIndex((l) => l.id === listingId && l.userId === userId);
    if (idx === -1) return false;
    store.listings.splice(idx, 1);
    store.applications = store.applications.filter((a) => a.listingId !== listingId);
    writeFallbackStore(store);
    return true;
  }
}

export async function createLfgApplication(input: {
  listingId: number;
  applicantUserId: number;
  applicantNick: string;
  role: string;
  contact: string;
  message: string;
}): Promise<{ ok: true; application: LfgApplicationRow } | { ok: false; status: number; error: string }> {
  try {
    const [listing] = await db
      .select()
      .from(lfgListings)
      .where(eq(lfgListings.id, input.listingId))
      .limit(1);

    if (!listing) {
      return { ok: false, status: 404, error: "Este anuncio ya no existe." };
    }
    if (new Date(listing.expiresAt).getTime() <= Date.now()) {
      return { ok: false, status: 410, error: "Este anuncio ya expiró." };
    }
    if (listing.userId === input.applicantUserId) {
      return { ok: false, status: 400, error: "No puedes postularte a tu propio anuncio." };
    }

    const existing = await db
      .select({ id: lfgApplications.id })
      .from(lfgApplications)
      .where(
        and(
          eq(lfgApplications.listingId, input.listingId),
          eq(lfgApplications.applicantUserId, input.applicantUserId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { ok: false, status: 409, error: "Ya enviaste una solicitud a este anuncio." };
    }

    const [created] = await db
      .insert(lfgApplications)
      .values({
        listingId: input.listingId,
        applicantUserId: input.applicantUserId,
        applicantNick: input.applicantNick,
        role: input.role,
        contact: input.contact,
        message: input.message,
        status: "pending",
      })
      .returning();

    return { ok: true, application: created };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const listing = store.listings.find((l) => l.id === input.listingId);
    if (!listing) return { ok: false, status: 404, error: "Este anuncio ya no existe." };
    if (new Date(listing.expiresAt).getTime() <= Date.now()) {
      return { ok: false, status: 410, error: "Este anuncio ya expiró." };
    }
    if (listing.userId === input.applicantUserId) {
      return { ok: false, status: 400, error: "No puedes postularte a tu propio anuncio." };
    }
    const already = store.applications.some(
      (a) => a.listingId === input.listingId && a.applicantUserId === input.applicantUserId,
    );
    if (already) {
      return { ok: false, status: 409, error: "Ya enviaste una solicitud a este anuncio." };
    }
    const stored: StoredApplication = {
      id: store.nextApplicationId++,
      listingId: input.listingId,
      applicantUserId: input.applicantUserId,
      applicantNick: input.applicantNick,
      role: input.role,
      contact: input.contact,
      message: input.message,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    store.applications.push(stored);
    writeFallbackStore(store);
    return { ok: true, application: toApplicationRow(stored) };
  }
}

export async function listLfgApplicationsForOwner(
  ownerUserId: number,
  listingId: number,
): Promise<{ ok: true; applications: LfgApplicationRow[] } | { ok: false; status: number; error: string }> {
  try {
    const [listing] = await db
      .select({ id: lfgListings.id, userId: lfgListings.userId })
      .from(lfgListings)
      .where(eq(lfgListings.id, listingId))
      .limit(1);

    if (!listing) return { ok: false, status: 404, error: "Anuncio no encontrado." };
    if (listing.userId !== ownerUserId) {
      return { ok: false, status: 403, error: "Solo el autor puede ver las solicitudes de este anuncio." };
    }

    const apps = await db
      .select()
      .from(lfgApplications)
      .where(eq(lfgApplications.listingId, listingId))
      .orderBy(desc(lfgApplications.createdAt));

    return { ok: true, applications: apps };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const listing = store.listings.find((l) => l.id === listingId);
    if (!listing) return { ok: false, status: 404, error: "Anuncio no encontrado." };
    if (listing.userId !== ownerUserId) {
      return { ok: false, status: 403, error: "Solo el autor puede ver las solicitudes de este anuncio." };
    }
    const apps = store.applications
      .filter((a) => a.listingId === listingId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toApplicationRow);
    return { ok: true, applications: apps };
  }
}

export async function updateLfgApplicationStatusOwned(
  ownerUserId: number,
  applicationId: number,
  status: "accepted" | "declined",
): Promise<{ ok: true; application: LfgApplicationRow } | { ok: false; status: number; error: string }> {
  try {
    const [appRow] = await db
      .select()
      .from(lfgApplications)
      .where(eq(lfgApplications.id, applicationId))
      .limit(1);

    if (!appRow) return { ok: false, status: 404, error: "Solicitud no encontrada." };

    const [listing] = await db
      .select({ id: lfgListings.id, userId: lfgListings.userId })
      .from(lfgListings)
      .where(eq(lfgListings.id, appRow.listingId))
      .limit(1);

    if (!listing || listing.userId !== ownerUserId) {
      return { ok: false, status: 403, error: "No tienes permiso para responder esta solicitud." };
    }

    const [updated] = await db
      .update(lfgApplications)
      .set({ status })
      .where(eq(lfgApplications.id, applicationId))
      .returning();

    return { ok: true, application: updated };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallbackStore();
    const appRow = store.applications.find((a) => a.id === applicationId);
    if (!appRow) return { ok: false, status: 404, error: "Solicitud no encontrada." };
    const listing = store.listings.find((l) => l.id === appRow.listingId);
    if (!listing || listing.userId !== ownerUserId) {
      return { ok: false, status: 403, error: "No tienes permiso para responder esta solicitud." };
    }
    appRow.status = status;
    writeFallbackStore(store);
    return { ok: true, application: toApplicationRow(appRow) };
  }
}
