// VANTS · Optimización SEO de Clips / Shorts con vidIQ MCP
// -----------------------------------------------------------------------------
// Endpoint protegido en Cloudflare Worker (el token VIDIQ_MCP_TOKEN jamás sale
// al navegador):
//   POST /clips/seo  -> genera títulos virales (con puntuación vidIQ si hay
//                       VIDIQ_MCP_TOKEN), descripción optimizada y tags para
//                       YouTube Shorts / TikTok / VANTS Clips.

const VIDIQ_MCP_URL = 'https://mcp.vidiq.com/mcp';

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

export async function rutasVidiqSeo(req, env, url, p, m, { json, usuarioClaims, fetchImpl = fetch }) {
  if (p !== '/clips/seo') return null;
  if (m !== 'POST') return json({ ok: false, error: 'metodo_no_permitido' }, 405);

  // Autenticación: sesión de usuario (VANTS / Google) o secreto de VANTS-Clipper
  const clipperHeader = req.headers.get('x-clipper-secret') || '';
  const clipperValid = Boolean(env && env.CLIPPER_SECRET && clipperHeader && clipperHeader === env.CLIPPER_SECRET);
  if (!clipperValid) {
    try {
      const claims = await usuarioClaims(req, env);
      if (!claims || !claims.sub) return json({ ok: false, error: 'sin_sesion' }, 401);
    } catch {
      return json({ ok: false, error: 'sin_sesion' }, 401);
    }
  }

  const body = await req.json().catch(() => ({}));
  const titulo = String(body.titulo || body.title || '').trim().slice(0, 160);
  const juego = String(body.juego || body.game || 'valorant').trim().slice(0, 40);
  const notas = String(body.notas || body.notes || '').trim().slice(0, 300);
  const formato = body.formato === 'long' ? 'long' : 'short';

  const baseSeo = generarSeoLocal({ titulo, juego, notas, formato });

  try {
    const vidiq = await consultarVidiqTitles(env, { titulo, juego, notas, formato }, fetchImpl);
    if (vidiq && vidiq.titles.length) {
      return json({
        ok: true,
        ...baseSeo,
        source: 'vidiq_mcp',
        recommendedTitle: vidiq.titles[0].title,
        titleOptions: vidiq.titles,
        creditsUsed: vidiq.creditsUsed,
      });
    }
  } catch {
    // Fallback limpio al motor local VANTS SEO si vidIQ MCP tarda o falla
  }

  return json({ ok: true, ...baseSeo });
}
