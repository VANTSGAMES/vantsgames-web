// client/src/components/FormulariosNativos.tsx
// Formularios nativos VANTS GAMES (#0a0a0b / #111113 / #ff0d2e) con ejemplos guía,
// persistencia en D1 (vants_formularios_envios), correo oficial desde @vants.cc
// y botón directo "Agregar a Google Calendar" (sin permisos OAuth extra).
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { opcionesJuegos } from "@/lib/juegos";

export type TipoFormularioVants = "inscripcion_torneo" | "workspace_empresas" | "soporte_contacto";

interface RespuestaFormulario {
  ok: boolean;
  id: string;
  tipo: TipoFormularioVants;
  calendar_url: string;
  email_enviado: boolean;
}

const TABS_FORM: Array<{ id: TipoFormularioVants; label: string; desc: string }> = [
  {
    id: "inscripcion_torneo",
    label: "Inscripción Torneo / Equipo",
    desc: "Registra tu roster oficial y recibe confirmación desde torneos@vants.cc + recordatorio en Calendar.",
  },
  {
    id: "workspace_empresas",
    label: "Workspace / Empresas",
    desc: "Solicita torneos corporativos, patrocinios o activaciones con marcas desde contacto@vants.cc.",
  },
  {
    id: "soporte_contacto",
    label: "Soporte y Contacto",
    desc: "Reporta incidencias de cuenta, pagos, brackets o revisión manual de demo/POV.",
  },
];

export function FormulariosNativos({
  tipoInicial = "inscripcion_torneo",
  onEnviado,
}: {
  tipoInicial?: TipoFormularioVants;
  onEnviado?: (res: RespuestaFormulario) => void;
}) {
  const { user, status } = useAuth();
  const [tipo, setTipo] = useState<TipoFormularioVants>(tipoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaFormulario | null>(null);

  const [nombre, setNombre] = useState(() => user?.name || user?.nickname || "");
  const [email, setEmail] = useState(() => user?.email || "");
  const [organizacion, setOrganizacion] = useState("");
  const [tag, setTag] = useState("");
  const [juego, setJuego] = useState("valorant");
  const [torneoSlug, setTorneoSlug] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");

  const activo = TABS_FORM.find((t) => t.id === tipo) || TABS_FORM[0];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await api<RespuestaFormulario>("/api/formularios/enviar", {
        method: "POST",
        auth: status === "autenticado",
        body: {
          tipo,
          nombre: nombre.trim(),
          email: email.trim(),
          organizacion: organizacion.trim(),
          tag: tag.trim().toUpperCase(),
          juego: tipo === "inscripcion_torneo" ? juego : undefined,
          torneo_slug: tipo === "inscripcion_torneo" ? torneoSlug.trim() : undefined,
          fecha_inicio: fechaInicio ? new Date(fechaInicio).toISOString() : undefined,
          asunto: asunto.trim(),
          mensaje: mensaje.trim(),
        },
      });
      setResultado(res);
      onEnviado?.(res);
    } catch (err: any) {
      setError(err?.code === "datos_invalidos" ? "Revisa tu nombre y correo electrónico." : err?.message || "No se pudo enviar el formulario.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section
      data-testid="formularios-nativos-vants"
      style={{
        background: "#111113",
        border: "1px solid #2a2a2f",
        borderTop: "2px solid #ff0d2e",
        color: "#f4f4f5",
      }}
      className="p-5 sm:p-6 grid gap-5"
    >
      <div className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#ff5468" }}>
          Formularios Oficiales VANTS · D1 + Google Sheets
        </span>
        <h2 className="d-2">Centro de formularios nativos</h2>
        <p className="small muted">{activo.desc}</p>
      </div>

      {/* Selector de formulario */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de formulario">
        {TABS_FORM.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tipo === t.id}
            onClick={() => {
              setTipo(t.id);
              setResultado(null);
              setError(null);
            }}
            className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              background: tipo === t.id ? "#ff0d2e" : "#0a0a0b",
              color: tipo === t.id ? "#ffffff" : "#d4d4d8",
              border: `1px solid ${tipo === t.id ? "#ff0d2e" : "#2a2a2f"}`,
            }}
            data-testid={`tab-form-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {resultado ? (
        <div
          className="p-5 grid gap-4"
          style={{ background: "#0a0a0b", border: "1px solid rgba(65,217,141,0.45)" }}
          role="status"
          data-testid="formulario-nativo-ok"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#41d98d" }}>
              ✓ Registro confirmado · {resultado.id}
            </span>
            <span className="text-xs muted">
              {resultado.email_enviado ? "Correo oficial @vants.cc enviado" : "Guardado en base de datos oficial"}
            </span>
          </div>
          <p className="text-sm" style={{ color: "#e4e4e7" }}>
            Tu envío quedó guardado en VANTS GAMES (y disponible para exportar a Google Sheets desde Workspace).
          </p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={resultado.calendar_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2"
              style={{ background: "#ff0d2e", color: "#ffffff" }}
              data-testid="btn-form-google-calendar"
            >
              📅 Agregar a Google Calendar
            </a>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                setMensaje("");
                setAsunto("");
              }}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
              style={{ background: "#18181d", border: "1px solid #2e2e36", color: "#e4e4e7" }}
            >
              Enviar otro formulario
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="grid gap-4" data-testid="form-nativo-submit">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="fn-nombre">
                {tipo === "inscripcion_torneo" ? "Capitán / Nick principal *" : "Nombre y apellido *"}
              </label>
              <input
                id="fn-nombre"
                className="input"
                style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                required
                maxLength={90}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={tipo === "inscripcion_torneo" ? "Ej.: Feispla#LATAM" : "Ej.: María Gómez"}
              />
              <span className="text-[11px] muted">
                {tipo === "inscripcion_torneo"
                  ? "Ejemplo: tu Riot ID o nick de FACEIT tal como aparece en partida."
                  : "Ejemplo: persona de contacto responsable de la solicitud."}
              </span>
            </div>

            <div className="field">
              <label htmlFor="fn-email">Correo electrónico *</label>
              <input
                id="fn-email"
                type="email"
                className="input"
                style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                required
                maxLength={140}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tipo === "workspace_empresas" ? "Ej.: marketing@marca.com" : "Ej.: capitan@equipo.gg"}
              />
              <span className="text-[11px] muted">
                Recibirás confirmación oficial desde {tipo === "inscripcion_torneo" ? "torneos@vants.cc" : "contacto@vants.cc"}.
              </span>
            </div>
          </div>

          {tipo === "inscripcion_torneo" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="field sm:col-span-2">
                  <label htmlFor="fn-equipo">Nombre del equipo *</label>
                  <input
                    id="fn-equipo"
                    className="input"
                    style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                    required
                    maxLength={80}
                    value={organizacion}
                    onChange={(e) => setOrganizacion(e.target.value)}
                    placeholder="Ej.: Caracas Five Esports"
                  />
                </div>
                <div className="field">
                  <label htmlFor="fn-tag">Tag (2–4 letras) *</label>
                  <input
                    id="fn-tag"
                    className="input uppercase"
                    style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                    required
                    maxLength={4}
                    pattern="[A-Za-z0-9]{2,4}"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="Ej.: CCS5"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="field">
                  <label htmlFor="fn-juego">Videojuego *</label>
                  <select
                    id="fn-juego"
                    className="input"
                    style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                    value={juego}
                    onChange={(e) => setJuego(e.target.value)}
                  >
                    {opcionesJuegos().map((j) => (
                      <option key={j.value} value={j.value}>{j.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="fn-torneo">Torneo o copa *</label>
                  <input
                    id="fn-torneo"
                    className="input"
                    style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                    required
                    maxLength={100}
                    value={torneoSlug}
                    onChange={(e) => setTorneoSlug(e.target.value)}
                    placeholder="Ej.: copa-valorant-s4"
                  />
                </div>
                <div className="field">
                  <label htmlFor="fn-fecha">Fecha estimada (Calendar)</label>
                  <input
                    id="fn-fecha"
                    type="datetime-local"
                    className="input"
                    style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {tipo === "workspace_empresas" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="fn-org">Empresa, organización o marca *</label>
                <input
                  id="fn-org"
                  className="input"
                  style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                  required
                  maxLength={100}
                  value={organizacion}
                  onChange={(e) => setOrganizacion(e.target.value)}
                  placeholder="Ej.: HyperX LATAM / Estudio Indie"
                />
              </div>
              <div className="field">
                <label htmlFor="fn-tipo-b2b">Tipo de colaboración *</label>
                <input
                  id="fn-tipo-b2b"
                  className="input"
                  style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                  required
                  maxLength={120}
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Ej.: Patrocinio Copa CS2 · Torneo corporativo"
                />
              </div>
            </div>
          )}

          {tipo === "soporte_contacto" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="fn-cat">Área de soporte *</label>
                <input
                  id="fn-cat"
                  className="input"
                  style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                  required
                  maxLength={120}
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Ej.: Cambio de capitán / Revisión POV / Pagos"
                />
              </div>
              <div className="field">
                <label htmlFor="fn-ref-org">Torneo o nick involucrado (opcional)</label>
                <input
                  id="fn-ref-org"
                  className="input"
                  style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
                  maxLength={100}
                  value={organizacion}
                  onChange={(e) => setOrganizacion(e.target.value)}
                  placeholder="Ej.: copa-cs2-s4 · PlayerX"
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="fn-msg">
              {tipo === "inscripcion_torneo"
                ? "Roster completo y notas (opcional)"
                : tipo === "workspace_empresas"
                  ? "Objetivo, alcance y fechas tentativas *"
                  : "Describe tu consulta con pasos claros *"}
            </label>
            <textarea
              id="fn-msg"
              rows={4}
              className="input"
              style={{ background: "#0a0a0b", borderColor: "#2a2a2f" }}
              required={tipo !== "inscripcion_torneo"}
              maxLength={1500}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder={
                tipo === "inscripcion_torneo"
                  ? "Ej.: Titulares: Cap1, Jugador2, Jugador3, Jugador4, Jugador5 · Suplente: Sub6 · Discord del capitán: @cap1"
                  : tipo === "workspace_empresas"
                    ? "Ej.: Buscamos patrocinar una copa de 16 equipos de CS2 en junio con presencia en brackets y streams oficiales."
                    : "Ej.: Al intentar entrar a la copa de VALORANT me aparece aviso de anti-cheat; adjunto versión de VANTS PC y horario."
              }
            />
          </div>

          {error && (
            <p className="text-xs px-3 py-2" role="alert" style={{ background: "rgba(255,13,46,0.14)", border: "1px solid rgba(255,13,46,0.4)", color: "#ff8090" }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={enviando}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ background: "#ff0d2e", color: "#ffffff" }}
              data-testid="btn-enviar-formulario-nativo"
            >
              {enviando ? "Enviando…" : "Enviar formulario oficial"}
            </button>
            <span className="text-[11px] muted">
              Confirmación inmediata desde @vants.cc + botón Google Calendar sin OAuth extra.
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
