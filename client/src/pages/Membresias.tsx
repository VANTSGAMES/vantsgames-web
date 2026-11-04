import { useState } from "react";
import { Link } from "wouter";
import { api, assetUrl, type Badge } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { LogrosJuegos, InsigniasVants1000, ProgresoJuegos } from "./Juegos";
import { Insignia3D, DetalleInsignia, FilaInsignias, useCatalogoInsignias, rareza, type Insignia, type EstadoInsignia } from "@/components/Insignia3D";

import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate } from "@/components/ui-vants";

/** Planes del catálogo live de Stripe (vants-functions/stripe-checkout). El alta la confirma el webhook. */
export const PLANES = [
  {
    id: "pro", kicker: "Competitivo", nombre: "VANTS PRO", precio: "4,99 € / mes · 39,99 € / año",
    lema: "Todo lo competitivo desbloqueado para subir de rango.",
    beneficios: ["Insignia PRO en tu ficha", "Sello PRO junto a tu nick", "Cola prioritaria en VANTS Ranked", "Inscripciones sin fee en torneos abiertos", "Marcos y tarjetas premium"],
    checkout: [{ period: "mo", label: "Mensual · 4,99 €" }, { period: "yr", label: "Anual · 39,99 €" }],
  },
  {
    id: "creator", kicker: "Creadores", nombre: "VANTS CREATOR", precio: "9,99 € / mes · 79,99 € / año",
    lema: "Para quienes muestran la arena: clips, streams y comunidad.",
    beneficios: ["Insignia y sello CREATOR", "Canal de clips verificado", "Destacado en la sala de jugadores", "Soporte directo con el equipo", "Kit de overlays de marca"],
    checkout: [{ period: "mo", label: "Mensual · 9,99 €" }, { period: "yr", label: "Anual · 79,99 €" }],
  },
  {
    id: "pase", kicker: "Temporada", nombre: "PASE S4", precio: "7,99 € · pago único",
    lema: "Un solo pago para toda la temporada S4 (180 días).",
    beneficios: ["Insignia PLUS en tu ficha", "Sello PRO junto a tu nick", "Inscripciones sin fee en torneos abiertos"],
    checkout: [{ period: "one_time", label: "Comprar pase · 7,99 €" }],
  },
  {
    id: "socio", kicker: "Invitación", nombre: "SOCIO VANTS", precio: "Solo por invitación",
    lema: "El programa de socios de la marca.",
    beneficios: ["Insignia SOCIO VANTS", "Voto en decisiones del circuito", "Acceso al Discord privado", "Descuentos en la tienda oficial"],
    checkout: null,
  },
] as const;

function CheckoutButtons({ plan }: { plan: (typeof PLANES)[number] }) {
  const { status, login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!plan.checkout) return <p className="small muted">La organización contacta directamente a los socios.</p>;
  if (status !== "autenticado") {
    return (
      <div className="grid gap-2">
        {AUTH_ENABLED && status === "anonimo" ? (
          <button className="btn btn-rojo w-full" onClick={() => login({ returnTo: "/membresias" })} data-testid={"button-plan-login-" + plan.id}>Inicia sesión para suscribirte</button>
        ) : (
          <p className="small muted">El pago requiere una cuenta con sesión iniciada en el dominio de VANTS.</p>
        )}
      </div>
    );
  }
  const go = async (period: string) => {
    setBusy(period); setErr(null);
    try {
      const r = await api<{ url: string }>("/fn/stripe-checkout/api/checkout/start", {
        method: "POST", auth: true,
        body: { plan: plan.id, period: period === "one_time" ? undefined : period, return_to: window.location.origin + "/membresias" },
      });
      if (r && r.url && /^https:\/\/checkout\.stripe\.com\//.test(r.url)) window.location.href = r.url;
      else setErr("Stripe no devolvió una sesión de pago válida.");
    } catch (e: any) {
      setErr("No se pudo abrir el pago (" + (e.code || "error") + ").");
    } finally { setBusy(null); }
  };
  return (
    <div className="grid gap-2">
      {plan.checkout.map((c, i) => (
        <button key={c.period} className={"btn w-full " + (i === 0 ? "btn-rojo" : "")} disabled={!!busy} onClick={() => go(c.period)} data-testid={"button-checkout-" + plan.id + "-" + c.period}>
          {busy === c.period ? "Abriendo Stripe…" : c.label}
        </button>
      ))}
      {err && <p className="small" style={{ color: "#ff5468" }} role="alert">{err}</p>}
    </div>
  );
}

export default function Membresias() {
  return (
    <>
      <PageHead eyebrow="Membresías" title={<>Elige cómo <span style={{ color: "var(--rojo)" }}>competir</span></>} lead="Pagos procesados por Stripe con impuestos incluidos. El plan se activa cuando Stripe confirma el pago al servidor; la web nunca da de alta un plan por su cuenta." />
      <div className="wrap">
        <div className="grid-auto grid md:grid-cols-2 xl:grid-cols-4">
          {PLANES.map((p) => (
            <article key={p.id} className="p-6 flex flex-col gap-5" data-testid={"plan-" + p.id} style={p.id === "pro" ? { boxShadow: "inset 0 2px 0 var(--rojo)" } : undefined}>
              <div>
                <div className="eyebrow mb-3">{p.kicker}</div>
                <h2 className="d-2">{p.nombre}</h2>
                <div className="num mt-2" style={{ color: "var(--gris-1)" }}>{p.precio}</div>
                <p className="muted small mt-3">{p.lema}</p>
              </div>
              <ul className="grid gap-2 small flex-1">
                {p.beneficios.map((b) => <li key={b} className="flex gap-2"><span style={{ color: "var(--rojo)" }} aria-hidden>▸</span>{b}</li>)}
              </ul>
              <CheckoutButtons plan={p} />
            </article>
          ))}
        </div>
        <p className="small muted mt-4">¿Ya tienes un plan? Consulta su estado en <Link href="/perfil/membresia" className="underline">Mi membresía</Link>.</p>
      </div>
      <BadgeGrid />
    </>
  );
}

const CATEGORIAS: [string, string][] = [["membresia", "Membresías"], ["identidad", "Identidad"], ["competitivo", "Competitivo"], ["comunidad", "Comunidad"]];

export function useMisInsignias() {
  const { status } = useAuth();
  return useApi<{ sello: string | null; insignias: EstadoInsignia[]; conseguidas: string[]; pid?: string }>("/int/insignias/mias", { auth: true, enabled: status === "autenticado" });
}

/** Catálogo de insignias VANTS en 3D. Se conceden solas al cumplir el requisito. */
export function BadgeGrid({ standalone = false }: { standalone?: boolean }) {
  const q = useCatalogoInsignias();
  const mias = useMisInsignias();
  const [abierta, setAbierta] = useState<Insignia | null>(null);
  const estado = new Map((mias.data?.insignias || []).map((e) => [e.code, e]));
  const logueado = !!mias.data;
  const todas = q.data?.catalogo || [];
  const lista = standalone ? todas : todas.filter((b) => b.categoria === "membresia");
  return (
    <Section id="insignias" eyebrow="Insignias" title={standalone ? "Catálogo completo" : "Insignias de los planes"} more={standalone ? undefined : { to: "/insignias", label: "Ver las " + (todas.length || 18) }}>
      {standalone && <p className="small muted -mt-3 mb-6 max-w-3xl">Las insignias se colocan solas en tu perfil en cuanto cumples el requisito: al comprar un plan, vincular cuentas, conseguir logros, ganar torneos o subir al Top 10. Si una suscripción caduca, su insignia se retira. Pulsa una para verla en 3D.</p>}
      {logueado && standalone && <p className="small mb-6"><span style={{ color: "var(--ok)" }}>{mias.data!.conseguidas.length}</span> <span className="muted">de {todas.length} conseguidas</span></p>}
      {q.isLoading ? <Skel n={2} /> : q.error ? <ErrorBox error={q.error} what="las insignias" /> : lista.length === 0 ? (
        <Empty code="insignias · 0" title="Catálogo vacío" />
      ) : (
        <div className="grid gap-10">
          {CATEGORIAS.filter(([c]) => lista.some((b) => b.categoria === c)).map(([c, t]) => (
            <div key={c} className="grid gap-4">
              {standalone && <h3 className="eyebrow">{t}</h3>}
              <div className="grid-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {lista.filter((b) => b.categoria === c).map((b) => {
                  const e = estado.get(b.code);
                  const ok = logueado ? !!e?.ok : true;
                  return (
                    <button key={b.code} type="button" onClick={() => setAbierta(b)} className="p-5 grid gap-3 content-start text-left hover:bg-[var(--grafito-2)] transition-colors group" data-testid={"badge-" + b.code}>
                      <div className="flex justify-center py-1 group-hover:scale-105 transition-transform"><Insignia3D d={b} size={104} conseguida={ok} titulo={b.nombre} /></div>
                      <div>
                        <div className="d-3" style={{ color: b.color }}>{b.nombre}</div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="tag">{rareza(b.rareza)}</span>
                          {logueado && (e?.ok ? <span className="tag" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Conseguida</span> : <span className="tag">Bloqueada</span>)}
                        </div>
                      </div>
                      <p className="small muted">{b.descripcion}</p>
                      <p className="small" style={{ color: "var(--gris-3)" }}>Requisito: {b.requisito}</p>
                      {logueado && e?.progreso && !e.ok && (
                        <div className="grid gap-1"><div className="flex justify-between text-xs muted"><span>Progreso</span><span className="num">{e.progreso.actual}/{e.progreso.meta}</span></div><div style={{ height: 4, background: "var(--grafito-3, #222)" }}><div style={{ height: 4, width: (100 * e.progreso.actual) / e.progreso.meta + "%", background: b.color }} /></div></div>
                      )}
                      <p className="text-xs muted">{b.titulares === 1 ? "1 jugador" : (b.titulares || 0) + " jugadores"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {abierta && <DetalleInsignia b={abierta} conseguida={logueado ? !!estado.get(abierta.code)?.ok : true} estado={estado.get(abierta.code)} sinEstado={!logueado} onCerrar={() => setAbierta(null)} />}
    </Section>
  );
}

export function Insignias() {
  return (
    <>
      <PageHead eyebrow="Insignias" title="Insignias VANTS" lead="Insignias oficiales en 3D que se colocan solas en tu perfil al cumplir el requisito, más 1000 insignias VANTS, una por cada logro de FACEIT y VALORANT." />
      <BadgeGrid standalone />
      <Section id="insignias-vants" eyebrow="Colección" title="1000 insignias VANTS"><InsigniasVants1000 /></Section>
    </>
  );
}

export function Logros() {
  return (
    <>
      <PageHead eyebrow="Logros" title="Mis logros" lead="Tus logros de juego e insignias, validados en el servidor." />
      <AuthGate what="tus logros"><MisLogros /></AuthGate>
    </>
  );
}

function MisLogros() {
  const q = useMisInsignias();
  return (
    <div className="wrap grid gap-10">
      <div className="grid gap-4">
        <h2 className="d-2">Logros de juego</h2>
        <p className="small muted -mt-2">1000 logros: 500 de FACEIT CS2 (se activan al vincular FACEIT) y 500 de VALORANT (se activan con tu Riot ID). Se calculan con tus datos reales.</p>
        <LogrosJuegos />
      </div>
      <div className="grid gap-4">
        <div className="flex items-end justify-between gap-3"><h2 className="d-2">Insignias conseguidas</h2><Link href="/insignias" className="link-arrow">Ver catálogo →</Link></div>
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="tus insignias" /> : (
          <div className="panel panel-pad"><FilaInsignias codes={q.data?.conseguidas || []} size={84} vacio="Todavía no tienes insignias. Mira los requisitos en el catálogo." /></div>
        )}
      </div>
    </div>
  );
}

export function Progreso() {
  return (
    <>
      <PageHead eyebrow="Progreso" title="Mi progreso" lead="Tu progreso de jugador en VANTS, FACEIT y VALORANT. FACEIT se activa al vincular la cuenta y VALORANT al conectar tu Riot ID." />
      <AuthGate what="tu progreso"><MiProgreso /></AuthGate>
    </>
  );
}

function MiProgreso() {
  return <div className="wrap"><ProgresoJuegos /></div>;
}
