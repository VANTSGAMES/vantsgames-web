// Genera wrangler.json para el Worker de producción `vants` a partir de su
// configuración ACTUAL en Cloudflare (ajustes + versión desplegada), para
// volver a subir el mismo código de API con los archivos nuevos de la web.
// Uso: node vants-config.mjs settings.json version.json <dir-assets> > wrangler.json
import { readFileSync } from "node:fs";
const [, , fSet, fVer, dir] = process.argv;
const set = JSON.parse(readFileSync(fSet, "utf8")).result;
const ver = JSON.parse(readFileSync(fVer, "utf8")).result;
const a = ver.resources.script_runtime.assets || {};
const vars = {}, d1 = [], otros = [];
for (const b of set.bindings) {
  if (b.type === "plain_text") vars[b.name] = b.text;
  else if (b.type === "json") vars[b.name] = b.json;
  else if (b.type === "d1") d1.push({ binding: b.name, database_id: b.database_id || b.id });
  else if (b.type === "assets" || b.type === "secret_text" || b.type === "secret_key") continue;
  else otros.push(b.type + ":" + b.name);
}
if (otros.length) { console.error("Bindings no soportados, se aborta: " + otros.join(", ")); process.exit(2); }
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
  triggers: { crons: JSON.parse(process.env.CRONS || "[]") },
  observability: set.observability,
};
console.log(JSON.stringify(cfg, null, 2));
