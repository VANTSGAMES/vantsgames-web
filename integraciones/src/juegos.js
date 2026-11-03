// VANTS · Integraciones · juegos (FACEIT CS2 + VALORANT)
// -----------------------------------------------------------------------------
//   · Catálogo de 1000 logros de juego (500 FACEIT CS2 + 500 VALORANT). Cada
//     logro desbloquea su insignia VANTS (1000 insignias, una por logro).
//     Los de FACEIT solo se activan con FACEIT vinculado; los de VALORANT solo
//     con un Riot ID guardado.
//   · Riot ID (Nombre#TAG) → rango, RR, ELO, pico, nivel de cuenta y
//     estadísticas de VALORANT vía HenrikDev (secreto HENRIKDEV_API_KEY). Si
//     la clave no está configurada se usa el rango que sincronizó el bot de
//     Discord (players.stats.valorant) para la cuenta de Discord vinculada.
//   · Mi progreso: VANTS + FACEIT + VALORANT.
//   · Equipo de FACEIT vinculado por enlace (faceit.com/…/teams/<id>).
// La vinculación de cuentas FACEIT (linker) NO se toca: solo se lee vants_links.

const HDEV = 'https://api.henrikdev.xyz';
const REGIONES = ['latam', 'na', 'br', 'eu', 'ap', 'kr'];
const n0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/* ================================================================ catálogo */

// Rangos de VALORANT (tier id competitivo → nombre en español)
export const TIERS_VALO = {
  3: 'Hierro 1', 4: 'Hierro 2', 5: 'Hierro 3', 6: 'Bronce 1', 7: 'Bronce 2', 8: 'Bronce 3',
  9: 'Plata 1', 10: 'Plata 2', 11: 'Plata 3', 12: 'Oro 1', 13: 'Oro 2', 14: 'Oro 3',
  15: 'Platino 1', 16: 'Platino 2', 17: 'Platino 3', 18: 'Diamante 1', 19: 'Diamante 2', 20: 'Diamante 3',
  21: 'Ascendente 1', 22: 'Ascendente 2', 23: 'Ascendente 3', 24: 'Inmortal 1', 25: 'Inmortal 2', 26: 'Inmortal 3', 27: 'Radiante',
};
// Niveles de FACEIT CS2 (ELO mínimo de cada nivel)
export const NIVELES_FACEIT = [null, 100, 501, 751, 901, 1051, 1201, 1351, 1531, 1751, 2001];

const MAPAS_CS = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Train', 'Vertigo', 'Overpass'];
const AGENTES = ['Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo', 'Viper', 'Vyse', 'Waylay', 'Yoru'];
const MAPAS_VALO = ['Ascent', 'Bind', 'Breeze', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Sunset', 'Abyss', 'Corrode'];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const fmtN = (v) => (v >= 1000 && Number.isInteger(v) ? v.toLocaleString('es-ES') : String(v));
const range = (a, b, step) => { const r = []; for (let x = a; x <= b + 1e-9; x += step) r.push(Math.round(x * 100) / 100); return r; };

// Cada serie: k = métrica, metas, nombre(meta), desc(meta), cat
function serie(out, juego, cat, k, metas, nombre, desc) {
  metas.forEach((m, i) => {
    out.push({ c: juego[0] + '.' + k + '.' + m, j: juego, cat, k, m, n: nombre(m), d: desc(m), t: Math.min(6, 1 + Math.floor((i * 6) / metas.length)) });
  });
}

function catalogoFaceit() {
  const o = [];
  const F = 'faceit';
  serie(o, F, 'Nivel', 'nivel', range(1, 10, 1), (m) => 'Nivel ' + m + ' FACEIT', (m) => 'Alcanza el nivel ' + m + ' en FACEIT CS2.');
  serie(o, F, 'ELO', 'elo', range(200, 4000, 100), (m) => fmtN(m) + ' ELO', (m) => 'Llega a ' + fmtN(m) + ' de ELO en FACEIT CS2.');
  serie(o, F, 'Partidas', 'partidas', [1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000], (m) => fmtN(m) + (m === 1 ? ' partida' : ' partidas'), (m) => 'Juega ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en FACEIT CS2.');
  serie(o, F, 'Victorias', 'victorias', [1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000], (m) => fmtN(m) + (m === 1 ? ' victoria' : ' victorias'), (m) => 'Gana ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en FACEIT CS2.');
  serie(o, F, 'Rendimiento', 'kd', range(0.6, 2.0, 0.05), (m) => 'K/D ' + m.toFixed(2), (m) => 'Mantén un K/D medio de ' + m.toFixed(2) + ' o más.');
  serie(o, F, 'Rendimiento', 'hs', range(20, 70, 2), (m) => m + ' % de headshots', (m) => 'Mantén un ' + m + ' % de headshots de media.');
  serie(o, F, 'Rendimiento', 'adr', range(50, 120, 5), (m) => 'ADR ' + m, (m) => 'Mantén un daño medio por ronda (ADR) de ' + m + ' o más.');
  serie(o, F, 'Rendimiento', 'winrate', range(40, 75, 5), (m) => m + ' % de victorias', (m) => 'Gana el ' + m + ' % de tus partidas (mínimo 20 jugadas).');
  serie(o, F, 'Rachas', 'mejor_racha', range(2, 20, 1), (m) => 'Racha de ' + m, (m) => 'Encadena ' + m + ' victorias seguidas en FACEIT.');
  serie(o, F, 'Rachas', 'racha', range(2, 11, 1), (m) => 'En racha · ' + m, (m) => 'Ten una racha activa de ' + m + ' victorias.');
  serie(o, F, 'Totales', 'kills', [10, 50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 50000], (m) => fmtN(m) + ' bajas', (m) => 'Suma ' + fmtN(m) + ' bajas en FACEIT CS2.');
  serie(o, F, 'Totales', 'headshots', [10, 50, 100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 20000], (m) => fmtN(m) + ' headshots', (m) => 'Suma ' + fmtN(m) + ' bajas con headshot.');
  serie(o, F, 'Totales', 'mvps', [1, 10, 25, 50, 100, 250, 500, 1000, 2000], (m) => fmtN(m) + ' MVP', (m) => 'Consigue ' + fmtN(m) + ' MVP de ronda.');
  serie(o, F, 'Totales', 'asistencias', [10, 50, 100, 250, 500, 1000, 2500, 5000], (m) => fmtN(m) + ' asistencias', (m) => 'Suma ' + fmtN(m) + ' asistencias.');
  serie(o, F, 'Multikills', 'triples', [1, 5, 10, 25, 50, 100, 250, 500], (m) => fmtN(m) + ' triples', (m) => 'Consigue ' + fmtN(m) + ' rondas con 3 bajas.');
  serie(o, F, 'Multikills', 'quadros', [1, 5, 10, 25, 50, 100], (m) => fmtN(m) + ' cuádruples', (m) => 'Consigue ' + fmtN(m) + ' rondas con 4 bajas.');
  serie(o, F, 'Multikills', 'aces', [1, 3, 5, 10, 25, 50], (m) => fmtN(m) + (m === 1 ? ' ace' : ' aces'), (m) => 'Elimina al equipo rival entero tú solo ' + fmtN(m) + (m === 1 ? ' vez.' : ' veces.'));
  serie(o, F, 'Multikills', 'dobles', [1, 10, 25, 50, 100, 250], (m) => fmtN(m) + ' dobles', (m) => 'Consigue ' + fmtN(m) + ' rondas con 2 bajas (últimas 100 partidas).');
  for (const mp of MAPAS_CS) {
    const s = slug(mp);
    serie(o, F, 'Mapas', 'mapa_' + s + '_partidas', [1, 5, 10, 25, 50, 100, 200], (m) => mp + ' · ' + fmtN(m) + ' partidas', (m) => 'Juega ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en ' + mp + '.');
    serie(o, F, 'Mapas', 'mapa_' + s + '_victorias', [1, 5, 10, 25, 50, 100], (m) => mp + ' · ' + fmtN(m) + ' victorias', (m) => 'Gana ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en ' + mp + '.');
    serie(o, F, 'Mapas', 'mapa_' + s + '_kills', [50, 250, 500, 1000, 2500], (m) => mp + ' · ' + fmtN(m) + ' bajas', (m) => 'Suma ' + fmtN(m) + ' bajas en ' + mp + '.');
  }
  serie(o, F, 'Partida', 'max_kills', [10, 15, 20, 25, 30, 35, 40], (m) => m + ' bajas en una partida', (m) => 'Haz ' + m + ' bajas en una sola partida.');
  serie(o, F, 'Partida', 'max_adr', [80, 100, 120, 150, 200], (m) => 'ADR ' + m + ' en una partida', (m) => 'Termina una partida con ADR de ' + m + ' o más.');
  serie(o, F, 'Partida', 'max_hs', [50, 60, 70, 80, 90, 100], (m) => m + ' % HS en una partida', (m) => 'Termina una partida (10+ bajas) con ' + m + ' % de headshots.');
  serie(o, F, 'Clutch', 'clutch_1v1', [1, 5, 10, 25, 50, 100], (m) => fmtN(m) + ' clutch 1v1', (m) => 'Gana ' + fmtN(m) + ' rondas 1 contra 1 (últimas 100 partidas).');
  serie(o, F, 'Clutch', 'clutch_1v2', [1, 3, 5, 10, 25], (m) => fmtN(m) + ' clutch 1v2', (m) => 'Gana ' + fmtN(m) + ' rondas 1 contra 2 (últimas 100 partidas).');
  serie(o, F, 'Clutch', 'entry', [1, 10, 25, 50, 100], (m) => fmtN(m) + ' entradas ganadas', (m) => 'Gana ' + fmtN(m) + ' duelos de entrada (últimas 100 partidas).');
  serie(o, F, 'Armas', 'sniper', [1, 10, 50, 100, 250, 500], (m) => fmtN(m) + ' bajas con AWP', (m) => 'Haz ' + fmtN(m) + ' bajas con francotirador (últimas 100 partidas).');
  serie(o, F, 'Armas', 'pistola', [1, 10, 50, 100, 250], (m) => fmtN(m) + ' bajas con pistola', (m) => 'Haz ' + fmtN(m) + ' bajas con pistola (últimas 100 partidas).');
  serie(o, F, 'Armas', 'cuchillo', [1, 3, 5, 10], (m) => fmtN(m) + ' bajas a cuchillo', (m) => 'Haz ' + fmtN(m) + ' bajas con cuchillo (últimas 100 partidas).');
  serie(o, F, 'Armas', 'zeus', [1, 3, 5, 10], (m) => fmtN(m) + ' bajas con Zeus', (m) => 'Haz ' + fmtN(m) + ' bajas con el Zeus (últimas 100 partidas).');
  serie(o, F, 'Utilidad', 'utilidad', [100, 500, 1000, 2500, 5000, 10000], (m) => fmtN(m) + ' de daño con utilidad', (m) => 'Inflige ' + fmtN(m) + ' de daño con granadas (últimas 100 partidas).');
  serie(o, F, 'Utilidad', 'flashes', [1, 10, 50, 100, 250, 500], (m) => fmtN(m) + ' flashes efectivas', (m) => 'Ciega a rivales con ' + fmtN(m) + ' flashes (últimas 100 partidas).');
  return o;
}

function catalogoValorant() {
  const o = [];
  const V = 'valorant';
  const tiers = range(3, 27, 1);
  serie(o, V, 'Rango', 'tier', tiers, (m) => TIERS_VALO[m], (m) => 'Alcanza el rango ' + TIERS_VALO[m] + ' en competitivo.');
  serie(o, V, 'Rango', 'pico', tiers, (m) => 'Pico ' + TIERS_VALO[m], (m) => 'Tu rango máximo histórico llega a ' + TIERS_VALO[m] + '.');
  serie(o, V, 'Rango', 'elo', range(100, 2700, 100), (m) => fmtN(m) + ' ELO VALORANT', (m) => 'Llega a ' + fmtN(m) + ' de ELO competitivo.');
  serie(o, V, 'Rango', 'rr', [25, 50, 75, 99], (m) => m + ' RR', (m) => 'Ten ' + m + ' RR o más en tu rango actual.');
  serie(o, V, 'Cuenta', 'nivel_cuenta', [5, 10, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500], (m) => 'Nivel de cuenta ' + m, (m) => 'Sube tu cuenta de Riot al nivel ' + m + '.');
  serie(o, V, 'Competitivo', 'partidas', [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000], (m) => fmtN(m) + ' competitivas', (m) => 'Juega ' + fmtN(m) + (m === 1 ? ' partida competitiva.' : ' partidas competitivas.'));
  serie(o, V, 'Competitivo', 'victorias', [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750], (m) => fmtN(m) + ' victorias', (m) => 'Gana ' + fmtN(m) + (m === 1 ? ' partida competitiva.' : ' partidas competitivas.'));
  for (const ag of AGENTES) {
    const s = slug(ag);
    serie(o, V, 'Agentes', 'agente_' + s + '_partidas', [1, 10, 25, 50], (m) => ag + ' · ' + fmtN(m) + ' partidas', (m) => 'Juega ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' con ' + ag + '.');
    serie(o, V, 'Agentes', 'agente_' + s + '_victorias', [1, 10, 25], (m) => ag + ' · ' + fmtN(m) + ' victorias', (m) => 'Gana ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' con ' + ag + '.');
    serie(o, V, 'Agentes', 'agente_' + s + '_kills', [100, 500], (m) => ag + ' · ' + fmtN(m) + ' bajas', (m) => 'Suma ' + fmtN(m) + ' bajas con ' + ag + '.');
  }
  for (const mp of MAPAS_VALO) {
    const s = slug(mp);
    serie(o, V, 'Mapas', 'mapa_' + s + '_partidas', [1, 10, 25, 50], (m) => mp + ' · ' + fmtN(m) + ' partidas', (m) => 'Juega ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en ' + mp + '.');
    serie(o, V, 'Mapas', 'mapa_' + s + '_victorias', [1, 10, 25], (m) => mp + ' · ' + fmtN(m) + ' victorias', (m) => 'Gana ' + fmtN(m) + (m === 1 ? ' partida' : ' partidas') + ' en ' + mp + '.');
  }
  serie(o, V, 'Totales', 'kills', [10, 50, 100, 250, 500, 1000, 2500, 5000], (m) => fmtN(m) + ' bajas', (m) => 'Suma ' + fmtN(m) + ' bajas en las partidas registradas.');
  serie(o, V, 'Totales', 'headshots', [10, 50, 100, 250, 500, 1000], (m) => fmtN(m) + ' headshots', (m) => 'Suma ' + fmtN(m) + ' impactos a la cabeza.');
  serie(o, V, 'Totales', 'asistencias', [10, 50, 100, 250, 500, 1000], (m) => fmtN(m) + ' asistencias', (m) => 'Suma ' + fmtN(m) + ' asistencias.');
  serie(o, V, 'Totales', 'dano', [1000, 5000, 10000, 25000, 50000], (m) => fmtN(m) + ' de daño', (m) => 'Inflige ' + fmtN(m) + ' de daño en total.');
  serie(o, V, 'Partida', 'max_kills', [10, 15, 20, 25, 30, 35, 40], (m) => m + ' bajas en una partida', (m) => 'Haz ' + m + ' bajas en una sola partida.');
  serie(o, V, 'Partida', 'max_acs', [200, 250, 300, 350, 400], (m) => 'ACS ' + m, (m) => 'Termina una partida con una puntuación de combate media de ' + m + ' o más.');
  serie(o, V, 'Rendimiento', 'kd', [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5], (m) => 'K/D ' + m.toFixed(2), (m) => 'Mantén un K/D medio de ' + m.toFixed(2) + ' o más.');
  serie(o, V, 'Rendimiento', 'hs', [10, 15, 20, 25, 30, 35, 40], (m) => m + ' % de headshots', (m) => 'Mantén un ' + m + ' % de impactos a la cabeza.');
  return o;
}

let CATALOGO = null;
export function catalogo() {
  if (!CATALOGO) {
    const f = catalogoFaceit(), v = catalogoValorant();
    if (f.length !== 500 || v.length !== 500) console.error('catalogo_tamano', f.length, v.length);
    CATALOGO = [...f, ...v];
  }
  return CATALOGO;
}

/* ================================================================ FACEIT */

// Métricas de FACEIT: estadísticas globales + mapas + últimas 100 partidas.
export async function metricasFaceit(env, pid, H) {
  return H.cacheado('fm:' + pid, 300_000, async () => {
    const [p, st, h1, h2] = await Promise.all([
      H.fx(env, '/players/' + pid),
      H.fx(env, '/players/' + pid + '/stats/cs2').catch(() => null),
      H.fx(env, '/players/' + pid + '/games/cs2/stats?limit=100').catch(() => null),
      H.fx(env, '/players/' + pid + '/games/cs2/stats?limit=100&offset=100').catch(() => null),
    ]);
    if (!p) return null;
    const cs = (p.games && (p.games.cs2 || p.games.csgo)) || {};
    const lt = (st && st.lifetime) || {};
    const v = {};
    v.nivel = nn(cs.skill_level); v.elo = nn(cs.faceit_elo);
    v.partidas = nn(lt['Total Matches'] ?? lt['Matches']);
    v.victorias = nn(lt['Wins']);
    v.kd = nn(lt['Average K/D Ratio']); v.hs = nn(lt['Average Headshots %']); v.adr = nn(lt['ADR']);
    v.winrate = v.partidas != null && v.partidas >= 20 ? nn(lt['Win Rate %']) : (v.partidas != null ? 0 : null);
    v.mejor_racha = nn(lt['Longest Win Streak']); v.racha = nn(lt['Current Win Streak']);
    // Totales a partir de los mapas
    const T = { kills: 0, headshots: 0, mvps: 0, asistencias: 0, triples: 0, quadros: 0, aces: 0 };
    let haySeg = false;
    for (const s of (st && st.segments) || []) {
      if (String(s.type || '').toLowerCase() !== 'map') continue;
      const x = s.stats || {};
      haySeg = true;
      const kills = n0(x['Kills']);
      T.kills += kills; T.headshots += n0(x['Headshots']); T.mvps += n0(x['MVPs']); T.asistencias += n0(x['Assists']);
      T.triples += n0(x['Triple Kills']); T.quadros += n0(x['Quadro Kills']); T.aces += n0(x['Penta Kills']);
      const mk = slug(String(s.label || '').replace(/^de_/i, ''));
      if (!mk) continue;
      v['mapa_' + mk + '_partidas'] = (v['mapa_' + mk + '_partidas'] || 0) + n0(x['Matches']);
      v['mapa_' + mk + '_victorias'] = (v['mapa_' + mk + '_victorias'] || 0) + n0(x['Wins']);
      v['mapa_' + mk + '_kills'] = (v['mapa_' + mk + '_kills'] || 0) + kills;
    }
    // Últimas partidas
    const items = [...((h1 && h1.items) || []), ...((h2 && h2.items) || [])];
    const R = { dobles: 0, clutch_1v1: 0, clutch_1v2: 0, entry: 0, sniper: 0, pistola: 0, cuchillo: 0, zeus: 0, utilidad: 0, flashes: 0, max_kills: 0, max_adr: 0, max_hs: 0 };
    const recK = { kills: 0, headshots: 0, mvps: 0, asistencias: 0, triples: 0, quadros: 0, aces: 0 };
    for (const it of items) {
      const s = it.stats || {};
      const k = n0(s['Kills']);
      R.dobles += n0(s['Double Kills']);
      R.clutch_1v1 += n0(s['1v1Wins']); R.clutch_1v2 += n0(s['1v2Wins']);
      R.entry += n0(s['Entry Wins']);
      R.sniper += n0(s['Sniper Kills']); R.pistola += n0(s['Pistol Kills']); R.cuchillo += n0(s['Knife Kills']); R.zeus += n0(s['Zeus Kills']);
      R.utilidad += n0(s['Utility Damage']); R.flashes += n0(s['Flash Successes'] ?? s['Enemies Flashed']);
      R.max_kills = Math.max(R.max_kills, k);
      R.max_adr = Math.max(R.max_adr, n0(s['ADR']));
      if (k >= 10) R.max_hs = Math.max(R.max_hs, n0(s['Headshots %']));
      recK.kills += k; recK.headshots += n0(s['Headshots']); recK.mvps += n0(s['MVPs']); recK.asistencias += n0(s['Assists']);
      recK.triples += n0(s['Triple Kills']); recK.quadros += n0(s['Quadro Kills']); recK.aces += n0(s['Penta Kills']);
    }
    // Si FACEIT no trae segmentos por mapa, se usan las partidas recientes.
    for (const key of Object.keys(T)) v[key] = haySeg ? Math.max(T[key], recK[key]) : recK[key];
    Object.assign(v, R);
    if (!items.length && !haySeg) for (const key of Object.keys(R)) v[key] = R[key] || 0;
    return { valores: v, nick: p.nickname, nivel: v.nivel, elo: v.elo };
  });
}

export function progresoNivelFaceit(nivel, elo) {
  if (!nivel || elo == null) return null;
  if (nivel >= 10) return { nivel, elo, desde: NIVELES_FACEIT[10], hasta: null, progreso: 100, falta: 0, siguiente: null };
  const desde = NIVELES_FACEIT[nivel], hasta = NIVELES_FACEIT[nivel + 1];
  const pr = Math.max(0, Math.min(100, Math.round(((elo - desde) / (hasta - desde)) * 100)));
  return { nivel, elo, desde, hasta, progreso: pr, falta: Math.max(0, hasta - elo), siguiente: nivel + 1 };
}

/* ================================================================ equipo FACEIT */

export function idEquipoFaceit(v) {
  const m = String(v || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}

export async function equipoFaceit(env, teamId, H, partidasUsuario) {
  return H.cacheado('ft:' + teamId, 300_000, async () => {
    const t = await H.fx(env, '/teams/' + teamId);
    if (!t) return null;
    const st = await H.fx(env, '/teams/' + teamId + '/stats/cs2').catch(() => null);
    const miembros = (t.members || []).slice(0, 10);
    const perfiles = await Promise.all(miembros.map((mm) => H.cacheado('fpl:' + mm.user_id, 600_000, () => H.fx(env, '/players/' + mm.user_id).catch(() => null))));
    const lt = (st && st.lifetime) || {};
    return {
      tipo: 'faceit',
      id: t.team_id,
      nombre: t.name,
      tag: t.nickname || null,
      avatar: t.avatar || null,
      url: 'https://www.faceit.com/es/teams/' + t.team_id,
      lider: t.leader || null,
      jugadores: miembros.map((mm, i) => {
        const pf = perfiles[i];
        const cs = (pf && pf.games && (pf.games.cs2 || pf.games.csgo)) || {};
        return { id: mm.user_id, nickname: mm.nickname, avatar: mm.avatar || null, nivel: nn(cs.skill_level ?? mm.skill_level), elo: nn(cs.faceit_elo), pais: (pf && pf.country) || mm.country || null, lider: mm.user_id === t.leader, url: 'https://www.faceit.com/es/players/' + encodeURIComponent(mm.nickname) };
      }),
      estadisticas: st ? {
        partidas: nn(lt['Matches']), victorias: nn(lt['Wins']), winrate: nn(lt['Win Rate %']),
        racha: nn(lt['Current Win Streak']), mejor_racha: nn(lt['Longest Win Streak']),
        recientes: Array.isArray(lt['Recent Results']) ? lt['Recent Results'].map((x) => x === '1') : [],
        mapas: ((st && st.segments) || []).filter((s) => String(s.type || '').toLowerCase() === 'map').map((s) => ({ mapa: s.label, partidas: nn(s.stats && s.stats['Matches']), winrate: nn(s.stats && s.stats['Win Rate %']) })).filter((x) => x.partidas),
      } : null,
      partidas: (partidasUsuario || []).filter((p) => p.equipo && p.equipo === t.name),
    };
  });
}

/* ================================================================ VALORANT */

export function riotValido(s) {
  const t = String(s || '').trim();
  const i = t.lastIndexOf('#');
  if (i < 1) return null;
  const nombre = t.slice(0, i).trim(), tag = t.slice(i + 1).trim();
  if (nombre.length < 3 || nombre.length > 16 || tag.length < 2 || tag.length > 5) return null;
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nombre) || !/^[\p{L}\p{N}]+$/u.test(tag)) return null;
  return { nombre, tag };
}

async function hdev(env, ruta) {
  const r = await fetch(HDEV + ruta, { headers: { Authorization: env.HENRIKDEV_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (r.status === 404) return null;
  if (r.status === 429) throw new Error('hdev_429');
  if (!r.ok) throw new Error('hdev_' + r.status);
  return r.json();
}

// Datos del bot de Discord (rango sincronizado) para la cuenta de Discord vinculada.
async function valorantDelBot(db, sub) {
  const d = await db.prepare("SELECT platform_user_id FROM vants_links WHERE auth0_sub = ? AND platform = 'discord'").bind(sub).first();
  const ids = [];
  if (d && d.platform_user_id) ids.push(d.platform_user_id);
  const filas = await db.prepare(
    "SELECT stats FROM players WHERE auth0_sub = ? OR discord_user_id = ? OR auth_user_id = ?"
  ).bind(sub, ids[0] || '-', 'discord:' + (ids[0] || '-')).all();
  for (const f of filas.results || []) {
    try {
      const s = JSON.parse(f.stats || '{}');
      if (s && s.valorant && s.valorant.tier_id) return s.valorant;
    } catch { /* stats corruptos */ }
  }
  return null;
}

// Consulta completa de VALORANT para un Riot ID (HenrikDev), con caché en D1 (10 min).
async function consultaValorant(env, fila) {
  const nom = encodeURIComponent(fila.nombre), tag = encodeURIComponent(fila.tag);
  let region = fila.region || null;
  const cuenta = await hdev(env, '/valorant/v2/account/' + nom + '/' + tag).catch((e) => { if (String(e.message) === 'hdev_429') throw e; return null; });
  if (cuenta && cuenta.data && cuenta.data.region) region = String(cuenta.data.region).toLowerCase();
  let mmr = null;
  for (const reg of region ? [region, ...REGIONES.filter((r) => r !== region)] : REGIONES) {
    const j = await hdev(env, '/valorant/v3/mmr/' + reg + '/pc/' + nom + '/' + tag).catch((e) => { if (String(e.message) === 'hdev_429') throw e; return null; });
    if (j && j.data) { mmr = j.data; region = reg; break; }
  }
  if (!cuenta && !mmr) return { ok: false, error: 'riot_no_encontrado' };
  let partidas = [];
  if (region) {
    const pj = await hdev(env, '/valorant/v1/stored-matches/' + region + '/' + nom + '/' + tag + '?mode=competitive&size=100').catch(() => null);
    partidas = ((pj && pj.data) || []).map((x) => {
      const s = x.stats || {}, meta = x.meta || {}, teams = x.teams || {};
      const equipo = String(s.team || '').toLowerCase();
      const otro = equipo === 'red' ? 'blue' : 'red';
      const shots = s.shots || {};
      const rondas = n0(teams[equipo]) + n0(teams[otro]);
      return {
        id: meta.id || null, mapa: (meta.map && meta.map.name) || null, agente: (s.character && s.character.name) || null,
        victoria: n0(teams[equipo]) > n0(teams[otro]), marcador: teams[equipo] != null ? teams[equipo] + ' / ' + teams[otro] : null,
        kills: n0(s.kills), muertes: n0(s.deaths), asistencias: n0(s.assists),
        headshots: n0(shots.head), disparos: n0(shots.head) + n0(shots.body) + n0(shots.leg),
        dano: n0(s.damage && s.damage.made), acs: rondas ? Math.round(n0(s.score) / rondas) : null,
        fecha: meta.started_at || null,
      };
    });
  }
  const cur = (mmr && mmr.current) || {};
  const peak = (mmr && mmr.peak) || {};
  const temporadas = (mmr && mmr.seasonal) || [];
  const d = cuenta && cuenta.data;
  return {
    ok: true,
    fuente: 'henrikdev',
    riot: fila.nombre + '#' + fila.tag,
    puuid: (d && d.puuid) || null,
    region,
    nivel_cuenta: d ? nn(d.account_level) : null,
    tarjeta: (d && d.card && (d.card.small || d.card.wide)) || null,
    tier_id: nn(cur.tier && cur.tier.id), tier: cur.tier && cur.tier.id ? (TIERS_VALO[cur.tier.id] || cur.tier.name) : null,
    rr: nn(cur.rr), elo: nn(cur.elo),
    pico_id: nn(peak.tier && peak.tier.id), pico: peak.tier && peak.tier.id ? (TIERS_VALO[peak.tier.id] || peak.tier.name) : null,
    pico_temporada: (peak.season && peak.season.short) || null,
    competitivas: temporadas.reduce((a, t) => a + n0(t.games), 0),
    victorias: temporadas.reduce((a, t) => a + n0(t.wins), 0),
    partidas,
  };
}

export function iconoTier(id) {
  return id ? 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/' + id + '/largeicon.png' : null;
}

export async function datosValorant(env, sub, forzar) {
  const db = env.DB;
  const fila = await db.prepare('SELECT * FROM integ_riot WHERE auth0_sub = ?').bind(sub).first();
  const bot = await valorantDelBot(db, sub).catch(() => null);
  const desdeBot = bot ? {
    ok: true, fuente: 'bot', riot: fila ? fila.nombre + '#' + fila.tag : null, region: bot.region || null,
    tier_id: nn(bot.tier_id), tier: TIERS_VALO[nn(bot.tier_id)] || bot.tier || null, rr: nn(bot.rr), elo: nn(bot.elo),
    pico_id: null, pico: null, nivel_cuenta: null, competitivas: null, victorias: null, partidas: [], actualizado: bot.actualizado || null,
  } : null;
  if (!fila) return desdeBot ? { ...desdeBot, sin_riot_id: true } : null;
  const key = String(env.HENRIKDEV_API_KEY || '').trim();
  if (!key) {
    return desdeBot ? { ...desdeBot, aviso: 'hdev_no_config' } : { ok: true, fuente: 'pendiente', riot: fila.nombre + '#' + fila.tag, aviso: 'hdev_no_config', partidas: [] };
  }
  const fresco = fila.datos && fila.actualizado && Date.now() - Date.parse(fila.actualizado.replace(' ', 'T') + 'Z') < 600_000;
  if (fresco && !forzar) { try { return JSON.parse(fila.datos); } catch { /* recalcular */ } }
  try {
    const d = await consultaValorant(env, fila);
    if (d.ok) {
      d.actualizado = new Date().toISOString();
      await db.prepare("UPDATE integ_riot SET datos = ?, region = ?, puuid = ?, verificado = 1, actualizado = datetime('now') WHERE auth0_sub = ?").bind(JSON.stringify(d), d.region, d.puuid, sub).run();
      return d;
    }
    return { ok: false, error: d.error, riot: fila.nombre + '#' + fila.tag, partidas: [] };
  } catch (e) {
    if (fila.datos) { try { return { ...JSON.parse(fila.datos), aviso: String(e.message) }; } catch { /* nada */ } }
    return desdeBot ? { ...desdeBot, aviso: String(e.message) } : { ok: false, error: String(e.message), riot: fila.nombre + '#' + fila.tag, partidas: [] };
  }
}

export function metricasValorant(d) {
  if (!d || !d.ok || d.fuente === 'pendiente') return null;
  const v = {};
  v.tier = d.tier_id || 0; v.pico = Math.max(d.pico_id || 0, d.tier_id || 0); v.elo = d.elo; v.rr = d.rr;
  v.nivel_cuenta = d.nivel_cuenta; v.partidas = d.competitivas; v.victorias = d.victorias;
  const P = d.partidas || [];
  if (d.fuente === 'henrikdev') {
    let k = 0, de = 0, hs = 0, sh = 0, as = 0, dn = 0, mk = 0, macs = 0, w = 0;
    for (const p of P) {
      k += p.kills; de += p.muertes; hs += p.headshots; sh += p.disparos; as += p.asistencias; dn += p.dano;
      mk = Math.max(mk, p.kills); macs = Math.max(macs, p.acs || 0); if (p.victoria) w++;
      if (p.agente) {
        const a = 'agente_' + slug(p.agente);
        v[a + '_partidas'] = (v[a + '_partidas'] || 0) + 1;
        if (p.victoria) v[a + '_victorias'] = (v[a + '_victorias'] || 0) + 1;
        v[a + '_kills'] = (v[a + '_kills'] || 0) + p.kills;
      }
      if (p.mapa) {
        const m = 'mapa_' + slug(p.mapa);
        v[m + '_partidas'] = (v[m + '_partidas'] || 0) + 1;
        if (p.victoria) v[m + '_victorias'] = (v[m + '_victorias'] || 0) + 1;
      }
    }
    v.kills = k; v.headshots = hs; v.asistencias = as; v.dano = dn; v.max_kills = mk; v.max_acs = macs;
    v.kd = de ? Math.round((k / de) * 100) / 100 : (k ? k : null);
    v.hs = sh ? Math.round((hs / sh) * 1000) / 10 : null;
    v.partidas = Math.max(n0(v.partidas), P.length); v.victorias = Math.max(n0(v.victorias), w);
  }
  return v;
}

/* ================================================================ logros + progreso */

// Calcula los 1000 logros: devuelve valores por métrica y códigos conseguidos
// (los conseguidos se guardan en integ_logros_ok para que no se pierdan).
export async function estadoLogros(env, sub, H) {
  const db = env.DB;
  const lf = await db.prepare("SELECT platform_user_id FROM vants_links WHERE auth0_sub = ? AND platform = 'faceit'").bind(sub).first();
  let vf = null, mf = null, errF = null;
  if (lf && lf.platform_user_id) {
    try { mf = await metricasFaceit(env, lf.platform_user_id, H); vf = mf && mf.valores; } catch (e) { errF = String(e.message || e); }
  }
  const dv = await datosValorant(env, sub, false).catch(() => null);
  const vv = metricasValorant(dv);
  const cat = catalogo();
  const previos = await db.prepare('SELECT code, conseguido FROM integ_logros_ok WHERE auth0_sub = ?').bind(sub).all();
  const ok = new Map((previos.results || []).map((r) => [r.code, r.conseguido]));
  const nuevos = [];
  for (const l of cat) {
    const vals = l.j === 'faceit' ? vf : vv;
    if (!vals || ok.has(l.c)) continue;
    const x = vals[l.k];
    if (x != null && x >= l.m) nuevos.push(l.c);
  }
  if (nuevos.length) {
    const ahora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const st = db.prepare('INSERT OR IGNORE INTO integ_logros_ok (auth0_sub, code, conseguido) VALUES (?, ?, ?)');
    for (let i = 0; i < nuevos.length; i += 50) await db.batch(nuevos.slice(i, i + 50).map((c) => st.bind(sub, c, ahora)));
    for (const c of nuevos) ok.set(c, ahora);
  }
  const cuenta = (j) => cat.filter((l) => l.j === j && ok.has(l.c)).length;
  return {
    faceit: { activo: !!vf, vinculado: !!lf, error: errF, valores: vf || {}, conseguidos: cuenta('faceit'), total: 500, nick: mf && mf.nick, nivel: mf && mf.nivel, elo: mf && mf.elo },
    valorant: { activo: !!vv, riot: dv ? dv.riot : null, fuente: dv ? dv.fuente : null, aviso: dv ? dv.aviso || null : null, valores: vv || {}, conseguidos: cuenta('valorant'), total: 500, datos: dv },
    conseguidos: Object.fromEntries(ok),
    nuevos: nuevos.length,
  };
}

/* ================================================================ rutas */

export async function rutasJuegos(req, env, url, p, m, H) {
  // Público: catálogo de los 1000 logros / insignias (estático, cacheable).
  if (p === '/logros/catalogo' && m === 'GET') {
    const r = H.json({ ok: true, total: catalogo().length, logros: catalogo() });
    r.headers.set('Cache-Control', 'public, max-age=3600');
    return r;
  }
  const privadas = ['/logros/estado', '/progreso', '/riot', '/valorant', '/faceit/equipo'];
  if (!privadas.includes(p)) return null;
  const sub = await H.usuario(req, env);
  const db = env.DB;

  if (p === '/logros/estado' && m === 'GET') {
    const e = await estadoLogros(env, sub, H);
    const { datos, ...valo } = e.valorant;
    return H.json({ ok: true, ...e, valorant: valo });
  }

  if (p === '/progreso' && m === 'GET') {
    const e = await estadoLogros(env, sub, H);
    const pl = await db.prepare('SELECT xp, display_name, username FROM players WHERE auth0_sub = ? ORDER BY xp DESC LIMIT 1').bind(sub).first();
    const f = e.faceit, v = e.valorant, d = v.datos;
    const vf = f.valores || {};
    return H.json({
      ok: true,
      vants: { xp: (pl && pl.xp) || 0, logros: Object.keys(e.conseguidos).length, total: 1000 },
      faceit: {
        activo: f.activo, vinculado: f.vinculado, error: f.error, nick: f.nick || null,
        nivel: f.nivel || null, elo: f.elo ?? null, nivel_progreso: progresoNivelFaceit(f.nivel, f.elo),
        stats: f.activo ? { partidas: vf.partidas, victorias: vf.victorias, winrate: vf.winrate, kd: vf.kd, hs: vf.hs, adr: vf.adr, mejor_racha: vf.mejor_racha, kills: vf.kills, aces: vf.aces } : null,
        logros: { conseguidos: f.conseguidos, total: 500 },
      },
      valorant: {
        activo: v.activo, riot: v.riot, fuente: v.fuente, aviso: v.aviso,
        tier_id: d && d.tier_id, tier: d && d.tier, icono: iconoTier(d && d.tier_id), rr: d && d.rr, elo: d && d.elo,
        pico: d && d.pico, pico_id: d && d.pico_id, pico_icono: iconoTier(d && d.pico_id), nivel_cuenta: d && d.nivel_cuenta, tarjeta: d && d.tarjeta,
        region: d && d.region, competitivas: d && d.competitivas, victorias: d && d.victorias,
        stats: v.activo && d && d.fuente === 'henrikdev' ? { kills: v.valores.kills, kd: v.valores.kd, hs: v.valores.hs, max_kills: v.valores.max_kills, max_acs: v.valores.max_acs } : null,
        partidas: (d && d.partidas ? d.partidas.slice(0, 10) : []),
        logros: { conseguidos: v.conseguidos, total: 500 },
      },
    });
  }

  if (p === '/riot' && m === 'GET') {
    const f = await db.prepare('SELECT nombre, tag, region, verificado, actualizado FROM integ_riot WHERE auth0_sub = ?').bind(sub).first();
    return H.json({ ok: true, riot: f ? f.nombre + '#' + f.tag : null, region: f ? f.region : null, verificado: !!(f && f.verificado), hdev: !!String(env.HENRIKDEV_API_KEY || '').trim() });
  }
  if (p === '/riot' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!b.riot) {
      await db.prepare('DELETE FROM integ_riot WHERE auth0_sub = ?').bind(sub).run();
      return H.json({ ok: true, riot: null });
    }
    const r = riotValido(b.riot);
    if (!r) return H.json({ ok: false, error: 'riot_invalido' }, 400);
    await db.prepare(
      "INSERT INTO integ_riot (auth0_sub, nombre, tag, region, verificado, datos, actualizado) VALUES (?, ?, ?, NULL, 0, NULL, NULL) ON CONFLICT(auth0_sub) DO UPDATE SET nombre = excluded.nombre, tag = excluded.tag, region = NULL, verificado = 0, datos = NULL, actualizado = NULL"
    ).bind(sub, r.nombre, r.tag).run();
    const d = await datosValorant(env, sub, true);
    if (d && d.ok === false && d.error === 'riot_no_encontrado') return H.json({ ok: false, error: 'riot_no_encontrado', riot: r.nombre + '#' + r.tag }, 404);
    return H.json({ ok: true, riot: r.nombre + '#' + r.tag, valorant: d });
  }
  if (p === '/valorant' && m === 'GET') {
    return H.json({ ok: true, valorant: await datosValorant(env, sub, url.searchParams.get('forzar') === '1') });
  }

  if (p === '/faceit/equipo' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!b.equipo) {
      await db.prepare('DELETE FROM integ_faceit_equipo WHERE auth0_sub = ?').bind(sub).run();
      return H.json({ ok: true, equipo: null });
    }
    const id = idEquipoFaceit(b.equipo);
    if (!id) return H.json({ ok: false, error: 'equipo_invalido' }, 400);
    const t = await H.fx(env, '/teams/' + id).catch(() => null);
    if (!t) return H.json({ ok: false, error: 'equipo_no_encontrado' }, 404);
    await db.prepare("INSERT INTO integ_faceit_equipo (auth0_sub, team_id, actualizado) VALUES (?, ?, datetime('now')) ON CONFLICT(auth0_sub) DO UPDATE SET team_id = excluded.team_id, actualizado = excluded.actualizado").bind(sub, id).run();
    return H.json({ ok: true, equipo: { id, nombre: t.name } });
  }
  return null;
}
