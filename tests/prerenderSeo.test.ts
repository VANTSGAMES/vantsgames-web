import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderRuta } from "../script/ci/prerenderSeo.ts";
import { SEO, RUTAS_PRE_RENDER } from "../client/src/lib/seoRutas.ts";

// La plantilla real de la portada: así el test cubre el HTML que el build pre-renderiza.
const fuente = readFileSync(new URL("../client/index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const META = { ruta: "/torneos/competir", titulo: "Competir — VANTS GAMES", descripcion: "Inscribe a tu equipo en torneos abiertos.", base: "https://vants.cc" };

const RE_ETIQUETAS = /<(?:meta|link)\b[^>]*>/g;
const RE_CONTENT = /\scontent="([^"]*)"/;
const RE_HREF = /\shref="([^"]*)"/;

/** Valor de `atributo` en la etiqueta <nombre> que lleva clave="valor" ("" si no existe). */
function atributo(html: string, nombre: string, clave: string, valor: string, atributo: string): string {
  const etiqueta = (html.match(RE_ETIQUETAS) || []).find((t) => t.startsWith(`<${nombre}`) && t.includes(`${clave}="${valor}"`));
  if (!etiqueta) return "";
  const m = etiqueta.match(atributo === "href" ? RE_HREF : RE_CONTENT);
  return m ? m[1] : "";
}

const cuenta = (html: string, texto: string) => html.split(texto).length - 1;
const tituloDe = (ruta: string) => SEO.find(([re]) => re.test(ruta))?.[1] ?? "";

describe("renderRuta — pre-render de metadatos por ruta del build web", () => {
  it("pone título, descripción, Open Graph, Twitter, canonical y og:url propios de la ruta", () => {
    const salida = renderRuta(fuente, META);
    assert.ok(salida.includes(`<title>${META.titulo}</title>`));
    assert.equal(atributo(salida, "meta", "name", "description", "content"), META.descripcion);
    assert.equal(atributo(salida, "meta", "property", "og:title", "content"), META.titulo);
    assert.equal(atributo(salida, "meta", "property", "og:description", "content"), META.descripcion);
    assert.equal(atributo(salida, "meta", "name", "twitter:title", "content"), META.titulo);
    assert.equal(atributo(salida, "meta", "name", "twitter:description", "content"), META.descripcion);
    assert.equal(atributo(salida, "link", "rel", "canonical", "href"), "https://vants.cc/torneos/competir");
    assert.equal(atributo(salida, "meta", "property", "og:url", "content"), "https://vants.cc/torneos/competir");
  });

  it("no toca el <body> ni los scripts: la aplicación arranca igual", () => {
    const salida = renderRuta(fuente, META);
    assert.equal(salida.slice(salida.indexOf("</head>")), fuente.slice(fuente.indexOf("</head>")));
    assert.equal(cuenta(salida, "<script"), cuenta(fuente, "<script"));
    assert.equal(cuenta(salida, 'type="application/ld+json"'), cuenta(fuente, 'type="application/ld+json"'));
  });

  it("solo cambia las etiquetas de metadatos y deja intacto el resto del <head>", () => {
    const salida = renderRuta(fuente, META);
    const cabeza = (h: string) => h.slice(0, h.indexOf("</head>")).split("\n");
    const antes = cabeza(fuente);
    const despues = cabeza(salida);
    const nuevas = despues.filter((l) => !antes.includes(l));
    const quitadas = antes.filter((l) => !despues.includes(l));
    // Sustituidas: title, description, og:title, og:description, twitter:title, twitter:description.
    // Añadidas: canonical y og:url.
    assert.equal(quitadas.length, 6);
    assert.equal(nuevas.length, 8);
    // El manifiesto y el registro del Service Worker los inyecta el build, no están en la plantilla.
    for (const clave of ['property="og:image" content', 'property="og:locale"', 'rel="icon"', 'rel="preconnect"', 'property="og:site_name"']) {
      assert.ok(despues.some((l) => l.includes(clave)), `falta en el resultado: ${clave}`);
    }
  });

  it("sustituye el canonical y og:url si ya existían en vez de duplicarlos", () => {
    const antigua = fuente.replace(
      "</title>",
      '</title>\n    <meta property="og:url" content="https://vants.cc/" />\n    <link rel="canonical" href="https://vants.cc/" />',
    );
    const salida = renderRuta(antigua, META);
    assert.equal(cuenta(salida, 'rel="canonical"'), 1);
    assert.equal(cuenta(salida, 'property="og:url"'), 1);
    assert.equal(atributo(salida, "link", "rel", "canonical", "href"), "https://vants.cc/torneos/competir");
    assert.equal(atributo(salida, "meta", "property", "og:url", "content"), "https://vants.cc/torneos/competir");
  });

  it("escapa los caracteres HTML de los textos para no romper la etiqueta", () => {
    const salida = renderRuta(fuente, { ...META, titulo: 'Torneos "S4" & <Final>' });
    assert.ok(salida.includes("<title>Torneos &quot;S4&quot; &amp; &lt;Final&gt;</title>"));
    assert.ok(!salida.includes("<Final>"));
    assert.equal(atributo(salida, "meta", "property", "og:title", "content"), 'Torneos &quot;S4&quot; &amp; &lt;Final&gt;');
  });

  it("es idempotente: renderizar dos veces da el mismo HTML", () => {
    assert.equal(renderRuta(renderRuta(fuente, META), META), renderRuta(fuente, META));
  });

  it("une bien el origen y la ruta aunque el origen traiga barra final", () => {
    const salida = renderRuta(fuente, { ...META, base: "https://vants.cc/" });
    assert.equal(atributo(salida, "link", "rel", "canonical", "href"), "https://vants.cc/torneos/competir");
  });
});

describe("RUTAS_PRE_RENDER — rutas que el build web pre-renderiza", () => {
  it("son rutas estáticas, únicas y con metadatos propios", () => {
    assert.ok(RUTAS_PRE_RENDER.length >= 37);
    assert.equal(new Set(RUTAS_PRE_RENDER).size, RUTAS_PRE_RENDER.length);
    for (const ruta of RUTAS_PRE_RENDER) {
      assert.ok(ruta.startsWith("/") && !ruta.endsWith("/"), `ruta mal formada: ${ruta}`);
      assert.ok(!/[:?#]/.test(ruta), `la ruta tiene parámetros o query: ${ruta}`);
      assert.ok(tituloDe(ruta).endsWith("— VANTS GAMES"), `sin metadatos: ${ruta}`);
    }
  });

  it("cada ruta resuelve a su entrada esperada (no al título genérico)", () => {
    assert.equal(tituloDe("/capacitacion"), "Centro de capacitación — VANTS GAMES");
    assert.equal(tituloDe("/crear-torneo"), "Crear mi torneo — VANTS GAMES");
    assert.equal(tituloDe("/comunidad/eventos"), "Eventos y Showmatches (RSVP) — VANTS GAMES");
    assert.equal(tituloDe("/comunidad/lfg"), "Buscador de Equipo y Scrims (LFG / LFT) — VANTS GAMES");
    assert.equal(tituloDe("/ranking"), "Ranking global — VANTS GAMES");
    assert.equal(tituloDe("/ranked"), "VANTS Ranked — VANTS GAMES");
    assert.equal(tituloDe("/equipo-vants"), "Equipo VANTS — VANTS GAMES");
  });

  it("la portada y las páginas personales no se pre-renderizan", () => {
    assert.ok(!RUTAS_PRE_RENDER.includes("/"));
    assert.ok(!RUTAS_PRE_RENDER.some((r) => r.startsWith("/perfil")));
    assert.ok(!RUTAS_PRE_RENDER.includes("/entrar"));
  });

  it("la plantilla index.html no declara un canonical fijo: responde en todas las rutas", () => {
    assert.equal(fuente.includes('rel="canonical"'), false);
    assert.equal(fuente.includes('property="og:url"'), false);
    assert.ok(fuente.includes('property="og:image:width" content="1200"'));
    assert.ok(fuente.includes('property="og:locale" content="es_LA"'));
  });
});
