// Genera client/public/insignias/<slug>.png (512 y 256) y <slug>-bloqueada.png
// con el motor V1 (client/src/lib/emblemaV1.ts) en Chromium headless.
// Uso: node script/insignias-png.mjs [ruta-chromium]
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = await build({ entryPoints: ["client/src/lib/emblemaV1.ts"], bundle: true, format: "iife", globalName: "V1", write: false });
const js = out.outputFiles[0].text;
const html = `<!doctype html><html><body><pre id="o"></pre><script>${js}
const r = {};
for (const code of Object.keys(V1.DEF_V1)) {
  const b = V1.DEF_V1[code], s = V1.slugInsignia(code);
  r[s + ".png"] = V1.canvasEmblema(b, 512).toDataURL();
  r[s + "-256.png"] = V1.canvasEmblema(b, 256).toDataURL();
  r[s + "-bloqueada.png"] = V1.canvasEmblema(b, 256, { bloqueada: true }).toDataURL();
  r[s + "-220.png"] = V1.canvasEmblema(b, 220).toDataURL();
}
document.getElementById("o").textContent = JSON.stringify(r);
</script></body></html>`;
const f = join(tmpdir(), "insignias-v1.html");
writeFileSync(f, html);
const home = process.env.HOME + "/.cache/ms-playwright";
const chrome = process.argv[2] || join(home, readdirSync(home).find((d) => d.startsWith("chromium-")), "chrome-linux64", "chrome");
const dom = execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=5000", "--dump-dom", "file://" + f], { maxBuffer: 1 << 28 }).toString();
const datos = JSON.parse(dom.match(/<pre id="o">([\s\S]*?)<\/pre>/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
const dir = "client/public/insignias";
mkdirSync(dir, { recursive: true });
const tmp = join(tmpdir(), "insignias-220"); mkdirSync(tmp, { recursive: true });
for (const [n, url] of Object.entries(datos)) {
  const buf = Buffer.from(url.split(",")[1], "base64");
  if (n.endsWith("-220.png")) writeFileSync(join(tmp, n), buf); else writeFileSync(join(dir, n), buf);
}
console.log(Object.keys(datos).length, "PNG");
