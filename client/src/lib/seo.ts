import { useEffect } from "react";
import { useLocation } from "wouter";
import { buildBreadcrumbJsonLd } from "./competitive";
import { SEO } from "./seoRutas";

export { SEO, RUTAS_PRE_RENDER } from "./seoRutas";

/** Fija un atributo de una etiqueta del <head>; si no existe y se pasa `crear`, la añade. */
function setMeta(selector: string, attr: string, value: string, crear?: () => HTMLElement) {
  let el = document.querySelector<HTMLElement>(selector);
  if (!el && crear) {
    el = crear();
    document.head.appendChild(el);
  }
  el?.setAttribute(attr, value);
}

export function useSeo() {
  const [path] = useLocation();
  useEffect(() => {
    const hit = SEO.find(([re]) => re.test(path));
    const title = hit ? hit[1] : "VANTS GAMES — Esports & Torneos";
    const desc = hit
      ? hit[2]
      : "Plataforma competitiva de esports en Venezuela y Latinoamérica para 11 videojuegos.";
    const base = String(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonical = base + (path.startsWith("/") ? path : "/" + path);

    document.title = title;
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    // El HTML inicial no declara URL canónica (el mismo archivo responde en todas las rutas):
    // aquí se crea con la URL real de cada página.
    setMeta('meta[property="og:url"]', "content", canonical, () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:url");
      return meta;
    });
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", canonical, () => {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      return link;
    });

    const ldId = "vants-route-ld";
    let script = document.getElementById(ldId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = ldId;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(buildBreadcrumbJsonLd(path, title, base));
  }, [path]);
}
