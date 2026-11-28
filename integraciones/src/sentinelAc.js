// integraciones/src/sentinelAc.js
// VANTS Sentinel AI — Anti-Cheat Proactivo sin Falsos Positivos + Puente VANTS PC
// -----------------------------------------------------------------------------
// REGLA ABSOLUTA:
//   - CERO auto-bans por buen aim (HS%, K/D, ADR altos son legales y NUNCA disparan bloqueo).
//   - Bloqueo automático proactivo ÚNICAMENTE con evidencia dura objetiva:
//       A) Ban activo en `vants_bans` o evasión de cuenta (user_sub, steam_id, faceit_id, discord_id, hwid).
//       B) Ban oficial externo verificado por cheating (FACEIT o Steam VAC/Game Ban).
//       C) Evidencia técnica dura firmada desde VANTS PC con HMAC `VANTS_PC_AC_SECRET`:
//          `memory_tamper`, `unsigned_dll_injection`, `blacklisted_cheat_process`, `synthetic_input_injected`.
//   - Reportes en sala sin prueba dura -> `accion: "revision_humana"` + aviso amarillo informativo (NO bloquea).

export const HARD_EVIDENCE_CODES = new Set([
  'memory_tamper',
  'unsigned_dll_injection',
  'blacklisted_cheat_process',
  'synthetic_input_injected',
]);

let tablasAcListas = false;
export function resetSentinelAcCacheForTests() {
  tablasAcListas = false;
}

export async function asegurarTablasAc(db) {
  if (tablasAcListas || !db) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS vants_bans (
      id TEXT PRIMARY KEY,
      user_sub TEXT,
      nick TEXT,
      steam_id TEXT,
      faceit_id TEXT,
      discord_id TEXT,
      hwid TEXT,
      motivo TEXT NOT NULL,
      tipo TEXT NOT NULL,
      risk_score INTEGER NOT NULL DEFAULT 0,
      evidencia_json TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS vants_ac_challenges (
      nonce TEXT PRIMARY KEY,
      user_sub TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS vants_ac_heartbeats (
      user_sub TEXT PRIMARY KEY,
      hwid TEXT,
      app_version TEXT,
      vanguard_on INTEGER NOT NULL DEFAULT 0,
      faceit_ac_on INTEGER NOT NULL DEFAULT 0,
      eac_on INTEGER NOT NULL DEFAULT 0,
      battleye_on INTEGER NOT NULL DEFAULT 0,
      shield_status TEXT NOT NULL DEFAULT 'clean',
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
  ]);
  tablasAcListas = true;
}

function timingSafeEqualStr(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (!sa || sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

/** Firma HMAC-SHA256 hex para el puente VANTS PC -> vants-integraciones. */
export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Construye el mensaje canónico firmado por VANTS PC para heartbeats y reportes duros. */
export function canonicalHeartbeatMessage({
  nonce,
  userSub,
  ts,
  hwid = '',
  vanguardOn = false,
  faceitAcOn = false,
  hardFlags = [],
}) {
  const flags = Array.isArray(hardFlags)
    ? [...new Set(hardFlags.map((f) => String(f).trim().toLowerCase()).filter(Boolean))].sort().join(',')
    : '';
  return `${String(nonce || '')}.${String(userSub || '')}.${String(ts || '')}.${String(hwid || '')}.${vanguardOn ? 1 : 0}.${faceitAcOn ? 1 : 0}.${flags}`;
}

export async function verificarFirmaAc(secret, msg, signature) {
  if (!secret || !signature) return false;
  const expected = await hmacSha256Hex(secret, msg);
  return timingSafeEqualStr(expected, String(signature).trim().toLowerCase());
}

/** Envío directo al webhook de disputas/anti-cheat de Discord (nunca lanza, sin @mentions). */
export async function enviarWebhookDisputas(env, embed) {
  const url = String((env && env.DISCORD_WEBHOOK_DISPUTAS) || '').trim();
  if (!url || !/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [embed],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ tipo: 'discord_webhook_disputas_error', status: res.status }));
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        tipo: 'discord_webhook_disputas_error',
        error: String((err && err.message) || err).slice(0, 120),
      }),
    );
    return false;
  }
}

/** Busca un ban activo en vants_bans por cualquiera de los identificadores verificables (evasión de cuenta). */
export async function buscarBanActivo(db, ids = {}) {
  const conds = [];
  const binds = [];
  for (const col of ['user_sub', 'steam_id', 'faceit_id', 'discord_id', 'hwid']) {
    const val = ids[col] ? String(ids[col]).trim() : '';
    if (val) {
      conds.push(`${col} = ?`);
      binds.push(val);
    }
  }
  if (!conds.length) return null;
  const sql = `SELECT id, user_sub, nick, steam_id, faceit_id, discord_id, hwid, motivo, tipo, risk_score, evidencia_json, creado_en
               FROM vants_bans WHERE activo = 1 AND (${conds.join(' OR ')}) ORDER BY creado_en DESC LIMIT 1`;
  return db.prepare(sql).bind(...binds).first().catch(() => null);
}

/** Verifica bans oficiales externos (FACEIT cheating ban y Steam VAC/Game Ban si STEAM_API_KEY está configurada). */
async function verificarBansExternos(env, { faceit_id, steam_id, faceit_ban_cheating }) {
  if (faceit_ban_cheating === true) {
    return {
      encontrado: true,
      tipo: 'external_faceit_ban',
      motivo: 'Ban oficial activo por cheating en FACEIT verificado.',
      evidencia: { fuente: 'faceit', faceit_id: faceit_id || null, cheating_ban: true },
    };
  }

  const fId = faceit_id ? String(faceit_id).trim() : '';
  if (fId && env.FACEIT_API_KEY) {
    try {
      const r = await fetch(`https://open.faceit.com/data/v4/players/${encodeURIComponent(fId)}/bans?limit=20`, {
        headers: { Authorization: `Bearer ${env.FACEIT_API_KEY}` },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const items = Array.isArray(d && d.items) ? d.items : [];
        const activoCheat = items.find((it) => {
          const reason = String((it && (it.reason || it.type)) || '').toLowerCase();
          const active = it && (it.ends_at == null || Date.parse(it.ends_at) > Date.now());
          return active && /(cheat|hack|anticheat|anti-cheat|ban evasion)/i.test(reason);
        });
        if (activoCheat) {
          return {
            encontrado: true,
            tipo: 'external_faceit_ban',
            motivo: `Ban oficial activo en FACEIT (${String(activoCheat.reason || 'cheating').slice(0, 80)}).`,
            evidencia: { fuente: 'faceit_api', faceit_id: fId, ban: activoCheat },
          };
        }
      }
    } catch {
      // No bloquear nunca por error de red externo
    }
  }

  const sId = steam_id ? String(steam_id).trim() : '';
  if (sId && /^\d{17}$/.test(sId) && env.STEAM_API_KEY) {
    try {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamids=${encodeURIComponent(sId)}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const p = Array.isArray(d && d.players) ? d.players[0] : null;
        if (p && (p.VACBanned === true || Number(p.NumberOfGameBans) > 0)) {
          return {
            encontrado: true,
            tipo: 'external_steam_ban',
            motivo: p.VACBanned
              ? `VAC Ban verificado en Steam (${p.NumberOfVACBans || 1}).`
              : `Game Ban verificado en Steam (${p.NumberOfGameBans}).`,
            evidencia: {
              fuente: 'steam_web_api',
              steam_id: sId,
              vac_banned: Boolean(p.VACBanned),
              vac_bans: Number(p.NumberOfVACBans || 0),
              game_bans: Number(p.NumberOfGameBans || 0),
              days_since_last_ban: Number(p.DaysSinceLastBan || 0),
            },
          };
        }
      }
    } catch {
      // No bloquear nunca por error de red externo
    }
  }

  return null;
}

/** Expulsa en tiempo real de SalaTorneo (best-effort vía Service Binding TORNEOS_REALTIME). */
async function expulsarDeSalaTorneo(env, torneoId, { nick, user_sub, motivo }) {
  if (!torneoId || !env.TORNEOS_REALTIME || !env.VANTS_INTERNAL_SECRET) return false;
  try {
    const r = await env.TORNEOS_REALTIME.fetch(
      new Request(`https://vants-recursos/torneos/${encodeURIComponent(torneoId)}/aviso`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vants-internal': env.VANTS_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          accion: 'expulsar',
          nick: nick || undefined,
          user_sub: user_sub || undefined,
          motivo: motivo || 'Expulsado por VANTS Sentinel Anti-Cheat',
        }),
      }),
    );
    return r.ok;
  } catch {
    return false;
  }
}

export function badgeDesdeHeartbeat(hb) {
  if (!hb) return { badge: 'Sin VANTS PC', code: 'none', vanguard_on: false, faceit_ac_on: false, vants_pc: false };
  const vOn = Boolean(hb.vanguard_on);
  const fOn = Boolean(hb.faceit_ac_on);
  const code = vOn && fOn ? 'both' : vOn ? 'vanguard' : fOn ? 'faceit' : 'pc';
  const badge =
    code === 'both'
      ? 'Vanguard ON · FACEIT AC ON'
      : code === 'vanguard'
        ? 'Vanguard ON'
        : code === 'faceit'
          ? 'FACEIT AC ON'
          : 'VANTS PC activo';
  return { badge, code, vanguard_on: vOn, faceit_ac_on: fOn, vants_pc: true, expires_at: hb.expires_at || null };
}

/**
 * Router de VANTS Sentinel AI (`/ai/anticheat/*`).
 * actor = { sub, owner, origen } resuelto previamente en vantsAi.js.
 */
export async function rutasSentinelAc(req, env, url, p, m, H, actor) {
  if (!p.startsWith('/ai/anticheat/')) return null;
  await asegurarTablasAc(env.DB);

  // 1) GET /ai/anticheat/challenge — Nonce de 60s atado a user_sub para VANTS PC
  if (p === '/ai/anticheat/challenge' && m === 'GET') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const nonce = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = Date.now() + 60_000;

    await env.DB.prepare(
      'INSERT INTO vants_ac_challenges (nonce, user_sub, expires_at, used_at) VALUES (?, ?, ?, NULL)',
    )
      .bind(nonce, actor.sub, expiresAt)
      .run();

    // Limpieza best-effort de retos vencidos
    await env.DB.prepare('DELETE FROM vants_ac_challenges WHERE expires_at < ?')
      .bind(Date.now() - 120_000)
      .run()
      .catch(() => null);

    return H.json({ ok: true, nonce, user_sub: actor.sub, expires_in: 60, expires_at: expiresAt });
  }

  // 2) POST /ai/anticheat/heartbeat — Heartbeat firmado cada 30s desde VANTS PC
  if (p === '/ai/anticheat/heartbeat' && m === 'POST') {
    if (!env.VANTS_PC_AC_SECRET) {
      return H.json({ ok: false, error: 'ac_secret_no_configurado' }, 503);
    }

    const b = await req.json().catch(() => ({}));
    const nonce = String(b.nonce || '').trim();
    const ts = String(b.ts || '');
    const hwid = String(b.hwid || '').trim().slice(0, 128);
    const appVersion = String(b.app_version || '').trim().slice(0, 32);
    const vanguardOn = Boolean(b.vanguard_on);
    const faceitAcOn = Boolean(b.faceit_ac_on);
    const eacOn = Boolean(b.eac_on);
    const battleyeOn = Boolean(b.battleye_on);
    const hardFlags = Array.isArray(b.hard_flags)
      ? b.hard_flags.map((f) => String(f).trim().toLowerCase()).filter((f) => HARD_EVIDENCE_CODES.has(f))
      : [];
    const signature = String(req.headers.get('x-vants-ac-signature') || b.signature || '').trim();

    if (!nonce || !ts || !signature) {
      return H.json({ ok: false, error: 'heartbeat_incompleto' }, 400);
    }

    const ch = await env.DB.prepare(
      'SELECT nonce, user_sub, expires_at, used_at FROM vants_ac_challenges WHERE nonce = ? LIMIT 1',
    )
      .bind(nonce)
      .first();
    if (!ch || ch.user_sub !== actor.sub || ch.used_at || Number(ch.expires_at) < Date.now()) {
      return H.json({ ok: false, error: 'nonce_invalido_o_expirado' }, 401);
    }

    const canonical = canonicalHeartbeatMessage({
      nonce,
      userSub: actor.sub,
      ts,
      hwid,
      vanguardOn,
      faceitAcOn,
      hardFlags,
    });
    const firmaOk = await verificarFirmaAc(env.VANTS_PC_AC_SECRET, canonical, signature);
    if (!firmaOk) {
      return H.json({ ok: false, error: 'firma_ac_invalida' }, 401);
    }

    // Marcar nonce consumido (anti-replay)
    await env.DB.prepare("UPDATE vants_ac_challenges SET used_at = datetime('now') WHERE nonce = ?")
      .bind(nonce)
      .run();

    // Comprobar ban activo por user_sub o hwid
    const banPrevio = await buscarBanActivo(env.DB, { user_sub: actor.sub, hwid });
    if (banPrevio) {
      return H.json(
        {
          ok: false,
          bloqueado: true,
          error: 'cuenta_bloqueada_anticheat',
          motivo: banPrevio.motivo,
          ban_id: banPrevio.id,
        },
        403,
      );
    }

    // Si VANTS PC reporta evidencia técnica dura firmada -> auto-ban inmediato + alerta roja
    if (hardFlags.length > 0) {
      const banId = crypto.randomUUID();
      const motivo = `Evidencia técnica dura firmada por VANTS PC: ${hardFlags.join(', ')}`;
      const evJson = JSON.stringify({ fuente: 'vants_pc_heartbeat', hard_flags: hardFlags, app_version: appVersion, hwid });
      await env.DB.prepare(
        `INSERT INTO vants_bans (id, user_sub, nick, hwid, motivo, tipo, risk_score, evidencia_json, activo)
         VALUES (?, ?, ?, ?, ?, 'vants_pc_hard_evidence', 100, ?, 1)`,
      )
        .bind(banId, actor.sub, String(b.nick || '').slice(0, 40) || null, hwid || null, motivo, evJson)
        .run();

      if (b.torneo_id) {
        await expulsarDeSalaTorneo(env, String(b.torneo_id), {
          nick: b.nick,
          user_sub: actor.sub,
          motivo,
        });
      }

      await enviarWebhookDisputas(env, {
        title: '🚨 Bloqueo Automático · VANTS Sentinel AI (Evidencia Dura PC)',
        color: 15158332,
        fields: [
          { name: 'Usuario', value: String(b.nick || actor.sub).slice(0, 120), inline: true },
          { name: 'Tipo', value: 'vants_pc_hard_evidence', inline: true },
          { name: 'Señales firmadas', value: hardFlags.join(', ').slice(0, 300), inline: false },
          { name: 'Ban ID', value: banId, inline: true },
        ],
        footer: { text: 'VANTS Sentinel AI · Cero falsos positivos por aim' },
        timestamp: new Date().toISOString(),
      });

      return H.json({ ok: false, bloqueado: true, error: 'cuenta_bloqueada_anticheat', ban_id: banId, motivo }, 403);
    }

    const ahora = Date.now();
    const expiresAt = ahora + 60_000;
    const estadoObj = {
      user_sub: actor.sub,
      hwid: hwid || null,
      app_version: appVersion || null,
      vanguard_on: vanguardOn,
      faceit_ac_on: faceitAcOn,
      eac_on: eacOn,
      battleye_on: battleyeOn,
      shield_status: 'clean',
      updated_at: ahora,
      expires_at: expiresAt,
    };

    await env.DB.prepare(
      `INSERT INTO vants_ac_heartbeats
         (user_sub, hwid, app_version, vanguard_on, faceit_ac_on, eac_on, battleye_on, shield_status, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'clean', ?, ?)
       ON CONFLICT(user_sub) DO UPDATE SET
         hwid = excluded.hwid,
         app_version = excluded.app_version,
         vanguard_on = excluded.vanguard_on,
         faceit_ac_on = excluded.faceit_ac_on,
         eac_on = excluded.eac_on,
         battleye_on = excluded.battleye_on,
         shield_status = 'clean',
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at`,
    )
      .bind(actor.sub, hwid || null, appVersion || null, vanguardOn ? 1 : 0, faceitAcOn ? 1 : 0, eacOn ? 1 : 0, battleyeOn ? 1 : 0, ahora, expiresAt)
      .run();

    // TTL 60s en KV (`ac_status:<user_sub>`) cuando CLIPS_KV está disponible
    if (env.CLIPS_KV && typeof env.CLIPS_KV.put === 'function') {
      await env.CLIPS_KV.put(`ac_status:${actor.sub}`, JSON.stringify(estadoObj), { expirationTtl: 60 }).catch(() => null);
    }

    return H.json({ ok: true, ttl: 60, ac: badgeDesdeHeartbeat(estadoObj) });
  }

  // 3) GET /ai/anticheat/status — Consulta estado AC vigente (TTL 60s)
  if (p === '/ai/anticheat/status' && m === 'GET') {
    const targetSub = actor.owner && url.searchParams.get('user_sub') ? String(url.searchParams.get('user_sub')).trim() : actor.sub;
    let hb = null;
    if (env.CLIPS_KV && typeof env.CLIPS_KV.get === 'function') {
      const raw = await env.CLIPS_KV.get(`ac_status:${targetSub}`).catch(() => null);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Number(parsed.expires_at) > Date.now()) hb = parsed;
        } catch {
          // fallback a D1
        }
      }
    }
    if (!hb) {
      hb = await env.DB.prepare(
        'SELECT user_sub, vanguard_on, faceit_ac_on, eac_on, battleye_on, expires_at FROM vants_ac_heartbeats WHERE user_sub = ? AND expires_at > ? LIMIT 1',
      )
        .bind(targetSub, Date.now())
        .first()
        .catch(() => null);
    }
    const ban = await buscarBanActivo(env.DB, { user_sub: targetSub });
    return H.json({
      ok: true,
      user_sub: targetSub,
      baneado: Boolean(ban),
      ac: badgeDesdeHeartbeat(hb),
    });
  }

  // 4) POST /ai/anticheat/evaluar — Motor proactivo sin falsos positivos por aim
  if (p === '/ai/anticheat/evaluar' && m === 'POST') {
    if (!actor.owner) return H.json({ ok: false, error: 'solo_interno' }, 403);
    const b = await req.json().catch(() => ({}));

    const user_sub = b.user_sub ? String(b.user_sub).trim().slice(0, 96) : null;
    const nick = b.nick ? String(b.nick).trim().slice(0, 60) : null;
    const steam_id = b.steam_id ? String(b.steam_id).trim().slice(0, 40) : null;
    const faceit_id = b.faceit_id ? String(b.faceit_id).trim().slice(0, 64) : null;
    const discord_id = b.discord_id ? String(b.discord_id).trim().slice(0, 40) : null;
    const hwid = b.hwid ? String(b.hwid).trim().slice(0, 128) : null;
    const torneo_id = b.torneo_id ? String(b.torneo_id).trim().slice(0, 80) : null;

    let hardBlock = null;

    // A) Ban activo en vants_bans o evasión de cuenta por cualquier identificador
    const banExistente = await buscarBanActivo(env.DB, { user_sub, steam_id, faceit_id, discord_id, hwid });
    if (banExistente) {
      const esEvasion = Boolean(user_sub && banExistente.user_sub && banExistente.user_sub !== user_sub);
      hardBlock = {
        ban_id: banExistente.id,
        tipo: esEvasion ? 'ban_evasion' : banExistente.tipo || 'vants_ban_activo',
        motivo: esEvasion
          ? `Evasión de ban detectada (coincide con ban activo ${banExistente.id}).`
          : banExistente.motivo,
        evidencia: { ban_origen: banExistente.id, evasion: esEvasion },
        yaExistiaEnMismoSub: !esEvasion && banExistente.user_sub === user_sub,
      };
    }

    // B) Ban oficial externo verificado (FACEIT cheating ban o Steam VAC/Game Ban)
    if (!hardBlock) {
      const ext = await verificarBansExternos(env, {
        faceit_id,
        steam_id,
        faceit_ban_cheating: b.faceit_ban_cheating === true,
      });
      if (ext) {
        hardBlock = {
          ban_id: crypto.randomUUID(),
          tipo: ext.tipo,
          motivo: ext.motivo,
          evidencia: ext.evidencia,
          yaExistiaEnMismoSub: false,
        };
      }
    }

    // C) Evidencia técnica dura firmada desde VANTS PC
    if (!hardBlock && b.vants_pc_evidence && typeof b.vants_pc_evidence === 'object') {
      const evPc = b.vants_pc_evidence;
      const flags = Array.isArray(evPc.flags)
        ? evPc.flags.map((f) => String(f).trim().toLowerCase()).filter((f) => HARD_EVIDENCE_CODES.has(f))
        : [];
      if (flags.length > 0 && env.VANTS_PC_AC_SECRET && evPc.signature) {
        const canonical = canonicalHeartbeatMessage({
          nonce: evPc.nonce || '',
          userSub: user_sub || '',
          ts: evPc.ts || '',
          hwid: hwid || evPc.hwid || '',
          vanguardOn: Boolean(evPc.vanguard_on),
          faceitAcOn: Boolean(evPc.faceit_ac_on),
          hardFlags: flags,
        });
        const validSig = await verificarFirmaAc(env.VANTS_PC_AC_SECRET, canonical, evPc.signature);
        if (validSig) {
          hardBlock = {
            ban_id: crypto.randomUUID(),
            tipo: 'vants_pc_hard_evidence',
            motivo: `Evidencia técnica dura firmada por VANTS PC: ${flags.join(', ')}`,
            evidencia: { fuente: 'vants_pc', flags, hwid: hwid || evPc.hwid || null },
            yaExistiaEnMismoSub: false,
          };
        }
      }
    }

    // Si existe evidencia dura objetiva (A, B o C) -> bloquear automáticamente, expulsar y alertar en rojo
    if (hardBlock) {
      if (!hardBlock.yaExistiaEnMismoSub) {
        const newId = hardBlock.yaExistiaEnMismoSub ? hardBlock.ban_id : crypto.randomUUID();
        hardBlock.ban_id = newId;
        await env.DB.prepare(
          `INSERT INTO vants_bans (id, user_sub, nick, steam_id, faceit_id, discord_id, hwid, motivo, tipo, risk_score, evidencia_json, activo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, 1)`,
        )
          .bind(
            newId,
            user_sub,
            nick,
            steam_id,
            faceit_id,
            discord_id,
            hwid,
            hardBlock.motivo,
            hardBlock.tipo,
            JSON.stringify(hardBlock.evidencia),
          )
          .run();
      }

      const expulsado = torneo_id
        ? await expulsarDeSalaTorneo(env, torneo_id, { nick, user_sub, motivo: hardBlock.motivo })
        : false;

      const torneoLink = torneo_id ? `https://vants.cc/torneos/${encodeURIComponent(torneo_id)}` : null;
      await enviarWebhookDisputas(env, {
        title: '🚨 Bloqueo Automático Anti-Cheat · VANTS Sentinel AI',
        color: 15158332,
        ...(torneoLink ? { url: torneoLink } : {}),
        fields: [
          { name: 'Jugador', value: nick || user_sub || 'Desconocido', inline: true },
          { name: 'Tipo de evidencia', value: hardBlock.tipo, inline: true },
          { name: 'Torneo', value: torneo_id || 'Global', inline: true },
          { name: 'Motivo objetivo', value: hardBlock.motivo.slice(0, 900), inline: false },
          { name: 'Ban ID', value: hardBlock.ban_id, inline: true },
          { name: 'Expulsado de sala', value: expulsado ? 'Sí (RPC SalaTorneo)' : 'No aplicable / sin sala activa', inline: true },
        ],
        footer: { text: 'VANTS Sentinel AI · Bloqueo basado exclusivamente en evidencia objetiva' },
        timestamp: new Date().toISOString(),
      });

      return H.json({
        ok: true,
        bloqueado: true,
        accion: 'bloqueo_automatico',
        tipo: hardBlock.tipo,
        ban_id: hardBlock.ban_id,
        motivo: hardBlock.motivo,
        expulsado_sala: expulsado,
        evidencia: hardBlock.evidencia,
      });
    }

    // SIN EVIDENCIA DURA: PROHIBIDO bloquear automáticamente (ni por hs_pct: 90, kd: 4.0, adr, ni reportes sin prueba).
    const hayReporteOSospecha = Boolean(b.reporte_en_sala || b.cuenta_sospechosa || b.motivo_reporte);
    if (hayReporteOSospecha) {
      const torneoLink = torneo_id ? `https://vants.cc/torneos/${encodeURIComponent(torneo_id)}` : null;
      await enviarWebhookDisputas(env, {
        title: '⚠️ Revisión Humana Sugerida · VANTS Sentinel AI',
        color: 16098851,
        ...(torneoLink ? { url: torneoLink } : {}),
        fields: [
          { name: 'Jugador reportado', value: nick || user_sub || 'Desconocido', inline: true },
          { name: 'Torneo', value: torneo_id || 'Sin especificar', inline: true },
          {
            name: 'Reporte / contexto',
            value: String(b.motivo_reporte || b.reporte_en_sala || 'Cuenta nueva sospechosa reportada en sala').slice(0, 600),
            inline: false,
          },
          {
            name: 'Acción Sentinel AI',
            value: 'NO bloqueado. Sin prueba técnica objetiva; revisar demo/POV manualmente. El buen aim (HS%/K-D alto) no genera auto-ban.',
            inline: false,
          },
        ],
        footer: { text: 'VANTS Sentinel AI · Revisión humana requerida (sin auto-ban)' },
        timestamp: new Date().toISOString(),
      });

      return H.json({
        ok: true,
        bloqueado: false,
        accion: 'revision_humana',
        motivo: 'Sin evidencia dura objetiva. Jugador NO bloqueado; se notificó al staff para revisión manual de demo/POV.',
      });
    }

    return H.json({
      ok: true,
      bloqueado: false,
      accion: 'permitido',
      motivo: 'Sin evidencia objetiva de trampa. Las métricas de habilidad (HS%, K/D, ADR) nunca generan bloqueo automático.',
    });
  }

  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}
