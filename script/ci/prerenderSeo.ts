/**
 * Pre-render de metadatos por ruta (lo usa vite.config.ts en el build web).
 *
 * La web es una SPA: el servidor entrega el mismo <head> para todas las rutas, así que los
 * rastreadores y las vistas previas de WhatsApp, X o Discord ven la portada en cualquier
 * página. Cloudflare resuelve /torneos → torneos.html, así que basta con emitir una copia del
 * index.html compilado por cada ruta con su título, descripción, canonical y Open Graph propios.
 * El <body> y los scripts no se tocan: la aplicación arranca exactamente igual.
 */

export interface MetaRuta {
  ruta: string;
  titulo: string;
  descripcion: string;
  /** Origen del sitio (p. ej. https://vants.cc); se le quita la barra final si la trae. */
  base: string;
}

const escapar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Expresiones fijas: nunca se construyen a partir de datos.
const RE_ETIQUETA: Record<"meta" | "link", RegExp> = {
  meta: /<meta\b[^>]*>/gi,
  link: /<link\b[^>]*>/gi,
};
const RE_ATRIBUTO = /\s([a-z][a-z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Nombre → valor de los atributos de una etiqueta (los nombres en HTML no distinguen mayúsculas). */
function atributos(etiqueta: string): Record<string, string> {
  const lista: Record<string, string> = {};
  for (const m of Array.from(etiqueta.matchAll(RE_ATRIBUTO))) lista[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return lista;
}

/** Devuelve la etiqueta con `atributo="valor"`: sustituido si existía, añadido si no. */
function conAtributo(etiqueta: string, atributo: string, valor: string): string {
  const nuevo = ` ${atributo}="${escapar(valor)}"`;
  for (const m of Array.from(etiqueta.matchAll(RE_ATRIBUTO))) {
    if (m[1].toLowerCase() === atributo) return etiqueta.slice(0, m.index) + nuevo + etiqueta.slice(m.index + m[0].length);
  }
  return etiqueta.endsWith("/>") ? `${etiqueta.slice(0, -2).trimEnd()}${nuevo} />` : `${etiqueta.slice(0, -1)}${nuevo}>`;
}

/** Cambia `atributo` en la etiqueta <nombre> cuyo atributoClave es valorClave. Devuelve si la encontró. */
function sustituir(
  html: string,
  nombre: "meta" | "link",
  atributoClave: string,
  valorClave: string,
  atributo: string,
  valor: string,
): { html: string; encontrada: boolean } {
  for (const m of Array.from(html.matchAll(RE_ETIQUETA[nombre]))) {
    if (atributos(m[0])[atributoClave] !== valorClave) continue;
    return { html: html.slice(0, m.index) + conAtributo(m[0], atributo, valor) + html.slice(m.index + m[0].length), encontrada: true };
  }
  return { html, encontrada: false };
}

/** Inserta una etiqueta nueva justo después de <title>, sin alterar el orden de carga. */
function trasElTitulo(html: string, etiqueta: string): string {
  return html.replace(/<\/title>/i, (cierre) => `${cierre}\n    ${etiqueta}`);
}

/** Devuelve el HTML de la portada compilada con los metadatos de `meta`. */
export function renderRuta(html: string, meta: MetaRuta): string {
  const url = meta.base.replace(/\/+$/, "") + meta.ruta;
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapar(meta.titulo)}</title>`);

  out = sustituir(out, "meta", "name", "description", "content", meta.descripcion).html;
  out = sustituir(out, "meta", "property", "og:title", "content", meta.titulo).html;
  out = sustituir(out, "meta", "property", "og:description", "content", meta.descripcion).html;
  out = sustituir(out, "meta", "name", "twitter:title", "content", meta.titulo).html;
  out = sustituir(out, "meta", "name", "twitter:description", "content", meta.descripcion).html;

  // La URL propia de la ruta: se sustituye si la etiqueta existe y se añade si falta.
  const canonical = sustituir(out, "link", "rel", "canonical", "href", url);
  out = canonical.encontrada ? canonical.html : trasElTitulo(out, `<link rel="canonical" href="${escapar(url)}" />`);
  const ogUrl = sustituir(out, "meta", "property", "og:url", "content", url);
  out = ogUrl.encontrada ? ogUrl.html : trasElTitulo(out, `<meta property="og:url" content="${escapar(url)}" />`);

  return out;
}
