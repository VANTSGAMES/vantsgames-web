import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
  communityPolls,
  communityPollVotes,
  pickemMatches,
  pickemPredictions,
} from "./schema.ts";
import {
  buildDefaultPickemMatches,
  buildDefaultPolls,
  computeOptionPercentages,
  computePickemScore,
  pollKindLabel,
  rankPickemLeaderboard,
  type CommunityVotingResponse,
  type PickemMatchDef,
  type PickemMatchWithStats,
  type PickemTeam,
  type PollDef,
  type PollKind,
  type PollOptionDef,
  type PollStatus,
  type PollWithResults,
  type RawPickemUserAggregate,
  type ValidatedCustomPollDraft,
} from "../../client/src/lib/votingHelpers.ts";

interface StoredVote {
  pollId: string;
  userId: number;
  userNick: string;
  optionId: string;
  updatedAt: string;
}

interface StoredPrediction {
  matchId: string;
  userId: number;
  userNick: string;
  pickedTeamId: string;
  updatedAt: string;
}

interface VotingFallbackStore {
  polls: PollDef[];
  votes: StoredVote[];
  matches: PickemMatchDef[];
  predictions: StoredPrediction[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FALLBACK_FILE = path.join(DATA_DIR, "community-voting.json");

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

function readFallback(): VotingFallbackStore {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")) as Partial<VotingFallbackStore>;
      const polls =
        Array.isArray(parsed.polls) && parsed.polls.length > 0
          ? parsed.polls
          : buildDefaultPolls();
      const matches =
        Array.isArray(parsed.matches) && parsed.matches.length > 0
          ? parsed.matches
          : buildDefaultPickemMatches();
      return {
        polls,
        votes: Array.isArray(parsed.votes) ? parsed.votes : [],
        matches,
        predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
      };
    }
  } catch (err) {
    console.warn("[communityVoting] fallback store reset:", (err as Error).message);
  }
  const initial: VotingFallbackStore = {
    polls: buildDefaultPolls(),
    votes: [],
    matches: buildDefaultPickemMatches(),
    predictions: [],
  };
  writeFallback(initial);
  return initial;
}

function writeFallback(store: VotingFallbackStore): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, FALLBACK_FILE);
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function ensureSeededInDb(): Promise<void> {
  const existingPolls = await db.select({ id: communityPolls.id }).from(communityPolls).limit(1);
  if (existingPolls.length === 0) {
    const defaults = buildDefaultPolls();
    for (const p of defaults) {
      await db
        .insert(communityPolls)
        .values({
          id: p.id,
          kind: p.kind,
          title: p.title,
          description: p.description,
          gameSlug: p.gameSlug ?? null,
          badge: p.badge,
          optionsJson: JSON.stringify(p.options),
          status: p.status,
          closesAt: new Date(p.closesAt),
          createdByUserId: null,
        })
        .onConflictDoNothing();
    }
  }

  const existingMatches = await db.select({ id: pickemMatches.id }).from(pickemMatches).limit(1);
  if (existingMatches.length === 0) {
    const defaults = buildDefaultPickemMatches();
    for (const m of defaults) {
      await db
        .insert(pickemMatches)
        .values({
          id: m.id,
          stage: m.stage,
          tournamentName: m.tournamentName,
          gameSlug: m.gameSlug,
          teamAJson: JSON.stringify(m.teamA),
          teamBJson: JSON.stringify(m.teamB),
          bestOf: m.bestOf,
          startsAt: new Date(m.startsAt),
          points: m.points,
          locked: m.locked,
          winnerId: m.winnerId,
        })
        .onConflictDoNothing();
    }
  }
}

async function loadState(): Promise<VotingFallbackStore> {
  try {
    await ensureSeededInDb();
    const [pollRows, voteRows, matchRows, predRows] = await Promise.all([
      db.select().from(communityPolls),
      db.select().from(communityPollVotes),
      db.select().from(pickemMatches),
      db.select().from(pickemPredictions),
    ]);

    const polls: PollDef[] = pollRows.map((p) => ({
      id: p.id,
      kind: (p.kind as PollKind) || "comunidad",
      title: p.title,
      description: p.description,
      gameSlug: p.gameSlug,
      badge: p.badge,
      status: p.status === "closed" ? "closed" : "open",
      closesAt: p.closesAt.toISOString(),
      options: parseJsonSafe<PollOptionDef[]>(p.optionsJson, []),
    }));

    const votes: StoredVote[] = voteRows.map((v) => ({
      pollId: v.pollId,
      userId: v.userId,
      userNick: v.userNick,
      optionId: v.optionId,
      updatedAt: v.updatedAt.toISOString(),
    }));

    const matches: PickemMatchDef[] = matchRows.map((m) => ({
      id: m.id,
      stage: m.stage === "final" ? "final" : "semifinal",
      tournamentName: m.tournamentName,
      gameSlug: m.gameSlug,
      teamA: parseJsonSafe<PickemTeam>(m.teamAJson, { id: "a", name: "Equipo A", tag: "A", seed: "#1" }),
      teamB: parseJsonSafe<PickemTeam>(m.teamBJson, { id: "b", name: "Equipo B", tag: "B", seed: "#2" }),
      bestOf: m.bestOf,
      startsAt: m.startsAt.toISOString(),
      points: m.points,
      locked: m.locked,
      winnerId: m.winnerId,
    }));

    const predictions: StoredPrediction[] = predRows.map((pr) => ({
      matchId: pr.matchId,
      userId: pr.userId,
      userNick: pr.userNick,
      pickedTeamId: pr.pickedTeamId,
      updatedAt: pr.updatedAt.toISOString(),
    }));

    return { polls, votes, matches, predictions };
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    return readFallback();
  }
}

export async function getVotingOverview(opts: {
  viewerUserId?: number | null;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<CommunityVotingResponse> {
  const nowMs = opts.nowMs ?? Date.now();
  const state = await loadState();

  // Build polls with live vote percentages
  const votesByPoll = new Map<string, StoredVote[]>();
  for (const v of state.votes) {
    const arr = votesByPoll.get(v.pollId) || [];
    arr.push(v);
    votesByPoll.set(v.pollId, arr);
  }

  const polls: PollWithResults[] = state.polls.map((poll) => {
    const pollVotes = votesByPoll.get(poll.id) || [];
    const counts: Record<string, number> = {};
    let viewerOptionId: string | null = null;

    for (const v of pollVotes) {
      counts[v.optionId] = (counts[v.optionId] || 0) + 1;
      if (opts.viewerUserId && v.userId === opts.viewerUserId) {
        viewerOptionId = v.optionId;
      }
    }

    const { results, totalVotes } = computeOptionPercentages(poll.options, counts);
    const closesMs = new Date(poll.closesAt).getTime();
    const isExpired = Number.isFinite(closesMs) && closesMs <= nowMs;
    const isOpenForVoting = poll.status === "open" && !isExpired;

    return {
      ...poll,
      options: results,
      totalVotes,
      viewerOptionId,
      isExpired,
      isOpenForVoting,
    };
  });

  // Build Pick'em matches with community pick split & viewer status
  const predsByMatch = new Map<string, StoredPrediction[]>();
  const predsByUser = new Map<number, { nick: string; picks: Record<string, string>; firstUpdatedMs: number }>();

  for (const pr of state.predictions) {
    const mArr = predsByMatch.get(pr.matchId) || [];
    mArr.push(pr);
    predsByMatch.set(pr.matchId, mArr);

    const ts = new Date(pr.updatedAt).getTime();
    const uEntry = predsByUser.get(pr.userId) || {
      nick: pr.userNick,
      picks: {},
      firstUpdatedMs: Number.isFinite(ts) ? ts : nowMs,
    };
    uEntry.nick = pr.userNick || uEntry.nick;
    uEntry.picks[pr.matchId] = pr.pickedTeamId;
    if (Number.isFinite(ts)) {
      uEntry.firstUpdatedMs = Math.min(uEntry.firstUpdatedMs, ts);
    }
    predsByUser.set(pr.userId, uEntry);
  }

  const pickemMatchesOut: PickemMatchWithStats[] = state.matches.map((m) => {
    const mPreds = predsByMatch.get(m.id) || [];
    let teamAPicks = 0;
    let teamBPicks = 0;
    let viewerPickTeamId: string | null = null;

    for (const pr of mPreds) {
      if (pr.pickedTeamId === m.teamA.id) teamAPicks += 1;
      else if (pr.pickedTeamId === m.teamB.id) teamBPicks += 1;
      if (opts.viewerUserId && pr.userId === opts.viewerUserId) {
        viewerPickTeamId = pr.pickedTeamId;
      }
    }

    const totalPicks = teamAPicks + teamBPicks;
    const teamAPercent = totalPicks > 0 ? Math.round((teamAPicks / totalPicks) * 100) : 50;
    const teamBPercent = totalPicks > 0 ? 100 - teamAPercent : 50;

    let viewerOutcome: "pending" | "hit" | "miss" | null = null;
    if (viewerPickTeamId) {
      if (!m.winnerId) viewerOutcome = "pending";
      else viewerOutcome = viewerPickTeamId === m.winnerId ? "hit" : "miss";
    }

    return {
      ...m,
      totalPicks,
      teamAPicks,
      teamBPicks,
      teamAPercent,
      teamBPercent,
      viewerPickTeamId,
      viewerOutcome,
    };
  });

  const viewerPicks = opts.viewerUserId ? predsByUser.get(opts.viewerUserId)?.picks || {} : {};
  const pickemSummary = computePickemScore(state.matches, viewerPicks);

  const rawLeaderboard: RawPickemUserAggregate[] = Array.from(predsByUser.entries()).map(
    ([userId, entry]) => {
      const score = computePickemScore(state.matches, entry.picks);
      return {
        userId,
        nick: entry.nick,
        points: score.points,
        hits: score.hits,
        resolvedCount: score.resolvedCount,
        picksSubmitted: score.picksSubmitted,
        accuracyPercent: score.accuracyPercent,
        firstUpdatedMs: entry.firstUpdatedMs,
      };
    },
  );

  const leaderboard = rankPickemLeaderboard(rawLeaderboard, opts.viewerUserId, 15);

  return {
    polls,
    pickemMatches: pickemMatchesOut,
    pickemSummary,
    leaderboard,
    viewer: {
      isModerator: Boolean(opts.viewerIsModerator),
    },
  };
}

export async function castPollVote(input: {
  pollId: string;
  optionId: string;
  userId: number;
  userNick: string;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityVotingResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const poll = state.polls.find((p) => p.id === input.pollId);
  if (!poll) {
    return { ok: false, status: 404, error: "Encuesta no encontrada." };
  }

  const closesMs = new Date(poll.closesAt).getTime();
  if (poll.status !== "open" || (Number.isFinite(closesMs) && closesMs <= nowMs)) {
    return { ok: false, status: 409, error: "Esta encuesta ya está cerrada y no acepta más votos." };
  }

  const validOption = poll.options.some((o) => o.id === input.optionId);
  if (!validOption) {
    return { ok: false, status: 400, error: "La opción seleccionada no existe en esta encuesta." };
  }

  const nowDate = new Date(nowMs);
  try {
    await db
      .insert(communityPollVotes)
      .values({
        pollId: poll.id,
        userId: input.userId,
        userNick: input.userNick,
        optionId: input.optionId,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [communityPollVotes.pollId, communityPollVotes.userId],
        set: {
          userNick: input.userNick,
          optionId: input.optionId,
          updatedAt: nowDate,
        },
      });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.votes.findIndex((v) => v.pollId === poll.id && v.userId === input.userId);
    const nextVote: StoredVote = {
      pollId: poll.id,
      userId: input.userId,
      userNick: input.userNick,
      optionId: input.optionId,
      updatedAt: nowDate.toISOString(),
    };
    if (idx === -1) store.votes.push(nextVote);
    else store.votes[idx] = nextVote;
    writeFallback(store);
  }

  const overview = await getVotingOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, overview };
}

export async function createCustomPoll(input: {
  userId: number;
  draft: ValidatedCustomPollDraft;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<{ ok: true; pollId: string; overview: CommunityVotingResponse }> {
  const nowMs = input.nowMs ?? Date.now();
  const id = `poll-${nowMs.toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const closesAt = new Date(nowMs + input.draft.closesInDays * 24 * 60 * 60 * 1000);
  const badge = pollKindLabel(input.draft.kind);

  const newPoll: PollDef = {
    id,
    kind: input.draft.kind,
    title: input.draft.title,
    description: input.draft.description,
    gameSlug: input.draft.gameSlug,
    badge,
    status: "open",
    closesAt: closesAt.toISOString(),
    options: input.draft.options,
  };

  try {
    await ensureSeededInDb();
    await db.insert(communityPolls).values({
      id: newPoll.id,
      kind: newPoll.kind,
      title: newPoll.title,
      description: newPoll.description,
      gameSlug: newPoll.gameSlug ?? null,
      badge: newPoll.badge,
      optionsJson: JSON.stringify(newPoll.options),
      status: "open",
      closesAt,
      createdByUserId: input.userId,
    });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    store.polls.unshift(newPoll);
    writeFallback(store);
  }

  const overview = await getVotingOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, pollId: id, overview };
}

export async function updatePollStatus(input: {
  pollId: string;
  status: PollStatus;
  viewerUserId: number;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityVotingResponse }
  | { ok: false; status: number; error: string }
> {
  const state = await loadState();
  const poll = state.polls.find((p) => p.id === input.pollId);
  if (!poll) {
    return { ok: false, status: 404, error: "Encuesta no encontrada." };
  }

  try {
    await db
      .update(communityPolls)
      .set({ status: input.status })
      .where(eq(communityPolls.id, poll.id));
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const target = store.polls.find((p) => p.id === poll.id);
    if (target) target.status = input.status;
    writeFallback(store);
  }

  const overview = await getVotingOverview({
    viewerUserId: input.viewerUserId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs: input.nowMs,
  });
  return { ok: true, overview };
}

export async function submitPickemPrediction(input: {
  matchId: string;
  pickedTeamId: string;
  userId: number;
  userNick: string;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityVotingResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match) {
    return { ok: false, status: 404, error: "Serie Pick'em no encontrada." };
  }

  if (match.locked || match.winnerId) {
    return {
      ok: false,
      status: 409,
      error: "Las predicciones para esta serie ya están cerradas.",
    };
  }

  if (input.pickedTeamId !== match.teamA.id && input.pickedTeamId !== match.teamB.id) {
    return { ok: false, status: 400, error: "El equipo elegido no corresponde a esta serie." };
  }

  const nowDate = new Date(nowMs);
  try {
    await db
      .insert(pickemPredictions)
      .values({
        matchId: match.id,
        userId: input.userId,
        userNick: input.userNick,
        pickedTeamId: input.pickedTeamId,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [pickemPredictions.matchId, pickemPredictions.userId],
        set: {
          userNick: input.userNick,
          pickedTeamId: input.pickedTeamId,
          updatedAt: nowDate,
        },
      });
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const idx = store.predictions.findIndex(
      (p) => p.matchId === match.id && p.userId === input.userId,
    );
    const nextPred: StoredPrediction = {
      matchId: match.id,
      userId: input.userId,
      userNick: input.userNick,
      pickedTeamId: input.pickedTeamId,
      updatedAt: nowDate.toISOString(),
    };
    if (idx === -1) store.predictions.push(nextPred);
    else store.predictions[idx] = nextPred;
    writeFallback(store);
  }

  const overview = await getVotingOverview({
    viewerUserId: input.userId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, overview };
}

export async function resolvePickemMatch(input: {
  matchId: string;
  winnerId?: string | null;
  locked?: boolean;
  viewerUserId: number;
  viewerIsModerator?: boolean;
  nowMs?: number;
}): Promise<
  | { ok: true; overview: CommunityVotingResponse }
  | { ok: false; status: number; error: string }
> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadState();
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match) {
    return { ok: false, status: 404, error: "Serie Pick'em no encontrada." };
  }

  const nextWinnerId = input.winnerId === undefined ? match.winnerId : input.winnerId;
  if (
    nextWinnerId !== null &&
    nextWinnerId !== match.teamA.id &&
    nextWinnerId !== match.teamB.id
  ) {
    return { ok: false, status: 400, error: "Ganador inválido para esta serie." };
  }

  const nextLocked =
    nextWinnerId !== null
      ? true
      : typeof input.locked === "boolean"
        ? input.locked
        : match.locked;

  try {
    await db
      .update(pickemMatches)
      .set({
        winnerId: nextWinnerId,
        locked: nextLocked,
        updatedAt: new Date(nowMs),
      })
      .where(eq(pickemMatches.id, match.id));
  } catch (err) {
    if (!isDbConnectionOrSchemaError(err)) throw err;
    const store = readFallback();
    const target = store.matches.find((m) => m.id === match.id);
    if (target) {
      target.winnerId = nextWinnerId;
      target.locked = nextLocked;
    }
    writeFallback(store);
  }

  const overview = await getVotingOverview({
    viewerUserId: input.viewerUserId,
    viewerIsModerator: input.viewerIsModerator,
    nowMs,
  });
  return { ok: true, overview };
}
