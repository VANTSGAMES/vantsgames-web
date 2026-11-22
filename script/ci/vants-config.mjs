// Genera wrangler.json para el Worker de producción `vants` a partir de su
// configuración ACTUAL en Cloudflare (ajustes + versión desplegada), para
// volver a subir el mismo código de API con los archivos nuevos de la web.
//
// Soporta los bindings de los recursos nuevos del proyecto (ver cloudflare/):
//   - Queues (productores)  type: "queue"                      → queues.producers
//   - Durable Objects       type: "durable_object_namespace"   → durable_objects.bindings
//   - Workflows             type: "workflows"                  → workflows
// Si el Worker gana un tipo de binding no soportado aquí, se aborta igual que
// antes (exit 2) para no desplegar una config incompleta.
//
// Variables de entorno opcionales:
//   CRONS           JSON con los cron triggers (los descarga el workflow)
//   WRANGLER_EXTRA  JSON que se fusiona AL FINAL sobre la config generada,
//                   p. ej. {"exports": {"SalaTorneo": {"type": "durable-object",
//                   "storage": "sqlite"}}, "queues": {"consumers": [ ... ]},
//                   "migrations": [...]} — ver cloudflare/wrangler.ejemplo.jsonc
//
// Uso: node vants-config.mjs settings.json version.json <dir-assets> > wrangler.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Traduce los bindings del Settings API de Cloudflare a bloques de wrangler.json. */
export function mapearBindings(bindings) {
  const vars = {}, d1 = [], colas = [], dos = [], workflows = [], servicios = [], otros = [];
  for (const b of bindings || []) {
    switch (b.type) {
      case "plain_text":
        vars[b.name] = b.text;
        break;
      case "json":
        vars[b.name] = b.json;
        break;
      case "d1":
        d1.push({ binding: b.name, database_id: b.database_id || b.id });
        break;
      case "service":
        servicios.push({
          binding: b.name,
          service: b.service,
          ...(b.environment ? { environment: b.environment } : {}),
        });
        break;
      case "queue":
        colas.push({ binding: b.name, queue: b.queue_name || b.queue || b.queue_id });
        break;
      case "durable_object_namespace":
        dos.push({
          name: b.name,
          class_name: b.class_name,
          ...(b.script_name ? { script_name: b.script_name } : {}),
        });
        break;
      case "workflows":
        // En el Settings API el nombre del workflow puede venir como workflow_name;
        // si no, se usa el nombre del binding (convención del dashboard).
        workflows.push({
          binding: b.name,
          class_name: b.class_name,
          name: b.workflow_name || b.name,
          ...(b.script_name ? { script_name: b.script_name } : {}),
        });
        break;
      case "assets":
      case "secret_text":
      case "secret_key":
        break; // ASSETS se declara abajo; los secretos nunca se escriben al wrangler.json
      default:
        otros.push(b.type + ":" + b.name);
    }
  }
  if (otros.length) throw new Error("Bindings no soportados, se aborta: " + otros.join(", "));
  return { vars, d1, colas, dos, workflows, servicios };
}

/** Construye el objeto wrangler.json completo a partir de settings + versión desplegada. */
export function construirConfig(set, ver, dir, env = process.env) {
  const a = ver.resources.script_runtime.assets || {};
  const { vars, d1, colas, dos, workflows, servicios } = mapearBindings(set.bindings);
  const cfg = {
    name: "vants",
    main: "src/worker.js",
    no_bundle: true,
    compatibility_date: set.compatibility_date,
    compatibility_flags: set.compatibility_flags || [],
    workers_dev: true,
    keep_vars: false,
    vars,
    d1_databases: d1,
    assets: {
      directory: dir,
      binding: "ASSETS",
      not_found_handling: a.not_found_handling || "single-page-application",
      run_worker_first: a.raw_run_worker_first ?? true,
      ...(a.html_handling ? { html_handling: a.html_handling } : {}),
    },
    triggers: { crons: JSON.parse(env.CRONS || "[]") },
    // Activada a petición (antes se copiaba set.observability, que traía enabled=false
    // de Cloudflare): logs, traces y detección de problemas con persistencia.
    observability: {
      enabled: true,
      head_sampling_rate: 1,
      redact_query_string: false,
      logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true, persist: true },
      traces: { enabled: true, head_sampling_rate: 1, persist: true },
      issue_detection: { enabled: true },
    },
  };
  if (servicios.length) cfg.services = servicios;
  if (colas.length) cfg.queues = { producers: colas };
  if (dos.length) cfg.durable_objects = { bindings: dos };
  if (workflows.length) cfg.workflows = workflows;
  // Puerta de escape operativa: p. ej. services adicionales, exports (DO), queues.consumers, migrations.
  const extra = env.WRANGLER_EXTRA ? JSON.parse(env.WRANGLER_EXTRA) : null;
  if (extra) {
    if (Array.isArray(extra.services)) {
      const merged = [...(cfg.services || [])];
      for (const s of extra.services) {
        if (!merged.some((x) => x.binding === s.binding)) merged.push(s);
      }
      cfg.services = merged;
      const { services: _omit, ...rest } = extra;
      Object.assign(cfg, rest);
    } else {
      Object.assign(cfg, extra);
    }
  }
  return cfg;
}

function principal() {
  const [, , fSet, fVer, dir] = process.argv;
  const set = JSON.parse(readFileSync(fSet, "utf8")).result;
  const ver = JSON.parse(readFileSync(fVer, "utf8")).result;
  try {
    console.log(JSON.stringify(construirConfig(set, ver, dir), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}

// Solo ejecuta el CLI cuando se invoca directamente (no al importarlo en tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
