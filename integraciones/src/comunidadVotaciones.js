// VANTS · Comunidad Fase 4: Encuestas oficiales y Pick'em (Votaciones)
// -----------------------------------------------------------------------------
// Persiste en D1 (`vants-db`) con autocreación de tablas `integ_community_voting_*`
// y seed inicial (4 encuestas + 4 series Pick'em). Contrato JSON idéntico al de
// Express para `client/src/lib/communityApi.ts` y `client/src/pages/VotacionesComunidad.tsx`:
//
//   GET    /community/voting                    (público + JWT opcional)
//   POST   /community/polls                     (owner/moderador)
//   PATCH  /community/polls/:id                 (owner/moderador; status open|closed)
//   POST   /community/polls/:id/vote            (sesión; un voto por usuario, re-votar lo cambia)
//   POST   /community/pickem/:matchId/predict   (sesión)
//   PATCH  /community/pickem/:matchId           (owner/moderador; winnerId y/o locked)
//
// Los errores usan `{ error }` como en Express.

import { esOwner } from './comunidad.js';

const VALID_POLL_KINDS = new Set(['torneo', 'mvp_clip', 'comunidad']);
const POLL_KIND_LABELS = { torneo: 'Próximo Torneo', mvp_clip: 'Clip / MVP', comunidad: 'Comunidad' };
const VALID_GAME_SLUGS = new Set([
  'general', 'valorant', 'cs2', 'fortnite', 'fc27', 'smash',
  'warzone', 'freefire', 'lol', 'wildrift', 'mlbb', 'clashroyale',
]);
const DEFAULT_OWNER_EMAILS = new Set(['geimerjhoan099@gmail.com']);

function pollKindLabel(kind) {
  return POLL_KIND_LABELS[kind] || 'Encuesta';
}

let tablasListas = false;
export function resetComunidadVotacionesCacheForTests() {
  tablasListas = false;
}

async function ensureTablasVotaciones(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_voting_polls (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'comunidad',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    game_slug TEXT,
    badge TEXT NOT NULL,
    options_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    closes_at TEXT NOT NULL,
    created_by_sub TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_voting_votes (
    poll_id TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    user_nick TEXT NOT NULL,
    option_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (poll_id, user_sub)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_voting_matches (
    id TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'semifinal',
    tournament_name TEXT NOT NULL,
    game_slug TEXT NOT NULL,
    team_a_json TEXT NOT NULL,
    team_b_json TEXT NOT NULL,
    best_of TEXT NOT NULL DEFAULT 'Bo3',
    starts_at TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 10,
    locked INTEGER NOT NULL DEFAULT 0,
    winner_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_voting_predictions (
    match_id TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    user_nick TEXT NOT NULL,
    picked_team_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (match_id, user_sub)
  )`).run();
  tablasListas = true;
}

function buildDefaultPolls(nowMs = Date.now()) {
  const inDays = (days) => new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "next-community-tournament-game",
      kind: "torneo",
      title: "¿Qué juego quieres para la Copa Comunitaria VANTS?",
      description:
        "El título más votado abrirá inscripciones gratuitas con bracket oficial y cobertura en directo este fin de semana.",
      gameSlug: null,
      badge: "Torneo Comunitario",
      closesAt: inDays(5),
      status: "open",
      options: [
        { id: "valorant", label: "VALORANT · Copa 5v5", subtitle: "Servidores Miami / Bogotá · Map pool activo", gameSlug: "valorant", tag: "5v5" },
        { id: "cs2", label: "Counter-Strike 2 · Copa FACEIT", subtitle: "5v5 MR12 · Ranking FACEIT conectado", gameSlug: "cs2", tag: "5v5" },
        { id: "fortnite", label: "Fortnite · Dúos Zero Build", subtitle: "4 partidas por puntos + bonus de eliminaciones", gameSlug: "fortnite", tag: "Dúos" },
        { id: "fc27", label: "FC 27 · Copa 1v1 Eliminación", subtitle: "Crossplay PS5 / Xbox / PC · Ida y vuelta", gameSlug: "fc27", tag: "1v1" },
        { id: "lol", label: "League of Legends · Grieta 5v5", subtitle: "Torneo Draft LAN · Eliminación directa", gameSlug: "lol", tag: "5v5" },
      ],
    },
    {
      id: "next-community-tournament-format",
      kind: "torneo",
      title: "Elige formato y horario oficial del próximo torneo",
      description:
        "Define el formato competitivo y la franja horaria (hora Venezuela / VET) que mejor se adapte a tu equipo.",
      gameSlug: null,
      badge: "Formato y Horario",
      closesAt: inDays(4),
      status: "open",
      options: [
        { id: "fri-bo1", label: "Viernes 20:00 VET · Eliminación Directa Bo1", subtitle: "Rápido, ideal para completar en una sola noche", tag: "Bo1" },
        { id: "sat-de-bo3", label: "Sábado 18:00 VET · Doble Eliminación (Final Bo3)", subtitle: "Segunda oportunidad en bracket inferior", tag: "Doble Elim." },
        { id: "sun-swiss", label: "Domingo 16:00 VET · Sistema Suizo + Top 4", subtitle: "Todos los equipos juegan al menos 3 partidas", tag: "Suizo" },
        { id: "sat-night-flash", label: "Sábado 21:00 VET · Copa Flash Relámpago", subtitle: "Cupo ágil de 16 equipos con check-in exprés", tag: "Flash" },
      ],
    },
    {
      id: "clip-of-the-week-s4",
      kind: "mvp_clip",
      title: "Vota el Clip de la Semana · Temporada 4",
      description:
        "El ganador entra a la vitrina de Clips Destacados en la portada y suma insignia de creador semanal.",
      gameSlug: null,
      badge: "Clip de la Semana",
      closesAt: inDays(3),
      status: "open",
      options: [
        { id: "clip-val-ascent", label: "Ace Clutch 1v4 en Ascent con Jett", subtitle: "Post-plant en A con 12 HP restantes", gameSlug: "valorant", tag: "Clutch" },
        { id: "clip-cs2-mirage", label: "Retake 1v3 con AWP no-scope en Mirage", subtitle: "Triple baja en sitio B en ronda decisiva", gameSlug: "cs2", tag: "AWP" },
        { id: "clip-fn-endgame", label: "Victory Royale último círculo en solitario", subtitle: "Rotación perfecta sin escudos vs 2 dúos", gameSlug: "fortnite", tag: "Endgame" },
        { id: "clip-fc27-90", label: "Gol de tiro libre al minuto 90' en semifinal", subtitle: "Remontada 3-2 en tiempo añadido", gameSlug: "fc27", tag: "Min 90'" },
      ],
    },
    {
      id: "mvp-circuit-s4",
      kind: "mvp_clip",
      title: "MVP del Circuito VANTS · Jornada S4",
      description:
        "Reconoce al jugador de mayor impacto competitivo en las series recientes del circuito oficial.",
      gameSlug: "valorant",
      badge: "MVP Oficial",
      closesAt: inDays(6),
      status: "open",
      options: [
        { id: "mvp-entry", label: "Duelista / Entry con 1.48 K/D en playoffs", subtitle: "Apertura de sitio en 72% de las rondas atacantes", gameSlug: "valorant", tag: "Entry" },
        { id: "mvp-awp", label: "AWPer dominante con +18 kills de apertura", subtitle: "Control total de medio en la serie de CS2", gameSlug: "cs2", tag: "Sniper" },
        { id: "mvp-igl", label: "IGL con lectura perfecta en mapas decisivos", subtitle: "Remontada 9-3 a 13-11 con ajustes en vivo", gameSlug: "valorant", tag: "IGL" },
        { id: "mvp-flex", label: "Jugador Flex / Soporte con 92% KAST", subtitle: "Utilidad clave y 4 clutches ganados en el torneo", gameSlug: "cs2", tag: "Soporte" },
      ],
    },
  ];
}

function buildDefaultPickemMatches(nowMs = Date.now()) {
  const inHours = (hours) => new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "val-s4-semi-1",
      stage: "semifinal",
      tournamentName: "VANTS Masters VALORANT · S4",
      gameSlug: "valorant",
      teamA: { id: "caracas-five", name: "Caracas Five", tag: "CCS", seed: "#1" },
      teamB: { id: "andes-vanguard", name: "Andes Vanguard", tag: "AND", seed: "#4" },
      bestOf: "Bo3",
      startsAt: inHours(30),
      points: 10,
      locked: false,
      winnerId: null,
    },
    {
      id: "val-s4-semi-2",
      stage: "semifinal",
      tournamentName: "VANTS Masters VALORANT · S4",
      gameSlug: "valorant",
      teamA: { id: "zulia-apex", name: "Zulia Apex", tag: "ZUL", seed: "#2" },
      teamB: { id: "latam-eclipse", name: "LATAM Eclipse", tag: "ECL", seed: "#3" },
      bestOf: "Bo3",
      startsAt: inHours(34),
      points: 10,
      locked: false,
      winnerId: null,
    },
    {
      id: "cs2-s4-final",
      stage: "final",
      tournamentName: "Copa FACEIT CS2 Venezuela · Gran Final",
      gameSlug: "cs2",
      teamA: { id: "vants-crimson", name: "VANTS Crimson", tag: "VNT", seed: "#1" },
      teamB: { id: "orinoco-wolves", name: "Orinoco Wolves", tag: "ORN", seed: "#2" },
      bestOf: "Bo3",
      startsAt: inHours(52),
      points: 20,
      locked: false,
      winnerId: null,
    },
    {
      id: "lol-s4-final",
      stage: "final",
      tournamentName: "Liga Grieta LATAM · Gran Final",
      gameSlug: "lol",
      teamA: { id: "avila-esports", name: "Ávila Esports", tag: "AVL", seed: "#1" },
      teamB: { id: "caribe-titans", name: "Caribe Titans", tag: "CRB", seed: "#2" },
      bestOf: "Bo5",
      startsAt: inHours(60),
      points: 20,
      locked: false,
      winnerId: null,
    },
  ];
}

async function ensureSeeded(db, nowMs = Date.now()) {
  await ensureTablasVotaciones(db);
  const hitPoll = await db.prepare('SELECT id FROM integ_community_voting_polls LIMIT 1').first();
  if (!hitPoll) {
    for (const pl of buildDefaultPolls(nowMs)) {
      await db.prepare(
        `INSERT OR IGNORE INTO integ_community_voting_polls
          (id, kind, title, description, game_slug, badge, options_json, status, closes_at, created_by_sub, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      ).bind(
        pl.id, pl.kind, pl.title, pl.description, pl.gameSlug ?? null, pl.badge,
        JSON.stringify(pl.options), pl.status, pl.closesAt, new Date(nowMs).toISOString(),
      ).run();
    }
  }
  const hitMatch = await db.prepare('SELECT id FROM integ_community_voting_matches LIMIT 1').first();
  if (!hitMatch) {
    for (const mt of buildDefaultPickemMatches(nowMs)) {
      await db.prepare(
        `INSERT OR IGNORE INTO integ_community_voting_matches
          (id, stage, tournament_name, game_slug, team_a_json, team_b_json, best_of, starts_at, points, locked, winner_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        mt.id, mt.stage, mt.tournamentName, mt.gameSlug, JSON.stringify(mt.teamA), JSON.stringify(mt.teamB),
        mt.bestOf, mt.startsAt, mt.points, mt.locked ? 1 : 0, mt.winnerId, new Date(nowMs).toISOString(),
      ).run();
    }
  }
}

function parseJsonSafe(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function computeOptionPercentages(options, voteCounts) {
  const safeCounts = options.map((opt) => {
    const raw = Number(voteCounts[opt.id] || 0);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  const totalVotes = safeCounts.reduce((acc, n) => acc + n, 0);
  const results = options.map((opt, idx) => {
    const votes = safeCounts[idx];
    return { ...opt, votes, percent: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0 };
  });
  return { results, totalVotes };
}

function computePickemScore(matches, picksByMatchId) {
  let points = 0, hits = 0, misses = 0, pending = 0, picksSubmitted = 0, resolvedCount = 0;
  const maxPoints = matches.reduce((acc, m) => acc + m.points, 0);
  for (const m of matches) {
    const pick = picksByMatchId[m.id];
    if (!pick) continue;
    picksSubmitted += 1;
    if (!m.winnerId) {
      pending += 1;
    } else {
      resolvedCount += 1;
      if (pick === m.winnerId) { hits += 1; points += m.points; } else { misses += 1; }
    }
  }
  const accuracyPercent = resolvedCount > 0 ? Math.round((hits / resolvedCount) * 100) : 0;
  return { points, maxPoints, hits, misses, pending, picksSubmitted, totalMatches: matches.length, resolvedCount, accuracyPercent };
}

function rankPickemLeaderboard(entries, viewerKey, limit = 15) {
  return [...entries]
    .filter((e) => e.picksSubmitted > 0)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
      if (b.picksSubmitted !== a.picksSubmitted) return b.picksSubmitted - a.picksSubmitted;
      return a.firstUpdatedMs - b.firstUpdatedMs;
    })
    .slice(0, limit)
    .map((e, idx) => ({
      rank: idx + 1,
      userId: e.userId,
      nick: e.nick,
      points: e.points,
      hits: e.hits,
      resolvedCount: e.resolvedCount,
      picksSubmitted: e.picksSubmitted,
      accuracyPercent: e.accuracyPercent,
      isViewer: Boolean(viewerKey && e.key === viewerKey),
    }));
}

// userId numérico estable derivado del sub (el cliente lo tipa como number).
function userIdDeSub(sub) {
  let h = 0;
  for (const ch of String(sub)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function slugifyOption(label, idx) {
  const base = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return `${base || 'opcion'}-${idx + 1}`;
}

function validateCustomPollDraft(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 6 || title.length > 140) {
    return { ok: false, error: 'El título de la encuesta debe tener entre 6 y 140 caracteres.' };
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length < 6 || description.length > 360) {
    return { ok: false, error: 'La descripción debe tener entre 6 y 360 caracteres.' };
  }
  const rawKind = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : 'comunidad';
  if (!VALID_POLL_KINDS.has(rawKind)) return { ok: false, error: 'Categoría de encuesta inválida.' };

  const rawGame = typeof input.gameSlug === 'string' ? input.gameSlug.trim().toLowerCase() : '';
  const gameSlug = rawGame && rawGame !== 'general' ? rawGame : null;
  if (gameSlug && !VALID_GAME_SLUGS.has(gameSlug)) return { ok: false, error: 'Videojuego seleccionado inválido.' };

  const rawDays = Number(input.closesInDays ?? 5);
  const closesInDays = Number.isFinite(rawDays) ? Math.min(30, Math.max(1, Math.round(rawDays))) : 5;

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const cleanedLabels = [];
  const seen = new Set();
  for (const item of rawOptions) {
    const label = typeof item === 'string' ? item.trim() : '';
    if (!label) continue;
    if (label.length < 2 || label.length > 90) {
      return { ok: false, error: 'Cada opción debe tener entre 2 y 90 caracteres.' };
    }
    const key = label.toLowerCase();
    if (seen.has(key)) return { ok: false, error: 'No puede haber opciones duplicadas en la encuesta.' };
    seen.add(key);
    cleanedLabels.push(label);
  }
  if (cleanedLabels.length < 2 || cleanedLabels.length > 6) {
    return { ok: false, error: 'Agrega entre 2 y 6 opciones para la encuesta.' };
  }
  const options = cleanedLabels.map((label, idx) => {
    const o = { id: slugifyOption(label, idx), label };
    if (gameSlug) o.gameSlug = gameSlug;
    return o;
  });
  return { ok: true, data: { title, description, kind: rawKind, gameSlug, closesInDays, options } };
}

async function esModeradorVotaciones(env, claims) {
  if (!claims || !claims.sub) return false;
  const email = String(claims.email || '').trim().toLowerCase();
  if (email && DEFAULT_OWNER_EMAILS.has(email)) return true;
  const extra = String(env.VANTS_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email && extra.includes(email)) return true;
  return esOwner(env.DB, claims.sub).catch(() => false);
}

async function resolverNickJugador(db, claims) {
  const sub = claims && claims.sub ? String(claims.sub) : '';
  if (sub) {
    const p = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (p && (p.display_name || p.username)) return String(p.display_name || p.username).trim().slice(0, 60);
    const rk = await db.prepare('SELECT nick FROM integ_ranking WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (rk && rk.nick) return String(rk.nick).trim().slice(0, 60);
  }
  const fallback = (claims && claims.name) || (claims && claims.email ? String(claims.email).split('@')[0] : '') || 'Jugador';
  return String(fallback).trim().slice(0, 60) || 'Jugador';
}

async function cargarEstado(db, nowMs) {
  await ensureSeeded(db, nowMs);
  const [pR, vR, mR, prR] = await Promise.all([
    db.prepare('SELECT * FROM integ_community_voting_polls ORDER BY created_at DESC').all(),
    db.prepare('SELECT * FROM integ_community_voting_votes').all(),
    db.prepare('SELECT * FROM integ_community_voting_matches').all(),
    db.prepare('SELECT * FROM integ_community_voting_predictions').all(),
  ]);
  const polls = (pR.results || []).map((r) => ({
    id: r.id,
    kind: r.kind || 'comunidad',
    title: r.title,
    description: r.description,
    gameSlug: r.game_slug || null,
    badge: r.badge,
    status: r.status === 'closed' ? 'closed' : 'open',
    closesAt: r.closes_at,
    options: parseJsonSafe(r.options_json, []),
  }));
  const matches = (mR.results || []).map((r) => ({
    id: r.id,
    stage: r.stage === 'final' ? 'final' : 'semifinal',
    tournamentName: r.tournament_name,
    gameSlug: r.game_slug,
    teamA: parseJsonSafe(r.team_a_json, { id: 'a', name: 'Equipo A', tag: 'A', seed: '#1' }),
    teamB: parseJsonSafe(r.team_b_json, { id: 'b', name: 'Equipo B', tag: 'B', seed: '#2' }),
    bestOf: r.best_of,
    startsAt: r.starts_at,
    points: Number(r.points) || 0,
    locked: Boolean(r.locked),
    winnerId: r.winner_id || null,
  }));
  return { polls, votes: vR.results || [], matches, predictions: prR.results || [] };
}

async function construirOverview(db, { viewerSub = null, viewerIsModerator = false, nowMs = Date.now() } = {}) {
  const state = await cargarEstado(db, nowMs);

  const votesByPoll = new Map();
  for (const v of state.votes) {
    const arr = votesByPoll.get(v.poll_id) || [];
    arr.push(v);
    votesByPoll.set(v.poll_id, arr);
  }

  const polls = state.polls.map((poll) => {
    const counts = {};
    let viewerOptionId = null;
    for (const v of votesByPoll.get(poll.id) || []) {
      counts[v.option_id] = (counts[v.option_id] || 0) + 1;
      if (viewerSub && v.user_sub === viewerSub) viewerOptionId = v.option_id;
    }
    const { results, totalVotes } = computeOptionPercentages(poll.options, counts);
    const closesMs = new Date(poll.closesAt).getTime();
    const isExpired = Number.isFinite(closesMs) && closesMs <= nowMs;
    return {
      ...poll,
      options: results,
      totalVotes,
      viewerOptionId,
      isExpired,
      isOpenForVoting: poll.status === 'open' && !isExpired,
    };
  });

  const predsByMatch = new Map();
  const predsByUser = new Map();
  for (const pr of state.predictions) {
    const mArr = predsByMatch.get(pr.match_id) || [];
    mArr.push(pr);
    predsByMatch.set(pr.match_id, mArr);

    const ts = new Date(pr.updated_at).getTime();
    const uEntry = predsByUser.get(pr.user_sub) || {
      nick: pr.user_nick, picks: {}, firstUpdatedMs: Number.isFinite(ts) ? ts : nowMs,
    };
    uEntry.nick = pr.user_nick || uEntry.nick;
    uEntry.picks[pr.match_id] = pr.picked_team_id;
    if (Number.isFinite(ts)) uEntry.firstUpdatedMs = Math.min(uEntry.firstUpdatedMs, ts);
    predsByUser.set(pr.user_sub, uEntry);
  }

  const pickemMatches = state.matches.map((m) => {
    let teamAPicks = 0;
    let teamBPicks = 0;
    let viewerPickTeamId = null;
    for (const pr of predsByMatch.get(m.id) || []) {
      if (pr.picked_team_id === m.teamA.id) teamAPicks += 1;
      else if (pr.picked_team_id === m.teamB.id) teamBPicks += 1;
      if (viewerSub && pr.user_sub === viewerSub) viewerPickTeamId = pr.picked_team_id;
    }
    const totalPicks = teamAPicks + teamBPicks;
    const teamAPercent = totalPicks > 0 ? Math.round((teamAPicks / totalPicks) * 100) : 50;
    const teamBPercent = totalPicks > 0 ? 100 - teamAPercent : 50;
    let viewerOutcome = null;
    if (viewerPickTeamId) {
      if (!m.winnerId) viewerOutcome = 'pending';
      else viewerOutcome = viewerPickTeamId === m.winnerId ? 'hit' : 'miss';
    }
    return { ...m, totalPicks, teamAPicks, teamBPicks, teamAPercent, teamBPercent, viewerPickTeamId, viewerOutcome };
  });

  const viewerPicks = viewerSub ? (predsByUser.get(viewerSub) || { picks: {} }).picks : {};
  const pickemSummary = computePickemScore(state.matches, viewerPicks);

  const raw = Array.from(predsByUser.entries()).map(([key, entry]) => {
    const score = computePickemScore(state.matches, entry.picks);
    return {
      key,
      userId: userIdDeSub(key),
      nick: entry.nick,
      points: score.points,
      hits: score.hits,
      resolvedCount: score.resolvedCount,
      picksSubmitted: score.picksSubmitted,
      accuracyPercent: score.accuracyPercent,
      firstUpdatedMs: entry.firstUpdatedMs,
    };
  });
  const leaderboard = rankPickemLeaderboard(raw, viewerSub, 15);

  return {
    polls,
    pickemMatches,
    pickemSummary,
    leaderboard,
    viewer: { isModerator: Boolean(viewerIsModerator) },
  };
}

async function claimsOr401(req, env, json, usuarioClaims) {
  try {
    const claims = await usuarioClaims(req, env);
    if (claims && claims.sub) return { claims };
  } catch { /* sin sesión */ }
  return { res: json({ error: 'Inicia sesión para continuar.' }, 401) };
}

export async function rutasComunidadVotaciones(req, env, url, p, m, { json, usuarioClaims }) {
  const esVoting = p === '/community/voting';
  const esPolls = p === '/community/polls' || p.startsWith('/community/polls/');
  const esPickem = p.startsWith('/community/pickem/');
  if (!esVoting && !esPolls && !esPickem) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const db = env.DB;

  const overviewPara = async (claims, mod) =>
    construirOverview(db, { viewerSub: claims && claims.sub ? claims.sub : null, viewerIsModerator: mod, nowMs });

  try {
    // GET /community/voting
    if (esVoting) {
      if (m !== 'GET') return json({ error: 'no_encontrado' }, 404);
      const claims = await usuarioClaims(req, env).catch(() => null);
      const mod = await esModeradorVotaciones(env, claims);
      return json(await overviewPara(claims, mod));
    }

    const parts = p.split('/').filter(Boolean).slice(2); // tras 'community/<polls|pickem>'
    const id = decodeURIComponent(parts[0] || '').trim();
    const action = parts[1] || '';

    if (esPolls) {
      // POST /community/polls
      if (!parts.length && m === 'POST') {
        const a = await claimsOr401(req, env, json, usuarioClaims);
        if (a.res) return a.res;
        if (!(await esModeradorVotaciones(env, a.claims))) {
          return json({ error: 'Solo administradores u owners pueden crear encuestas oficiales.' }, 403);
        }
        const body = await req.json().catch(() => ({}));
        const v = validateCustomPollDraft(body || {});
        if (!v.ok) return json({ error: v.error }, 400);
        await ensureSeeded(db, nowMs);
        const d = v.data;
        const pid = `poll-${nowMs.toString(36)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
        const closesAt = new Date(nowMs + d.closesInDays * 24 * 60 * 60 * 1000).toISOString();
        await db.prepare(
          `INSERT INTO integ_community_voting_polls
            (id, kind, title, description, game_slug, badge, options_json, status, closes_at, created_by_sub, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
        ).bind(
          pid, d.kind, d.title, d.description, d.gameSlug, pollKindLabel(d.kind),
          JSON.stringify(d.options), closesAt, a.claims.sub, nowIso,
        ).run();
        return json(await overviewPara(a.claims, true), 201);
      }

      if (!id || parts.length > 2) return json({ error: 'Encuesta no encontrada.' }, 404);

      // PATCH /community/polls/:id
      if (!action && m === 'PATCH') {
        const a = await claimsOr401(req, env, json, usuarioClaims);
        if (a.res) return a.res;
        if (!(await esModeradorVotaciones(env, a.claims))) {
          return json({ error: 'Solo administradores u owners pueden gestionar encuestas.' }, 403);
        }
        const body = await req.json().catch(() => ({}));
        const rawStatus = String((body && body.status) || '').trim().toLowerCase();
        if (rawStatus !== 'open' && rawStatus !== 'closed') {
          return json({ error: "Estado inválido. Usa 'open' o 'closed'." }, 400);
        }
        await ensureSeeded(db, nowMs);
        const hit = await db.prepare('SELECT id FROM integ_community_voting_polls WHERE id = ?').bind(id).first();
        if (!hit) return json({ error: 'Encuesta no encontrada.' }, 404);
        await db.prepare('UPDATE integ_community_voting_polls SET status = ? WHERE id = ?').bind(rawStatus, id).run();
        return json(await overviewPara(a.claims, true));
      }

      // POST /community/polls/:id/vote
      if (action === 'vote' && m === 'POST') {
        const a = await claimsOr401(req, env, json, usuarioClaims);
        if (a.res) return json({ error: 'Inicia sesión para votar en encuestas oficiales.' }, 401);
        const body = await req.json().catch(() => ({}));
        const optionId = String((body && body.optionId) || '').trim();
        if (!optionId) return json({ error: 'Selecciona una opción válida para votar.' }, 400);

        await ensureSeeded(db, nowMs);
        const row = await db.prepare('SELECT * FROM integ_community_voting_polls WHERE id = ?').bind(id).first();
        if (!row) return json({ error: 'Encuesta no encontrada.' }, 404);
        const closesMs = new Date(row.closes_at).getTime();
        if (row.status !== 'open' || (Number.isFinite(closesMs) && closesMs <= nowMs)) {
          return json({ error: 'Esta encuesta ya está cerrada y no acepta más votos.' }, 409);
        }
        const options = parseJsonSafe(row.options_json, []);
        if (!options.some((o) => o.id === optionId)) {
          return json({ error: 'La opción seleccionada no existe en esta encuesta.' }, 400);
        }
        const nick = await resolverNickJugador(db, a.claims);
        await db.prepare(
          `INSERT INTO integ_community_voting_votes (poll_id, user_sub, user_nick, option_id, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(poll_id, user_sub) DO UPDATE SET
             user_nick = excluded.user_nick,
             option_id = excluded.option_id,
             updated_at = excluded.updated_at`
        ).bind(id, a.claims.sub, nick, optionId, nowIso).run();
        const mod = await esModeradorVotaciones(env, a.claims);
        return json(await overviewPara(a.claims, mod));
      }
      return json({ error: 'no_encontrado' }, 404);
    }

    // ---- Pick'em ----
    if (!id || parts.length > 2) return json({ error: "Serie Pick'em no encontrada." }, 404);

    // POST /community/pickem/:matchId/predict
    if (action === 'predict' && m === 'POST') {
      const a = await claimsOr401(req, env, json, usuarioClaims);
      if (a.res) return json({ error: "Inicia sesión para participar en el Pick'em." }, 401);
      const body = await req.json().catch(() => ({}));
      const pickedTeamId = String((body && body.pickedTeamId) || '').trim();
      if (!pickedTeamId) return json({ error: 'Selecciona un equipo ganador para tu predicción.' }, 400);

      await ensureSeeded(db, nowMs);
      const row = await db.prepare('SELECT * FROM integ_community_voting_matches WHERE id = ?').bind(id).first();
      if (!row) return json({ error: "Serie Pick'em no encontrada." }, 404);
      if (row.locked || row.winner_id) {
        return json({ error: 'Las predicciones para esta serie ya están cerradas.' }, 409);
      }
      const teamA = parseJsonSafe(row.team_a_json, {});
      const teamB = parseJsonSafe(row.team_b_json, {});
      if (pickedTeamId !== teamA.id && pickedTeamId !== teamB.id) {
        return json({ error: 'El equipo elegido no corresponde a esta serie.' }, 400);
      }
      const nick = await resolverNickJugador(db, a.claims);
      await db.prepare(
        `INSERT INTO integ_community_voting_predictions (match_id, user_sub, user_nick, picked_team_id, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(match_id, user_sub) DO UPDATE SET
           user_nick = excluded.user_nick,
           picked_team_id = excluded.picked_team_id,
           updated_at = excluded.updated_at`
      ).bind(id, a.claims.sub, nick, pickedTeamId, nowIso).run();
      const mod = await esModeradorVotaciones(env, a.claims);
      return json(await overviewPara(a.claims, mod));
    }

    // PATCH /community/pickem/:matchId
    if (!action && m === 'PATCH') {
      const a = await claimsOr401(req, env, json, usuarioClaims);
      if (a.res) return a.res;
      if (!(await esModeradorVotaciones(env, a.claims))) {
        return json({ error: "Solo administradores u owners pueden resolver series Pick'em." }, 403);
      }
      const body = (await req.json().catch(() => ({}))) || {};
      const winnerId = body.winnerId === null ? null : typeof body.winnerId === 'string' ? body.winnerId.trim() : undefined;
      const locked = typeof body.locked === 'boolean' ? body.locked : undefined;
      if (winnerId === undefined && locked === undefined) {
        return json({ error: 'Indica un ganador oficial o el estado de bloqueo.' }, 400);
      }
      await ensureSeeded(db, nowMs);
      const row = await db.prepare('SELECT * FROM integ_community_voting_matches WHERE id = ?').bind(id).first();
      if (!row) return json({ error: "Serie Pick'em no encontrada." }, 404);
      const teamA = parseJsonSafe(row.team_a_json, {});
      const teamB = parseJsonSafe(row.team_b_json, {});
      const nextWinner = winnerId === undefined ? (row.winner_id || null) : winnerId;
      if (nextWinner !== null && nextWinner !== teamA.id && nextWinner !== teamB.id) {
        return json({ error: 'Ganador inválido para esta serie.' }, 400);
      }
      const nextLocked = nextWinner !== null ? true : typeof locked === 'boolean' ? locked : Boolean(row.locked);
      await db.prepare(
        'UPDATE integ_community_voting_matches SET winner_id = ?, locked = ?, updated_at = ? WHERE id = ?'
      ).bind(nextWinner, nextLocked ? 1 : 0, nowIso, id).run();
      return json(await overviewPara(a.claims, true));
    }

    return json({ error: 'no_encontrado' }, 404);
  } catch (e) {
    console.error('comunidadVotaciones failed:', e && e.message);
    return json({ error: 'No se pudo completar la operación de votaciones.' }, 500);
  }
}
