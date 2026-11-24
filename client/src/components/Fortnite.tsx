/**
 * Epic Games / Fortnite (Worker vants-integraciones):
 *   POST /int/epic/inicio → URL del login oficial de Epic (OAuth, basic_profile)
 *   GET  /int/epic/yo     → cuenta vinculada + estadísticas de Battle Royale
 *   POST /int/epic/desvincular
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { Insignia3D } from "@/components/Insignia3D";
import type { DefInsignia } from "@/lib/insignia3d";
import { pub } from "@/lib/api";

const DEF_FORTNITE: DefInsignia = { code: "FORTNITE", color: "#9d4dff", forma: "escudo", icono: "f", rareza: "rare" };

export type StatsFortnite = { victorias: number | null; partidas: number | null; kills: number | null; kd: number | null; winrate: number | null; top10: number | null; nivel_pase: number | null; minutos: number | null };
export type CuentaEpic = { vinculada: boolean; account_id?: string; nombre?: string | null; desde?: string; stats?: StatsFortnite | null; error_stats?: string | null };

const ERR_STATS: Record<string, string> = {
  privadas: "Tus estadísticas de Fortnite son privadas. Actívalas en Fortnite → Ajustes → Cuenta y privacidad → Mostrar estadísticas del juego.",
  sin_partidas: "Todavía no hay partidas de Battle Royale registradas en esta cuenta.",
  sin_clave: "Las estadísticas de Fortnite se activarán en cuanto el servidor tenga su clave de datos.",
};
const ERR_LINK: Record<string, string> = {
  epic_cancelado: "Cancelaste el inicio de sesión de Epic Games.",
  epic_state: "La autorización de Epic caducó. Inténtalo de nuevo.",
  epic_ya_vinculada: "Esa cuenta de Epic Games ya está vinculada a otro perfil de VANTS.",
  epic_sin_configurar: "La vinculación con Epic Games todavía no está activa en el servidor.",
};
export const mensajeEpic = (k: string) => {
  if (ERR_LINK[k]) return ERR_LINK[k];
  if (k.startsWith("intercambio_epic")) {
    // Formato: intercambio_epic_<status>_<errorCode> (p. ej. intercambio_epic_401_invalid_client)
    if (/invalid_client|unauthorized_client/.test(k)) return "Epic rechazó las credenciales de la app (invalid_client): el Client Secret guardado no corresponde al Client ID. Genera un nuevo Client Secret en el Epic Developer Portal y avisa a la organización para actualizarlo en el servidor.";
    if (/redirect/.test(k)) return "Epic rechazó la URL de retorno (redirect_uri). En el Epic Developer Portal, la app debe tener registrada exactamente: https://int.vants.cc/epic/callback";
    if (k.includes("_400")) return "El código de autorización de Epic expiró o ya se usó (" + k + "). Cierra la pestaña de Epic y vuelve a intentarlo.";
    return "Epic rechazó la autorización (" + k + "). Revisa la app en el Epic Developer Portal.";
  }
  return "No se pudo vincular Epic Games (" + k + ").";
};

const fmt = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("es", { maximumFractionDigits: d }));

export function StatsFortniteGrid({ s }: { s: StatsFortnite }) {
  const items: [string, string][] = [
    ["Victorias", fmt(s.victorias)], ["Partidas", fmt(s.partidas)], ["% victorias", s.winrate == null ? "—" : fmt(s.winrate, 1) + "%"],
    ["K/D", fmt(s.kd, 2)], ["Kills", fmt(s.kills)], ["Top 10", fmt(s.top10)],
  ];
  if (s.nivel_pase != null) items.push(["Nivel del pase", fmt(s.nivel_pase)]);
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="fortnite-stats">
      {items.map(([l, v]) => (
        <div key={l} className="grid gap-0.5"><span className="eyebrow">{l}</span><span className="num d-3">{v}</span></div>
      ))}
    </div>
  );
}

/** Panel de Fortnite (perfil propio o público). */
export function PanelFortnite({ c, propio }: { c: CuentaEpic | null | undefined; propio?: boolean }) {
  if (!c || (!c.vinculada && !c.nombre)) {
    return propio ? <p className="small muted">Vincula tu cuenta de Epic Games en Cuentas vinculadas para mostrar tus estadísticas de Fortnite.</p> : null;
  }
  return (
    <div className="panel panel-pad grid gap-4 content-start" data-testid="panel-fortnite" style={{ boxShadow: "inset 0 2px 0 #9d4dff" }}>
      <div className="flex items-center gap-3">
        <Insignia3D d={DEF_FORTNITE} size={44} titulo="FORTNITE" />
        <div className="grid">
          <span className="eyebrow">Fortnite · Epic Games</span>
          <span className="d-3">{c.nombre || "Cuenta de Epic"}</span>
        </div>
        <span className="tag tag-ok ml-auto">Verificada</span>
      </div>
      {c.stats ? <StatsFortniteGrid s={c.stats} /> : <p className="small muted">{!propio && c.error_stats === "privadas" ? "Este jugador tiene sus estadísticas de Fortnite en privado." : ERR_STATS[c.error_stats || ""] || "No se pudieron cargar las estadísticas de Fortnite."}</p>}
    </div>
  );
}

export function useCuentaEpic(enabled = true) {
  return useApi<CuentaEpic>("/int/epic/yo", { auth: true, enabled });
}

/** Tarjeta de vinculación en /perfil/cuentas. */
export function TarjetaEpic() {
  const qc = useQueryClient();
  const q = useCuentaEpic();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ko = sp.get("linkerr");
    if (sp.get("linked") === "epic") setOk(true);
    else if (ko && (ko.startsWith("epic") || ko.startsWith("intercambio_epic"))) setErr(ko);
  }, []);
  const conectar = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>("/int/epic/inicio", { method: "POST", auth: true });
      window.location.assign(r.url);
    } catch (e: any) { setErr(e.code); setBusy(false); }
  };
  const quitar = async () => {
    setBusy(true);
    try { await api("/int/epic/desvincular", { method: "POST", auth: true }); await qc.invalidateQueries({ queryKey: ["/int/epic/yo", true] }); setOk(false); }
    catch (e: any) { setErr(e.code); }
    finally { setBusy(false); }
  };
  const c = q.data;
  const conectada = !!c?.vinculada;
  return (
    <div className="p-5 grid gap-3" data-testid="cuenta-epic">
      <div className="flex items-center gap-3">
        <img src={pub("brand/logo-epic.svg")} alt="Epic Games" width={32} height={32} style={{ width: 32, height: 32 }} aria-hidden="true" />
        <span className="d-3">Epic Games · Fortnite</span>
        <span className={(conectada ? "tag tag-ok" : "tag") + " ml-auto"} data-testid="estado-epic">{q.isLoading ? "…" : conectada ? "Conectada" : "Desconectada"}</span>
      </div>
      {ok && conectada && <p className="small" style={{ color: "var(--ok)" }}>Cuenta de Epic Games vinculada. Ya tienes la insignia FORTNITE.</p>}
      {conectada && <p className="small muted">Cuenta verificada: <b style={{ color: "var(--gris-1)" }}>{c?.nombre || c?.account_id}</b></p>}
      {err && <p className="small" style={{ color: "#ff5468" }}>{mensajeEpic(err)}</p>}
      {!conectada && <p className="small muted">Inicia sesión con Epic Games para verificar tu cuenta de Fortnite, mostrar tus estadísticas y desbloquear la insignia FORTNITE.</p>}
      {conectada
        ? <button className="btn btn-sm w-fit" disabled={busy} onClick={quitar} data-testid="button-desconectar-epic">{busy ? "Quitando…" : "Desconectar"}</button>
        : <button className="btn btn-sm w-fit" disabled={busy || q.isLoading} onClick={conectar} data-testid="button-conectar-epic">{busy ? "Abriendo…" : "Conectar Epic Games"}</button>}
    </div>
  );
}
