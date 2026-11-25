// VANTS · Skilling Hub (Centro de capacitación)
// -----------------------------------------------------------------------------
// Preferencias de aprendizaje del jugador: áreas de interés (juegos y roles)
// y formatos preferidos (torneos en vivo, directos, clips, misiones, ranked,
// tutoriales). Alimenta el onboarding de 2 pasos y las recomendaciones de
// https://vants.cc/capacitacion.
//
// Endpoint único, protegido con sesión VANTS Identity / Auth0 (JWT dual):
//   GET /skilling/preferencias  -> { ok, preferencias: { areas, formatos, onboarded } }
//   PUT /skilling/preferencias  -> guarda y devuelve lo guardado
//   POST /skilling/preferencias -> alias de PUT (por compatibilidad con clientes)
//
// Almacenamiento: D1 vants-db (binding DB), tabla vants_skilling_prefs
// (pid = sub canónico del JWT). Sin preferencias guardadas se responde con el
// estado "nuevo" para que el cliente lance el onboarding.

const MAX_ITEMS = 20;
const MAX_ITEM_LEN = 40;

function limpiarLista(valor) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((x) => typeof x === 'string')
    .map((x) => x.trim().toLowerCase().slice(0, MAX_ITEM_LEN))
    .filter((x) => x.length > 0)
    .slice(0, MAX_ITEMS);
}

function parsearLista(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function rutasSkilling(req, env, url, p, m, { json, usuarioClaims }) {
  if (p !== '/skilling/preferencias') return null;

  try {
    const claims = await usuarioClaims(req, env).catch(() => null);
    if (!claims || !claims.sub) {
      return json({ ok: false, error: 'sin_sesion' }, 401);
    }
    const pid = String(claims.sub);

    if (m === 'GET') {
      const row = await env.DB
        .prepare('SELECT areas, formatos, onboarded, updated_at FROM vants_skilling_prefs WHERE pid = ?')
        .bind(pid)
        .first();
      if (!row) {
        return json({ ok: true, fuente: 'nuevo', preferencias: { areas: [], formatos: [], onboarded: false } });
      }
      return json({
        ok: true,
        fuente: 'guardado',
        actualizado: row.updated_at || null,
        preferencias: {
          areas: parsearLista(row.areas),
          formatos: parsearLista(row.formatos),
          onboarded: !!row.onboarded,
        },
      });
    }

    if (m === 'PUT' || m === 'POST') {
      const body = await req.json().catch(() => null);
      const areas = limpiarLista(body && body.areas);
      const formatos = limpiarLista(body && body.formatos);
      const onboarded = !!(body && body.onboarded);
      await env.DB
        .prepare(
          'INSERT INTO vants_skilling_prefs (pid, areas, formatos, onboarded, updated_at) ' +
            'VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ' +
            'ON CONFLICT(pid) DO UPDATE SET areas = excluded.areas, formatos = excluded.formatos, ' +
            'onboarded = excluded.onboarded, updated_at = CURRENT_TIMESTAMP'
        )
        .bind(pid, JSON.stringify(areas), JSON.stringify(formatos), onboarded ? 1 : 0)
        .run();
      return json({ ok: true, preferencias: { areas, formatos, onboarded } });
    }

    return json({ ok: false, error: 'metodo_no_permitido' }, 405);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}
