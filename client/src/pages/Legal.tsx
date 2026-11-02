import { PageHead } from "@/components/ui-vants";
import privacidad from "@/content/privacidad.html?raw";
import terminos from "@/content/terminos.html?raw";

/** Textos legales vigentes (actualizados el 18 de octubre de 2026), migrados como contenido estático. */
const DOCS = {
  privacidad: { t: "Política de privacidad", html: privacidad },
  terminos: { t: "Términos de servicio", html: terminos },
};

export default function Legal({ doc }: { doc: keyof typeof DOCS }) {
  const d = DOCS[doc];
  return (
    <>
      <PageHead eyebrow="Legal · Última actualización: 18 de octubre de 2026" title={d.t} />
      <article className="wrap legal pb-20" dangerouslySetInnerHTML={{ __html: d.html }} />
    </>
  );
}
