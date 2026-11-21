// Prepara los recursos gráficos de la app Android tras `npx cap add android`:
// 1) ic_launcher / ic_launcher_round en todas las densidades (desde brand/vants-mark.svg)
// 2) splash sólido #0A0A0B (evita el flash blanco al arrancar)
// 3) versión (versionName/versionCode) pasada por entorno
// Uso: node script/ci/app-icono.mjs  (requiere sharp, instalado por el workflow)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import sharp from "sharp";

const RES = "android/app/src/main/res";
const MARCA = "client/public/brand/vants-mark.svg";
const FONDO = "#0A0A0B";

if (!existsSync(RES)) {
  console.error("No existe " + RES + " — ejecuta antes npx cap add android");
  process.exit(1);
}

const svg = readFileSync(MARCA);

// Icono cuadrado: marca centrada sobre fondo de la marca (85% del lienzo, margen 7.5%)
const densidades = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dens, px] of Object.entries(densidades)) {
  const dir = `${RES}/mipmap-${dens}`;
  mkdirSync(dir, { recursive: true });
  const marca = Math.round(px * 0.72);
  const margen = Math.round((px - marca) / 2);
  for (const nombre of ["ic_launcher.png", "ic_launcher_round.png"]) {
    await sharp({ create: { width: px, height: px, channels: 4, background: FONDO } })
      .composite([{ input: await sharp(svg, { density: 720 }).resize(marca, marca).png().toBuffer(), left: margen, top: margen }])
      .png()
      .toFile(`${dir}/${nombre}`);
  }
}
// Iconos adaptativos: usamos PNG directo, quitamos la variante anydpi-v26
for (const d of ["mipmap-anydpi-v26"]) rmSync(`${RES}/${d}`, { recursive: true, force: true });

// Splash: sólido oscuro (styles.xml del template referencia @drawable/splash)
mkdirSync(`${RES}/drawable`, { recursive: true });
mkdirSync(`${RES}/drawable-land`, { recursive: true });
await sharp({ create: { width: 1080, height: 1920, channels: 4, background: FONDO } }).png().toFile(`${RES}/drawable/splash.png`);
await sharp({ create: { width: 1080, height: 1920, channels: 4, background: FONDO } }).png().toFile(`${RES}/drawable-land/splash.png`);

// Versión
const gradle = `${'android'}/app/build.gradle`;
let g = readFileSync(gradle, "utf8");
const ver = process.env.APP_VERSION || "1.0.0";
const cod = process.env.APP_VERSION_CODE || "1";
g = g.replace(/versionName\s+"[^"]*"/, `versionName "${ver}"`);
g = g.replace(/versionCode\s+\d+/, `versionCode ${cod}`);
writeFileSync(gradle, g);
console.log(`Recursos listos: icono ${JSON.stringify(Object.values(densidades))}px, splash ${FONDO}, versión ${ver} (${cod})`);
