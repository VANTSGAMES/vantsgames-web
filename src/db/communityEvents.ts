import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "./index.ts";
import { communityEventRsvps, communityEvents } from "./schema.ts";
import {
  buildDefaultEvents,
  computeEventCapacityState,
  sortCommunityEvents,
  type CommunityEventDef,
  type CommunityEventItem,
  type CommunityEventsResponse,
  type EventModality,
  type EventStatus,
  type EventType,
  type RsvpStatus,
  type ValidatedEventDraft,
} from "../../client/src/lib/eventsHelpers.ts";

interface StoredRsvp {
  eventId: string;
  userId: number;
  userNick: string;
  status: RsvpStatus;
  roleNote: string | null;
  checkedIn: boolean;
  updatedAt: string;
}

interface EventsFallbackStore {
  events: CommunityEventDef[];
  rsvps: StoredRsvp[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FALLBACK_FILE = path.join(DATA_DIR, "community-events.json");

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

function readFallback(): EventsFallbackStore {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")) as Partial<EventsFallbackStore>;
      const events =
        Array.isArray(parsed.events) && parsed.events.length > 0
          ? parsed.events
          : buildDefaultEvents();
      return {
        events,
        rsvps: Array.isArray(parsed.rsvps) ? parsed.rsvps : [],
      };
    }
  } catch (err) {
    console.warn("[communityEvents] fallback store reset:", (err as Error).message);
  }
  const initial: EventsFallbackStore = {
    events: buildDefaultEvents(),
    rsvps: [],
  };
  writeFallback(initial);
  return initial;
}

function writeFallback(store: EventsFallbackStore): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, FALLBACK_FILE);
}

async function ensureSeededInDb(): Promise<void> {
  const existing = await db.select({ id: communityEvents.id }).from(communityEvents).limit(1);
  if (existing.length > 0) return;

  const defaults = buildDefaultEvents();
  for (const ev of defaults) {
    await db
      .insert(communityEvents)
      .values({
        id: ev.id,
        title: ev.title,
        type: ev.type,
        gameSlug: ev.gameSlug,
        modality: ev.modality,
        location: ev.location,
        streamUrl: ev.streamUrl,
        description: ev.description,
        startsAt: new Date(ev.startsAt),
        endsAt: ev.endsAt ? new Date(ev.endsAt) : null,
        capacity: ev.capacity,
        featured: ev.featured,
        status: ev.status,
        hostNick: ev.hostNick,
        createdByUserId: null,
        createdAt: new Date(ev.createdAt),
      })
      .onConflictDoNothing();
  }
}

async function loadState(): Promise<EventsFallbackStore> {
  try {
    await ensureSeededInDb();
    const [eventRows, rsvpRows] = await Promise.all([
      db.select().from(communityEvents),
      db.select().from(communityEventRsvps),
    ]);

    const events: CommunityEventDef[] = eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      type: (e.type as EventType) || "showmatch",
      gameSlug: e.gameSlug || "general",
      modality: (e.modality as EventModality) || "online",
      location: e.location,
      streamUrl: e.streamUrl,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt ? e.endsAt.toISOString() : null,
      capacity: e.capacity,
      featured: e.featured,
      status: (e.status as EventStatus) || "open",
      hostNick: e.hostNick,
      createdAt: e.createdAt.toISOString(),
    }));

    const rsvps: StoredRsvp[] = rsvpRows.map((r) => ({
      eventId: r.eventId,
      userId: r.userId,
      userNick: r.userNick,
      status: r.status === "waitlist" ? "waitlist" : "confirmed",
      roleNote: r.roleNote,
      checkedIn: r.checkedIn,
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { events, rsvps };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    return readFallback();
  }
}

export async function getEventsOverview(opts: {
  viewerUserId?: number | null;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<CommunityEventsResponse> {
  const nowMs = opts.nowMs ?? Date.now();
  const state = await loadState();

  const rsvpsByEvent = new Map<string, StoredRsvp[]>();
  for (const r of state.rsvps) {
    const arr = rsvpsByEvent.get(r.eventId) || [];
    arr.push(r);
    rsvpsByEvent.set(r.eventId, arr);
  }

  let totalRsvps = 0;
  let userConfirmedCount = 0;
  let userWaitlistCount = 0;

  const items: CommunityEventItem[] = state.events.map((ev) => {
    const evRsvps = (rsvpsByEvent.get(ev.id) || []).sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    );
    const confirmed = evRsvps.filter((r) => r.status === "confirmed");
    const waitlist = evRsvps.filter((r) => r.status === "waitlist");
    totalRsvps += confirmed.length + waitlist.length;

    const viewerHit = opts.viewerUserId
      ? evRsvps.find((r) => r.userId === opts.viewerUserId) || null
      : null;
    if (viewerHit?.status === "confirmed") userConfirmedCount += 1;
    if (viewerHit?.status === "waitlist") userWaitlistCount += 1;

    const cap = computeEventCapacityState(ev.capacity, confirmed.length);
    const endReferenceMs = ev.endsAt
      ? new Date(ev.endsAt).getTime()
      : new Date(ev.startsAt).getTime() + 3 * 60 * 60 * 1000;
    const isPast = Number.isFinite(endReferenceMs) && endReferenceMs < nowMs;
    const isOpenForRsvp = ev.status === "open" && !isPast;

    const attendeesPreview = confirmed.slice(0, 8).map((r) => ({
      nick: r.userNick,
      status: r.status,
      checkedIn: r.checkedIn,
    }));

    return {
      ...ev,
      confirmedCount: confirmed.length,
      waitlistCount: waitlist.length,
      spotsLeft: cap.spotsLeft,
      fillPercent: cap.fillPercent,
      isFull: cap.isFull,
      isPast,
      isOpenForRsvp,
      viewerRsvp: viewerHit
        ? {
            status: viewerHit.status,
            roleNote: viewerHit.roleNote,
            checkedIn: viewerHit.checkedIn,
            updatedAt: viewerHit.updatedAt,
          }
        : null,
      attendeesPreview,
    };
  });

  const sorted = sortCommunityEvents(items);
  const totalUpcoming = sorted.filter((e) => !e.isPast && e.status === "open").length;

  return {
    events: sorted,
    summary: {
      totalUpcoming,
      totalRsvps,
      userConfirmedCount,
      userWaitlistCount,
    },
    viewer: {
      isModerator: Boolean(opts.viewerIsModerator),
    },
  };
}

export async function upsertEventRsvp(input: {
  eventId: string;
  userId: number;
  userNick: string;
  roleNote?: string | null;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; status: RsvpStatus; overview: CommunityEventsResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const ev = state.events.find((e) => e.id === input.eventId);
  if (!ev) {
    return { ok: false, status: 404, error: "Evento no encontrado." };
  }

  const endRef = ev.endsAt
    ? new Date(ev.endsAt).getTime()
    : new Date(ev.startsAt).getTime() + 3 * 60 * 60 * 1000;
  if (ev.status !== "open" || (Number.isFinite(endRef) && endRef < nowMs)) {
    return { ok: false, status: 409, error: "Las inscripciones para este evento ya están cerradas." };
  }

  const evRsvps = state.rsvps.filter((r) => r.eventId === ev.id);
  const existing = evRsvps.find((r) => r.userId === input.userId);
  const confirmedCount = evRsvps.filter((r) => r.status === "confirmed").length;

  const assignedStatus: RsvpStatus = existing
    ? existing.status
    : computeEventCapacityState(ev.capacity, confirmedCount).nextRsvpStatus;

  const nowDate = new Date(nowMs);
  const nextRoleNote = input.roleNote !== undefined ? input.roleNote : existing?.roleNote ?? null;

  try {
    await db
      .insert(communityEventRsvps)
      .values({
        eventId: ev.id,
        userId: input.userId,
        userNick: input.userNick,
        status: assignedStatus,
        roleNote: nextRoleNote,
        checkedIn: existing?.checkedIn ?? false,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [communityEventRsvps.eventId, communityEventRsvps.userId],
        set: {
          userNick: input.userNick,
          roleNote: nextRoleNote,
          updatedAt: nowDate,
        },
      });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.rsvps.findIndex(
      (r) => r.eventId === ev.id && r.userId === input.userId,
    );
    const row: StoredRsvp = {
      eventId: ev.id,
      userId: input.userId,
      userNick: input.userNick,
      status: assignedStatus,
      roleNote: nextRoleNote,
      checkedIn: existing?.checkedIn ?? false,
      updatedAt: nowDate.toISOString(),
    };
    if (idx === -1) store.rsvps.push(row);
    else store.rsvps[idx] = row;
    writeFallback(store);
  }

  const overview = await getEventsOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, status: assignedStatus, overview };
}

export async function cancelEventRsvp(input: {
  eventId: string;
  userId: number;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityEventsResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const ev = state.events.find((e) => e.id === input.eventId);
  if (!ev) {
    return { ok: false, status: 404, error: "Evento no encontrado." };
  }

  const evRsvps = state.rsvps.filter((r) => r.eventId === ev.id);
  const existing = evRsvps.find((r) => r.userId === input.userId);
  if (!existing) {
    return { ok: false, status: 404, error: "No tienes una inscripción activa en este evento." };
  }

  // Promote earliest waitlisted user if a confirmed slot frees up
  const waitlistSorted = evRsvps
    .filter((r) => r.status === "waitlist" && r.userId !== input.userId)
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  const promoteTarget = existing.status === "confirmed" ? waitlistSorted[0] || null : null;

  try {
    await db
      .delete(communityEventRsvps)
      .where(
        and(
          eq(communityEventRsvps.eventId, ev.id),
          eq(communityEventRsvps.userId, input.userId),
        ),
      );
    if (promoteTarget) {
      await db
        .update(communityEventRsvps)
        .set({ status: "confirmed", updatedAt: new Date(nowMs) })
        .where(
          and(
            eq(communityEventRsvps.eventId, ev.id),
            eq(communityEventRsvps.userId, promoteTarget.userId),
          ),
        );
    }
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    store.rsvps = store.rsvps.filter(
      (r) => !(r.eventId === ev.id && r.userId === input.userId),
    );
    if (promoteTarget) {
      const target = store.rsvps.find(
        (r) => r.eventId === ev.id && r.userId === promoteTarget.userId,
      );
      if (target) {
        target.status = "confirmed";
        target.updatedAt = new Date(nowMs).toISOString();
      }
    }
    writeFallback(store);
  }

  const overview = await getEventsOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, overview };
}

export async function toggleEventCheckIn(input: {
  eventId: string;
  userId: number;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; checkedIn: boolean; overview: CommunityEventsResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const ev = state.events.find((e) => e.id === input.eventId);
  if (!ev) {
    return { ok: false, status: 404, error: "Evento no encontrado." };
  }
  if (ev.status === "cancelled") {
    return { ok: false, status: 409, error: "Este evento fue cancelado." };
  }

  const existing = state.rsvps.find(
    (r) => r.eventId === ev.id && r.userId === input.userId,
  );
  if (!existing) {
    return { ok: false, status: 400, error: "Primero confirma tu asistencia (RSVP) para hacer check-in." };
  }
  if (existing.status !== "confirmed") {
    return { ok: false, status: 409, error: "Tu inscripción está en lista de espera; el check-in es solo para cupos confirmados." };
  }

  const nextCheckedIn = !existing.checkedIn;
  try {
    await db
      .update(communityEventRsvps)
      .set({ checkedIn: nextCheckedIn, updatedAt: new Date(nowMs) })
      .where(
        and(
          eq(communityEventRsvps.eventId, ev.id),
          eq(communityEventRsvps.userId, input.userId),
        ),
      );
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const target = store.rsvps.find(
      (r) => r.eventId === ev.id && r.userId === input.userId,
    );
    if (target) {
      target.checkedIn = nextCheckedIn;
      target.updatedAt = new Date(nowMs).toISOString();
    }
    writeFallback(store);
  }

  const overview = await getEventsOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, checkedIn: nextCheckedIn, overview };
}

export async function createCommunityEvent(input: {
  userId: number;
  hostNick: string;
  draft: ValidatedEventDraft;
  nowMs?: number;
}): Promise<{ ok: true; eventId: string; overview: CommunityEventsResponse }> {
  const nowMs = input.nowMs ?? Date.now();
  const id = `evt-${nowMs.toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const createdAt = new Date(nowMs).toISOString();

  const newEvent: CommunityEventDef = {
    id,
    title: input.draft.title,
    type: input.draft.type,
    gameSlug: input.draft.gameSlug,
    modality: input.draft.modality,
    location: input.draft.location,
    streamUrl: input.draft.streamUrl,
    description: input.draft.description,
    startsAt: input.draft.startsAt,
    endsAt: input.draft.endsAt,
    capacity: input.draft.capacity,
    featured: input.draft.featured,
    status: "open",
    hostNick: input.hostNick,
    createdAt,
  };

  try {
    await ensureSeededInDb();
    await db.insert(communityEvents).values({
      id: newEvent.id,
      title: newEvent.title,
      type: newEvent.type,
      gameSlug: newEvent.gameSlug,
      modality: newEvent.modality,
      location: newEvent.location,
      streamUrl: newEvent.streamUrl,
      description: newEvent.description,
      startsAt: new Date(newEvent.startsAt),
      endsAt: newEvent.endsAt ? new Date(newEvent.endsAt) : null,
      capacity: newEvent.capacity,
      featured: newEvent.featured,
      status: "open",
      hostNick: newEvent.hostNick,
      createdByUserId: input.userId,
      createdAt: new Date(createdAt),
    });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    store.events.unshift(newEvent);
    writeFallback(store);
  }

  const overview = await getEventsOverview({
    viewerUserId: input.userId,
    viewerIsModerator: true,
    nowMs,
  });
  return { ok: true, eventId: id, overview };
}

export async function updateCommunityEventStatus(input: {
  eventId: string;
  status: EventStatus;
  viewerUserId: number;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityEventsResponse }
  | { ok: false; status: number; error: string }
> {
  const state = await loadState();
  const ev = state.events.find((e) => e.id === input.eventId);
  if (!ev) {
    return { ok: false, status: 404, error: "Evento no encontrado." };
  }

  try {
    await db
      .update(communityEvents)
      .set({ status: input.status })
      .where(eq(communityEvents.id, ev.id));
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const target = store.events.find((e) => e.id === ev.id);
    if (target) target.status = input.status;
    writeFallback(store);
  }

  const overview = await getEventsOverview({
    viewerUserId: input.viewerUserId,
    viewerIsModerator: true,
    nowMs: input.nowMs,
  });
  return { ok: true, overview };
}
