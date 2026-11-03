import { useState } from "react";
import { Link } from "wouter";
import { api, assetUrl, type Badge } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { LogrosJuego } from "./Vants";

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

const RAREZA: Record<string, string> = { common: "Común", rare: "Rara", epic: "Épica", legendary: "Legendaria" };

export function BadgeGrid({ standalone = false }: { standalone?: boolean }) {
  const q = useApi<{ badges: Badge[] }>("/api/badges");
  return (
    <Section id="insignias" eyebrow="Insignias" title={standalone ? "Catálogo completo" : "Insignias verificadas"} more={standalone ? undefined : { to: "/insignias", label: "Catálogo" }}>
      {q.isLoading ? <Skel n={2} /> : q.error ? <ErrorBox error={q.error} what="las insignias" /> : (q.data?.badges || []).length === 0 ? (
        <Empty code="insignias · 0" title="Catálogo vacío" />
      ) : (
        <div className="grid-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {(standalone ? q.data!.badges : q.data!.badges.slice(0, 10)).map((b) => (
            <div key={b.code} className="p-5 grid gap-3 content-start" data-testid={"badge-" + b.code}>
              <img src={assetUrl(b.image.webp)!} alt="" width={72} height={72} loading="lazy" style={{ width: 72, height: 72 }} />
              <div>
                <div className="d-3" style={{ color: b.color }}>{b.name}</div>
                <div className="tag mt-1.5">{RAREZA[b.rarity] || b.rarity}</div>
              </div>
              <p className="small muted">{b.description}</p>
              <p className="small" style={{ color: "var(--gris-3)" }}>Requisito: {b.requirement}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function Insignias() {
  return (
    <>
      <PageHead eyebrow="Insignias" title="Insignias VANTS" lead="Cada insignia la concede el motor de logros del servidor cuando se cumple su requisito. No se pueden activar desde la web." />
      <BadgeGrid standalone />
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
  const q = useApi<any>("/api/me/badges", { auth: true });
  const items: any[] = (q.data?.badges || []).filter((a: any) => a && a.badge && a.status === "active");
  return (
    <div className="wrap grid gap-10">
      <div className="grid gap-4">
        <h2 className="d-2">Logros de juego</h2>
        <p className="small muted -mt-2">Se calculan con tus datos reales: FACEIT, equipo, inscripciones y cuentas vinculadas.</p>
        <LogrosJuego />
      </div>
      <div className="grid gap-4">
        <h2 className="d-2">Insignias conseguidas</h2>
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="tus insignias" /> : items.length === 0 ? (
          <Empty code="insignias · 0" title="Todavía no tienes insignias" text="Las insignias las concede el motor de logros al registrarte, activar una membresía o ganar torneos oficiales." action={<Link href="/insignias" className="link-arrow">Ver requisitos <span aria-hidden>→</span></Link>} />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {items.map((a: any) => (
              <div key={a.badge.code} className="p-5 grid gap-2 content-start" data-testid={"insignia-" + a.badge.code}>
                {a.badge.image?.webp && <img src={assetUrl(a.badge.image.webp)!} alt="" width={64} height={64} />}
                <div className="d-3">{a.badge.name}</div>
                <p className="small muted">{a.badge.description}</p>
                {a.awarded_at && <div className="small muted num">Conseguida el {new Date(a.awarded_at).toLocaleDateString("es-ES")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Progreso() {
  return (
    <>
      <PageHead eyebrow="Progreso" title="Mi progreso" lead="Nivel y experiencia calculados por el servidor." />
      <AuthGate what="tu progreso"><MiProgreso /></AuthGate>
    </>
  );
}

function MiProgreso() {
  const q = useApi<any>("/api/account/progreso", { auth: true });
  return (
    <div className="wrap">
      {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="tu progreso" /> : (
        <div className="panel panel-pad grid gap-4 sm:grid-cols-3">
          {Object.entries(q.data || {}).filter(([k, v]) => k !== "ok" && (typeof v === "number" || typeof v === "string")).map(([k, v]) => (
            <div key={k}><div className="eyebrow mb-1">{k.replace(/_/g, " ")}</div><div className="d-2 num">{String(v)}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}
