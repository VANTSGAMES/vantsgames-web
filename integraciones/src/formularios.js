// integraciones/src/formularios.js
// Formularios nativos VANTS GAMES (Módulo 4)
// -----------------------------------------------------------------------------
//   POST /formularios/enviar  -> Guarda en D1 (vants_formularios_envios), genera
//                                enlace Google Calendar (sin OAuth) y envía correos
//                                oficiales desde torneos@vants.cc / contacto@vants.cc.
//   GET  /formularios/envios  -> Lista envíos del usuario (o todos si es owner)
//                                listos para exportar en 1 clic a Google Sheets (drive.file).
import { esOwner } from './comunidad.js';
import { buildGoogleCalendarUrl, enviarEmail, plantillaEmail } from './email.js';

const TIPOS_VALIDOS = new Set(['inscripcion_torneo', 'workspace_empresas', 'soporte_contacto']);

let tablaLista = false;
export function resetFormulariosCacheForTests() {
  tablaLista = false;
}

export async function asegurarFormularios(db) {
  if (tablaLista || !db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS vants_formularios_envios (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    user_sub TEXT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    juego TEXT,
    torneo_slug TEXT,
    organizacion TEXT,
    asunto TEXT,
    datos_json TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'recibido',
    calendar_url TEXT,
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )`).run();
  tablaLista = true;
}

const clean = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export async function rutasFormularios(req, env, url, p, m, H) {
  if (!p.startsWith('/formularios/')) return null;
  await asegurarFormularios(env.DB);

  if (p === '/formularios/enviar' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (b.website_hp) return H.json({ ok: true }); // honeypot anti-bots

    const tipo = clean(b.tipo, 40);
    if (!TIPOS_VALIDOS.has(tipo)) {
      return H.json({ ok: false, error: 'tipo_formulario_invalido' }, 400);
    }

    const claims = await H.usuarioClaims(req, env).catch(() => null);
    const userSub = claims && claims.sub ? String(claims.sub) : null;

    const nombre = clean(b.nombre || b.contacto || b.capitan || (claims && claims.name), 90);
    const email = clean(b.email || (claims && claims.email), 140).toLowerCase();
    if (nombre.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return H.json({ ok: false, error: 'datos_invalidos', detalle: 'Indica tu nombre y un correo electrónico válido.' }, 400);
    }

    const juego = clean(b.juego, 40) || null;
    const torneoSlug = clean(b.torneo_slug || b.torneo, 100) || null;
    const organizacion = clean(b.organizacion || b.empresa || b.equipo, 100) || null;
    const asunto = clean(b.asunto || b.motivo || b.tipo_interes, 140) || null;
    const mensaje = clean(b.mensaje || b.notas || '', 1500);
    const tag = clean(b.tag, 8);
    const fechaInicio = clean(b.fecha_inicio || b.starts_at, 40) || null;

    const id = 'VTS-F-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
    const datosObj = {
      tipo,
      nombre,
      email,
      juego,
      torneo_slug: torneoSlug,
      organizacion,
      tag: tag || null,
      asunto,
      mensaje,
      fecha_inicio: fechaInicio,
    };

    const siteBase = String((env && env.SITE_URL) || 'https://vants.cc').replace(/\/$/, '');
    const esTorneo = tipo === 'inscripcion_torneo';
    const calendarUrl = buildGoogleCalendarUrl({
      titulo: esTorneo
        ? `Check-in Torneo VANTS · ${torneoSlug || organizacion || 'Circuito VANTS'}`
        : tipo === 'workspace_empresas'
          ? `Seguimiento Alianza VANTS · ${organizacion || nombre}`
          : `Seguimiento Soporte VANTS · ${id}`,
      detalles: esTorneo
        ? `Inscripción ${id} · Equipo: ${organizacion || nombre}${tag ? ` [${tag}]` : ''}. Abre VANTS PC 30 minutos antes para el check-in y anti-cheat.`
        : `Referencia ${id}. ${asunto || ''} ${mensaje}`.trim(),
      ubicacion: esTorneo && torneoSlug ? `${siteBase}/torneos/${encodeURIComponent(torneoSlug)}` : `${siteBase}/workspace`,
      inicioIso: fechaInicio || undefined,
      duracionMin: esTorneo ? 180 : 45,
    });

    await env.DB.prepare(
      `INSERT INTO vants_formularios_envios
         (id, tipo, user_sub, nombre, email, juego, torneo_slug, organizacion, asunto, datos_json, estado, calendar_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', ?)`,
    )
      .bind(id, tipo, userSub, nombre, email, juego, torneoSlug, organizacion, asunto, JSON.stringify(datosObj), calendarUrl)
      .run();

    const canal = esTorneo ? 'torneos' : 'contacto';
    const tituloCorreo = esTorneo
      ? 'Inscripción registrada en VANTS'
      : tipo === 'workspace_empresas'
        ? 'Solicitud Workspace / Empresas recibida'
        : 'Solicitud de soporte registrada';

    const pasos = esTorneo
      ? [
          'Guarda la fecha en tu calendario con el botón «Agregar a Google Calendar».',
          'Si el torneo requiere anti-cheat oficial, instala o abre VANTS PC 30 minutos antes.',
          'Revisa el bracket y el estado de tu plaza en vants.cc/torneos.',
        ]
      : tipo === 'workspace_empresas'
        ? [
            'Nuestro equipo comercial evaluará tu propuesta en un plazo máximo de 5 días hábiles.',
            'Puedes responder a este correo para adjuntar un media kit o calendario tentativo.',
          ]
        : [
            'Nuestro equipo de soporte revisará tu caso usando la referencia ' + id + '.',
            'Si es una incidencia en torneo en curso, usa !arbitro dentro de la sala del torneo.',
          ];

    const datosTabla = [
      ['Referencia', id],
      ['Tipo', tipo.replace(/_/g, ' ')],
      ['Nombre / Contacto', nombre],
      ...(organizacion ? [[esTorneo ? 'Equipo' : 'Organización', organizacion + (tag ? ` [${tag}]` : '')]] : []),
      ...(juego ? [['Juego', juego]] : []),
      ...(torneoSlug ? [['Torneo', torneoSlug]] : []),
      ...(asunto ? [['Asunto', asunto]] : []),
    ];

    // Correo oficial al remitente desde torneos@vants.cc o contacto@vants.cc
    const emailUsuario = await enviarEmail(env, {
      to: email,
      canal,
      asunto: `${tituloCorreo} (${id}) — VANTS GAMES`,
      html: plantillaEmail({
        base: siteBase,
        titulo: tituloCorreo,
        saludo: `Hola ${nombre},`,
        parrafos: [
          'Hemos registrado tu formulario oficial en VANTS GAMES. A continuación tienes el resumen y tus próximos pasos:',
          ...(mensaje ? [`Detalle registrado: «${mensaje.slice(0, 400)}»`] : []),
        ],
        datos: datosTabla,
        pasos,
        cta: {
          texto: esTorneo ? 'Ver torneos activos' : 'Ir a mi Centro Workspace',
          url: esTorneo && torneoSlug ? `/torneos/${encodeURIComponent(torneoSlug)}` : '/workspace',
        },
        calendarUrl,
        planes: esTorneo,
      }),
    }).catch(() => ({ ok: false, omitido: true }));

    // Aviso al organizador / equipo VANTS con enlace directo a Workspace / Google Sheets
    const destinoInterno = esTorneo ? 'torneos@vants.cc' : 'contacto@vants.cc';
    await enviarEmail(env, {
      to: destinoInterno,
      canal,
      replyTo: email,
      asunto: `[Formulario ${tipo}] ${organizacion || nombre} · ${id}`,
      html: plantillaEmail({
        base: siteBase,
        titulo: 'Nuevo envío en Formulario Nativo',
        saludo: 'Equipo organizador VANTS,',
        parrafos: [
          `Se recibió un nuevo registro (${id}) desde el formulario nativo de vants.cc. Puedes exportarlo en 1 clic a Google Sheets desde tu Centro Workspace.`,
          ...(mensaje ? [`Mensaje: ${mensaje}`] : []),
        ],
        datos: [...datosTabla, ['Correo remitente', email]],
        cta: { texto: 'Responder al remitente', url: `mailto:${encodeURIComponent(email)}` },
        calendarUrl,
        sheetsUrl: `${siteBase}/workspace`,
        planes: false,
      }),
    }).catch(() => null);

    return H.json(
      {
        ok: true,
        id,
        tipo,
        calendar_url: calendarUrl,
        email_enviado: Boolean(emailUsuario && emailUsuario.ok),
      },
      201,
    );
  }

  if (p === '/formularios/envios' && m === 'GET') {
    const claims = await H.usuarioClaims(req, env);
    const owner = await esOwner(env.DB, claims.sub);
    const tipoFilter = clean(url.searchParams.get('tipo'), 40);

    let rs;
    if (owner) {
      rs = tipoFilter && TIPOS_VALIDOS.has(tipoFilter)
        ? await env.DB.prepare(
            'SELECT id, tipo, user_sub, nombre, email, juego, torneo_slug, organizacion, asunto, datos_json, estado, calendar_url, creado_en FROM vants_formularios_envios WHERE tipo = ? ORDER BY creado_en DESC LIMIT 100',
          )
            .bind(tipoFilter)
            .all()
        : await env.DB.prepare(
            'SELECT id, tipo, user_sub, nombre, email, juego, torneo_slug, organizacion, asunto, datos_json, estado, calendar_url, creado_en FROM vants_formularios_envios ORDER BY creado_en DESC LIMIT 100',
          ).all();
    } else {
      rs = await env.DB.prepare(
        'SELECT id, tipo, user_sub, nombre, email, juego, torneo_slug, organizacion, asunto, datos_json, estado, calendar_url, creado_en FROM vants_formularios_envios WHERE user_sub = ? OR lower(email) = lower(?) ORDER BY creado_en DESC LIMIT 50',
      )
        .bind(claims.sub, claims.email || '')
        .all();
    }

    return H.json({
      ok: true,
      owner,
      envios: (rs.results || []).map((r) => ({
        ...r,
        datos: (() => {
          try {
            return JSON.parse(r.datos_json || '{}');
          } catch {
            return {};
          }
        })(),
      })),
    });
  }

  return H.json({ ok: false, error: 'no_encontrado' }, 404);
}
