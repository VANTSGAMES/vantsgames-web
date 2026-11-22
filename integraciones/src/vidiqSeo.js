// VANTS · Optimización SEO de Clips / Shorts con vidIQ MCP y Cuotas Diarias
// -----------------------------------------------------------------------------
// Endpoints protegidos en Cloudflare Worker (el token VIDIQ_MCP_TOKEN jamás sale
// al navegador):
//   GET  /clips/cuota                 -> estado de membresía y cupos diarios (Shorts + vidIQ)
//   POST /clips/cuota/consumir-short  -> valida y descuenta 1 Short automático del cupo diario
//   POST /clips/seo                   -> genera títulos virales con vidIQ MCP solo si el plan
//                                        del miembro y el tope diario global lo permiten; si no,
//                                        usa el motor SEO local gratis (0 créditos).

import { membresiaDe } from './extras.js';

const VIDIQ_MCP_URL = 'https://mcp.vidiq.com/mcp';
const GLOBAL_QUOTA_KEY = '__GLOBAL__';
const DEFAULT_GLOBAL_VIDIQ_CAP = 20;

export const CUOTAS_CLIPS_DIARIAS = {
  free: { plan: 'free', label: 'Gratis', shortsPerDay: 0, vidiqPerDay: 0, autoUpload: false, autoDiscord: false },
  pase: { plan: 'pase', label: 'PASE S4', shortsPerDay: 2, vidiqPerDay: 2, autoUpload: true, autoDiscord: false },
  pro: { plan: 'pro', label: 'VANTS PRO', shortsPerDay: 3, vidiqPerDay: 3, autoUpload: true, autoDiscord: false },
  creator: { plan: 'creator', label: 'VANTS CREATOR', shortsPerDay: 5, vidiqPerDay: 5, autoUpload: true, autoDiscord: true },
  socio: { plan: 'socio', label: 'SOCIO VANTS', shortsPerDay: 15, vidiqPerDay: 15, autoUpload: true, autoDiscord: true },
};

export function planCuotaDe(mem) {
  const key = String(mem?.plan || '').toLowerCase();
  if (mem?.activo && CUOTAS_CLIPS_DIARIAS[key]) return CUOTAS_CLIPS_DIARIAS[key];
  return CUOTAS_CLIPS_DIARIAS.free;
}

function fechaUtcHoy(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const next = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return { fecha: `${y}-${m}-${d}`, resetAt: next.toISOString() };
}

function globalCapDe(env) {
  const raw = Number(env && env.VIDIQ_DAILY_GLOBAL_CAP);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return DEFAULT_GLOBAL_VIDIQ_CAP;
}

async function asegurarTablaCuotas(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS clips_cuota_diaria (
        fecha TEXT NOT NULL,
        clave TEXT NOT NULL,
        vidiq_usados INTEGER NOT NULL DEFAULT 0,
        shorts_usados INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (fecha, clave)
      )`
    )
    .run();
}

async function leerUsoDiario(env, fecha, clave, quotaStore) {
  if (quotaStore) {
    return quotaStore.get(`${fecha}:${clave}`) || { vidiq_usados: 0, shorts_usados: 0 };
  }
  if (!env || !env.DB) return { vidiq_usados: 0, shorts_usados: 0 };
  try {
    await asegurarTablaCuotas(env.DB);
    const row = await env.DB.prepare(
      'SELECT vidiq_usados, shorts_usados FROM clips_cuota_diaria WHERE fecha = ? AND clave = ?'
    )
      .bind(fecha, clave)
      .first();
    return {
      vidiq_usados: Number(row?.vidiq_usados || 0),
      shorts_usados: Number(row?.shorts_usados || 0),
    };
  } catch {
    return { vidiq_usados: 0, shorts_usados: 0 };
  }
}

async function incrementarUsoDiario(env, fecha, clave, campo, quotaStore) {
  const col = campo === 'shorts' ? 'shorts_usados' : 'vidiq_usados';
  if (quotaStore) {
    const k = `${fecha}:${clave}`;
    const prev = quotaStore.get(k) || { vidiq_usados: 0, shorts_usados: 0 };
    const next = { ...prev, [col]: prev[col] + 1 };
    quotaStore.set(k, next);
    return next;
  }
  if (!env || !env.DB) return { vidiq_usados: campo === 'vidiq' ? 1 : 0, shorts_usados: campo === 'shorts' ? 1 : 0 };
  try {
    await asegurarTablaCuotas(env.DB);
    const vInc = campo === 'vidiq' ? 1 : 0;
    const sInc = campo === 'shorts' ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO clips_cuota_diaria (fecha, clave, vidiq_usados, shorts_usados, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(fecha, clave) DO UPDATE SET
         vidiq_usados = vidiq_usados + excluded.vidiq_usados,
         shorts_usados = shorts_usados + excluded.shorts_usados,
         updated_at = datetime('now')`
    )
      .bind(fecha, clave, vInc, sInc)
      .run();
    return leerUsoDiario(env, fecha, clave, null);
  } catch {
    return { vidiq_usados: campo === 'vidiq' ? 1 : 0, shorts_usados: campo === 'shorts' ? 1 : 0 };
  }
}

async function construirEstadoCuota(env, sub, mem, quotaStore, now) {
  const { fecha, resetAt } = fechaUtcHoy(now);
  const cfg = planCuotaDe(mem);
  const [usoUser, usoGlobal] = await Promise.all([
    leerUsoDiario(env, fecha, sub, quotaStore),
    leerUsoDiario(env, fecha, GLOBAL_QUOTA_KEY, quotaStore),
  ]);
  const globalCap = globalCapDe(env);
  const vidiqRestantesUsuario = Math.max(0, cfg.vidiqPerDay - usoUser.vidiq_usados);
  const vidiqRestantesGlobal = Math.max(0, globalCap - usoGlobal.vidiq_usados);
  const vidiqRestantes = Math.min(vidiqRestantesUsuario, vidiqRestantesGlobal);
  const shortsRestantes = Math.max(0, cfg.shortsPerDay - usoUser.shorts_usados);

  return {
    fecha,
    resetAt,
    plan: cfg.plan,
    label: cfg.label,
    activo: cfg.plan !== 'free',
    autoUpload: cfg.autoUpload,
    autoDiscord: cfg.autoDiscord,
    shorts: {
      usados: usoUser.shorts_usados,
      limite: cfg.shortsPerDay,
      restantes: shortsRestantes,
    },
    vidiq: {
      usados: usoUser.vidiq_usados,
      limite: cfg.vidiqPerDay,
      restantes: vidiqRestantes,
      restantesUsuario: vidiqRestantesUsuario,
      globalUsados: usoGlobal.vidiq_usados,
      globalLimite: globalCap,
      globalDisponible: vidiqRestantesGlobal > 0,
    },
    creditosVants: {
      usados: usoUser.vidiq_usados,
      limite: cfg.vidiqPerDay,
      restantes: vidiqRestantes,
      globalDisponible: vidiqRestantesGlobal > 0,
    },
  };
}

const JUEGO_META = {
  valorant: {
    nombre: 'VALORANT',
    tags: ['valorant', 'valorant shorts', 'valorant clips', 'valorant latam', 'clutch valorant', 'valorant venezuela', 'riot games', 'fps', 'esports', 'vants games'],
    hashtags: ['#shorts', '#valorant', '#valorantclips', '#gaming', '#vants'],
  },
  cs2: {
    nombre: 'Counter-Strike 2',
    tags: ['cs2', 'counter strike 2', 'cs2 clips', 'faceit', 'cs2 shorts', 'cs2 latam', 'ace cs2', 'fps', 'esports', 'vants games'],
    hashtags: ['#shorts', '#cs2', '#faceit', '#gaming', '#vants'],
  },
  fortnite: {
    nombre: 'Fortnite',
    tags: ['fortnite', 'fortnite shorts', 'fortnite clips', 'fortnite latam', 'victory royale', 'fortnite competitive', 'epic games', 'vants games'],
    hashtags: ['#shorts', '#fortnite', '#fortniteclips', '#gaming', '#vants'],
  },
  lol: {
    nombre: 'League of Legends',
    tags: ['league of legends', 'lol shorts', 'lol clips', 'pentakill', 'lol latam', 'riot games', 'esports', 'vants games'],
    hashtags: ['#shorts', '#leagueoflegends', '#lol', '#gaming', '#vants'],
  },
  fc27: {
    nombre: 'EA Sports FC',
    tags: ['eafc', 'fc27', 'fifa shorts', 'golazo', 'fc latam', 'esports', 'vants games'],
    hashtags: ['#shorts', '#eafc', '#gaming', '#vants'],
  },
  smash: {
    nombre: 'Super Smash Bros. Ultimate',
    tags: ['smash ultimate', 'ssbu', 'smash shorts', 'smash latam', 'combo smash', 'esports', 'vants games'],
    hashtags: ['#shorts', '#smashultimate', '#gaming', '#vants'],
  },
  warzone: {
    nombre: 'Call of Duty Warzone',
    tags: ['warzone', 'cod warzone', 'warzone clips', 'warzone shorts', 'warzone latam', 'fps', 'vants games'],
    hashtags: ['#shorts', '#warzone', '#cod', '#gaming', '#vants'],
  },
  rocketleague: {
    nombre: 'Rocket League',
    tags: ['rocket league', 'rocket league clips', 'rocket league shorts', 'esports', 'vants games'],
    hashtags: ['#shorts', '#rocketleague', '#gaming', '#vants'],
  },
  apex: {
    nombre: 'Apex Legends',
    tags: ['apex legends', 'apex clips', 'apex shorts', 'fps', 'esports', 'vants games'],
    hashtags: ['#shorts', '#apexlegends', '#gaming', '#vants'],
  },
  clashroyale: {
    nombre: 'Clash Royale',
    tags: ['clash royale', 'clash royale shorts', 'clash royale clips', 'mobile gaming', 'vants games'],
    hashtags: ['#shorts', '#clashroyale', '#gaming', '#vants'],
  },
};

function normalizarJuego(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('valorant') || s === 'val') return 'valorant';
  if (s === 'cs2' || s.includes('counterstrike') || s === 'csgo') return 'cs2';
  if (s.includes('fortnite') || s === 'fn') return 'fortnite';
  if (s === 'lol' || s.includes('leagueoflegends')) return 'lol';
  if (s.includes('fc2') || s.includes('eafc') || s.includes('fifa')) return 'fc27';
  if (s.includes('smash') || s === 'ssbu') return 'smash';
  if (s.includes('warzone') || s.includes('cod')) return 'warzone';
  if (s.includes('rocket')) return 'rocketleague';
  if (s.includes('apex')) return 'apex';
  if (s.includes('clash')) return 'clashroyale';
  return 'valorant';
}

export function parseMcpSseJson(rawText) {
  const txt = String(rawText || '').trim();
  if (!txt) return null;
  if (txt.startsWith('{')) {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }
  const lines = txt.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        return JSON.parse(payload);
      } catch {
        // continuar buscando la trama JSON válida
      }
    }
  }
  return null;
}

export function generarSeoLocal({ titulo, juego, notas, formato = 'short' }) {
  const slug = normalizarJuego(juego);
  const meta = JUEGO_META[slug] || {
    nombre: String(juego || 'Esports').trim() || 'Esports',
    tags: ['gaming', 'esports', 'clips', 'shorts', 'latam', 'vants games'],
    hashtags: ['#shorts', '#gaming', '#esports', '#vants'],
  };
  const base = String(titulo || '').trim().replace(/\s+/g, ' ').slice(0, 72) || `Jugada épica en ${meta.nombre}`;
  const tagLine = meta.hashtags.slice(0, 3).join(' ');
  const isShort = formato !== 'long';

  const titleOptions = [
    {
      title: `${base} · ${meta.nombre} ${isShort ? '#shorts' : '| VANTS'}`.slice(0, 98),
      score: null,
    },
    {
      title: `No creerás esta jugada en ${meta.nombre}: ${base} ${isShort ? '#shorts' : ''}`.trim().slice(0, 98),
      score: null,
    },
    {
      title: `${base} 🔥 (${meta.nombre} Competitivo) ${tagLine}`.slice(0, 98),
      score: null,
    },
  ];

  const extraNote = String(notas || '').trim().slice(0, 280);
  const description = [
    `🎮 ${base} — ${meta.nombre}`,
    extraNote || null,
    '🏆 Compite en torneos, rankings y comunidad en https://vants.cc',
    '📺 Directos y clips oficiales de VANTS GAMES',
    '',
    meta.hashtags.join(' '),
  ]
    .filter((x) => x !== null)
    .join('\n');

  const baseWords = base
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 24)
    .slice(0, 4);

  const tags = [...new Set([...meta.tags, ...baseWords, isShort ? 'youtube shorts' : 'gaming highlights'])].slice(0, 15);

  return {
    source: 'vants_seo',
    gameSlug: slug,
    gameName: meta.nombre,
    recommendedTitle: titleOptions[0].title,
    titleOptions,
    description,
    tags,
    hashtags: meta.hashtags,
    creditsUsed: null,
  };
}

async function consultarVidiqTitles(env, { titulo, juego, notas, formato = 'short' }, fetchImpl = fetch) {
  const token = String((env && env.VIDIQ_MCP_TOKEN) || '').trim();
  if (!token) return null;

  const meta = JUEGO_META[normalizarJuego(juego)] || { nombre: juego || 'Esports' };
  const workingTitle = String(titulo || '').trim() || `Clip competitivo de ${meta.nombre}`;
  const desc = [
    `Clip de ${meta.nombre} en VANTS GAMES (Venezuela y Latinoamérica).`,
    String(notas || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 400);

  const res = await fetchImpl(VIDIQ_MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'vidiq_generate_titles',
        arguments: {
          title: workingTitle.slice(0, 200),
          description: desc,
          numTitles: 3,
          type: formato === 'long' ? 'long' : 'short',
          language: 'es',
        },
      },
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) return null;
  const raw = await res.text();
  const rpc = parseMcpSseJson(raw);
  if (!rpc || rpc.error || !rpc.result) return null;

  let structured = rpc.result.structuredContent || null;
  if (!structured && Array.isArray(rpc.result.content)) {
    const textPart = rpc.result.content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (textPart) {
      try {
        structured = JSON.parse(textPart.text);
      } catch {
        structured = null;
      }
    }
  }
  if (!structured || !Array.isArray(structured.titles) || structured.titles.length === 0) return null;

  const titles = structured.titles
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .map((t) => ({
      title: String(t.title).trim().slice(0, 100),
      score: typeof t.score === 'number' ? Math.round(t.score) : null,
    }))
    .slice(0, 5);

  if (!titles.length) return null;
  const creditsUsed =
    structured._credits && typeof structured._credits.used === 'number' ? structured._credits.used : null;
  return { titles, creditsUsed };
}

async function resolverContextoClips(req, env, usuarioClaims, membresiaFn) {
  const clipperHeader = req.headers.get('x-clipper-secret') || '';
  const clipperValid = Boolean(env && env.CLIPPER_SECRET && clipperHeader && clipperHeader === env.CLIPPER_SECRET);
  if (clipperValid) {
    return {
      ok: true,
      sub: 'clipper:owner',
      mem: { plan: 'socio', activo: true, origen: 'clipper_secret' },
    };
  }
  try {
    const claims = await usuarioClaims(req, env);
    if (!claims || !claims.sub) return { ok: false };
    let mem = { plan: null, activo: false };
    try {
      mem = (await membresiaFn(env, claims.sub)) || mem;
    } catch {
      mem = { plan: null, activo: false };
    }
    return { ok: true, sub: claims.sub, mem };
  } catch {
    return { ok: false };
  }
}

export async function rutasVidiqSeo(
  req,
  env,
  url,
  p,
  m,
  { json, usuarioClaims, fetchImpl = fetch, membresiaFn = membresiaDe, quotaStore = null, now } = {},
) {
  const rutas = ['/clips/seo', '/clips/cuota', '/clips/cuota/consumir-short'];
  if (!rutas.includes(p)) return null;

  if (p === '/clips/cuota' && m !== 'GET') return json({ ok: false, error: 'metodo_no_permitido' }, 405);
  if ((p === '/clips/seo' || p === '/clips/cuota/consumir-short') && m !== 'POST') {
    return json({ ok: false, error: 'metodo_no_permitido' }, 405);
  }

  const ctx = await resolverContextoClips(req, env, usuarioClaims, membresiaFn);
  if (!ctx.ok) return json({ ok: false, error: 'sin_sesion' }, 401);

  if (p === '/clips/cuota') {
    const quota = await construirEstadoCuota(env, ctx.sub, ctx.mem, quotaStore, now);
    return json({ ok: true, ...quota, planes: CUOTAS_CLIPS_DIARIAS });
  }

  if (p === '/clips/cuota/consumir-short') {
    const before = await construirEstadoCuota(env, ctx.sub, ctx.mem, quotaStore, now);
    if (!before.autoUpload || before.shorts.limite <= 0) {
      return json(
        {
          ok: false,
          error: 'requiere_membresia',
          detalle: 'La subida automática a YouTube Shorts requiere PASE S4, VANTS PRO o VANTS CREATOR.',
          quota: before,
        },
        403,
      );
    }
    if (before.shorts.restantes <= 0) {
      return json(
        {
          ok: false,
          error: 'limite_diario_shorts',
          detalle: `Alcanzaste tu límite de ${before.shorts.limite} Shorts automáticos hoy. Se reinicia a las 00:00 UTC.`,
          quota: before,
        },
        429,
      );
    }
    await incrementarUsoDiario(env, before.fecha, ctx.sub, 'shorts', quotaStore);
    const after = await construirEstadoCuota(env, ctx.sub, ctx.mem, quotaStore, now);
    return json({ ok: true, quota: after });
  }

  // POST /clips/seo
  const body = await req.json().catch(() => ({}));
  const titulo = String(body.titulo || body.title || '').trim().slice(0, 160);
  const juego = String(body.juego || body.game || 'valorant').trim().slice(0, 40);
  const notas = String(body.notas || body.notes || '').trim().slice(0, 300);
  const formato = body.formato === 'long' ? 'long' : 'short';

  const baseSeo = generarSeoLocal({ titulo, juego, notas, formato });
  const quotaBefore = await construirEstadoCuota(env, ctx.sub, ctx.mem, quotaStore, now);

  let vidiqReason = null;
  if (quotaBefore.vidiq.limite <= 0) {
    vidiqReason = 'requiere_membresia';
  } else if (quotaBefore.vidiq.restantesUsuario <= 0) {
    vidiqReason = 'limite_diario_usuario';
  } else if (!quotaBefore.vidiq.globalDisponible) {
    vidiqReason = 'limite_diario_global';
  }

  if (!vidiqReason) {
    try {
      const vidiq = await consultarVidiqTitles(env, { titulo, juego, notas, formato }, fetchImpl);
      if (vidiq && vidiq.titles.length) {
        await Promise.all([
          incrementarUsoDiario(env, quotaBefore.fecha, ctx.sub, 'vidiq', quotaStore),
          incrementarUsoDiario(env, quotaBefore.fecha, GLOBAL_QUOTA_KEY, 'vidiq', quotaStore),
        ]);
        const quotaAfter = await construirEstadoCuota(env, ctx.sub, ctx.mem, quotaStore, now);
        return json({
          ok: true,
          ...baseSeo,
          source: 'vidiq_mcp',
          recommendedTitle: vidiq.titles[0].title,
          titleOptions: vidiq.titles,
          creditsUsed: vidiq.creditsUsed,
          vidiqReason: null,
          quota: quotaAfter,
        });
      }
      vidiqReason = env && env.VIDIQ_MCP_TOKEN ? 'vidiq_no_disponible' : 'vidiq_sin_token';
    } catch {
      vidiqReason = 'vidiq_no_disponible';
    }
  }

  return json({ ok: true, ...baseSeo, vidiqReason, quota: quotaBefore });
}
