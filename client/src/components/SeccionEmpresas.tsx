import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "wouter";
import { Section } from "./ui-vants";

/**
 * Sección comercial para empresas, marcas y negocios gamer.
 * Se muestra en el Home (id="empresas") y en la página /empresas.
 * El formulario compone un correo estructurado a contacto@vants.cc.
 */

const APP_APK = "https://github.com/VANTSGAMES/vantsgames-web/releases/latest/download/VANTS-1.0.0.apk";
export { APP_APK };

const BENEFICIOS: { t: string; d: string }[] = [
  {
    t: "Torneos Patrocinados",
    d: "Presencia visual de tu marca en brackets oficiales, páginas de inscripción, perfiles de equipos y transmisiones en vivo sin publicidad invasiva.",
  },
  {
    t: "Perfil de Empresa Verificado",
    d: "Obtén la insignia oficial VERIFIED PARTNER, soporte prioritario, espacio comercial dedicado y métricas reales de participación.",
  },
  {
    t: "Ligas y Eventos a Medida",
    d: "Infraestructura completa para organizar copas corporativas, lanzamientos de videojuegos o activaciones con creadores de contenido.",
  },
];

const TIPOS = ["Patrocinio", "Torneo corporativo", "Publicidad", "Alianza"];

function ModalAlianza({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const [f, setF] = useState({ empresa: "", contacto: "", email: "", web: "", tipo: TIPOS[0], mensaje: "" });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<null | "ok" | "mailto">(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  const mailto = () => {
    const cuerpo = [
      "Solicitud de alianza comercial — VANTS GAMES", "",
      "Empresa/marca: " + f.empresa, "Contacto: " + f.contacto, "Correo: " + f.email,
      "Web/redes: " + (f.web || "—"), "Tipo de interés: " + f.tipo, "", "Mensaje:", f.mensaje,
    ].join("\n");
    window.open(
      "mailto:contacto@vants.cc?subject=" + encodeURIComponent("[Alianza] " + f.empresa + " · " + f.tipo) + "&body=" + encodeURIComponent(cuerpo),
      "_blank",
    );
    setEnviado("mailto");
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const { api } = await import("@/lib/api");
      await api("/int/empresas/alianza", {
        method: "POST",
        body: { empresa: f.empresa, contacto: f.contacto, email: f.email, web: f.web, tipo: f.tipo, mensaje: f.mensaje },
      });
      setEnviado("ok");
    } catch {
      mailto(); // respaldo: el correo oficial sigue siendo el canal
    } finally {
      setEnviando(false);
    }
  };

  const campo = "field";
  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" aria-label="Solicitar alianza comercial">
      <div ref={ref} className="panel panel-pad chamfer modal-caja grid gap-4" data-testid="modal-alianza">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Industria gamer · Alianzas</div>
            <h2 className="d-3">Solicitar alianza comercial</h2>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCerrar} aria-label="Cerrar formulario">✕</button>
        </div>
        {enviado ? (
          <div className="grid gap-3" role="status" data-testid="alianza-resultado">
            <p className="muted small">
              {enviado === "ok" ? (
                <>
                  <strong style={{ color: "var(--blanco)" }}>Agradecemos su propuesta.</strong> Nuestro equipo comercial
                  la evaluará y se pondrá en contacto en un plazo máximo de 5 días hábiles. Envió un acuse de recibo a{" "}
                  <strong style={{ color: "var(--blanco)" }}>{f.email}</strong>.
                </>
              ) : (
                <>
                  Se abrió su cliente de correo con la solicitud lista para enviar a <strong>contacto@vants.cc</strong>.
                  Si no se abrió, escríbanos directamente con los datos del formulario.
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setEnviado(null)}>Editar datos</button>
              <button type="button" className="btn btn-sm btn-rojo" onClick={onCerrar}>Listo</button>
            </div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={enviar}>
            <div className={campo}>
              <label htmlFor="al-empresa">Nombre de la empresa / marca *</label>
              <input id="al-empresa" className="input" required maxLength={80} value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={campo}>
                <label htmlFor="al-contacto">Nombre del contacto *</label>
                <input id="al-contacto" className="input" required maxLength={80} value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
              </div>
              <div className={campo}>
                <label htmlFor="al-email">Correo electrónico *</label>
                <input id="al-email" type="email" className="input" required maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={campo}>
                <label htmlFor="al-web">Sitio web o redes</label>
                <input id="al-web" className="input" maxLength={160} placeholder="https://…" value={f.web} onChange={(e) => setF({ ...f, web: e.target.value })} />
              </div>
              <div className={campo}>
                <label htmlFor="al-tipo">Tipo de interés *</label>
                <select id="al-tipo" className="input" required value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className={campo}>
              <label htmlFor="al-mensaje">Mensaje *</label>
              <textarea id="al-mensaje" className="input" required maxLength={1500} rows={4} placeholder="Cuéntanos qué quieres lograr con VANTS GAMES…" value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-rojo" disabled={enviando} data-testid="btn-enviar-alianza">{enviando ? "Enviando…" : "Enviar solicitud"}</button>
            <p className="muted small">La solicitud llega al equipo comercial de VANTS. Requiere registro legal de empresa/marca, portafolio relevante y validación oficial.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export function SeccionEmpresas({ pagina = false }: { pagina?: boolean }) {
  const [modal, setModal] = useState(false);
  return (
    <Section id="empresas" nivel={pagina ? 1 : 2} eyebrow="Industria gamer · Patrocinios y alianzas" title={<>Conecta tu marca con la <span style={{ color: "var(--rojo)" }}>escena competitiva</span> de Latinoamérica</>}>
      <p className="muted" style={{ maxWidth: "76ch" }}>
        VANTS GAMES ofrece un espacio organizado, seguro y verificado para estudios de videojuegos, tiendas de hardware,
        marcas, organizadores y negocios de la industria gamer que buscan presencia real en torneos, rankings y
        comunidades activas.
      </p>
      <div className="grid gap-4 md:grid-cols-3 mt-6">
        {BENEFICIOS.map((b, i) => (
          <div key={b.t} className="panel panel-pad chamfer grid gap-2 content-start reveal" style={{ "--d": `${i * 80}ms` } as CSSProperties}>
            <span className="muro-num">0{i + 1}</span>
            <span className="d-3" style={{ fontFamily: "var(--f-display)", letterSpacing: "0.04em" }}>{b.t}</span>
            <p className="muted small">{b.d}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-8">
        <button type="button" className="btn btn-rojo" onClick={() => setModal(true)} data-testid="btn-alianza">
          Solicitar alianza comercial <span aria-hidden="true">→</span>
        </button>
        <Link href="/terminos#empresas" className="btn btn-ghost" data-testid="btn-condiciones-empresas">Ver condiciones para empresas</Link>
        <span className="muted small">Requiere registro legal de empresa/marca, portafolio relevante y validación oficial del equipo VANTS.</span>
      </div>
      <ModalAlianza abierta={modal} onCerrar={() => setModal(false)} />
    </Section>
  );
}

/** Página independiente /empresas: misma sección con cabecera propia. */
export function PaginaEmpresas() {
  return (
    <>
      <SeccionEmpresas pagina />
      <div className="wrap pb-14">
        <p className="muted small">Más información en <Link href="/terminos#empresas" className="link-arrow">condiciones para empresas <span aria-hidden>→</span></Link> o escribiendo a <a href="mailto:contacto@vants.cc" className="link-arrow">contacto@vants.cc</a>.</p>
      </div>
    </>
  );
}
