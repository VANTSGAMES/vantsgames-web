// Embebe dist/worker-public en worker/assets.js (base64) para el Worker de preview.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
const ROOT = new URL("../dist/worker-public/", import.meta.url).pathname;
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".ico": "image/x-icon", ".webp": "image/webp", ".woff2": "font/woff2" };
const out = {};
(function walk(d) {
  for (const f of readdirSync(d)) {
    const full = join(d, f);
    if (statSync(full).isDirectory()) walk(full);
    else out["/" + full.slice(ROOT.length)] = { t: T[extname(f)] || "application/octet-stream", b: readFileSync(full).toString("base64") };
  }
})(ROOT);
writeFileSync(new URL("./assets.js", import.meta.url), "export const ASSETS = " + JSON.stringify(out) + ";\n");
console.log(Object.keys(out).length, "archivos");
