import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";

/* Datos de vants-integraciones (/int/yo): FACEIT real + estado + directos. */
export type Jugador = { id: string; nickname: string; avatar: string | null; pais: string | null; nivel: number | null; elo: number | null; region: string | null; url: string };
export type Estad = { partidas: number | null; victorias: number | null; winrate: number | null; kd: number | null; hs: number | null; adr: number | null; racha: number | null; mejor_racha: number | null; recientes: boolean[] };
export type Partida = { id: string | null; mapa: string | null; victoria: boolean; marcador: string | null; kills: number | null; muertes: number | null; asistencias: number | null; kd: number | null; adr: number | null; hs: number | null; fecha: string | null; url: string | null };
export type Equipo = { tipo: "faceit" | "ultima_partida"; id?: string; nombre: string; tag?: string | null; avatar: string | null; url: string | null; jugadores: { id: string; nickname: string; avatar: string | null; nivel: number | null; elo?: number | null; lider?: boolean; url: string }[];
  estadisticas?: { partidas: number | null; victorias: number | null; winrate: number | null; racha: number | null; mejor_racha: number | null; recientes: boolean[]; mapas: { mapa: string; partidas: number | null; winrate: number | null }[] } | null; partidas?: Partida[] };
export type Directo = { plataforma: "twitch" | "kick"; canal: string; nombre: string; en_vivo: boolean; titulo: string | null; juego: string | null; espectadores: number | null; miniatura: string | null; url: string };
export type Yo = {
  faceit: { jugador: Jugador; estadisticas: Estad | null; partidas: Partida[]; equipo: Equipo | null } | null;
  actual: { estado: "en_partida" | "buscando" | "desconectado"; cola?: string | null; url?: string | null; ultima_actividad?: string } | null;
  error_faceit: string | null; faceit_vinculado: boolean;
  canales: { twitch: string | null; kick: string | null };
  directos: Directo[];
};

export function useYo() {
  return useApi<Yo>("/int/yo", { auth: true, refetchMs: 60_000 });
}

const COLOR_NIVEL = ["#eee", "#eee", "#1ce400", "#1ce400", "#ffc800", "#ffc800", "#ffc800", "#ff6309", "#ff6309", "#ff6309", "#fe1f00"];
export function NivelFaceit({ n, size = 34 }: { n: number | null; size?: number }) {
  if (!n) return null;
  return (
    <span title={"Nivel " + n + " de FACEIT"} style={{ width: size, height: size, borderRadius: 999, border: "3px solid " + COLOR_NIVEL[n], display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.42, color: COLOR_NIVEL[n], background: "#1b1b1b", flex: "none" }} data-testid="nivel-faceit">{n}</span>
  );
}

function EstadoPill({ yo }: { yo: Yo }) {
  const vivo = yo.directos.find((d) => d.en_vivo);
  const a = yo.actual;
  return (
    <div className="flex flex-wrap gap-2" data-testid="estado-jugador">
      {a?.estado === "en_partida" ? <a href={a.url || "#"} target="_blank" rel="noopener noreferrer" className="tag tag-rojo"><span className="dot-live" /> En partida · {a.cola || "FACEIT"}</a>
        : a?.estado === "buscando" ? <span className="tag tag-aviso">Preparando partida en FACEIT</span>
        : <span className="tag">No está en partida</span>}
      {yo.directos.map((d) => d.en_vivo ? (
        <a key={d.plataforma} href={d.url} target="_blank" rel="noopener noreferrer" className="tag tag-rojo"><span className="dot-live" /> En directo en {d.plataforma === "twitch" ? "Twitch" : "Kick"}{d.espectadores != null ? " · " + d.espectadores : ""}</a>
      ) : (
        <a key={d.plataforma} href={d.url} target="_blank" rel="noopener noreferrer" className="tag">{d.plataforma === "twitch" ? "Twitch" : "Kick"} · desconectado</a>
      ))}
      {!vivo && yo.directos.length === 0 && <Link href="/perfil/ajustes" className="tag">Añadir canal de Twitch o Kick</Link>}
    </div>
  );
}

const fmt = (v: number | null | undefined, suf = "") => (v == null ? "—" : String(v) + suf);
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es", { day: "2-digit", month: "short" }) : "");

/** Ficha de FACEIT. En «Mi perfil» se muestra sin la tabla; en «Estadísticas» con últimos resultados y partidas. */
export function PanelFaceit({ partidas: conPartidas = false }: { partidas?: boolean } = {}) {
  const q = useYo();
  if (q.isLoading) return <div className="panel panel-pad"><div className="sk" style={{ height: 90 }} /></div>;
  if (q.error) return <div className="panel panel-pad small muted">No se pudo leer tu perfil de FACEIT ({q.error.code}).</div>;
  const yo = q.data!;
  if (!yo.faceit_vinculado) return (
    <div className="panel panel-pad flex flex-wrap items-center justify-between gap-4" data-testid="faceit-sin-vincular">
      <div><div className="eyebrow mb-1">FACEIT</div><p className="small muted">Vincula tu cuenta de FACEIT para ver tu nivel, ELO, partidas y equipo.</p></div>
      <Link href="/perfil/cuentas" className="btn btn-sm btn-rojo">Vincular FACEIT</Link>
    </div>
  );
  if (!yo.faceit) return <div className="panel panel-pad small muted">FACEIT no respondió ({yo.error_faceit || "sin datos"}). Se reintenta en un minuto.</div>;
  const { jugador: j, estadisticas: e, partidas } = yo.faceit;
  return (
    <div className="grid gap-6">
      <div className="panel panel-pad flex flex-wrap items-center gap-5" data-testid="panel-faceit">
        {j.avatar ? <img src={j.avatar} alt="" width={72} height={72} className="chamfer" /> : null}
        <div className="min-w-0 grow">
          <div className="eyebrow mb-1">FACEIT · CS2{j.region ? " · " + j.region : ""}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href={j.url} target="_blank" rel="noopener noreferrer" className="d-2" data-testid="faceit-nick">{j.nickname}</a>
            <NivelFaceit n={j.nivel} />
            <span className="d-3" data-testid="faceit-elo">{fmt(j.elo)} <span className="small muted">ELO</span></span>
          </div>
          <div className="mt-3"><EstadoPill yo={yo} /></div>
        </div>
      </div>
      {e && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-6" data-testid="faceit-stats">
          {[["Partidas", fmt(e.partidas)], ["Victorias", fmt(e.winrate, " %")], ["K/D", fmt(e.kd)], ["HS", fmt(e.hs, " %")], ["ADR", fmt(e.adr)], ["Racha", fmt(e.racha)]].map(([l, v]) => (
            <div key={l} className="panel panel-pad"><div className="eyebrow mb-1">{l}</div><div className="d-3">{v}</div></div>
          ))}
        </div>
      )}
      {conPartidas && e && e.recientes.length > 0 && (
        <div className="flex gap-1 items-center"><span className="small muted mr-2">Últimos resultados</span>{e.recientes.map((w, i) => <span key={i} className={"tag " + (w ? "" : "tag-rojo")} style={w ? { color: "var(--ok)" } : undefined}>{w ? "V" : "D"}</span>)}</div>
      )}
      {conPartidas && <TablaPartidas partidas={partidas} />}
    </div>
  );
}

export function TablaPartidas({ partidas }: { partidas: Partida[] }) {
  if (!partidas.length) return <div className="panel panel-pad small muted">Aún no hay partidas de CS2 en FACEIT.</div>;
  return (
    <div className="panel overflow-x-auto" data-testid="faceit-partidas">
      <table className="w-full small">
        <thead><tr className="muted text-left">{["Fecha", "Mapa", "Resultado", "Marcador", "K / D / A", "K/D", "ADR", "HS"].map((h) => <th key={h} className="p-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {partidas.map((p, i) => (
            <tr key={p.id || i} style={{ borderTop: "1px solid var(--grafito-2)" }}>
              <td className="p-3">{fecha(p.fecha)}</td>
              <td className="p-3">{(p.mapa || "").replace(/^de_/, "")}</td>
              <td className="p-3" style={{ color: p.victoria ? "var(--ok)" : "#ff5468", fontWeight: 700 }}>{p.victoria ? "Victoria" : "Derrota"}</td>
              <td className="p-3">{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="link-arrow">{p.marcador || "Ver"}</a> : p.marcador}</td>
              <td className="p-3">{fmt(p.kills)} / {fmt(p.muertes)} / {fmt(p.asistencias)}</td>
              <td className="p-3">{fmt(p.kd)}</td>
              <td className="p-3">{fmt(p.adr)}</td>
              <td className="p-3">{fmt(p.hs, " %")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EquipoFaceit({ pie }: { pie?: (actual: string | null) => JSX.Element }) {
  const q = useYo();
  if (q.isLoading) return <div className="wrap"><div className="sk" style={{ height: 120 }} /></div>;
  const eq = q.data?.faceit?.equipo;
  const extra = q.data?.faceit_vinculado && pie ? <div className="wrap mt-4">{pie(eq && eq.tipo === "faceit" && eq.id ? eq.id : null)}</div> : null;
  if (!eq) return <><div className="wrap"><div className="panel panel-pad small muted">{q.data?.faceit_vinculado ? "Tu cuenta de FACEIT no pertenece a ningún equipo. Vincula el equipo que creaste en FACEIT con su enlace." : <>Vincula FACEIT en <Link href="/perfil/cuentas" className="link-arrow">Cuentas vinculadas</Link> para ver tu equipo.</>}</div></div>{extra}</>;
  return <><EquipoFaceitVista eq={eq} />{extra}</>;
}

function EquipoFaceitVista({ eq }: { eq: Equipo }) {
  const st = eq.estadisticas;
  return (
    <div className="wrap grid gap-4" data-testid="faceit-equipo">
      <div className="panel panel-pad flex items-center gap-4">
        {eq.avatar ? <img src={eq.avatar} alt="" width={56} height={56} className="chamfer" /> : null}
        <div>
          <div className="eyebrow mb-1">{eq.tipo === "faceit" ? "Equipo de FACEIT" : "Tu equipo en la última partida"}</div>
          {eq.url ? <a href={eq.url} target="_blank" rel="noopener noreferrer" className="d-3">{eq.nombre}</a> : <span className="d-3">{eq.nombre}</span>}{eq.tag ? <span className="small muted"> · {eq.tag}</span> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {eq.jugadores.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="panel panel-pad flex items-center gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"jugador-" + p.nickname}>
            {p.avatar ? <img src={p.avatar} alt="" width={40} height={40} className="rounded-full" loading="lazy" /> : <span style={{ width: 40, height: 40 }} className="rounded-full bg-[var(--grafito-2)]" />}
            <span className="min-w-0 grow"><span className="block truncate">{p.nickname}</span><span className="small muted num">{p.elo != null ? p.elo + " ELO" : ""}{p.lider ? " · Líder" : ""}</span></span>
            <NivelFaceit n={p.nivel} size={26} />
          </a>
        ))}
      </div>
      {st && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5" data-testid="faceit-equipo-stats">
          {[["Partidas", fmt(st.partidas)], ["Victorias", fmt(st.victorias)], ["Win %", fmt(st.winrate, " %")], ["Racha", fmt(st.racha)], ["Mejor racha", fmt(st.mejor_racha)]].map(([l, v]) => (
            <div key={l} className="panel panel-pad"><div className="eyebrow mb-1">{l}</div><div className="d-3">{v}</div></div>
          ))}
        </div>
      )}
      {st && st.recientes.length > 0 && <div className="flex gap-1 items-center"><span className="small muted mr-2">Últimos resultados del equipo</span>{st.recientes.map((w, i) => <span key={i} className={"tag " + (w ? "" : "tag-rojo")} style={w ? { color: "var(--ok)" } : undefined}>{w ? "V" : "D"}</span>)}</div>}
      {st && st.mapas.length > 0 && <div className="flex flex-wrap gap-2">{st.mapas.map((m) => <span key={m.mapa} className="tag">{m.mapa.replace(/^de_/, "")} · {m.partidas} · {fmt(m.winrate, " %")}</span>)}</div>}
      {eq.tipo === "faceit" && <div className="grid gap-2"><h3 className="d-3">Partidas con el equipo</h3><TablaPartidas partidas={eq.partidas || []} /></div>}
    </div>
  );
}

export function EstadisticasFaceit() {
  return <div className="wrap"><PanelFaceit partidas /></div>;
}

export function CanalesForm() {
  const qc = useQueryClient();
  const q = useYo();
  const [tw, setTw] = useState("");
  const [kk, setKk] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  useEffect(() => { if (q.data) { setTw(q.data.canales.twitch || ""); setKk(q.data.canales.kick || ""); } }, [q.data?.canales.twitch, q.data?.canales.kick]);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSt({ k: "guardando" });
    try {
      await api("/int/canales", { method: "POST", auth: true, body: { twitch: tw.trim(), kick: kk.trim() } });
      await qc.invalidateQueries({ queryKey: ["/int/yo", true] });
      setSt({ k: "ok" });
    } catch (e: any) {
      setSt({ k: "error", m: e.code === "canal_invalido" ? "Usa el nombre del canal (letras, números y guion bajo)." : "No se pudo guardar (" + e.code + ")." });
    }
  };
  return (
    <form onSubmit={submit} className="panel panel-pad grid gap-4 max-w-xl" data-testid="form-canales">
      <h2 className="d-3">Canales de directo</h2>
      <p className="small muted">Cuando entres en directo, la web lo muestra en tu perfil, avisa en la campana y publica en el canal #directos de Discord.</p>
      <div className="field"><label htmlFor="tw">Twitch</label><input id="tw" className="input" value={tw} onChange={(e) => setTw(e.target.value)} placeholder="tu_canal" maxLength={60} data-testid="input-twitch" /></div>
      <div className="field"><label htmlFor="kk">Kick</label><input id="kk" className="input" value={kk} onChange={(e) => setKk(e.target.value)} placeholder="tu_canal" maxLength={60} data-testid="input-kick" /></div>
      <div className="flex items-center gap-3">
        <button className="btn btn-rojo" disabled={st.k === "guardando"} data-testid="button-guardar-canales">{st.k === "guardando" ? "Guardando…" : "Guardar canales"}</button>
        {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">Guardado.</span>}
        {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
      </div>
    </form>
  );
}
