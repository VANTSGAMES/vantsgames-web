// src/vantsAi.js
import { esOwner } from "./comunidad.js";
import { webhookDiscord } from "./comms.js";
import { membresiaDe } from "./extras.js";
import { datosValorant, metricasFaceit, metricasValorant } from "./juegos.js";
import { identidadDe, identidades, perfilPublico } from "./perfiles.js";

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ROUTER_MODEL = (env) => String(env.GEMINI_ROUTER_MODEL || "gemini-3.5-flash-lite").trim();
const EXPERT_MODEL = (env) => String(env.GEMINI_EXPERT_MODEL || "gemini-3.8-flash").trim();

const CUOTAS_AI_DIARIAS = {
  free: 3,
  pase: 12,
  pro: 30,
  creator: 50,
  socio: 200,
};

let aiTablasListas = false;
const enc = new TextEncoder();

function secretIgual(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
  if (!sa || sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Publicación al VantsBus (vía Service Binding VANTS_BUS_SERVICE sin error 1042)
async function publicarBusAi(env, type, data = {}) {
  const secret = String(env.VANTS_BUS_SECRET || "").trim();
  const binding = env.VANTS_BUS_SERVICE;
  const busUrl = String(env.VANTS_BUS_URL || "").replace(/\/+$/, "");
  if (!secret || (!binding && !busUrl)) return { ok: false, omitido: true };

  const rawBody = JSON.stringify({ type, data });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacHex(secret, `${ts}.${rawBody}`);
  const req = new Request(`${busUrl || "https://vants-bus"}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-VANTS-Project": String(env.VANTS_BUS_PROJECT || "vants-ai"),
      "X-VANTS-Timestamp": ts,
      "X-VANTS-Signature": sig,
    },
    body: rawBody,
  });

  try {
    const res = binding ? await binding.fetch(req) : await fetch(req);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}

async function asegurarTablasAi(db) {
  if (aiTablasListas) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_ai_tasks (
      id TEXT PRIMARY KEY,
      auth0_sub TEXT NOT NULL,
      user_role TEXT NOT NULL,
      target_agent TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'completed',
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      metadata_json TEXT,
      action_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      reviewed_at TEXT,
      reviewed_by TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON integ_ai_tasks(status, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_tasks_sub ON integ_ai_tasks(auth0_sub, created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS integ_ai_cuota_diaria (
      fecha TEXT NOT NULL,
      auth0_sub TEXT NOT NULL,
      usados INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (fecha, auth0_sub)
    )`),
  ]);
  aiTablasListas = true;
}

function fechaUtcHoy() {
  return new Date().toISOString().slice(0, 10);
}

async function estadoCuotaAi(env, sub, isOwner) {
  const fecha = fechaUtcHoy();
  const mem = await membresiaDe(env, sub).catch(() => ({ plan: null, activo: false }));
  const plan = isOwner ? "socio" : mem.activo && CUOTAS_AI_DIARIAS[mem.plan] ? mem.plan : "free";
  const limite = isOwner ? 9999 : CUOTAS_AI_DIARIAS[plan];
  const row = await env.DB.prepare(
    "SELECT usados FROM integ_ai_cuota_diaria WHERE fecha = ? AND auth0_sub = ?"
  ).bind(fecha, sub).first().catch(() => null);
  const usados = Number(row?.usados || 0);
  return { fecha, plan, limite, usados, restantes: Math.max(0, limite - usados) };
}

async function consumirCuotaAi(db, fecha, sub) {
  await db.prepare(
    `INSERT INTO integ_ai_cuota_diaria (fecha, auth0_sub, usados, updated_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(fecha, auth0_sub) DO UPDATE SET
       usados = usados + 1,
       updated_at = datetime('now')`
  ).bind(fecha, sub).run();
}

// Resuelve identidad desde JWT (web/app) o desde puente interno de vantsbot-cf
async function resolverActorAi(req, env, H) {
  const interno = req.headers.get("x-vants-internal") || "";
  if (env.VANTS_INTERNAL_SECRET && secretIgual(interno, env.VANTS_INTERNAL_SECRET)) {
    const discordId = String(req.headers.get("x-vants-discord-id") || "").trim();
    const esStaffDiscord = req.headers.get("x-vants-staff") === "1";
    let sub = discordId ? `discord:${discordId}` : "staff:discord";

    if (discordId) {
      const p = await env.DB.prepare(
        "SELECT auth0_sub FROM players WHERE discord_user_id = ? AND auth0_sub IS NOT NULL LIMIT 1"
      ).bind(discordId).first().catch(() => null);
      if (p?.auth0_sub) sub = p.auth0_sub;
    }

    const owner = esStaffDiscord || (await esOwner(env.DB, sub).catch(() => false));
    return { sub, owner, origen: "discord" };
  }

  const claims = await H.usuarioClaims(req, env);
  const sub = claims.sub;
  const owner = await esOwner(env.DB, sub).catch(() => false);
  return { sub, owner, origen: "web" };
}

async function callGemini(env, model, payload) {
  const key = String(env.GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("gemini_no_configurado");

  // Con AI Gateway: https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY}/google-ai-studio/v1beta/models
  const base = String(env.AI_GATEWAY_URL || DEFAULT_GEMINI_BASE).replace(/\/+$/, "");
  const res = await fetch(`${base}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`gemini_${res.status}:${errTxt.slice(0, 180)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("gemini_respuesta_vacia");
  return text;
}

// 1. Orquestador (JSON estricto sin parámetros heredados)
async function enrutarSolicitud(env, userRole, prompt) {
  const raw = await callGemini(env, ROUTER_MODEL(env), {
    system_instruction: {
      parts: [{
        text:
          "Eres el orquestador central de VANTS Core (empresa y plataforma competitiva de esports en Venezuela y LATAM). " +
          "Clasifica cada solicitud en exactamente un agente:\n" +
          "- 'scouting': análisis de jugadores, coaching, estadísticas de FACEIT/CS2, VALORANT, Fortnite o VANTS Ranked (MM).\n" +
          "- 'sponsorship': patrocinios, cálculo de ROI/EMV, propuestas B2B, marcas y monetización.\n" +
          "- 'community': soporte general sobre VANTS, anuncios de torneos, comunicados para Discord, directos o eventos.\n" +
          "Marca needs_external_action=true SOLO si piden publicar/enviar un anuncio oficial o propuesta. Extrae mentioned_player si nombran un jugador.",
      }],
    },
    contents: [{ role: "user", parts: [{ text: `Rol: ${userRole}\nSolicitud: ${prompt}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          target_agent: { type: "STRING", enum: ["scouting", "sponsorship", "community"] },
          priority: { type: "INTEGER" },
          reasoning: { type: "STRING" },
          needs_external_action: { type: "BOOLEAN" },
          mentioned_player: { type: "STRING", nullable: true },
        },
        required: ["target_agent", "priority", "reasoning", "needs_external_action"],
      },
    },
  });

  return JSON.parse(raw);
}

// 2. Telemetría REAL (FACEIT + VALORANT + Fortnite + Matchmaking VANTS)
async function recolectarTelemetriaReal(env, H, { sub, targetPid, targetQuery }) {
  let ident = null;

  if (targetPid) {
    const ids = await identidades(env.DB);
    ident = ids.porPid.get(String(targetPid));
  } else if (targetQuery) {
    const q = String(targetQuery).trim().toLowerCase();
    const ids = await identidades(env.DB);
    ident = ids.lista.find((i) => i.nick.toLowerCase() === q || i.alias.includes(q)) || null;
  }

  if (!ident && sub) {
    ident = await identidadDe(env.DB, sub).catch(() => null);
  }
  if (!ident) return { encontrado: false };

  const perfil = await perfilPublico(env, ident.pid).catch(() => null);
  const faceitLink = ident.links.find((l) => l.platform === "faceit" && l.platform_user_id);
  const subRiot = ident.subs.find((x) => x.startsWith("google-oauth2|")) || ident.subs[0];
  const subPrincipal = ident.subs[0] || sub;

  const [faceitDeep, valoRaw, mmRecientes] = await Promise.all([
    faceitLink ? metricasFaceit(env, faceitLink.platform_user_id, H).catch(() => null) : null,
    subRiot ? datosValorant(env, subRiot, false).catch(() => null) : null,
    subPrincipal
      ? env.DB.prepare(
          "SELECT game, mode, region, score_a, score_b, rr_before, rr_after, played_at FROM mm_historial WHERE sub = ? ORDER BY played_at DESC LIMIT 8"
        ).bind(subPrincipal).all().then((r) => r.results || []).catch(() => [])
      : [],
  ]);

  const valoMetricas = metricasValorant(valoRaw);

  return {
    encontrado: true,
    pid: ident.pid,
    nick: ident.nick,
    xp_vants: ident.xp,
    sello: perfil?.sello || null,
    insignias: perfil?.insignias || [],
    equipos: perfil?.equipos || [],
    logros_vants: perfil?.logros || null,
    vants_ranked_mm: mmRecientes,
    faceit_cs2: faceitDeep
      ? {
          nick: faceitDeep.nick,
          nivel: faceitDeep.nivel,
          elo: faceitDeep.elo,
          partidas: faceitDeep.valores.partidas,
          winrate_pct: faceitDeep.valores.winrate,
          kd: faceitDeep.valores.kd,
          hs_pct: faceitDeep.valores.hs,
          adr: faceitDeep.valores.adr,
          mejor_racha: faceitDeep.valores.mejor_racha,
          clutch_1v1: faceitDeep.valores.clutch_1v1,
          entry_wins: faceitDeep.valores.entry,
        }
      : perfil?.faceit || null,
    valorant: valoRaw?.ok
      ? {
          riot: valoRaw.riot,
          region: valoRaw.region,
          rango_actual: valoRaw.tier,
          pico_historico: valoRaw.pico,
          rr: valoRaw.rr,
          elo: valoRaw.elo,
          competitivas: valoRaw.competitivas,
          victorias: valoRaw.victorias,
          kd_reciente: valoMetricas?.kd ?? null,
          hs_pct_reciente: valoMetricas?.hs ?? null,
          max_acs: valoMetricas?.max_acs ?? null,
          ultimas_5_partidas: (valoRaw.partidas || []).slice(0, 5),
        }
      : null,
    fortnite: perfil?.fortnite || null,
  };
}

// 3. Métricas reales de plataforma + cálculo determinista de ROI/EMV
async function recolectarContextoSponsor(env, ctxData = {}) {
  const [jugadores, torneos, directos, clips] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM perfiles_publicos").first().catch(() => ({ n: 0 })),
    env.DB.prepare("SELECT COUNT(*) n FROM pt_torneos WHERE estado IN ('upcoming', 'ongoing')").first().catch(() => ({ n: 0 })),
    env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN en_vivo = 1 THEN 1 ELSE 0 END) vivos, SUM(COALESCE(espectadores, 0)) viewers FROM integ_directos").first().catch(() => ({ total: 0, vivos: 0, viewers: 0 })),
    env.DB.prepare("SELECT COUNT(*) n FROM integ_clips WHERE publico = 1").first().catch(() => ({ n: 0 })),
  ]);

  const logoSec = Math.max(0, Number(ctxData.logo_screen_seconds) || 600);
  const avgViewers = Math.max(1, Number(ctxData.avg_viewers) || Number(directos?.viewers) || 500);
  const cpmUsd = Math.max(1, Number(ctxData.cpm_usd) || 18);
  const impressions = Math.round((logoSec / 30) * avgViewers);
  const emvUsd = Number(((impressions / 1000) * cpmUsd).toFixed(2));

  return {
    plataforma_vants: {
      perfiles_registrados: Number(jugadores?.n || 0),
      torneos_activos: Number(torneos?.n || 0),
      canales_monitoreados: Number(directos?.total || 0),
      canales_en_vivo: Number(directos?.vivos || 0),
      clips_publicos: Number(clips?.n || 0),
    },
    simulacion_roi: {
      marca: String(ctxData.brand || "Patrocinador"),
      logo_screen_seconds: logoSec,
      avg_viewers: avgViewers,
      cpm_usd: cpmUsd,
      impresiones_equivalentes: impressions,
      valor_mediatico_estimado_usd: emvUsd,
    },
  };
}

// 4. Contexto real de comunidad (torneos, eventos y directos en vivo)
async function recolectarContextoComunidad(env) {
  const [torneos, eventos, directos] = await Promise.all([
    env.DB.prepare("SELECT slug, nombre, game_slug, estado, starts_at, prize_value, prize_currency FROM pt_torneos WHERE estado IN ('upcoming', 'ongoing') ORDER BY starts_at ASC LIMIT 8").all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT id, title, game_slug, starts_at, capacity FROM integ_community_events WHERE status = 'open' ORDER BY starts_at ASC LIMIT 6").all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT plataforma, nombre, juego, espectadores, url FROM integ_directos WHERE en_vivo = 1 ORDER BY espectadores DESC LIMIT 6").all().catch(() => ({ results: [] })),
  ]);

  return {
    torneos_proximos: torneos.results || [],
    eventos_abiertos: eventos.results || [],
    directos_en_vivo: directos.results || [],
  };
}

// 5. Ejecución tras aprobación humana (desde vants.cc o botones de Discord)
async function ejecutarAccionAprobada(env, task, H) {
  if (!task.action_json) return { ejecutado: false, motivo: "sin_accion_externa" };
  let action;
  try {
    action = JSON.parse(task.action_json);
  } catch {
    return { ejecutado: false, motivo: "accion_invalida" };
  }

  if (action.tipo === "discord_anuncio") {
    const embed = {
      title: String(action.titulo || "VANTS GAMES").slice(0, 120),
      description: String(action.mensaje || task.response).slice(0, 1800),
      color: 16715054,
      footer: { text: "VANTS Core AI · Aprobado por Staff" },
    };
    if (H.discord) {
      await H.discord(env, action.categoria || "anuncios", { embeds: [embed] });
    }
    const okWh = await webhookDiscord(env, action.webhook || "comunidad", { embeds: [embed] });
    if (action.notificar_todos && H.notificar) {
      await H.notificar(env, null, "anuncio", embed.title, embed.description.slice(0, 300), action.url || "/torneos").catch(() => null);
    }
    return { ejecutado: true, canal: action.categoria || "anuncios", webhook_ok: okWh };
  }

  return { ejecutado: false, motivo: "tipo_no_soportado" };
}

// Helper exportable para pre-evaluar propuestas B2B desde src/comms.js (/empresas/alianza)
export async function preEvaluarAlianzaB2B(env, { empresa, tipo, web, mensaje }) {
  await asegurarTablasAi(env.DB);
  const ctx = await recolectarContextoSponsor(env, { brand: empresa });
  const respuesta = await callGemini(env, EXPERT_MODEL(env), {
    system_instruction: {
      parts: [{
        text:
          "Eres Director Comercial de VANTS GAMES. Evalúa esta solicitud B2B entrante: " +
          "1) Fit estratégico (Alto/Medio/Bajo), 2) Puntos clave a verificar, 3) Borrador de respuesta comercial usando solo métricas reales de VANTS.",
      }],
    },
    contents: [{
      role: "user",
      parts: [{ text: `Empresa: ${empresa}\nInterés: ${tipo}\nWeb: ${web || "—"}\nMensaje: ${mensaje}\n\nMétricas VANTS:\n${JSON.stringify(ctx.plataforma_vants)}` }],
    }],
  });

  const taskId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO integ_ai_tasks (id, auth0_sub, user_role, target_agent, priority, status, prompt, response, metadata_json)
     VALUES (?, 'system:b2b', 'automated_b2b', 'sponsorship', 4, 'pending_approval', ?, ?, ?)`
  ).bind(taskId, `Propuesta B2B: ${empresa} (${tipo})`, respuesta, JSON.stringify(ctx)).run();

  await publicarBusAi(env, "ai.draft_created", {
    task_id: taskId,
    agent: "sponsorship",
    title: `Borrador B2B · ${empresa} (${tipo})`,
    message: respuesta.slice(0, 1200),
  });

  return { taskId, respuesta };
}

export async function rutasVantsAi(req, env, url, p, m, H) {
  if (p !== "/ai" && !p.startsWith("/ai/")) return null;

  await asegurarTablasAi(env.DB);
  const { sub, owner, origen } = await resolverActorAi(req, env, H);

  if (p === "/ai/estado" && m === "GET") {
    const cuota = await estadoCuotaAi(env, sub, owner);
    return H.json({
      ok: true,
      configurado: !!String(env.GEMINI_API_KEY || "").trim(),
      modelos: { router: ROUTER_MODEL(env), expert: EXPERT_MODEL(env) },
      gateway: Boolean(env.AI_GATEWAY_URL),
      bus: Boolean(env.VANTS_BUS_SECRET && (env.VANTS_BUS_SERVICE || env.VANTS_BUS_URL)),
      owner,
      origen,
      cuota,
      agentes: ["scouting", "sponsorship", "community"],
    });
  }

  if (p === "/ai/scout/jugador" && m === "POST") {
    const cuota = await estadoCuotaAi(env, sub, owner);
    if (cuota.restantes <= 0) {
      return H.json({ ok: false, error: "limite_diario_ai", cuota }, 429);
    }

    const b = await req.json().catch(() => ({}));
    const telemetria = await recolectarTelemetriaReal(env, H, {
      sub,
      targetPid: b.pid || null,
      targetQuery: b.nick || null,
    });
    if (!telemetria.encontrado) {
      return H.json({ ok: false, error: "jugador_no_encontrado" }, 404);
    }

    const raw = await callGemini(env, EXPERT_MODEL(env), {
      system_instruction: {
        parts: [{
          text:
            "Eres Director de Scouting y Coach de Esports en VANTS GAMES. " +
            "Analiza ÚNICAMENTE los datos reales entregados (FACEIT CS2, VALORANT, Fortnite, VANTS Ranked MM y XP). " +
            "No inventes estadísticas faltantes. Devuelve un JSON estricto en español.",
        }],
      },
      contents: [{ role: "user", parts: [{ text: `Evalúa a este jugador:\n${JSON.stringify(telemetria)}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            performance_score: { type: "INTEGER" },
            tier_sugerido: { type: "STRING" },
            rol_ideal: { type: "STRING" },
            fortalezas: { type: "ARRAY", items: { type: "STRING" } },
            areas_mejora: { type: "ARRAY", items: { type: "STRING" } },
            plan_entrenamiento_7d: { type: "ARRAY", items: { type: "STRING" } },
            recomendacion_fichaje: { type: "STRING" },
          },
          required: ["performance_score", "tier_sugerido", "fortalezas", "areas_mejora", "recomendacion_fichaje"],
        },
      },
    });

    await consumirCuotaAi(env.DB, cuota.fecha, sub);
    const reporte = JSON.parse(raw);
    const taskId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO integ_ai_tasks (id, auth0_sub, user_role, target_agent, priority, status, prompt, response, metadata_json)
       VALUES (?, ?, ?, 'scouting', 3, 'completed', ?, ?, ?)`
    ).bind(
      taskId,
      sub,
      owner ? "owner" : "player",
      `Scouting rápido: ${telemetria.nick}`,
      JSON.stringify(reporte),
      JSON.stringify({ pid: telemetria.pid, nick: telemetria.nick })
    ).run();

    await publicarBusAi(env, "ai.report_ready", {
      task_id: taskId,
      player: telemetria.nick,
      score: reporte.performance_score,
      tier: reporte.tier_sugerido,
    });

    return H.json({
      ok: true,
      task_id: taskId,
      jugador: { pid: telemetria.pid, nick: telemetria.nick },
      telemetria,
      reporte,
      cuota: { ...cuota, usados: cuota.usados + 1, restantes: Math.max(0, cuota.restantes - 1) },
    });
  }

  if (p === "/ai/dispatch" && m === "POST") {
    const cuota = await estadoCuotaAi(env, sub, owner);
    if (cuota.restantes <= 0) {
      return H.json({ ok: false, error: "limite_diario_ai", cuota }, 429);
    }

    const b = await req.json().catch(() => ({}));
    const prompt = String(b.prompt || "").trim().slice(0, 2000);
    if (prompt.length < 3) return H.json({ ok: false, error: "prompt_corto" }, 400);

    const userRole = owner ? String(b.user_role || "owner").slice(0, 40) : "player";
    const contextData = b.context_data && typeof b.context_data === "object" ? b.context_data : {};
    const decision = await enrutarSolicitud(env, userRole, prompt);

    if (decision.target_agent === "sponsorship" && !owner) {
      return H.json({ ok: false, error: "solo_owner_comercial" }, 403);
    }

    let respuesta = "";
    let metadata = {};
    let actionJson = null;
    let status = "completed";

    if (decision.target_agent === "scouting") {
      const telemetria = await recolectarTelemetriaReal(env, H, {
        sub,
        targetPid: contextData.pid || null,
        targetQuery: contextData.nick || decision.mentioned_player || null,
      });
      metadata = { telemetria };

      respuesta = await callGemini(env, EXPERT_MODEL(env), {
        system_instruction: {
          parts: [{
            text:
              "Eres el Director de Scouting y Analítica de VANTS GAMES. " +
              "Basa tu análisis estrictamente en la telemetría real adjunta. " +
              "Si el jugador no tiene cuentas vinculadas, indícale cómo vincular FACEIT/Riot en vants.cc/perfil/cuentas.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nDatos reales de VANTS:\n${JSON.stringify(telemetria)}` }] }],
      });
    } else if (decision.target_agent === "sponsorship") {
      const sponsorCtx = await recolectarContextoSponsor(env, contextData);
      metadata = sponsorCtx;

      respuesta = await callGemini(env, EXPERT_MODEL(env), {
        system_instruction: {
          parts: [{
            text:
              "Eres el Director Comercial y de Patrocinios Globales de VANTS GAMES. " +
              "Usa exclusivamente las métricas reales de la plataforma y el cálculo de ROI adjunto. " +
              "Redacta una propuesta ejecutiva clara lista para enviar a un director de marketing.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nDatos reales y cálculo ROI:\n${JSON.stringify(sponsorCtx)}` }] }],
      });
      status = "pending_approval";
    } else {
      const comCtx = await recolectarContextoComunidad(env);
      metadata = comCtx;

      respuesta = await callGemini(env, ROUTER_MODEL(env), {
        system_instruction: {
          parts: [{
            text:
              "Eres el Director de Comunidad y Soporte de VANTS GAMES (esports Venezuela y LATAM, vants.cc). " +
              "Responde en español, directo, sin inventar URLs ni fechas y usando los torneos, eventos y directos reales adjuntos.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nEstado actual de VANTS:\n${JSON.stringify(comCtx)}` }] }],
      });

      if (owner && decision.needs_external_action) {
        status = "pending_approval";
        actionJson = JSON.stringify({
          tipo: "discord_anuncio",
          titulo: String(contextData.titulo || "Anuncio Oficial VANTS").slice(0, 120),
          mensaje: respuesta,
          categoria: String(contextData.categoria || "anuncios"),
          webhook: String(contextData.webhook || "comunidad"),
          notificar_todos: Boolean(contextData.notificar_todos),
          url: String(contextData.url || "/torneos"),
        });
      }
    }

    await consumirCuotaAi(env.DB, cuota.fecha, sub);
    const taskId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO integ_ai_tasks (id, auth0_sub, user_role, target_agent, priority, status, prompt, response, metadata_json, action_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      taskId,
      sub,
      userRole,
      decision.target_agent,
      Math.max(1, Math.min(5, Number(decision.priority) || 3)),
      status,
      prompt,
      respuesta,
      JSON.stringify(metadata),
      actionJson
    ).run();

    if (status === "pending_approval") {
      await publicarBusAi(env, "ai.draft_created", {
        task_id: taskId,
        agent: decision.target_agent,
        title: String(contextData.titulo || `Borrador IA (${decision.target_agent})`),
        message: respuesta.slice(0, 1400),
      });
    }

    return H.json({
      ok: true,
      task_id: taskId,
      status,
      routing: decision,
      metadata,
      response: respuesta,
      requiere_aprobacion: status === "pending_approval",
    });
  }

  if (p === "/ai/tasks" && m === "GET") {
    const scope = url.searchParams.get("scope");
    const statusFilter = url.searchParams.get("status");

    if (scope === "admin") {
      if (!owner) return H.json({ ok: false, error: "solo_owner" }, 403);
      const rs = statusFilter
        ? await env.DB.prepare("SELECT * FROM integ_ai_tasks WHERE status = ? ORDER BY created_at DESC LIMIT 50").bind(statusFilter).all()
        : await env.DB.prepare("SELECT * FROM integ_ai_tasks ORDER BY created_at DESC LIMIT 50").all();
      return H.json({ ok: true, tasks: rs.results || [] });
    }

    const rs = await env.DB.prepare(
      "SELECT id, target_agent, priority, status, prompt, response, created_at FROM integ_ai_tasks WHERE auth0_sub = ? ORDER BY created_at DESC LIMIT 30"
    ).bind(sub).all();
    return H.json({ ok: true, tasks: rs.results || [] });
  }

  const rev = p.match(/^\/ai\/tasks\/([0-9a-f-]{36})\/(approve|reject)$/i);
  if (rev && m === "POST") {
    if (!owner) return H.json({ ok: false, error: "solo_owner" }, 403);
    const [, taskId, accion] = rev;
    const task = await env.DB.prepare("SELECT * FROM integ_ai_tasks WHERE id = ?").bind(taskId).first();
    if (!task) return H.json({ ok: false, error: "no_encontrado" }, 404);
    if (task.status !== "pending_approval") {
      return H.json({ ok: false, error: "ya_revisada", status: task.status }, 409);
    }

    const nuevoEstado = accion === "approve" ? "approved" : "rejected";
    let ejecucion = null;
    if (nuevoEstado === "approved") {
      ejecucion = await ejecutarAccionAprobada(env, task, H);
    }

    await env.DB.prepare(
      "UPDATE integ_ai_tasks SET status = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), reviewed_by = ? WHERE id = ?"
    ).bind(nuevoEstado, sub, taskId).run();

    await publicarBusAi(env, "ai.task_reviewed", {
      task_id: taskId,
      agent: task.target_agent,
      status: nuevoEstado,
      origen,
    });

    return H.json({ ok: true, task_id: taskId, status: nuevoEstado, ejecucion });
  }

  return H.json({ ok: false, error: "no_encontrado" }, 404);
}
