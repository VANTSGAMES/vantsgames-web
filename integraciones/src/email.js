// VANTS · Integraciones · email oficial @vants.cc
// -----------------------------------------------------------------------------
// Correos transaccionales oficiales desde @vants.cc enviados vía Resend
// (nunca mediante Gmail OAuth del usuario).
//   - canal 'torneos'  → torneos@vants.cc  (o RESEND_FROM_TORNEOS)
//   - canal 'contacto' → contacto@vants.cc (o RESEND_FROM_CONTACTO)
//   - por defecto      → contacto@vants.cc (o RESEND_FROM)
//
// Incluye generador de enlaces "Agregar a Google Calendar" (sin OAuth extra)
// y plantillas HTML responsive con la estética oficial VANTS (#0a0a0b / #111113 / #ff0d2e).

const RESEND = 'https://api.resend.com/emails';

export async function asegurarEmail(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS integ_email_sub (auth0_sub TEXT PRIMARY KEY, email TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime('now')))"),
  ]);
}

/** Guarda (o refresca) el email verificado de una sesión. */
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

/** Resuelve el remitente oficial @vants.cc según el canal. */
export function remitenteOficial(env, canal = 'contacto') {
  const c = String(canal || 'contacto').toLowerCase();
  if (c === 'torneos') {
    return (env && env.RESEND_FROM_TORNEOS) || 'VANTS GAMES Torneos <torneos@vants.cc>';
  }
  if (c === 'contacto' || c === 'empresas' || c === 'soporte') {
    return (env && env.RESEND_FROM_CONTACTO) || 'VANTS GAMES <contacto@vants.cc>';
  }
  return (env && env.RESEND_FROM) || 'VANTS GAMES <contacto@vants.cc>';
}

/** Estado del proveedor de correo oficial @vants.cc (sin exponer secretos). */
export function estadoProveedorEmail(env) {
  return {
    proveedor: 'resend',
    configurado: Boolean(env && env.RESEND_API_KEY),
    remitentes: {
      torneos: remitenteOficial(env, 'torneos'),
      contacto: remitenteOficial(env, 'contacto'),
    },
  };
}

/** Envía un correo oficial @vants.cc con Resend. Sin API key o con error → omite en silencio. */
export async function enviarEmail(env, { to, asunto, html, canal = 'contacto', replyTo }) {
  const key = env && env.RESEND_API_KEY;
  if (!key || !to) return { ok: false, omitido: true };
  const from = remitenteOficial(env, canal);
  const payload = { from, to: [to], subject: asunto, html };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const r = await fetch(RESEND, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error(JSON.stringify({ tipo: 'resend_error', canal, status: r.status }));
      return { ok: false, error: 'resend_' + r.status };
    }
    return { ok: true, from };
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'resend_error', canal, error: String((e && e.message) || e).slice(0, 120) }));
    return { ok: false, error: 'red' };
  }
}

/**
 * Construye un enlace directo "Agregar a Google Calendar" (action=TEMPLATE).
 * No requiere ningún scope OAuth de Calendar.
 */
export function buildGoogleCalendarUrl({
  titulo,
  detalles = '',
  ubicacion = 'https://vants.cc',
  inicioIso,
  duracionMin = 120,
}) {
  const start = inicioIso ? new Date(inicioIso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const startValid = Number.isNaN(start.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000) : start;
  const end = new Date(startValid.getTime() + Math.max(15, Number(duracionMin) || 120) * 60_000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: String(titulo || 'Evento VANTS GAMES').slice(0, 180),
    dates: `${fmt(startValid)}/${fmt(end)}`,
    details: String(detalles || 'Evento oficial organizado en VANTS GAMES (https://vants.cc).').slice(0, 1200),
    location: String(ubicacion || 'https://vants.cc').slice(0, 240),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ------------------------------------------------------------ plantilla */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Plantilla HTML responsive de VANTS GAMES:
 *   - Fondo #0A0A0B, tarjeta #111113, acento rojo #FF0D2E.
 *   - Soporta bloque de datos clave, pasos siguientes con ejemplos, CTA principal,
 *     botón "Agregar a Google Calendar" (sin OAuth) y enlace a Google Sheets/Workspace.
 */
export function plantillaEmail({
  titulo,
  saludo,
  parrafos = [],
  datos = [],
  pasos = [],
  cta,
  calendarUrl,
  sheetsUrl,
  planes = true,
  base = 'https://vants.cc',
}) {
  const url = (u) => /^https?:\/\/|^mailto:/i.test(String(u)) ? String(u) : String(base).replace(/\/$/, '') + String(u);
  const fila = (d) => `<tr>
      <td style="padding:10px 14px;border:1px solid #2a2a2f;background:#0e0e11;color:#8e8e96;font:600 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${esc(d[0])}</td>
      <td style="padding:10px 14px;border:1px solid #2a2a2f;background:#111113;color:#f4f4f5;font:500 14px Inter,Arial,sans-serif">${esc(d[1])}</td>
    </tr>`;
  const listaPasos = pasos.length
    ? `<div style="margin:18px 0;padding:14px 16px;background:#0a0a0b;border:1px solid #26262c;border-left:3px solid #ff0d2e">
         <p style="margin:0 0 8px;font:700 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#ff5468">Próximos pasos</p>
         <ol style="margin:0;padding-left:18px;color:#d4d4d8;font:400 13px/1.6 Inter,Arial,sans-serif">
           ${pasos.map((p) => `<li style="margin:0 0 6px">${esc(p)}</li>`).join('')}
         </ol>
       </div>`
    : '';
  const botonesSecundarios = [];
  if (calendarUrl) {
    botonesSecundarios.push(
      `<td style="padding:0 10px 10px 0"><a href="${esc(calendarUrl)}" style="display:inline-block;padding:10px 18px;background:#18181d;border:1px solid #35353d;font:700 12px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f4f4f5;text-decoration:none">📅 Agregar a Google Calendar</a></td>`,
    );
  }
  if (sheetsUrl) {
    botonesSecundarios.push(
      `<td style="padding:0 10px 10px 0"><a href="${esc(url(sheetsUrl))}" style="display:inline-block;padding:10px 18px;background:#141e18;border:1px solid #2d6a4f;font:700 12px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6ee7b7;text-decoration:none">📊 Abrir Workspace / Google Sheets</a></td>`,
    );
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0b">
<div style="display:none;max-height:0;overflow:hidden">${esc(titulo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#111113;border:1px solid #2a2a2f">
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
    ${listaPasos}
    ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 10px"><tr><td style="background:#ff0d2e">
      <a href="${esc(url(cta.url))}" style="display:inline-block;padding:12px 26px;font:700 14px 'Saira Condensed',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;text-decoration:none">${esc(cta.texto)} &rarr;</a>
    </td></tr></table>` : ''}
    ${botonesSecundarios.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 4px"><tr>${botonesSecundarios.join('')}</tr></table>` : ''}
  </td></tr>
  ${planes ? `<tr><td style="padding:18px 28px;background:#18181b;border-top:1px solid #2a2a2f">
    <p style="margin:0 0 8px;font:700 11px 'Saira Condensed',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#ff5468">Juega con ventaja</p>
    <p style="margin:0 0 10px;font:400 13px/1.55 Inter,Arial,sans-serif;color:#8e8e96">Con <strong style="color:#c4c4c9">VANTS PRO</strong> tus inscripciones a torneos abiertos no tienen fee y accedes a beneficios competitivos del circuito.</p>
    <a href="${esc(url('/membresias'))}" style="font:700 12px 'Saira Condensed',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#f4f4f5;text-decoration:underline;text-underline-offset:3px">Ver planes VANTS &rarr;</a>
  </td></tr>` : ''}
  <!-- pie -->
  <tr><td style="padding:16px 28px;border-top:1px solid #2a2a2f">
    <p style="margin:0;font:400 11px/1.6 Inter,Arial,sans-serif;color:#5c5c64">VANTS GAMES · Correo oficial enviado desde @vants.cc · Venezuela y Latinoamérica.<br>
    <a href="https://vants.cc/torneos" style="color:#8e8e96;text-decoration:none">Torneos</a> · <a href="https://vants.cc/workspace" style="color:#8e8e96;text-decoration:none">Workspace</a> · <a href="https://vants.cc/privacidad" style="color:#8e8e96;text-decoration:none">Privacidad</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
