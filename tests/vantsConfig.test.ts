// Tests del generador de wrangler.json (script/ci/vants-config.mjs):
// mapeo de bindings (D1, Queues, Durable Objects, Workflows), abort con tipos
// desconocidos, bloque de observabilidad y la puerta de escape WRANGLER_EXTRA.
import test from "node:test";
import assert from "node:assert/strict";
import { mapearBindings, construirConfig } from "../script/ci/vants-config.mjs";

const settingsBase = {
  compatibility_date: "2025-05-05",
  compatibility_flags: ["nodejs_compat"],
  bindings: [
    { type: "plain_text", name: "SITE_URL", text: "https://vants.cc" },
    { type: "json", name: "SITE_ORIGINS", json: ["https://vants.cc"] },
    { type: "d1", name: "DB", database_id: "d1-abc" },
    { type: "secret_text", name: "TOKEN_SECRETO", text: "no-debe-salir" },
    { type: "secret_key", name: "LLAVE", },
    { type: "assets", name: "ASSETS" },
  ],
};

const versionBase = {
  resources: {
    script_runtime: {
      assets: { not_found_handling: "single-page-application", raw_run_worker_first: true, html_handling: "auto-trailing-slash" },
    },
  },
};

test("mapearBindings — pasa vars/D1/secretos y deja fuera los secretos", () => {
  const m = mapearBindings(settingsBase.bindings);
  assert.equal(m.vars.SITE_URL, "https://vants.cc");
  assert.deepEqual(m.vars.SITE_ORIGINS, ["https://vants.cc"]);
  assert.deepEqual(m.d1, [{ binding: "DB", database_id: "d1-abc" }]);
  assert.equal(JSON.stringify(m).includes("no-debe-salir"), false, "el secreto no debe aparecer");
  // Los tipos desconocidos no se devuelven: lanzan (ver test siguiente).
});

test("mapearBindings — cola, Durable Object y Workflow de VANTS", () => {
  const m = mapearBindings([
    { type: "queue", name: "COLA_WEBHOOKS", queue_name: "webhooks-faceit", queue_id: "q-1" },
    { type: "durable_object_namespace", name: "SALA_TORNEO", class_name: "SalaTorneo" },
    { type: "durable_object_namespace", name: "DO_EXTERNO", class_name: "OtraClase", script_name: "otro-worker" },
    { type: "workflows", name: "TORNEO_WORKFLOW", class_name: "TorneoWorkflow", workflow_name: "torneo-workflow" },
  ]);
  assert.deepEqual(m.colas, [{ binding: "COLA_WEBHOOKS", queue: "webhooks-faceit" }]);
  assert.deepEqual(m.dos, [
    { name: "SALA_TORNEO", class_name: "SalaTorneo" },
    { name: "DO_EXTERNO", class_name: "OtraClase", script_name: "otro-worker" },
  ]);
  assert.deepEqual(m.workflows, [
    { binding: "TORNEO_WORKFLOW", class_name: "TorneoWorkflow", name: "torneo-workflow" },
  ]);
});

test("mapearBindings — tipo desconocido aborta con el mensaje de siempre", () => {
  assert.throws(() => mapearBindings([{ type: "hyperdrive", name: "HD" }]), /Bindings no soportados, se aborta: hyperdrive:HD/);
});

test("construirConfig — observabilidad activada y assets intactos", () => {
  const cfg = construirConfig(settingsBase, versionBase, "dist-web", { CRONS: '["0 3 * * *"]' });
  assert.deepEqual(cfg.observability, {
    enabled: true,
    head_sampling_rate: 1,
    redact_query_string: false,
    logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true, persist: true },
    traces: { enabled: true, head_sampling_rate: 1, persist: true },
    issue_detection: { enabled: true },
  });
  assert.equal(cfg.name, "vants");
  assert.equal(cfg.assets.directory, "dist-web");
  assert.equal(cfg.assets.not_found_handling, "single-page-application");
  assert.deepEqual(cfg.triggers, { crons: ["0 3 * * *"] });
  assert.equal(JSON.stringify(cfg).includes("no-debe-salir"), false);
});

test("construirConfig — los bindings de recursos nuevos caen en su bloque wrangler", () => {
  const conRecursos = {
    ...settingsBase,
    bindings: [
      ...settingsBase.bindings,
      { type: "queue", name: "COLA_WEBHOOKS", queue_name: "webhooks-faceit" },
      { type: "durable_object_namespace", name: "SALA_TORNEO", class_name: "SalaTorneo" },
      { type: "workflows", name: "TORNEO_WORKFLOW", class_name: "TorneoWorkflow", workflow_name: "torneo-workflow" },
    ],
  };
  const cfg = construirConfig(conRecursos, versionBase, "dist-web");
  assert.deepEqual(cfg.queues, { producers: [{ binding: "COLA_WEBHOOKS", queue: "webhooks-faceit" }] });
  assert.deepEqual(cfg.durable_objects, { bindings: [{ name: "SALA_TORNEO", class_name: "SalaTorneo" }] });
  assert.deepEqual(cfg.workflows, [{ binding: "TORNEO_WORKFLOW", class_name: "TorneoWorkflow", name: "torneo-workflow" }]);
});

test("construirConfig — sin recursos nuevos no agrega bloques vacíos", () => {
  const cfg = construirConfig(settingsBase, versionBase, "dist-web");
  assert.equal("queues" in cfg, false);
  assert.equal("durable_objects" in cfg, false);
  assert.equal("workflows" in cfg, false);
});

test("construirConfig — WRANGLER_EXTRA se fusiona al final (exports, consumers, migrations)", () => {
  const extra = {
    exports: { SalaTorneo: { type: "durable-object", storage: "sqlite" } },
    queues: { consumers: [{ queue: "webhooks-faceit", max_batch_size: 10, max_batch_timeout: 5, max_retries: 5, dead_letter_queue: "webhooks-faceit-dlq" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["SalaTorneo"] }],
  };
  const cfg = construirConfig(settingsBase, versionBase, "dist-web", { WRANGLER_EXTRA: JSON.stringify(extra) });
  assert.deepEqual(cfg.exports, extra.exports);
  assert.deepEqual(cfg.queues, { consumers: extra.queues.consumers });
  assert.deepEqual(cfg.migrations, extra.migrations);
});

test("construirConfig — soporta service bindings existentes y fusiona WRANGLER_EXTRA.services sin duplicar", () => {
  const conSvc = {
    ...settingsBase,
    bindings: [
      ...settingsBase.bindings,
      { type: "service", name: "VANTS_INT", service: "vants-integraciones" },
    ],
  };
  const extra = { services: [{ binding: "VANTS_INT", service: "vants-integraciones" }, { binding: "OTRO", service: "otro-worker" }] };
  const cfg = construirConfig(conSvc, versionBase, "dist-web", { WRANGLER_EXTRA: JSON.stringify(extra) });
  assert.deepEqual(cfg.services, [
    { binding: "VANTS_INT", service: "vants-integraciones" },
    { binding: "OTRO", service: "otro-worker" },
  ]);
});
