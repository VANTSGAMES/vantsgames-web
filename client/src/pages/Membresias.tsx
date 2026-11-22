import { useState } from "react";
import { Link } from "wouter";
import { api, assetUrl, type Badge } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { LogrosJuegos, InsigniasVants1000, ProgresoJuegos } from "./Juegos";
import { Insignia3D, DetalleInsignia, FilaInsignias, useCatalogoInsignias, rareza, type Insignia, type EstadoInsignia } from "@/components/Insignia3D";

import { useAuth, AUTH_ENABLED } from "@/lib/auth";
import { PageHead, Section, Empty, Skel, ErrorBox, AuthGate } from "@/components/ui-vants";
import { PLANES, PLAN_COMPARISON, type PlanDef } from "@/lib/planes";
import { computeAnnualSavingsPercent } from "@/lib/discovery";

export { PLANES };

type BillingCycle = "mo" | "yr";

function formatEur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

function CheckoutButtons({ plan, billing }: { plan: PlanDef; billing: BillingCycle }) {
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
      {plan.checkout.map((c) => {
        const primary = c.period === "one_time" || c.period === billing;
        return (
          <button
            key={c.period}
            className={"btn w-full " + (primary ? "btn-rojo" : "")}
            disabled={!!busy}
            onClick={() => go(c.period)}
            data-testid={"button-checkout-" + plan.id + "-" + c.period}
          >
            {busy === c.period ? "Abriendo Stripe…" : c.label}
          </button>
        );
      })}
      {err && <p className="small" style={{ color: "#ff5468" }} role="alert">{err}</p>}
    </div>
  );
}

export default function Membresias() {
  const [billing, setBilling] = useState<BillingCycle>("yr");
  const ahorroPro = computeAnnualSavingsPercent(4.99, 39.99);

  const precioVisible = (p: PlanDef) => {
    if (p.monthlyPrice && p.annualPrice) {
      if (billing === "yr") {
        const equivMes = p.annualPrice / 12;
        return (
          <div className="mt-2">
            <div className="d-2 num" style={{ color: "var(--blanco)" }}>
              {formatEur(p.annualPrice)} <span className="small muted font-normal">/ año</span>
            </div>
            <div className="text-xs muted num mt-0.5">
              Equivale a {formatEur(equivMes)} / mes · Ahorras {computeAnnualSavingsPercent(p.monthlyPrice, p.annualPrice)}%
            </div>
          </div>
        );
      }
      return (
        <div className="mt-2">
          <div className="d-2 num" style={{ color: "var(--blanco)" }}>
            {formatEur(p.monthlyPrice)} <span className="small muted font-normal">/ mes</span>
          </div>
          <div className="text-xs muted num mt-0.5">Facturación mensual · Cancela cuando quieras</div>
        </div>
      );
    }
    return <div className="d-3 num mt-2" style={{ color: "var(--gris-1)" }}>{p.precio}</div>;
  };

  return (
    <>
      <PageHead
        eyebrow="Membresías"
        title={<>Elige cómo <span style={{ color: "var(--rojo)" }}>competir</span></>}
        lead="Pagos procesados por Stripe con impuestos incluidos. El plan se activa cuando Stripe confirma el pago al servidor; la web nunca da de alta un plan por su cuenta."
        actions={
          <div
            className="inline-flex border p-1 gap-1"
            style={{ borderColor: "var(--linea)", background: "var(--grafito-1)" }}
            role="group"
            aria-label="Ciclo de facturación"
            data-testid="billing-toggle"
          >
            <button
              type="button"
              className="px-4 h-9 text-sm font-bold uppercase tracking-wider cursor-pointer transition-colors"
              style={{
                fontFamily: "var(--f-display)",
                background: billing === "mo" ? "var(--rojo)" : "transparent",
                color: billing === "mo" ? "#fff" : "var(--gris-2)",
              }}
              aria-pressed={billing === "mo"}
              onClick={() => setBilling("mo")}
              data-testid="billing-toggle-mo"
            >
              Mensual
            </button>
            <button
              type="button"
              className="px-4 h-9 text-sm font-bold uppercase tracking-wider cursor-pointer transition-colors"
              style={{
                fontFamily: "var(--f-display)",
                background: billing === "yr" ? "var(--rojo)" : "transparent",
                color: billing === "yr" ? "#fff" : "var(--gris-2)",
              }}
              aria-pressed={billing === "yr"}
              onClick={() => setBilling("yr")}
              data-testid="billing-toggle-yr"
            >
              Anual · -{ahorroPro}%
            </button>
          </div>
        }
      />
      <div className="wrap grid gap-10">
        <div>
          <div className="grid-auto grid md:grid-cols-2 xl:grid-cols-4">
            {PLANES.map((p) => (
              <article
                key={p.id}
                className={"panel chamfer p-6 flex flex-col gap-4 flotar" + (p.id === "pro" ? " brillo-borde" : "")}
                data-testid={"plan-" + p.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">{p.kicker}</span>
                  {p.id === "pro" && <span className="tag tag-rojo">Más elegido</span>}
                </div>
                <h2 className="d-2" style={{ fontFamily: "var(--f-display)", letterSpacing: "0.03em" }}>{p.nombre}</h2>
                {precioVisible(p)}
                <p className="muted small">{p.lema}</p>
                <hr className="rule" />
                <ul className="grid gap-2 small">
                  {p.beneficios.map((b) => <li key={b} className="flex gap-2"><span style={{ color: "var(--rojo)" }} aria-hidden>▸</span>{b}</li>)}
                </ul>
                <div className="mt-auto pt-2">
                  <CheckoutButtons plan={p} billing={billing} />
                </div>
              </article>
            ))}
          </div>
          <p className="small muted mt-4">¿Ya tienes un plan? Consulta su estado en <Link href="/perfil/membresia" className="underline">Mi membresía</Link>.</p>
        </div>

        <section aria-labelledby="comparativa-planes-t" data-testid="plan-comparison-table">
          <div className="eyebrow mb-2">Comparativa directa</div>
          <h2 id="comparativa-planes-t" className="d-2 mb-5">Qué desbloquea cada plan</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left border-collapse small">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--linea)", background: "var(--grafito-2)" }}>
                  <th className="p-4 font-semibold" style={{ minWidth: 220 }}>Ventaja competitiva</th>
                  <th className="p-4 font-semibold">Gratis</th>
                  <th className="p-4 font-semibold" style={{ color: "var(--rojo)" }}>VANTS PRO</th>
                  <th className="p-4 font-semibold">VANTS CREATOR</th>
                  <th className="p-4 font-semibold">PASE S4</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b last:border-b-0" style={{ borderColor: "var(--linea-suave)" }}>
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 muted">{row.gratis}</td>
                    <td className="p-4 font-semibold" style={{ color: row.pro === "—" ? "var(--gris-3)" : "var(--blanco)" }}>{row.pro}</td>
                    <td className="p-4" style={{ color: row.creator === "—" ? "var(--gris-3)" : "var(--blanco)" }}>{row.creator}</td>
                    <td className="p-4" style={{ color: row.pase === "—" ? "var(--gris-3)" : "var(--gris-1)" }}>{row.pase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
