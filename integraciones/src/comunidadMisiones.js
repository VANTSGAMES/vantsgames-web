// VANTS · Comunidad Fase 3: Retos y Misiones Semanales (port del API Express a D1)
// -----------------------------------------------------------------------------
// Persiste en D1 (`vants-db`) con autocreación de tablas (prefijo integ_community_missions_*).
// Contrato 100 % compatible con `client/src/lib/communityApi.ts` y las páginas de misiones:
//
//   GET  /community/missions                 (público + JWT opcional)
//   POST /community/missions/:code/progress  (sesión)  body: { note? }
//   POST /community/missions/:code/claim     (sesión)  -> { xpAwarded, ...overview }

const WEEKLY_MISSIONS = [
  {
    code: "weekly-clip",
    title: "Sube 1 clip esta semana",
    description:
      "Comparte una jugada desde tu equipo o enlaza tu clip de Twitch/Kick en el juego correspondiente.",
    category: "clips",
    target: 1,
    xp: 150,
    badgeTag: "Creador S4",
    actionLabel: "Publicar clip",
    actionTo: "/clips/publicar",
    trackingMode: "manual",
  },
  {
    code: "weekly-tournaments-val-cs2",
    title: "Juega 2 torneos de VALORANT o CS2",
    description:
      "Participa en dos torneos oficiales o comunitarios de VALORANT o Counter-Strike 2 dentro del circuito VANTS.",
    category: "torneos",
    target: 2,
    xp: 300,
    badgeTag: "Competidor S4",
    games: ["valorant", "cs2"],
    actionLabel: "Ver torneos",
    actionTo: "/torneos/competir",
    trackingMode: "manual",
  },
  {
    code: "weekly-profile-team",
    title: "Completa tu perfil y equipo",
    description:
      "Actualiza tu ficha competitiva, vincula tus cuentas y define tu equipo principal en la sala VANTS.",
    category: "perfil",
    target: 1,
    xp: 120,
    badgeTag: "Roster Activo",
    actionLabel: "Ir a mi perfil",
    actionTo: "/perfil",
    trackingMode: "manual",
  },
  {
    code: "weekly-lfg-post",
    title: "Publica en el Buscador LFG / Scrims",
    description:
      "Crea al menos 1 anuncio LFT, LFG o Scrim esta semana para activar el matchmaking comunitario. Se detecta automáticamente.",
    category: "comunidad",
    target: 1,
    xp: 110,
    badgeTag: "Scout S4",
    actionLabel: "Abrir buscador LFG",
    actionTo: "/comunidad/lfg",
    trackingMode: "auto_or_manual",
  },
  {
    code: "weekly-forum-activity",
    title: "Participa en el Muro de Comunidad",
    description:
      "Aporta 2 publicaciones o comentarios en cualquier videojuego del Muro / Foro de VANTS. Se sincroniza automáticamente.",
    category: "comunidad",
    target: 2,
    xp: 140,
    badgeTag: "Voz VANTS",
    actionLabel: "Abrir el muro",
    actionTo: "/comunidad/foro",
    trackingMode: "auto_or_manual",
  },
  {
    code: "weekly-forum-gg",
    title: "Apoya 3 hilos con GG o Fuego",
    description:
      "Reacciona a 3 publicaciones destacadas de otros jugadores en el Muro para impulsar guías y highlights.",
    category: "comunidad",
    target: 3,
    xp: 90,
    badgeTag: "Espíritu GG",
    actionLabel: "Explorar hilos",
    actionTo: "/comunidad/foro",
    trackingMode: "auto_or_manual",
  },
];

const SEASON_TIERS = [
  { id: "recluta", name: "Recluta S4", minXp: 0, accent: "#a3a7b0" },
  { id: "contendiente", name: "Contendiente S4", minXp: 250, accent: "#e8ecf2" },
  { id: "elite", name: "Élite S4", minXp: 500, accent: "#2bd576" },
  { id: "leyenda", name: "Leyenda VANTS S4", minXp: 750, accent: "#ff0d2e" },
];

let tablasListas = false;
export function resetMisionesCacheForTests() {
  tablasListas = false;
}

async function ensureTablasMisiones(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_community_missions_progress (
    week_key TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    mission_code TEXT NOT NULL,
    user_nick TEXT NOT NULL,
    progress_count INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    proof_note TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (week_key, user_sub, mission_code)
  )`).run();
  tablasListas = true;
}

function getMissionByCode(code) {
  const clean = String(code || '').trim().toLowerCase();
  return WEEKLY_MISSIONS.find((m) => m.code === clean);
}

function computeSeasonTier(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let current = SEASON_TIERS[0];
  let next = null;
  for (let i = 0; i < SEASON_TIERS.length; i++) {
    if (safeXp >= SEASON_TIERS[i].minXp) {
      current = SEASON_TIERS[i];
      next = SEASON_TIERS[i + 1] || null;
    }
  }
  return { tier: current, nextTier: next, xpToNextTier: next ? Math.max(0, next.minXp - safeXp) : 0 };
}

function computeMissionPercent(current, target) {
  if (target <= 0) return 0;
  const clamped = Math.max(0, Math.min(target, current));
  return Math.round((clamped / target) * 100);
}

function getIsoWeekInfo(nowMs = Date.now()) {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(nowMs);
  const utcDay = now.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday, 0, 0, 0, 0));
  const nextMonday = new Date(monday.getTime() + 7 * DAY);
  const sunday = new Date(nextMonday.getTime() - 1);

  const thursday = new Date(monday.getTime() + 3 * DAY);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 0, 0, 0, 0));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4.getTime() - (jan4Day - 1) * DAY);
  const weekNum = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * DAY)) + 1;
  const weekKey = `${isoYear}-W${String(weekNum).padStart(2, '0')}`;

  const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const weekRangeLabel = `${fmt(monday)} – ${fmt(sunday)}`;

  const remainingMs = Math.max(0, nextMonday.getTime() - nowMs);
  const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const resetsInLabel = days >= 1
    ? `Reinicia en ${days}d ${hours}h`
    : totalHours >= 1 ? `Reinicia en ${totalHours}h` : 'Reinicia en <1h';

  return { weekKey, weekStartMs: monday.getTime(), weekEndMs: nextMonday.getTime(), weekRangeLabel, resetsInLabel };
}

function validateMissionProgressNote(note) {
  const cleaned = String(note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!cleaned) return { ok: true, note: null };
  if (cleaned.length > 200) {
    return { ok: false, error: 'La referencia o nota no puede superar los 200 caracteres.' };
  }
  return { ok: true, note: cleaned };
}

// userId numérico estable derivado del sub (el contrato Express expone un id numérico).
function userIdDesdeSub(sub) {
  let h = 0;
  const s = String(sub || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

async function resolverNickJugador(db, claims) {
  const sub = claims && claims.sub ? String(claims.sub) : '';
  if (sub) {
    const p = await db.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
    if (p && (p.display_name || p.username)) return String(p.display_name || p.username).trim().slice(0, 60);
  }
  const fallback = (claims && claims.name) || (claims && claims.email ? String(claims.email).split('@')[0] : '') || 'Jugador';
  return String(fallback).trim().slice(0, 60) || 'Jugador';
}

async function listWeekRows(db, weekKey) {
  const res = await db.prepare('SELECT * FROM integ_community_missions_progress WHERE week_key = ?').bind(weekKey).all();
  return (res.results || []).map((r) => ({
    userSub: r.user_sub,
    userNick: r.user_nick,
    missionCode: r.mission_code,
    progressCount: Number(r.progress_count) || 0,
    claimed: Boolean(r.claimed),
    xpAwarded: Number(r.xp_awarded) || 0,
    proofNote: r.proof_note ?? null,
    updatedAt: r.updated_at,
  }));
}

async function upsertMissionRow(db, row) {
  await db.prepare(
    `INSERT INTO integ_community_missions_progress
      (week_key, user_sub, mission_code, user_nick, progress_count, claimed, xp_awarded, proof_note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_key, user_sub, mission_code) DO UPDATE SET
       user_nick = excluded.user_nick,
       progress_count = excluded.progress_count,
       claimed = excluded.claimed,
       xp_awarded = excluded.xp_awarded,
       proof_note = excluded.proof_note,
       updated_at = excluded.updated_at`
  ).bind(
    row.weekKey, row.userSub, row.missionCode, row.userNick, row.progressCount,
    row.claimed ? 1 : 0, row.xpAwarded, row.proofNote, row.updatedAt,
  ).run();
}

async function getWeeklyMissionsOverview(db, { viewerSub = null, nowMs = Date.now() } = {}) {
  await ensureTablasMisiones(db);
  const week = getIsoWeekInfo(nowMs);
  const weekRows = await listWeekRows(db, week.weekKey);

  const viewerRowsByCode = new Map();
  if (viewerSub) {
    for (const r of weekRows) if (r.userSub === viewerSub) viewerRowsByCode.set(r.missionCode, r);
  }

  const missions = WEEKLY_MISSIONS.map((def) => {
    const saved = viewerRowsByCode.get(def.code);
    const current = Math.min(def.target, saved ? saved.progressCount : 0);
    const claimed = Boolean(saved && saved.claimed);
    const completed = current >= def.target || claimed;
    return {
      ...def,
      current: claimed ? def.target : current,
      percent: claimed ? 100 : computeMissionPercent(current, def.target),
      completed,
      claimed,
      proofNote: (saved && saved.proofNote) || null,
    };
  });

  const maxWeeklyXp = WEEKLY_MISSIONS.reduce((acc, m) => acc + m.xp, 0);
  const xpEarned = missions.reduce((acc, m) => acc + (m.claimed ? m.xp : 0), 0);
  const missionsClaimed = missions.filter((m) => m.claimed).length;
  const tierInfo = computeSeasonTier(xpEarned);

  const summary = {
    xpEarned,
    maxWeeklyXp,
    missionsClaimed,
    totalMissions: missions.length,
    percentOverall: maxWeeklyXp > 0 ? Math.round((xpEarned / maxWeeklyXp) * 100) : 0,
    tier: tierInfo.tier,
    nextTier: tierInfo.nextTier,
    xpToNextTier: tierInfo.xpToNextTier,
  };

  const byUser = new Map();
  for (const r of weekRows) {
    if (!r.claimed || r.xpAwarded <= 0) continue;
    const existing = byUser.get(r.userSub) || { userSub: r.userSub, nick: r.userNick, xp: 0, missionsCompleted: 0, lastUpdated: 0 };
    existing.nick = r.userNick || existing.nick;
    existing.xp += r.xpAwarded;
    existing.missionsCompleted += 1;
    existing.lastUpdated = Math.max(existing.lastUpdated, new Date(r.updatedAt).getTime());
    byUser.set(r.userSub, existing);
  }

  const leaderboard = Array.from(byUser.values())
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.missionsCompleted !== a.missionsCompleted) return b.missionsCompleted - a.missionsCompleted;
      return a.lastUpdated - b.lastUpdated;
    })
    .slice(0, 15)
    .map((entry, idx) => ({
      rank: idx + 1,
      userId: userIdDesdeSub(entry.userSub),
      nick: entry.nick,
      xp: entry.xp,
      missionsCompleted: entry.missionsCompleted,
      tier: computeSeasonTier(entry.xp).tier,
      isViewer: Boolean(viewerSub && entry.userSub === viewerSub),
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

async function registrarProgreso(db, { userSub, userNick, missionCode, note, nowMs = Date.now() }) {
  const def = getMissionByCode(missionCode);
  if (!def) return { ok: false, status: 404, error: 'Misión semanal no encontrada.' };
  await ensureTablasMisiones(db);

  const week = getIsoWeekInfo(nowMs);
  const rows = await listWeekRows(db, week.weekKey);
  const existing = rows.find((r) => r.userSub === userSub && r.missionCode === def.code);
  if (existing && existing.claimed) {
    return { ok: false, status: 409, error: 'Ya reclamaste la recompensa de esta misión esta semana.' };
  }
  const baseCount = existing ? existing.progressCount : 0;
  if (baseCount >= def.target) {
    return { ok: false, status: 409, error: 'Ya alcanzaste el objetivo de esta misión. Reclama tu XP.' };
  }

  await upsertMissionRow(db, {
    weekKey: week.weekKey,
    userSub,
    userNick,
    missionCode: def.code,
    progressCount: Math.min(def.target, baseCount + 1),
    claimed: false,
    xpAwarded: 0,
    proofNote: note ?? (existing ? existing.proofNote : null) ?? null,
    updatedAt: new Date(nowMs).toISOString(),
  });

  return { ok: true, overview: await getWeeklyMissionsOverview(db, { viewerSub: userSub, nowMs }) };
}

async function reclamarRecompensa(db, { userSub, userNick, missionCode, nowMs = Date.now() }) {
  const def = getMissionByCode(missionCode);
  if (!def) return { ok: false, status: 404, error: 'Misión semanal no encontrada.' };
  await ensureTablasMisiones(db);

  const week = getIsoWeekInfo(nowMs);
  const rows = await listWeekRows(db, week.weekKey);
  const existing = rows.find((r) => r.userSub === userSub && r.missionCode === def.code);
  if (existing && existing.claimed) {
    return { ok: false, status: 409, error: 'Ya reclamaste el XP de esta misión esta semana.' };
  }
  const effective = existing ? existing.progressCount : 0;
  if (effective < def.target) {
    return { ok: false, status: 400, error: `Aún te faltan ${def.target - effective} paso(s) para completar esta misión.` };
  }

  await upsertMissionRow(db, {
    weekKey: week.weekKey,
    userSub,
    userNick,
    missionCode: def.code,
    progressCount: def.target,
    claimed: true,
    xpAwarded: def.xp,
    proofNote: existing ? existing.proofNote : null,
    updatedAt: new Date(nowMs).toISOString(),
  });

  return { ok: true, xpAwarded: def.xp, overview: await getWeeklyMissionsOverview(db, { viewerSub: userSub, nowMs }) };
}

export async function rutasComunidadMisiones(req, env, url, p, m, { json, usuarioClaims }) {
  if (p !== '/community/missions' && !p.startsWith('/community/missions/')) return null;

  try {
    if (p === '/community/missions' && m === 'GET') {
      const claims = await usuarioClaims(req, env).catch(() => null);
      const overview = await getWeeklyMissionsOverview(env.DB, { viewerSub: claims && claims.sub ? String(claims.sub) : null });
      return json(overview);
    }

    const match = p.match(/^\/community\/missions\/([^/]+)\/(progress|claim)$/);
    if (match && m === 'POST') {
      const claims = await usuarioClaims(req, env).catch(() => null);
      if (!claims || !claims.sub) {
        return json({ error: match[2] === 'claim' ? 'Inicia sesión para reclamar tu recompensa.' : 'Inicia sesión para registrar tu progreso.' }, 401);
      }
      let code = match[1];
      try { code = decodeURIComponent(code); } catch { /* usa el valor crudo */ }
      code = code.trim().toLowerCase();
      const userSub = String(claims.sub);

      if (match[2] === 'progress') {
        const body = await req.json().catch(() => ({}));
        const noteCheck = validateMissionProgressNote(body && body.note);
        if (!noteCheck.ok) return json({ error: noteCheck.error }, 400);
        const userNick = await resolverNickJugador(env.DB, claims);
        const result = await registrarProgreso(env.DB, { userSub, userNick, missionCode: code, note: noteCheck.note });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.overview);
      }

      const userNick = await resolverNickJugador(env.DB, claims);
      const result = await reclamarRecompensa(env.DB, { userSub, userNick, missionCode: code });
      if (!result.ok) return json({ error: result.error }, result.status);
      return json({ xpAwarded: result.xpAwarded, ...result.overview });
    }
  } catch (err) {
    console.error('community missions failed:', err && err.message);
    return json({ error: 'No se pudieron procesar las misiones semanales.' }, 500);
  }

  return json({ error: 'Not found' }, 404);
}
