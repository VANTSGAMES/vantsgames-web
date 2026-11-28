// VANTS · Google Workspace Pro & Google Maps Config (D1 en Cloudflare Workers)
// -----------------------------------------------------------------------------
// Respalda el Centro Google Workspace (/workspace) y Arenas (/arenas) en producción:
//   GET    /pro/me
//   PATCH  /pro/me
//   GET    /pro/notes
//   POST   /pro/notes
//   DELETE /pro/notes/:id
//   GET    /pro/workspace-links
//   POST   /pro/workspace-links
//   DELETE /pro/workspace-links/:id
//   GET    /pro/bookmarks
//   POST   /pro/bookmarks
//   DELETE /pro/bookmarks/:id
//   GET    /maps/config

const VALID_SERVICES = new Set([
  'drive',
  'docs',
  'sheets',
  'slides',
  'calendar',
  'meet',
  'tasks',
  'forms',
  'gmail',
  'chat',
]);

let tablasListas = false;
export function resetGoogleProCacheForTests() {
  tablasListas = false;
}

function stableNumericId(sub) {
  let h = 2166136261;
  const s = String(sub || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647 || 1;
}

async function ensureTablasPro(db) {
  if (tablasListas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_pro_users (
    user_sub TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT,
    photo_url TEXT,
    preferred_game TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_pro_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_sub TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    game_slug TEXT,
    category TEXT NOT NULL DEFAULT 'estrategia',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_pro_workspace_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_sub TEXT NOT NULL,
    service TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    game_slug TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integ_pro_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_sub TEXT NOT NULL,
    tournament_slug TEXT NOT NULL,
    tournament_name TEXT NOT NULL,
    game_slug TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  tablasListas = true;
}

async function syncProUser(db, claims) {
  await ensureTablasPro(db);
  const sub = String(claims.sub);
  const email = claims.email || `${sub.replace(/[^a-zA-Z0-9._-]/g, '_')}@users.vants.cc`;
  const name = claims.name || null;
  const picture = claims.picture || null;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO integ_pro_users (user_sub, email, display_name, photo_url, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_sub) DO UPDATE SET
         email = excluded.email,
         display_name = COALESCE(integ_pro_users.display_name, excluded.display_name),
         photo_url = COALESCE(excluded.photo_url, integ_pro_users.photo_url),
         updated_at = excluded.updated_at`,
    )
    .bind(sub, email, name, picture, nowIso)
    .run();

  const row = await db
    .prepare('SELECT user_sub, email, display_name, photo_url, preferred_game FROM integ_pro_users WHERE user_sub = ?')
    .bind(sub)
    .first();

  return {
    id: stableNumericId(sub),
    uid: sub,
    email: (row && row.email) || email,
    displayName: (row && row.display_name) || name,
    photoUrl: (row && row.photo_url) || picture,
    preferredGame: (row && row.preferred_game) || null,
  };
}

function mapNoteRow(r) {
  return {
    id: Number(r.id),
    title: r.title,
    content: r.content,
    gameSlug: r.game_slug || null,
    category: r.category || 'estrategia',
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

function mapLinkRow(r) {
  return {
    id: Number(r.id),
    service: r.service,
    resourceId: r.resource_id,
    title: r.title,
    url: r.url || null,
    gameSlug: r.game_slug || null,
    metadataJson: r.metadata_json || null,
    createdAt: r.created_at,
  };
}

function mapBookmarkRow(r) {
  return {
    id: Number(r.id),
    tournamentSlug: r.tournament_slug,
    tournamentName: r.tournament_name,
    gameSlug: r.game_slug || null,
    notes: r.notes || null,
    createdAt: r.created_at,
  };
}

export async function rutasGooglePro(req, env, url, p, m, { json, usuarioClaims }) {
  if (p === '/maps/config' && m === 'GET') {
    const apiKey = String(env.GOOGLE_MAPS_API_KEY || '').trim();
    return json({ apiKey, configured: Boolean(apiKey) });
  }

  if (p === '/pro/config-status' && m === 'GET') {
    const gcpProjectId = String(env.GCP_PROJECT_ID || 'semiotic-ion-508913-r1');
    const gcpProjectNumber = String(env.GCP_PROJECT_NUMBER || '238603325169');
    return json({
      ok: true,
      project: {
        gcpProjectId,
        gcpProjectNumber,
        resourceName: `projects/${gcpProjectNumber}`,
        googleOAuthClientId: String(
          env.GOOGLE_OAUTH_CLIENT_ID ||
            '238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com',
        ),
      },
      origins: {
        intOrigin: 'https://int.vants.cc',
        fnOrigin: 'https://fn.vants.cc',
        siteUrl: String(env.SITE_URL || 'https://vants.cc'),
      },
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'],
      workspaceServices: Array.from(VALID_SERVICES),
      emailProvider: {
        provider: 'resend',
        configured: Boolean(env.RESEND_API_KEY),
        torneosFrom: env.RESEND_FROM_TORNEOS || 'VANTS GAMES Torneos <torneos@vants.cc>',
        contactoFrom: env.RESEND_FROM_CONTACTO || 'VANTS GAMES <contacto@vants.cc>',
      },
    });
  }

  if (!p.startsWith('/pro/')) return null;

  let claims;
  try {
    claims = await usuarioClaims(req, env);
  } catch {
    return json({ error: 'Inicia sesión con tu cuenta de Google o VANTS para continuar.' }, 401);
  }
  if (!claims || !claims.sub) {
    return json({ error: 'Inicia sesión con tu cuenta de Google o VANTS para continuar.' }, 401);
  }

  const user = await syncProUser(env.DB, claims);
  const sub = user.uid;

  if (p === '/pro/me' && m === 'GET') {
    const [notesRes, linksRes, bmRes] = await Promise.all([
      env.DB.prepare('SELECT id FROM integ_pro_notes WHERE user_sub = ?').bind(sub).all(),
      env.DB.prepare('SELECT id FROM integ_pro_workspace_links WHERE user_sub = ?').bind(sub).all(),
      env.DB.prepare('SELECT id FROM integ_pro_bookmarks WHERE user_sub = ?').bind(sub).all(),
    ]);
    return json({
      user,
      counts: {
        notes: (notesRes.results || []).length,
        workspaceLinks: (linksRes.results || []).length,
        bookmarks: (bmRes.results || []).length,
      },
    });
  }

  if (p === '/pro/me' && m === 'PATCH') {
    const body = await req.json().catch(() => ({}));
    const preferredGame =
      typeof body.preferredGame === 'string' ? body.preferredGame.trim().slice(0, 40) : user.preferredGame;
    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 80)
        : user.displayName;
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      'UPDATE integ_pro_users SET preferred_game = ?, display_name = ?, updated_at = ? WHERE user_sub = ?',
    )
      .bind(preferredGame || null, displayName || null, nowIso, sub)
      .run();
    return json({
      user: {
        ...user,
        preferredGame: preferredGame || null,
        displayName: displayName || null,
      },
    });
  }

  if (p === '/pro/notes' && m === 'GET') {
    const res = await env.DB.prepare(
      'SELECT id, title, content, game_slug, category, created_at, updated_at FROM integ_pro_notes WHERE user_sub = ? ORDER BY id DESC',
    )
      .bind(sub)
      .all();
    return json({ notes: (res.results || []).map(mapNoteRow) });
  }

  if (p === '/pro/notes' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, 140);
    const content = String(body.content || '').trim().slice(0, 4000);
    const gameSlug = typeof body.gameSlug === 'string' && body.gameSlug.trim() ? body.gameSlug.trim().slice(0, 40) : null;
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim().slice(0, 40) : 'estrategia';
    if (title.length < 2 || content.length < 2) {
      return json({ error: 'Título y contenido son obligatorios (mín. 2 caracteres).' }, 400);
    }
    const nowIso = new Date().toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO integ_pro_notes (user_sub, title, content, game_slug, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, title, content, game_slug, category, created_at, updated_at`,
    )
      .bind(sub, title, content, gameSlug, category, nowIso, nowIso)
      .first();
    return json({ note: mapNoteRow(row) }, 201);
  }

  const noteDeleteMatch = p.match(/^\/pro\/notes\/(\d+)$/);
  if (noteDeleteMatch && m === 'DELETE') {
    const id = Number(noteDeleteMatch[1]);
    const existing = await env.DB.prepare('SELECT id FROM integ_pro_notes WHERE id = ? AND user_sub = ?')
      .bind(id, sub)
      .first();
    if (!existing) return json({ error: 'Nota no encontrada.' }, 404);
    await env.DB.prepare('DELETE FROM integ_pro_notes WHERE id = ? AND user_sub = ?').bind(id, sub).run();
    return json({ deleted: true, id });
  }

  if (p === '/pro/workspace-links' && m === 'GET') {
    const res = await env.DB.prepare(
      'SELECT id, service, resource_id, title, url, game_slug, metadata_json, created_at FROM integ_pro_workspace_links WHERE user_sub = ? ORDER BY id DESC',
    )
      .bind(sub)
      .all();
    return json({ links: (res.results || []).map(mapLinkRow) });
  }

  if (p === '/pro/workspace-links' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const service = String(body.service || '').trim().toLowerCase();
    const resourceId = String(body.resourceId || '').trim().slice(0, 255);
    const title = String(body.title || '').trim().slice(0, 200);
    const linkUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim().slice(0, 1000) : null;
    const gameSlug = typeof body.gameSlug === 'string' && body.gameSlug.trim() ? body.gameSlug.trim().slice(0, 40) : null;
    const metadataJson =
      body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata).slice(0, 2000) : null;
    if (!VALID_SERVICES.has(service) || !resourceId || !title) {
      return json({ error: 'Datos de recurso Workspace inválidos.' }, 400);
    }
    const nowIso = new Date().toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO integ_pro_workspace_links (user_sub, service, resource_id, title, url, game_slug, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, service, resource_id, title, url, game_slug, metadata_json, created_at`,
    )
      .bind(sub, service, resourceId, title, linkUrl, gameSlug, metadataJson, nowIso)
      .first();
    return json({ link: mapLinkRow(row) }, 201);
  }

  const linkDeleteMatch = p.match(/^\/pro\/workspace-links\/(\d+)$/);
  if (linkDeleteMatch && m === 'DELETE') {
    const id = Number(linkDeleteMatch[1]);
    const existing = await env.DB.prepare('SELECT id FROM integ_pro_workspace_links WHERE id = ? AND user_sub = ?')
      .bind(id, sub)
      .first();
    if (!existing) return json({ error: 'Recurso no encontrado.' }, 404);
    await env.DB.prepare('DELETE FROM integ_pro_workspace_links WHERE id = ? AND user_sub = ?').bind(id, sub).run();
    return json({ deleted: true, id });
  }

  if (p === '/pro/bookmarks' && m === 'GET') {
    const res = await env.DB.prepare(
      'SELECT id, tournament_slug, tournament_name, game_slug, notes, created_at FROM integ_pro_bookmarks WHERE user_sub = ? ORDER BY id DESC',
    )
      .bind(sub)
      .all();
    return json({ bookmarks: (res.results || []).map(mapBookmarkRow) });
  }

  if (p === '/pro/bookmarks' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const tournamentSlug = String(body.tournamentSlug || '').trim().slice(0, 140);
    const tournamentName = String(body.tournamentName || '').trim().slice(0, 200);
    const gameSlug = typeof body.gameSlug === 'string' && body.gameSlug.trim() ? body.gameSlug.trim().slice(0, 40) : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null;
    if (!tournamentSlug || !tournamentName) {
      return json({ error: 'Slug y nombre del torneo son obligatorios.' }, 400);
    }
    const nowIso = new Date().toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO integ_pro_bookmarks (user_sub, tournament_slug, tournament_name, game_slug, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, tournament_slug, tournament_name, game_slug, notes, created_at`,
    )
      .bind(sub, tournamentSlug, tournamentName, gameSlug, notes, nowIso)
      .first();
    return json({ bookmark: mapBookmarkRow(row) }, 201);
  }

  const bmDeleteMatch = p.match(/^\/pro\/bookmarks\/(\d+)$/);
  if (bmDeleteMatch && m === 'DELETE') {
    const id = Number(bmDeleteMatch[1]);
    const existing = await env.DB.prepare('SELECT id FROM integ_pro_bookmarks WHERE id = ? AND user_sub = ?')
      .bind(id, sub)
      .first();
    if (!existing) return json({ error: 'Torneo guardado no encontrado.' }, 404);
    await env.DB.prepare('DELETE FROM integ_pro_bookmarks WHERE id = ? AND user_sub = ?').bind(id, sub).run();
    return json({ deleted: true, id });
  }

  return json({ error: 'Ruta Pro no encontrada.' }, 404);
}
