/**
 * Protocolo unificado de comunicaciones VANTS GAMES.
 *
 * Canales Discord por webhook (secrets del Worker):
 *   DISCORD_WEBHOOK_REGISTROS → registros-nuevos-y-sugerencias (privado)
 *   DISCORD_WEBHOOK_COMUNIDAD → comunidad-y-creadores
 *   DISCORD_WEBHOOK_B2B       → alertas-b2b
 *   DISCORD_WEBHOOK_TICKETS   → tickets-soporte
 *
 * Tonos: Discord cercano y motivador; correo comercial estrictamente
 * formal. Correos oficiales: contacto@vants.cc (empresas/patrocinios/
 * legal) y hola@vants.cc.
 */
import { enviarEmail, plantillaEmail, guardarEmailSub, emailDe } from './email.js';
import { invalidarIdentidades } from './perfiles.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sha16(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Envía a un webhook de Discord por destino. Sin secret → no-op silencioso. */
export async function webhookDiscord(env, destino, payload) {
  const url = env['DISCORD_WEBHOOK_' + destino.toUpperCase()];
  if (!url || !/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function nickDe(env, sub) {
  const perf = await env.DB.prepare('SELECT nickname FROM perfiles_publicos WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  if (perf && perf.nickname) return perf.nickname;
  const r = await env.DB.prepare('SELECT display_name, username FROM players WHERE auth0_sub = ?').bind(sub).first().catch(() => null);
  return (r && (r.display_name || r.username)) || null;
}

async function contarRegistros(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM integ_estado WHERE clave LIKE 'registro_visto_%'").first().catch(() => null);
  return (r && r.n) || 0;
}

/** Límite simple por hora para endpoints públicos (D1 como contador). */
async function limitePorIp(env, req, prefijo, max, ventanaMin = 60) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const ventana = Math.floor(Date.now() / (ventanaMin * 60_000));
  const clave = prefijo + '_' + ventana + '_' + ip.slice(0, 45);
  const r = await env.DB.prepare('SELECT valor FROM integ_estado WHERE clave = ?').bind(clave).first().catch(() => null);
  if (r && Number(r.valor) >= max) return false;
  await env.DB.prepare('INSERT INTO integ_estado (clave, valor) VALUES (?, 2) ON CONFLICT(clave) DO UPDATE SET valor = CAST(valor AS INTEGER) + 1').bind(clave).run().catch(() => null);
  return true;
}

/* ------------------------------------------------------------ rutas */

export async function rutasComms(req, env, url, p, m, H) {
  /* POST /int/registro — lo llama el cliente al iniciar sesión. La primera
   * vez de cada usuario inicializa su perfil público y foto de Google, envía
   * el correo oficial de bienvenida vía Resend, crea notificación in-app y
   * dispara la bienvenida al canal privado de Discord. */
  if (p === '/registro' && m === 'POST') {
    const claims = await H.usuarioClaims(req, env);
    const sub = claims.sub;
    if (claims.email) await guardarEmailSub(env.DB, sub, claims.email);

    const nickInicial = (await nickDe(env, sub)) || claims.name || (claims.email ? claims.email.split('@')[0] : 'jugador');
    await env.DB.prepare(
      `INSERT INTO perfiles_publicos (auth0_sub, nickname, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(auth0_sub) DO UPDATE SET nickname = COALESCE(perfiles_publicos.nickname, excluded.nickname)`,
    ).bind(sub, String(nickInicial).slice(0, 40)).run().catch(() => null);

    if (claims.picture && /^https:\/\//.test(claims.picture) && !/cdn\.auth0\.com|gravatar\.com/.test(claims.picture)) {
      const pid = await sha16(sub);
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS integ_foto (pid TEXT PRIMARY KEY, mime TEXT, datos TEXT, url TEXT, actualizado TEXT NOT NULL DEFAULT (datetime('now')))",
      ).run().catch(() => null);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO integ_foto (pid, mime, datos, url, actualizado) VALUES (?, NULL, NULL, ?, datetime('now'))",
      ).bind(pid, claims.picture).run().catch(() => null);
    }

    const clave = 'registro_visto_' + sub;
    const previo = await env.DB.prepare('SELECT valor FROM integ_estado WHERE clave = ?').bind(clave).first().catch(() => null);
    if (previo) return H.json({ ok: true, primero: false });

    invalidarIdentidades();
    const verificado = claims.email_verified !== false;
    await env.DB.prepare('INSERT INTO integ_estado (clave, valor) VALUES (?, ?)').bind(clave, verificado ? 'verificado' : 'pendiente').run().catch(() => null);
    const total = await contarRegistros(env);
    const fundador = total <= 500; // etapa inicial: reconocimiento de fundadores
    const nick = nickInicial;

    // 1) Correo oficial de bienvenida al jugador vía Resend (reemplaza bienvenida de Auth0)
    let emailEnviado = false;
    if (claims.email) {
      const resEmail = await enviarEmail(env, {
        to: claims.email,
        asunto: '¡Bienvenido a la arena, ' + nick + '! — VANTS GAMES',
        html: plantillaEmail({
          base: env.SITE_URL || 'https://vants.cc',
          titulo: 'Bienvenido a VANTS GAMES',
          saludo: 'Hola ' + nick + ',',
          parrafos: [
            'Tu cuenta oficial de VANTS GAMES ya está activa. Desde hoy puedes competir en torneos de 11 títulos, subir en VANTS Ranked, reservar cupo en Eventos y Showmatches y conectar tus cuentas de FACEIT, VALORANT, Fortnite, Discord, Twitch y Steam.',
            fundador
              ? 'Además, formas parte de los primeros 500 jugadores registrados: tienes reconocido el estatus de Miembro FUNDADOR de la etapa inicial.'
              : 'Completa tu ficha de jugador y vincula tus cuentas de juego desde tu perfil para desbloquear tus insignias y estadísticas en vivo.',
          ],
          datos: [
            ['Jugador', nick],
            ['Cuenta', claims.email],
            ['Estatus', fundador ? 'Miembro FUNDADOR · Etapa inicial' : 'Jugador verificado'],
            ['Registro N.º', '#' + String(total)],
          ],
          cta: { texto: 'Completar mi perfil', url: '/perfil/cuentas' },
          planes: true,
        }),
      }).catch(() => null);
      emailEnviado = Boolean(resEmail && resEmail.ok);
    }

    // 2) Notificación de bienvenida in-app en la campana del jugador
    if (H.notificar) {
      await H.notificar(
        env,
        sub,
        'bienvenida',
        '¡Bienvenido a VANTS GAMES, ' + nick + '!',
        fundador
          ? 'Eres Miembro FUNDADOR (#' + total + '). Vincula tus cuentas de FACEIT, VALORANT y Fortnite en tu perfil.'
          : 'Vincula tus cuentas de FACEIT, VALORANT y Fortnite desde tu perfil para activar tus estadísticas e insignias.',
        '/perfil/cuentas',
      ).catch(() => null);
    }

    // 3) Webhook a Discord (#registros-nuevos-y-sugerencias)
    await webhookDiscord(env, 'registros', {
      content: '🎮 ¡Bienvenido a la arena, **' + nick + '**!' + (fundador ? ' 🏆 *Miembro FUNDADOR de la etapa inicial*' : ''),
      embeds: [{
        title: 'Nuevo registro en VANTS GAMES',
        color: 0xff0d2e,
        fields: [
          { name: 'Jugador', value: nick, inline: true },
          { name: 'Correo', value: claims.email ? claims.email : '—', inline: true },
          { name: 'Verificación', value: verificado ? '✅ Verificado' : '⏳ Pendiente (sin permisos comunitarios)', inline: true },
          { name: 'Nº de registro', value: String(total), inline: true },
        ],
        footer: { text: 'VANTS GAMES · registros-nuevos-y-sugerencias' },
      }],
    });

    // 4) Aviso in-app al equipo de owners
    const owners = await env.DB.prepare("SELECT auth0_sub FROM players WHERE role = 'owner'").all().catch(() => ({ results: [] }));
    for (const o of owners.results || []) {
      await H.notificar(env, o.auth0_sub, 'registro', 'Nuevo jugador registrado: ' + nick, verificado ? 'Cuenta verificada ✅' : 'Correo sin verificar ⏳', '/sala').catch(() => null);
    }
    return H.json({ ok: true, primero: true, fundador, verificado, emailEnviado });
  }

  /* POST /int/sugerencia — sugerencias de la comunidad (auth + verificado). */
  if (p === '/sugerencia' && m === 'POST') {
    const sub = await H.usuario(req, env);
    const b = await req.json().catch(() => ({}));
    const mensaje = String(b.mensaje || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 1000);
    if (mensaje.length < 10) return H.json({ ok: false, error: 'mensaje_corto' }, 400);
    const nick = await nickDe(env, sub) || 'jugador';
    await webhookDiscord(env, 'registros', {
      content: '💡 **' + nick + '** dejó una sugerencia para la arena:',
      embeds: [{ description: mensaje.slice(0, 1000), color: 0xf5c044, footer: { text: 'VANTS GAMES · sugerencias de la comunidad' } }],
    });
    const owners = await env.DB.prepare("SELECT auth0_sub FROM players WHERE role = 'owner'").all().catch(() => ({ results: [] }));
    for (const o of owners.results || []) {
      await H.notificar(env, o.auth0_sub, 'sugerencia', 'Sugerencia de ' + nick, mensaje.slice(0, 300), null).catch(() => null);
    }
    return H.json({ ok: true });
  }

  /* POST /int/empresas/alianza — formulario comercial B2B (público).
   * Tono formal: correo interno a contacto@vants.cc + acuse al remitente +
   * alerta al canal privado alertas-b2b. */
  if (p === '/empresas/alianza' && m === 'POST') {
    if (!(await limitePorIp(env, req, 'b2b', 3))) return H.json({ ok: false, error: 'demasiadas_solicitudes' }, 429);
    const b = await req.json().catch(() => ({}));
    if (b.company_url) return H.json({ ok: true }); // honeypot (campo oculto): bots fuera
    const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
    const empresa = txt(b.empresa, 80), contacto = txt(b.contacto, 80), email = txt(b.email, 120).toLowerCase();
    const web = txt(b.web, 160), tipo = ['Patrocinio', 'Torneo corporativo', 'Publicidad', 'Alianza'].includes(b.tipo) ? b.tipo : 'Alianza';
    const mensaje = txt(b.mensaje, 1500);
    if (!empresa || !contacto || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || mensaje.length < 10) {
      return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    }
    // Alerta privada al canal alertas-b2b (sobria, datos clave).
    await webhookDiscord(env, 'b2b', {
      embeds: [{
        title: '🤝 Propuesta comercial · ' + tipo,
        color: 0x3ddc84,
        fields: [
          { name: 'Empresa / marca', value: empresa, inline: true },
          { name: 'Interés', value: tipo, inline: true },
          { name: 'Contacto', value: contacto + '\n' + email, inline: false },
          { name: 'Web / redes', value: web || '—', inline: false },
          { name: 'Mensaje', value: mensaje.slice(0, 1000), inline: false },
        ],
        footer: { text: 'VANTS GAMES · alertas-b2b · requiere validación comercial' },
      }],
    });
    // Correo formal interno al equipo comercial.
    await enviarEmail(env, {
      to: 'contacto@vants.cc',
      asunto: '[Alianza B2B] ' + empresa + ' · ' + tipo,
      html: plantillaEmail({
        base: env.SITE_URL,
        titulo: 'Nueva propuesta comercial',
        saludo: 'Equipo comercial,',
        parrafos: ['Se ha recibido una nueva solicitud de alianza a través del formulario «VANTS para Empresas». Los datos se adjuntan a continuación para su evaluación.'],
        datos: [['Empresa / marca', empresa], ['Contacto', contacto], ['Correo', email], ['Web / redes', web || '—'], ['Tipo de interés', tipo], ['Mensaje', mensaje]],
        cta: { texto: 'Responder al contacto', url: 'mailto:' + encodeURIComponent(email) },
        planes: false,
      }),
    }).catch(() => null);
    // Acuse formal al remitente.
    await enviarEmail(env, {
      to: email,
      asunto: 'Hemos recibido su propuesta — VANTS GAMES',
      html: plantillaEmail({
        base: env.SITE_URL,
        titulo: 'Propuesta recibida',
        saludo: 'Estimados ' + empresa + ':',
        parrafos: [
          'Agradecemos su propuesta. Nuestro equipo comercial la evaluará y se pondrá en contacto con usted por este medio en un plazo máximo de 5 días hábiles.',
          'Le recordamos que las alianzas comerciales requieren registro legal de la empresa o marca, portafolio relevante y la validación oficial del equipo VANTS GAMES.',
        ],
        datos: [['Empresa / marca', empresa], ['Tipo de interés', tipo], ['Referencia', 'alianza-' + Date.now().toString(36)]],
        cta: { texto: 'Conocer las condiciones', url: '/terminos#empresas' },
        planes: false,
      }),
    }).catch(() => null);
    return H.json({ ok: true });
  }

  /* POST /int/soporte/ticket — tickets del equipo (auth + verificado). */
  if (p === '/soporte/ticket' && m === 'POST') {
    const sub = await H.usuario(req, env);
    if (!(await limitePorIp(env, req, 'tk_' + sub.slice(0, 12), 5))) return H.json({ ok: false, error: 'demasiadas_solicitudes' }, 429);
    const b = await req.json().catch(() => ({}));
    const asunto = String(b.asunto || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
    const mensaje = String(b.mensaje || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 1500);
    if (asunto.length < 4 || mensaje.length < 10) return H.json({ ok: false, error: 'datos_invalidos' }, 400);
    const nick = await nickDe(env, sub) || 'jugador';
    const ref = 'VTS-' + Date.now().toString(36).toUpperCase();
    await webhookDiscord(env, 'tickets', {
      embeds: [{
        title: '🎫 ' + asunto,
        description: mensaje.slice(0, 1000),
        color: 0x9146ff,
        fields: [{ name: 'Jugador', value: nick, inline: true }, { name: 'Referencia', value: ref, inline: true }],
        footer: { text: 'VANTS GAMES · tickets-soporte' },
      }],
    });
    const email = await emailDe(env.DB, sub);
    if (email) {
      await enviarEmail(env, {
        to: email,
        asunto: 'Ticket ' + ref + ' recibido — VANTS GAMES',
        html: plantillaEmail({
          base: env.SITE_URL,
          titulo: 'Ticket recibido',
          saludo: 'Hola ' + nick + ',',
          parrafos: ['Hemos recibido tu solicitud de soporte. El equipo la revisará y te responderá por este correo y por las notificaciones de la plataforma.'],
          datos: [['Referencia', ref], ['Asunto', asunto]],
          planes: false,
        }),
      }).catch(() => null);
    }
    return H.json({ ok: true, ref });
  }

  return null;
}
