// VANTS · Integraciones · email
// -----------------------------------------------------------------------------
// Correos transaccionales de la web (inscripciones a torneos, torneos de
// comunidad) enviados con Resend (https://resend.com). Si RESEND_API_KEY no
// está configurada, los envíos se omiten en silencio: nada se rompe.
//
// Secretos (wrangler secret / GitHub Actions):
//   RESEND_API_KEY            clave de la API de Resend
//   RESEND_FROM (opcional)    remitente, por defecto "VANTS GAMES <no-reply@vants.cc>"
//                             — requiere dominio verificado en Resend.
//
// Tabla propia: integ_email_sub (auth0_sub → email) cachea el email verificado
// del JWT para poder escribir al creador de un torneo aunque la petición sea
// del owner (p. ej. al aprobar un torneo de comunidad).

const RESEND = 'https://api.resend.com/emails';

export async function asegurarEmail(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS integ_email_sub (auth0_sub TEXT PRIMARY KEY, email TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime('now')))"),
  ]);
}

/** Guarda (o refresca) el email verificado de una sesión Auth0. */
export async function guardarEmailSub(db, sub, email) {
  if (!sub || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  await db.prepare(
    "INSERT INTO integ_email_sub (auth0_sub, email) VALUES (?, ?) ON CONFLICT(auth0_sub) DO UPDATE SET email = excluded.email, actualizado = datetime('now')"
  ).bind(sub, String(email).toLowerCase()).run().catch(() => null);
}

/** Email cacheado de un sub (null si nunca inició sesión con email). */
export async function emailDe(db, sub) {
  if (!sub) return null;
  const r = await db.prepare('SELECT email FROM integ_email_sub WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  return r ? r.email : null;
}

/** Envía un correo con Resend. Sin API key o con error → omite en silencio. */
export async function enviarEmail(env, { to, asunto, html }) {
  const key = env.RESEND_API_KEY;
  if (!key || !to) return { ok: false, omitido: true };
  const from = env.RESEND_FROM || 'VANTS GAMES <no-reply@vants.cc>';
  try {
    const r = await fetch(RESEND, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: asunto, html }),
    });
    if (!r.ok) return { ok: false, error: 'resend_' + r.status };
    return { ok: true };
  } catch {
    return { ok: false, error: 'red' };
  }
}

/* ------------------------------------------------------------ plantilla */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Plantilla HTML profesional de VANTS: fondo oscuro #0A0A0B, acento rojo,
 * wordmark, bloque de datos, botón CTA, bloque de planes (upsell) y pie con
 * redes. Compatible con clientes de correo (tablas, estilos inline).
 */
export function plantillaEmail({ titulo, saludo, parrafos = [], datos = [], cta, planes = true, base = 'https://vants.cc' }) {
  const url = (u) => /^https?:\/\//i.test(String(u)) ? String(u) : String(base).replace(/\/$/, '') + String(u);
  const fila = (d) => `<tr>
      <td style="padding:10px 14px;border:1px solid #2a2a2f;color:#8e8e96;font:600 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${esc(d[0])}</td>
      <td style="padding:10px 14px;border:1px solid #2a2a2f;color:#f4f4f5;font:500 14px Inter,Arial,sans-serif">${esc(d[1])}</td>
    </tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0b">
<div style="display:none;max-height:0;overflow:hidden">${esc(titulo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111113;border:1px solid #2a2a2f">
  <!-- cabecera -->
  <tr><td style="padding:22px 28px;border-bottom:2px solid #ff0d2e">
    <span style="font:800 20px 'Saira Condensed','Arial Narrow',Arial,sans-serif;letter-spacing:.14em;color:#f4f4f5">VANTS<span style="color:#8e8e96;font-weight:600"> GAMES</span></span>
  </td></tr>
  <!-- cuerpo -->
  <tr><td style="padding:28px">
    <p style="margin:0 0 6px;font:700 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8e8e96">Compete · Connect · Dominate</p>
    <h1 style="margin:0 0 18px;font:800 26px 'Saira Condensed','Arial Narrow',Arial,sans-serif;line-height:1.05;text-transform:uppercase;color:#f4f4f5">${esc(titulo)}</h1>
    ${saludo ? `<p style="margin:0 0 14px;font:600 15px Inter,Arial,sans-serif;color:#f4f4f5">${esc(saludo)}</p>` : ''}
    ${parrafos.map((p) => `<p style="margin:0 0 12px;font:400 14px/1.6 Inter,Arial,sans-serif;color:#c4c4c9">${esc(p)}</p>`).join('')}
    ${datos.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">${datos.map(fila).join('')}</table>` : ''}
    ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:#ff0d2e">
      <a href="${esc(url(cta.url))}" style="display:inline-block;padding:12px 26px;font:700 14px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;text-decoration:none">${esc(cta.texto)} &rarr;</a>
    </td></tr></table>` : ''}
  </td></tr>
  ${planes ? `<tr><td style="padding:18px 28px;background:#18181b;border-top:1px solid #2a2a2f">
    <p style="margin:0 0 8px;font:700 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#ff5468">Juega con ventaja</p>
    <p style="margin:0 0 10px;font:400 13px/1.55 Inter,Arial,sans-serif;color:#8e8e96">Con <strong style="color:#c4c4c9">VANTS PRO</strong> tus inscripciones a torneos abiertos no tienen fee y entras en la cola prioritaria de VANTS Ranked. Crea tus propios torneos de comunidad con un plan activo.</p>
    <a href="${esc(url('/membresias'))}" style="font:700 12px 'Saira Condensed',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#f4f4f5;text-decoration:underline;text-underline-offset:3px">Ver planes VANTS &rarr;</a>
  </td></tr>` : ''}
  <!-- pie -->
  <tr><td style="padding:16px 28px;border-top:1px solid #2a2a2f">
    <p style="margin:0;font:400 11px/1.6 Inter,Arial,sans-serif;color:#5c5c64">VANTS GAMES · Torneos y comunidad competitiva de Venezuela y Latinoamérica.<br>
    <a href="https://www.twitch.tv/feisreal" style="color:#8e8e96;text-decoration:none">Twitch</a> · <a href="https://www.youtube.com/@feispla" style="color:#8e8e96;text-decoration:none">YouTube</a> · <a href="https://vants.cc" style="color:#8e8e96;text-decoration:none">vants.cc</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
