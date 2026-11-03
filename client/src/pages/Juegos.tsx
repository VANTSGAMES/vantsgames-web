/**
 * 1000 logros de juego (500 FACEIT CS2 + 500 VALORANT), sus 1000 insignias VANTS,
 * Mi progreso (VANTS + FACEIT + VALORANT), Riot ID y equipo de FACEIT.
 * Datos de vants-integraciones: /int/logros/catalogo (público), /int/logros/estado,
 * /int/progreso, /int/riot, /int/faceit/equipo.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Skel, ErrorBox, Empty } from "@/components/ui-vants";
import { NivelFaceit } from "./PerfilFaceit";
import { LogrosJuego } from "./Vants";

/* ------------------------------------------------------------------ tipos */
export type LogroCat = { c: string; j: "faceit" | "valorant"; cat: string; k: string; m: number; n: string; d: string; t: number };
type EstadoJuego = { activo: boolean; conseguidos: number; total: number; valores: Record<string, number | null> };
export type EstadoLogros = {
  faceit: EstadoJuego & { vinculado: boolean; error: string | null; nick: string | null; nivel: number | null; elo: number | null };
  valorant: EstadoJuego & { riot: string | null; fuente: string | null; aviso: string | null };
  conseguidos: Record<string, string>;
};
type PartidaValo = { id: string | null; mapa: string | null; agente: string | null; victoria: boolean; marcador: string | null; kills: number; muertes: number; asistencias: number; acs: number | null; fecha: string | null };
export type Progreso = {
  vants: { xp: number; logros: number; total: number };
  faceit: { activo: boolean; vinculado: boolean; error: string | null; nick: string | null; nivel: number | null; elo: number | null;
    nivel_progreso: { nivel: number; elo: number; desde: number; hasta: number | null; progreso: number; falta: number; siguiente: number | null } | null;
    stats: Record<string, number | null> | null; logros: { conseguidos: number; total: number } };
  valorant: { activo: boolean; riot: string | null; fuente: string | null; aviso: string | null; tier_id: number | null; tier: string | null; icono: string | null; rr: number | null; elo: number | null;
    pico: string | null; pico_icono: string | null; nivel_cuenta: number | null; tarjeta: string | null; region: string | null; competitivas: number | null; victorias: number | null;
    stats: Record<string, number | null> | null; partidas: PartidaValo[]; logros: { conseguidos: number; total: number } };
};

export function useCatalogo() {
  return useApi<{ total: number; logros: LogroCat[] }>("/int/logros/catalogo");
}
export function useEstadoLogros() {
  const { status } = useAuth();
  return useApi<EstadoLogros>(status === "autenticado" ? "/int/logros/estado" : null, { auth: true });
}
export function useProgresoJuegos() {
  const { status } = useAuth();
  return useApi<Progreso>(status === "autenticado" ? "/int/progreso" : null, { auth: true, refetchMs: 120_000 });
}

/* ------------------------------------------------------------- insignias */
const TIER_COLOR = ["", "#b0793f", "#c3ccd9", "#e3b341", "#35c8d8", "#a45de8", "#ff4655"];
const TIER_NOMBRE = ["", "Bronce", "Plata", "Oro", "Platino", "Diamante", "Élite"];
const ETIQ: Record<string, string> = {
  nivel: "NIVEL", elo: "ELO", partidas: "PARTIDAS", victorias: "WINS", kd: "K/D", hs: "HS %", adr: "ADR", winrate: "WIN %",
  mejor_racha: "RACHA", racha: "EN RACHA", kills: "BAJAS", headshots: "HEADSHOT", mvps: "MVP", asistencias: "ASIST.", triples: "3K", quadros: "4K",
  aces: "ACE", dobles: "2K", max_kills: "BAJAS/P", max_adr: "ADR/P", max_hs: "HS/P", clutch_1v1: "1V1", clutch_1v2: "1V2", entry: "ENTRY",
  sniper: "AWP", pistola: "PISTOLA", cuchillo: "CUCHILLO", zeus: "ZEUS", utilidad: "UTILIDAD", flashes: "FLASH", tier: "RANGO", pico: "PICO",
  rr: "RR", nivel_cuenta: "NIVEL", dano: "DAÑO", max_acs: "ACS",
};
const corto = (m: number) => (m >= 1000 ? (m % 1000 === 0 ? m / 1000 : (m / 1000).toFixed(1)) + "K" : m < 10 && !Number.isInteger(m) ? m.toFixed(2) : String(m));
function etiqueta(l: LogroCat): { arriba: string; centro: string } {
  const mm = l.k.match(/^(mapa|agente)_([a-z0-9]+)_(partidas|victorias|kills)$/);
  if (mm) return { arriba: mm[2].toUpperCase().slice(0, 8), centro: corto(l.m) + (mm[3] === "victorias" ? "W" : mm[3] === "kills" ? "K" : "") };
  return { arriba: ETIQ[l.k] || l.k.toUpperCase().slice(0, 8), centro: corto(l.m) };
}
const iconoTier = (id: number) => "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/" + id + "/largeicon.png";

/** Insignia VANTS de un logro: hexágono naranja para FACEIT, rombo rojo para VALORANT. */
export function InsigniaVants({ l, ok, size = 64 }: { l: LogroCat; ok: boolean; size?: number }) {
  const c = TIER_COLOR[l.t] || "#888";
  const { arriba, centro } = etiqueta(l);
  const faceit = l.j === "faceit";
  const forma = faceit ? "M32 3 L57 17.5 L57 46.5 L32 61 L7 46.5 L7 17.5 Z" : "M32 2 L62 32 L32 62 L2 32 Z";
  const acento = faceit ? "#ff5500" : "#ff4655";
  const rangoIcono = !faceit && (l.k === "tier" || l.k === "pico");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={"Insignia " + l.n} style={{ filter: ok ? undefined : "grayscale(1)", opacity: ok ? 1 : 0.4, flex: "none" }}>
      <path d={forma} fill="#121214" stroke={c} strokeWidth={3.5} />
      <path d={forma} fill="none" stroke={acento} strokeWidth={1} transform="translate(32 32) scale(0.82) translate(-32 -32)" opacity={0.8} />
      {rangoIcono ? (
        <image href={iconoTier(l.m)} x={16} y={14} width={32} height={32} />
      ) : (
        <text x={32} y={37} textAnchor="middle" fontSize={centro.length > 4 ? 11 : 14} fontWeight={800} fill="#fff" fontFamily="inherit">{centro}</text>
      )}
      <text x={32} y={rangoIcono ? 53 : 24} textAnchor="middle" fontSize={arriba.length > 7 ? 5.2 : 6.2} fontWeight={700} fill={c} fontFamily="inherit" letterSpacing={0.3}>{arriba}</text>
      {!rangoIcono && <text x={32} y={48} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={acento} fontFamily="inherit">{faceit ? "CS2" : "VAL"}</text>}
    </svg>
  );
}

/* ------------------------------------------------------------- logros 1000 */
type Juego = "faceit" | "valorant" | "vants";
const POR_PAGINA = 48;

function ActivarJuego({ juego }: { juego: "faceit" | "valorant" }) {
  return juego === "faceit" ? (
    <div className="panel panel-pad flex flex-wrap items-center justify-between gap-3" data-testid="activar-faceit">
      <p className="small muted">Los 500 logros de FACEIT se activan al vincular tu cuenta de FACEIT.</p>
      <Link href="/perfil/cuentas" className="btn btn-sm btn-rojo">Vincular FACEIT</Link>
    </div>
  ) : (
    <div className="panel panel-pad grid gap-3" data-testid="activar-valorant">
      <p className="small muted">Los 500 logros de VALORANT se activan al conectar tu cuenta de Riot con tu Riot ID.</p>
      <RiotIdForm compacto />
    </div>
  );
}

/** Lista completa con pestañas FACEIT / VALORANT / VANTS, filtros y paginación. */
export function LogrosJuegos({ inicial = "faceit" as Juego }: { inicial?: Juego }) {
  const cat = useCatalogo();
  const est = useEstadoLogros();
  const [juego, setJuego] = useState<Juego>(inicial);
  const [filtro, setFiltro] = useState<"todos" | "ok" | "pend">("todos");
  const [categoria, setCategoria] = useState("");
  const [buscar, setBuscar] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  useEffect(() => setN(POR_PAGINA), [juego, filtro, categoria, buscar]);
  const lista = useMemo(() => (cat.data?.logros || []).filter((l) => l.j === juego), [cat.data, juego]);
  const cats = useMemo(() => Array.from(new Set(lista.map((l) => l.cat))), [lista]);
  if (cat.isLoading || est.isLoading) return <Skel n={3} />;
  if (cat.error) return <ErrorBox error={cat.error} what="el catálogo de logros" />;
  if (est.error) return <ErrorBox error={est.error} what="tus logros" />;
  const e = est.data;
  const ok = e?.conseguidos || {};
  const g = juego === "vants" ? null : e?.[juego];
  const q = buscar.trim().toLowerCase();
  const vis = lista.filter((l) => (filtro === "todos" || (filtro === "ok") === !!ok[l.c]) && (!categoria || l.cat === categoria) && (!q || l.n.toLowerCase().includes(q) || l.d.toLowerCase().includes(q)));
  // Conseguidos primero, después los más cercanos a completarse.
  const pct = (l: LogroCat) => { const v = g?.valores?.[l.k]; return v == null ? 0 : Math.min(1, v / l.m); };
  vis.sort((a, b) => (ok[b.c] ? 1 : 0) - (ok[a.c] ? 1 : 0) || pct(b) - pct(a));
  return (
    <div className="grid gap-5" data-testid="logros-1000">
      <div className="tabs" role="tablist">
        {([["faceit", "FACEIT CS2", e ? e.faceit.conseguidos + "/500" : ""], ["valorant", "VALORANT", e ? e.valorant.conseguidos + "/500" : ""], ["vants", "VANTS", ""]] as const).map(([id, l, c]) => (
          <button key={id} role="tab" aria-selected={juego === id} className="tab" onClick={() => setJuego(id)} data-testid={"tab-logros-" + id}>{l} {c && <span className="muted num">{c}</span>}</button>
        ))}
      </div>
      {juego === "vants" ? <LogrosJuego /> : (
        <>
          {g && (
            <div className="flex items-center gap-4">
              <div className="num d-2">{g.conseguidos}<span className="muted">/500</span></div>
              <div className="grow h-2 bg-[var(--grafito-2)]" aria-hidden><div className="h-2" style={{ width: (100 * g.conseguidos) / 500 + "%", background: "var(--rojo)" }} /></div>
            </div>
          )}
          {g && !g.activo && <ActivarJuego juego={juego} />}
          {juego === "valorant" && e?.valorant.activo && e.valorant.fuente === "bot" && (
            <p className="small muted">Rango leído del bot de Discord. Las estadísticas por partida, agente y mapa se completan cuando el servidor tenga acceso a la API de VALORANT.</p>
          )}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="field"><label htmlFor="lg-f">Mostrar</label><select id="lg-f" className="input" value={filtro} onChange={(ev) => setFiltro(ev.target.value as any)}><option value="todos">Todos</option><option value="ok">Conseguidos</option><option value="pend">Pendientes</option></select></div>
            <div className="field"><label htmlFor="lg-c">Categoría</label><select id="lg-c" className="input" value={categoria} onChange={(ev) => setCategoria(ev.target.value)}><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field grow"><label htmlFor="lg-b">Buscar</label><input id="lg-b" className="input" value={buscar} onChange={(ev) => setBuscar(ev.target.value)} placeholder="Mirage, Jett, ELO…" /></div>
            <span className="small muted num pb-2">{vis.length} logros</span>
          </div>
          {vis.length === 0 ? <Empty code="logros · 0" title="Ningún logro coincide con el filtro" /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {vis.slice(0, n).map((l) => {
                const hecho = !!ok[l.c];
                const v = g?.valores?.[l.k];
                return (
                  <div key={l.c} className="panel panel-pad flex gap-3 items-start" style={{ borderColor: hecho ? "rgba(61,220,132,.35)" : undefined }} data-testid={"logro-" + l.c}>
                    <InsigniaVants l={l} ok={hecho} size={56} />
                    <div className="min-w-0 grid gap-1 grow">
                      <div className="flex items-center justify-between gap-2"><span className="eyebrow truncate">{l.cat}</span>{hecho ? <span className="tag tag-ok">Conseguido</span> : <span className="tag">{TIER_NOMBRE[l.t]}</span>}</div>
                      <div className="font-semibold leading-tight">{l.n}</div>
                      <p className="small muted">{l.d}</p>
                      {hecho ? <span className="small muted num">Desde {new Date(ok[l.c].replace(" ", "T") + "Z").toLocaleDateString("es-ES")}</span> : v != null && g?.activo ? (
                        <div className="grid gap-1"><div className="h-1.5 bg-[var(--grafito-2)]"><div className="h-1.5" style={{ width: Math.min(100, (100 * v) / l.m) + "%", background: "var(--rojo)" }} /></div><span className="small muted num">{l.k === "tier" || l.k === "pico" ? "Ahora: tier " + v : v + " / " + l.m}</span></div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {vis.length > n && <button className="btn w-fit mx-auto" onClick={() => setN(n + POR_PAGINA * 2)} data-testid="button-mas-logros">Ver más ({vis.length - n} restantes)</button>}
        </>
      )}
    </div>
  );
}

/** Resumen corto para el perfil: contadores + últimos conseguidos. */
export function ResumenLogros() {
  const cat = useCatalogo();
  const est = useEstadoLogros();
  if (cat.isLoading || est.isLoading) return <Skel n={1} />;
  if (est.error || cat.error || !est.data) return <p className="small muted">No se pudieron leer tus logros.</p>;
  const ok = est.data.conseguidos;
  const porCode = new Map((cat.data?.logros || []).map((l) => [l.c, l]));
  const ultimos = Object.entries(ok).sort((a, b) => b[1].localeCompare(a[1]) || b[0].localeCompare(a[0])).map(([c]) => porCode.get(c)).filter(Boolean).slice(0, 10) as LogroCat[];
  return (
    <div className="grid gap-4" data-testid="resumen-logros">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["faceit", "valorant"] as const).map((j) => {
          const g = est.data![j];
          return (
            <Link key={j} href="/logros" className="panel panel-pad grid gap-2 hover:bg-[var(--grafito-2)] transition-colors">
              <div className="flex justify-between items-center"><span className="eyebrow">{j === "faceit" ? "FACEIT CS2" : "VALORANT"}</span>{g.activo ? <span className="tag tag-ok">Activo</span> : <span className="tag">{j === "faceit" ? "Vincula FACEIT" : "Añade tu Riot ID"}</span>}</div>
              <div className="num d-3">{g.conseguidos}<span className="muted">/500</span></div>
              <div className="h-1.5 bg-[var(--grafito-2)]"><div className="h-1.5" style={{ width: (100 * g.conseguidos) / 500 + "%", background: "var(--rojo)" }} /></div>
            </Link>
          );
        })}
      </div>
      {ultimos.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Últimas insignias">{ultimos.map((l) => <span key={l.c} title={l.n}><InsigniaVants l={l} ok size={48} /></span>)}</div>
      )}
    </div>
  );
}

/** Colección de las 1000 insignias VANTS (una por logro de juego). */
export function InsigniasVants1000() {
  const cat = useCatalogo();
  const est = useEstadoLogros();
  const [juego, setJuego] = useState<"faceit" | "valorant">("faceit");
  const [soloMias, setSoloMias] = useState(false);
  const [n, setN] = useState(120);
  useEffect(() => setN(120), [juego, soloMias]);
  if (cat.isLoading) return <Skel n={2} />;
  if (cat.error) return <ErrorBox error={cat.error} what="las insignias" />;
  const ok = est.data?.conseguidos || {};
  const lista = (cat.data?.logros || []).filter((l) => l.j === juego && (!soloMias || ok[l.c]));
  const mias = (cat.data?.logros || []).filter((l) => ok[l.c]).length;
  return (
    <div className="grid gap-5" data-testid="insignias-1000">
      <div className="flex flex-wrap items-center gap-3">
        <div className="tabs grow" role="tablist">
          <button role="tab" className="tab" aria-selected={juego === "faceit"} onClick={() => setJuego("faceit")}>FACEIT CS2 · 500</button>
          <button role="tab" className="tab" aria-selected={juego === "valorant"} onClick={() => setJuego("valorant")}>VALORANT · 500</button>
        </div>
        {est.data && <label className="small flex items-center gap-2"><input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} /> Solo las mías ({mias})</label>}
      </div>
      <p className="small muted">Cada logro de juego desbloquea su insignia. El color del borde indica la dificultad: bronce, plata, oro, platino, diamante y élite.</p>
      {lista.length === 0 ? <Empty code="insignias · 0" title="Aún no tienes insignias de este juego" /> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))" }}>
          {lista.slice(0, n).map((l) => (
            <div key={l.c} className="grid justify-items-center gap-1 p-2 text-center" title={l.n + " · " + l.d} data-testid={"insignia-" + l.c}>
              <InsigniaVants l={l} ok={!est.data || !!ok[l.c]} size={60} />
              <span className="small leading-tight" style={{ fontSize: 11, color: ok[l.c] ? "var(--blanco)" : "var(--gris-2)" }}>{l.n}</span>
            </div>
          ))}
        </div>
      )}
      {lista.length > n && <button className="btn w-fit mx-auto" onClick={() => setN(n + 240)}>Ver más ({lista.length - n})</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ Riot ID */
const ERR_RIOT: Record<string, string> = {
  riot_invalido: "Usa el formato Nombre#TAG (por ejemplo Kick Feispla#000).",
  riot_no_encontrado: "Riot no tiene ninguna cuenta con ese Riot ID. Revisa el nombre y el tag.",
  sin_sesion: "Inicia sesión para guardar tu Riot ID.",
};
export function RiotIdForm({ compacto = false }: { compacto?: boolean }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const q = useApi<{ riot: string | null; verificado: boolean; hdev: boolean }>(status === "autenticado" ? "/int/riot" : null, { auth: true });
  const [v, setV] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  useEffect(() => { if (q.data?.riot) setV(q.data.riot); }, [q.data?.riot]);
  const refrescar = () => Promise.all(["/int/riot", "/int/progreso", "/int/logros/estado"].map((k) => qc.invalidateQueries({ queryKey: [k, true] })));
  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    setSt({ k: "guardando" });
    try {
      const r = await api<any>("/int/riot", { method: "POST", auth: true, body: { riot: v.trim() } });
      await refrescar();
      const d = r.valorant;
      setSt({ k: "ok", m: d && d.tier ? "Conectado: " + d.tier + (d.rr != null ? " · " + d.rr + " RR" : "") : "Riot ID guardado." });
    } catch (e: any) { setSt({ k: "error", m: ERR_RIOT[e.code] || "No se pudo guardar (" + e.code + ")." }); }
  };
  const quitar = async () => { setSt({ k: "guardando" }); try { await api("/int/riot", { method: "POST", auth: true, body: { riot: "" } }); setV(""); await refrescar(); setSt({ k: "idle" }); } catch (e: any) { setSt({ k: "error", m: "No se pudo quitar (" + e.code + ")." }); } };
  return (
    <form onSubmit={guardar} className={compacto ? "grid gap-3" : "panel panel-pad grid gap-4 max-w-xl"} data-testid="form-riot">
      {!compacto && <><h2 className="d-3">Cuenta de VALORANT (Riot ID)</h2><p className="small muted">Escribe tu Riot ID para activar tu rango, estadísticas, Mi progreso y los 500 logros de VALORANT.</p></>}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="field grow"><label htmlFor="riot-id">Riot ID</label><input id="riot-id" className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Nombre#TAG" maxLength={24} required data-testid="input-riot" /></div>
        <button className="btn btn-rojo" disabled={st.k === "guardando"} data-testid="button-guardar-riot">{st.k === "guardando" ? "Conectando…" : q.data?.riot ? "Actualizar" : "Conectar"}</button>
        {q.data?.riot && <button type="button" className="btn" onClick={quitar} disabled={st.k === "guardando"}>Quitar</button>}
      </div>
      {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">{st.m}</span>}
      {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
      {q.data?.riot && st.k === "idle" && <span className="small muted">Guardado: <b style={{ color: "var(--gris-1)" }}>{q.data.riot}</b>{q.data.verificado ? " · verificado con Riot" : ""}</span>}
    </form>
  );
}

/* ------------------------------------------------------------------ progreso */
const fmt = (v: number | null | undefined, suf = "") => (v == null ? "—" : String(v) + suf);
function Barra({ pct, color = "var(--rojo)" }: { pct: number; color?: string }) {
  return <div className="h-2 bg-[var(--grafito-2)]" aria-hidden><div className="h-2" style={{ width: Math.max(0, Math.min(100, pct)) + "%", background: color }} /></div>;
}

export function PanelFaceitProgreso({ p }: { p: Progreso["faceit"] }) {
  if (!p.vinculado) return (
    <div className="panel panel-pad grid gap-3" data-testid="progreso-faceit-inactivo">
      <div className="eyebrow">FACEIT CS2 · inactivo</div>
      <p className="small muted">Se activa al vincular tu cuenta de FACEIT: nivel, ELO, progreso al siguiente nivel y 500 logros.</p>
      <Link href="/perfil/cuentas" className="btn btn-sm btn-rojo w-fit">Vincular FACEIT</Link>
    </div>
  );
  const np = p.nivel_progreso;
  return (
    <div className="panel panel-pad grid gap-4" data-testid="progreso-faceit">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">FACEIT CS2</span><span className="tag tag-ok">Activo</span></div>
      {!p.activo ? <p className="small muted">FACEIT no respondió ({p.error || "sin datos"}). Se reintenta en unos minutos.</p> : (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <NivelFaceit n={p.nivel} size={52} />
            <div><div className="d-2">{p.nick}</div><div className="small muted">Nivel {fmt(p.nivel)} · <b className="num" style={{ color: "var(--blanco)" }}>{fmt(p.elo)}</b> ELO</div></div>
          </div>
          {np && (
            <div className="grid gap-1.5">
              <Barra pct={np.progreso} color="#ff5500" />
              <span className="small muted num">{np.siguiente ? "Faltan " + np.falta + " ELO para el nivel " + np.siguiente + " (" + np.hasta + ")" : "Nivel máximo alcanzado"}</span>
            </div>
          )}
          {p.stats && (
            <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
              {[["Partidas", fmt(p.stats.partidas)], ["Victorias", fmt(p.stats.victorias)], ["Win %", fmt(p.stats.winrate, " %")], ["K/D", fmt(p.stats.kd)], ["HS", fmt(p.stats.hs, " %")], ["ADR", fmt(p.stats.adr)]].map(([l, v]) => (
                <div key={l}><div className="eyebrow mb-1">{l}</div><div className="d-3 num">{v}</div></div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="grid gap-1.5"><div className="flex justify-between small"><span>Logros FACEIT</span><span className="num">{p.logros.conseguidos} / {p.logros.total}</span></div><Barra pct={(100 * p.logros.conseguidos) / p.logros.total} /></div>
    </div>
  );
}

export function PanelValorantProgreso({ p }: { p: Progreso["valorant"] }) {
  if (!p.activo) return (
    <div className="panel panel-pad grid gap-3" data-testid="progreso-valorant-inactivo">
      <div className="eyebrow">VALORANT · inactivo</div>
      <p className="small muted">Se activa al conectar tu cuenta de Riot: rango, RR, ELO, pico, estadísticas y 500 logros.</p>
      {p.riot && p.aviso === "hdev_no_config" && <p className="small muted">Riot ID guardado ({p.riot}). Los datos aparecerán en cuanto el servidor tenga acceso a la API de VALORANT.</p>}
      <RiotIdForm compacto />
    </div>
  );
  return (
    <div className="panel panel-pad grid gap-4" data-testid="progreso-valorant">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">VALORANT{p.region ? " · " + p.region.toUpperCase() : ""}</span><span className="tag tag-ok">Activo</span></div>
      <div className="flex items-center gap-4 flex-wrap">
        {p.icono && <img src={p.icono} alt="" width={64} height={64} data-testid="valorant-icono" />}
        <div>
          <div className="d-2" data-testid="valorant-rango">{p.tier || "Sin clasificar"}</div>
          <div className="small muted">{p.riot || "Cuenta de Discord"} · <b className="num" style={{ color: "var(--blanco)" }}>{fmt(p.rr)}</b> RR · ELO {fmt(p.elo)}</div>
        </div>
        {p.pico && <div className="ml-auto flex items-center gap-2">{p.pico_icono && <img src={p.pico_icono} alt="" width={36} height={36} />}<div className="small"><div className="eyebrow">Pico</div>{p.pico}</div></div>}
      </div>
      {p.rr != null && <div className="grid gap-1.5"><Barra pct={p.rr} color="#ff4655" /><span className="small muted num">{100 - p.rr} RR para subir de rango</span></div>}
      {(p.nivel_cuenta != null || p.competitivas != null || p.stats) && (
        <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
          {[["Nivel", fmt(p.nivel_cuenta)], ["Compet.", fmt(p.competitivas)], ["Victorias", fmt(p.victorias)], ["K/D", fmt(p.stats?.kd)], ["HS", fmt(p.stats?.hs, " %")], ["Máx. bajas", fmt(p.stats?.max_kills)]].map(([l, v]) => (
            <div key={l}><div className="eyebrow mb-1">{l}</div><div className="d-3 num">{v}</div></div>
          ))}
        </div>
      )}
      {p.fuente === "bot" && <p className="small muted">Rango sincronizado por el bot de Discord. Las estadísticas por partida se completan cuando el servidor tenga acceso a la API de VALORANT.</p>}
      {p.partidas.length > 0 && (
        <div className="overflow-x-auto" data-testid="valorant-partidas">
          <table className="w-full small">
            <thead><tr className="muted text-left">{["Fecha", "Mapa", "Agente", "Resultado", "K / D / A", "ACS"].map((h) => <th key={h} className="p-2 font-normal">{h}</th>)}</tr></thead>
            <tbody>{p.partidas.map((x, i) => (
              <tr key={x.id || i} style={{ borderTop: "1px solid var(--grafito-2)" }}>
                <td className="p-2">{x.fecha ? new Date(x.fecha).toLocaleDateString("es", { day: "2-digit", month: "short" }) : ""}</td><td className="p-2">{x.mapa}</td><td className="p-2">{x.agente}</td>
                <td className="p-2" style={{ color: x.victoria ? "var(--ok)" : "#ff5468", fontWeight: 700 }}>{x.victoria ? "Victoria" : "Derrota"} {x.marcador}</td>
                <td className="p-2">{x.kills} / {x.muertes} / {x.asistencias}</td><td className="p-2">{fmt(x.acs)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="grid gap-1.5"><div className="flex justify-between small"><span>Logros VALORANT</span><span className="num">{p.logros.conseguidos} / {p.logros.total}</span></div><Barra pct={(100 * p.logros.conseguidos) / p.logros.total} /></div>
      <details><summary className="small muted cursor-pointer">Cambiar Riot ID</summary><div className="mt-3"><RiotIdForm compacto /></div></details>
    </div>
  );
}

/** Mi progreso completo: VANTS (XP y rango), FACEIT y VALORANT. */
export function ProgresoJuegos() {
  const q = useProgresoJuegos();
  const vx = useApi<any>("/api/account/progreso", { auth: true });
  if (q.isLoading) return <Skel n={3} h={120} />;
  if (q.error) return <ErrorBox error={q.error} what="tu progreso" />;
  const p = q.data!;
  const r = vx.data?.rango;
  return (
    <div className="grid gap-6" data-testid="mi-progreso">
      <div className="panel panel-pad grid gap-4">
        <div className="flex items-center justify-between gap-3"><span className="eyebrow">VANTS</span><Link href="/logros" className="link-arrow">Ver logros →</Link></div>
        <div className="flex flex-wrap items-center gap-6">
          <div><div className="eyebrow mb-1">Rango VANTS</div><div className="d-2" style={{ color: r?.color }}>{r?.nombre || "—"}</div></div>
          <div><div className="eyebrow mb-1">XP</div><div className="d-2 num">{vx.data?.xp ?? p.vants.xp}</div></div>
          <div><div className="eyebrow mb-1">Logros de juego</div><div className="d-2 num">{p.vants.logros}<span className="muted">/1000</span></div></div>
        </div>
        {r && <div className="grid gap-1.5"><Barra pct={r.progreso} color={r.color} /><span className="small muted num">{vx.data?.siguiente ? "Faltan " + vx.data.siguiente.falta + " XP para " + vx.data.siguiente.nombre : "Rango máximo"}</span></div>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelFaceitProgreso p={p.faceit} />
        <PanelValorantProgreso p={p.valorant} />
      </div>
    </div>
  );
}

/** Panel de VALORANT para el resumen del perfil. */
export function PanelValorantPerfil() {
  const q = useProgresoJuegos();
  if (q.isLoading) return <div className="panel panel-pad"><div className="sk" style={{ height: 80 }} /></div>;
  if (q.error || !q.data) return null;
  return <PanelValorantProgreso p={q.data.valorant} />;
}

/* ------------------------------------------------------------- equipo FACEIT */
const ERR_EQ: Record<string, string> = { equipo_invalido: "Pega el enlace del equipo de FACEIT (faceit.com/…/teams/…).", equipo_no_encontrado: "FACEIT no tiene ningún equipo con ese enlace." };
export function VincularEquipoFaceit({ actual }: { actual: string | null }) {
  const qc = useQueryClient();
  const [v, setV] = useState("");
  const [st, setSt] = useState<{ k: "idle" | "guardando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const enviar = async (ev: FormEvent | null, quitar = false) => {
    ev?.preventDefault();
    setSt({ k: "guardando" });
    try {
      const r = await api<any>("/int/faceit/equipo", { method: "POST", auth: true, body: { equipo: quitar ? "" : v.trim() } });
      await qc.invalidateQueries({ queryKey: ["/int/yo", true] });
      setV("");
      setSt({ k: "ok", m: quitar ? "Equipo quitado." : "Equipo vinculado: " + r.equipo.nombre });
    } catch (e: any) { setSt({ k: "error", m: ERR_EQ[e.code] || "No se pudo guardar (" + e.code + ")." }); }
  };
  return (
    <form onSubmit={(e) => enviar(e)} className="panel panel-pad grid gap-3" data-testid="form-equipo-faceit">
      <div className="eyebrow">Vincular equipo de FACEIT</div>
      <p className="small muted">Pega el enlace de tu equipo creado en FACEIT para mostrar sus jugadores, su nivel, su ELO y sus partidas.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="field grow"><label htmlFor="eq-fc">Enlace del equipo</label><input id="eq-fc" className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://www.faceit.com/es/teams/…" required data-testid="input-equipo-faceit" /></div>
        <button className="btn btn-rojo" disabled={st.k === "guardando"}>{st.k === "guardando" ? "Guardando…" : "Vincular"}</button>
        {actual && <button type="button" className="btn" onClick={() => enviar(null, true)} disabled={st.k === "guardando"}>Quitar equipo</button>}
      </div>
      {st.k === "ok" && <span className="small" style={{ color: "var(--ok)" }} role="status">{st.m}</span>}
      {st.k === "error" && <span className="small" style={{ color: "#ff5468" }} role="alert">{st.m}</span>}
    </form>
  );
}
