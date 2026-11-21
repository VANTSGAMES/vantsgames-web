import fs from "node:fs";
import path from "node:path";
import { and, eq, gte } from "drizzle-orm";
import { db } from "./index.ts";
import {
  forumComments,
  forumPosts,
  forumReactions,
  lfgListings,
  missionProgress,
} from "./schema.ts";
import {
  WEEKLY_MISSIONS,
  computeMissionPercent,
  computeSeasonTier,
  getIsoWeekInfo,
  getMissionByCode,
  type MissionWithProgress,
  type WeeklyContributor,
  type WeeklyMissionsResponse,
  type WeeklyMissionsSummary,
} from "../../client/src/lib/missionsHelpers.ts";

interface StoredMissionRow {
  userId: number;
  userNick: string;
  weekKey: string;
  missionCode: string;
  progressCount: number;
  claimed: boolean;
  xpAwarded: number;
  proofNote: string | null;
  updatedAt: string;
}

interface MissionsFallbackStore {
  rows: StoredMissionRow[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FALLBACK_FILE = path.join(DATA_DIR, "community-missions.json");

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

function readFallback(): MissionsFallbackStore {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")) as Partial<MissionsFallbackStore>;
      return { rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
    }
  } catch (err) {
    console.warn("[communityMissions] fallback store reset:", (err as Error).message);
  }
  return { rows: [] };
}

function writeFallback(store: MissionsFallbackStore): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, FALLBACK_FILE);
}

/**
 * Calcula actividad real de la semana actual en Fase 1 (LFG) y Fase 2 (Foro/Reacciones)
 * para avanzar automáticamente las misiones comunitarias del jugador.
 */
async function computeAutoCountsForUser(
  userId: number,
  weekStartMs: number,
): Promise<Record<string, number>> {
  const since = new Date(weekStartMs);
  try {
    const [lfgRows, postRows, commentRows, reactRows] = await Promise.all([
      db
        .select({ id: lfgListings.id })
        .from(lfgListings)
        .where(and(eq(lfgListings.userId, userId), gte(lfgListings.createdAt, since))),
      db
        .select({ id: forumPosts.id })
        .from(forumPosts)
        .where(and(eq(forumPosts.userId, userId), gte(forumPosts.createdAt, since))),
      db
        .select({ id: forumComments.id })
        .from(forumComments)
        .where(and(eq(forumComments.userId, userId), gte(forumComments.createdAt, since))),
      db
        .select({ id: forumReactions.id })
        .from(forumReactions)
        .where(and(eq(forumReactions.userId, userId), gte(forumReactions.createdAt, since))),
    ]);

    return {
      "weekly-lfg-post": lfgRows.length,
      "weekly-forum-activity": postRows.length + commentRows.length,
      "weekly-forum-gg": reactRows.length,
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    let lfgCount = 0;
    let forumCount = 0;
    let reactCount = 0;

    try {
      const lfgPath = path.join(DATA_DIR, "community-lfg.json");
      if (fs.existsSync(lfgPath)) {
        const lfgData = JSON.parse(fs.readFileSync(lfgPath, "utf8")) as {
          listings?: { userId: number; createdAt: string }[];
        };
        lfgCount = (lfgData.listings || []).filter(
          (l) => l.userId === userId && new Date(l.createdAt).getTime() >= weekStartMs,
        ).length;
      }
    } catch {
      // ignore fallback read errors
    }

    try {
      const forumPath = path.join(DATA_DIR, "community-forum.json");
      if (fs.existsSync(forumPath)) {
        const forumData = JSON.parse(fs.readFileSync(forumPath, "utf8")) as {
          posts?: { userId: number; createdAt: string }[];
          comments?: { userId: number; createdAt: string }[];
          reactions?: { userId: number; createdAt: string }[];
        };
        const posts = (forumData.posts || []).filter(
          (p) => p.userId === userId && new Date(p.createdAt).getTime() >= weekStartMs,
        ).length;
        const comments = (forumData.comments || []).filter(
          (c) => c.userId === userId && new Date(c.createdAt).getTime() >= weekStartMs,
        ).length;
        const reacts = (forumData.reactions || []).filter(
          (r) => r.userId === userId && new Date(r.createdAt).getTime() >= weekStartMs,
        ).length;
        forumCount = posts + comments;
        reactCount = reacts;
      }
    } catch {
      // ignore fallback read errors
    }

    return {
      "weekly-lfg-post": lfgCount,
      "weekly-forum-activity": forumCount,
      "weekly-forum-gg": reactCount,
    };
  }
}

async function listWeekRows(weekKey: string): Promise<StoredMissionRow[]> {
  try {
    const rows = await db
      .select()
      .from(missionProgress)
      .where(eq(missionProgress.weekKey, weekKey));
    return rows.map((r) => ({
      userId: r.userId,
      userNick: r.userNick,
      weekKey: r.weekKey,
      missionCode: r.missionCode,
      progressCount: r.progressCount,
      claimed: r.claimed,
      xpAwarded: r.xpAwarded,
      proofNote: r.proofNote,
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    return readFallback().rows.filter((r) => r.weekKey === weekKey);
  }
}

async function upsertMissionRow(row: StoredMissionRow): Promise<StoredMissionRow> {
  try {
    const [saved] = await db
      .insert(missionProgress)
      .values({
        userId: row.userId,
        userNick: row.userNick,
        weekKey: row.weekKey,
        missionCode: row.missionCode,
        progressCount: row.progressCount,
        claimed: row.claimed,
        xpAwarded: row.xpAwarded,
        proofNote: row.proofNote,
        updatedAt: new Date(row.updatedAt),
      })
      .onConflictDoUpdate({
        target: [missionProgress.userId, missionProgress.weekKey, missionProgress.missionCode],
        set: {
          userNick: row.userNick,
          progressCount: row.progressCount,
          claimed: row.claimed,
          xpAwarded: row.xpAwarded,
          proofNote: row.proofNote,
          updatedAt: new Date(row.updatedAt),
        },
      })
      .returning();

    return {
      userId: saved.userId,
      userNick: saved.userNick,
      weekKey: saved.weekKey,
      missionCode: saved.missionCode,
      progressCount: saved.progressCount,
      claimed: saved.claimed,
      xpAwarded: saved.xpAwarded,
      proofNote: saved.proofNote,
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.rows.findIndex(
      (r) =>
        r.userId === row.userId &&
        r.weekKey === row.weekKey &&
        r.missionCode === row.missionCode,
    );
    if (idx === -1) {
      store.rows.push(row);
    } else {
      store.rows[idx] = row;
    }
    writeFallback(store);
    return row;
  }
}

export async function getWeeklyMissionsOverview(opts: {
  viewerUserId?: number | null;
  nowMs?: number;
}): Promise<WeeklyMissionsResponse> {
  const week = getIsoWeekInfo(opts.nowMs);
  const weekRows = await listWeekRows(week.weekKey);
  const autoCounts = opts.viewerUserId
    ? await computeAutoCountsForUser(opts.viewerUserId, week.weekStartMs)
    : {};

  const viewerRowsByCode = new Map<string, StoredMissionRow>();
  if (opts.viewerUserId) {
    for (const r of weekRows) {
      if (r.userId === opts.viewerUserId) {
        viewerRowsByCode.set(r.missionCode, r);
      }
    }
  }

  const missions: MissionWithProgress[] = WEEKLY_MISSIONS.map((def) => {
    const saved = viewerRowsByCode.get(def.code);
    const autoCount = autoCounts[def.code] || 0;
    const rawProgress = Math.max(saved?.progressCount || 0, autoCount);
    const current = Math.min(def.target, rawProgress);
    const claimed = Boolean(saved?.claimed);
    const completed = current >= def.target || claimed;
    return {
      ...def,
      current: claimed ? def.target : current,
      percent: claimed ? 100 : computeMissionPercent(current, def.target),
      completed,
      claimed,
      proofNote: saved?.proofNote || null,
    };
  });

  const maxWeeklyXp = WEEKLY_MISSIONS.reduce((acc, m) => acc + m.xp, 0);
  const xpEarned = missions.reduce((acc, m) => acc + (m.claimed ? m.xp : 0), 0);
  const missionsClaimed = missions.filter((m) => m.claimed).length;
  const tierInfo = computeSeasonTier(xpEarned);

  const summary: WeeklyMissionsSummary = {
    xpEarned,
    maxWeeklyXp,
    missionsClaimed,
    totalMissions: missions.length,
    percentOverall: maxWeeklyXp > 0 ? Math.round((xpEarned / maxWeeklyXp) * 100) : 0,
    tier: tierInfo.tier,
    nextTier: tierInfo.nextTier,
    xpToNextTier: tierInfo.xpToNextTier,
  };

  // Build real weekly contributors leaderboard from claimed missions this week
  const byUser = new Map<
    number,
    { userId: number; nick: string; xp: number; missionsCompleted: number; lastUpdated: number }
  >();
  for (const r of weekRows) {
    if (!r.claimed || r.xpAwarded <= 0) continue;
    const existing = byUser.get(r.userId) || {
      userId: r.userId,
      nick: r.userNick,
      xp: 0,
      missionsCompleted: 0,
      lastUpdated: 0,
    };
    existing.nick = r.userNick || existing.nick;
    existing.xp += r.xpAwarded;
    existing.missionsCompleted += 1;
    existing.lastUpdated = Math.max(existing.lastUpdated, new Date(r.updatedAt).getTime());
    byUser.set(r.userId, existing);
  }

  const leaderboard: WeeklyContributor[] = Array.from(byUser.values())
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.missionsCompleted !== a.missionsCompleted) {
        return b.missionsCompleted - a.missionsCompleted;
      }
      return a.lastUpdated - b.lastUpdated;
    })
    .slice(0, 15)
    .map((entry, idx) => ({
      rank: idx + 1,
      userId: entry.userId,
      nick: entry.nick,
      xp: entry.xp,
      missionsCompleted: entry.missionsCompleted,
      tier: computeSeasonTier(entry.xp).tier,
      isViewer: Boolean(opts.viewerUserId && entry.userId === opts.viewerUserId),
    }));

  return {
    weekKey: week.weekKey,
    weekRangeLabel: week.weekRangeLabel,
    resetsInLabel: week.resetsInLabel,
    missions,
    summary,
    leaderboard,
  };
}

export async function recordMissionProgress(input: {
  userId: number;
  userNick: string;
  missionCode: string;
  note?: string | null;
  nowMs?: number;
}): Promise<{ ok: true; overview: WeeklyMissionsResponse } | { ok: false; status: number; error: string }> {
  const def = getMissionByCode(input.missionCode);
  if (!def) {
    return { ok: false, status: 404, error: "Misión semanal no encontrada." };
  }

  const week = getIsoWeekInfo(input.nowMs);
  const weekRows = await listWeekRows(week.weekKey);
  const existing = weekRows.find(
    (r) => r.userId === input.userId && r.missionCode === def.code,
  );
  if (existing?.claimed) {
    return { ok: false, status: 409, error: "Ya reclamaste la recompensa de esta misión esta semana." };
  }

  const autoCounts = await computeAutoCountsForUser(input.userId, week.weekStartMs);
  const baseCount = Math.max(existing?.progressCount || 0, autoCounts[def.code] || 0);
  if (baseCount >= def.target) {
    return {
      ok: false,
      status: 409,
      error: "Ya alcanzaste el objetivo de esta misión. Reclama tu XP.",
    };
  }

  const nextCount = Math.min(def.target, baseCount + 1);
  await upsertMissionRow({
    userId: input.userId,
    userNick: input.userNick,
    weekKey: week.weekKey,
    missionCode: def.code,
    progressCount: nextCount,
    claimed: false,
    xpAwarded: 0,
    proofNote: input.note ?? existing?.proofNote ?? null,
    updatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  });

  const overview = await getWeeklyMissionsOverview({
    viewerUserId: input.userId,
    nowMs: input.nowMs,
  });
  return { ok: true, overview };
}

export async function claimMissionReward(input: {
  userId: number;
  userNick: string;
  missionCode: string;
  nowMs?: number;
}): Promise<
  | { ok: true; xpAwarded: number; overview: WeeklyMissionsResponse }
  | { ok: false; status: number; error: string }
> {
  const def = getMissionByCode(input.missionCode);
  if (!def) {
    return { ok: false, status: 404, error: "Misión semanal no encontrada." };
  }

  const week = getIsoWeekInfo(input.nowMs);
  const weekRows = await listWeekRows(week.weekKey);
  const existing = weekRows.find(
    (r) => r.userId === input.userId && r.missionCode === def.code,
  );
  if (existing?.claimed) {
    return { ok: false, status: 409, error: "Ya reclamaste el XP de esta misión esta semana." };
  }

  const autoCounts = await computeAutoCountsForUser(input.userId, week.weekStartMs);
  const effectiveProgress = Math.max(existing?.progressCount || 0, autoCounts[def.code] || 0);
  if (effectiveProgress < def.target) {
    return {
      ok: false,
      status: 400,
      error: `Aún te faltan ${def.target - effectiveProgress} paso(s) para completar esta misión.`,
    };
  }

  await upsertMissionRow({
    userId: input.userId,
    userNick: input.userNick,
    weekKey: week.weekKey,
    missionCode: def.code,
    progressCount: def.target,
    claimed: true,
    xpAwarded: def.xp,
    proofNote: existing?.proofNote ?? null,
    updatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  });

  const overview = await getWeeklyMissionsOverview({
    viewerUserId: input.userId,
    nowMs: input.nowMs,
  });
  return { ok: true, xpAwarded: def.xp, overview };
}
