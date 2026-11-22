import { useEffect } from "react";
import { PageHead } from "@/components/ui-vants";
import privacidad from "@/content/privacidad.html?raw";
import terminos from "@/content/terminos.html?raw";

/** Textos legales vigentes, migrados como contenido estático. */
const DOCS = {
  privacidad: { t: "Política de privacidad", fecha: "22 de noviembre de 2026", html: privacidad },
  terminos: { t: "Términos de Servicio — VANTS GAMES", fecha: "Noviembre 2026", html: terminos },
};

export default function Legal({ doc }: { doc: keyof typeof DOCS }) {
  const d = DOCS[doc];

  // Anclas tipo /terminos#empresas: al montar (o cambiar doc) baja al elemento.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearTimeout(t);
  }, [doc]);

  return (
    <>
      <PageHead eyebrow={"Legal · Última actualización: " + d.fecha} title={d.t} lead={doc === "terminos" ? "Las reglas de la arena: cómo se compite, se organiza y se crece en VANTS GAMES." : undefined} />
      <article className="wrap legal pb-20" dangerouslySetInnerHTML={{ __html: d.html }} />
    </>
  );
}
