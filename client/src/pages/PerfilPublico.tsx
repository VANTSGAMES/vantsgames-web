/**
 * Fichas públicas de VANTS (vants-integraciones):
 *   GET /int/jugadores        → una entrada por persona (Sala → Cuentas registradas)
 *   GET /int/u/<pid>          → perfil principal de la cuenta (ranking, sala, roster)
 *   GET /int/roster-oficial   → equipo VANTS; el dueño lo edita con POST /int/roster-oficial/*
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { PanelFortnite, type StatsFortnite } from "@/components/Fortnite";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api, pub } from "@/lib/api";
import { PageHead, Section, Empty, Skel, ErrorBox, GameTag, Initials } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { NivelFaceit } from "./PerfilFaceit";
import { TarjetaClip, type Clip } from "./MisClips";
import { FotoEquipo, useRol, mensajeError } from "./Vants";
import { fecha } from "@/lib/format";
import { FilaInsignias, Sello3D, SelloAvatar, useCatalogoInsignias, Insignia3D } from "@/components/Insignia3D";
import { JUEGOS, nombreJuego, opcionesJuegos } from "@/lib/juegos";
import { computeAchievementPercent } from "@/lib/competitive";
import { normalizeText } from "@/lib/discovery";

type JugadorLista = { pid: string; nick: string; avatar: string | null; fundador: boolean; xp: number; nivel: number | null; elo: number | null; sello?: string | null };
type Perfil = {
  pid: string; nick: string; avatar: string | null; fundador: boolean; xp: number; desde: string | null; sello?: string | null; insignias?: string[];
  banner?: string | null; redes?: Record<string, string> | null;
  faceit: { nick: string; nivel: number | null; elo: number | null; partidas: number | null; winrate: number | null; kd: number | null; pais: string | null; url: string } | null;
  valorant: { riot: string | null; tier: string | null; tier_id: number | null; rr: number | null; icono: string | null; pico: string | null } | null;
  cuentas: { plataforma: string; handle: string }[];
  equipos: { slug: string; nombre: string; tag: string | null; juego: string | null; logo_url: string | null; rol: string; oficial: boolean }[];
  logros: { faceit: number; valorant: number; total: number };
  fortnite?: { nombre: string | null; stats: StatsFortnite | null; error_stats: string | null } | null;
  clips: Clip[];
};

/* Iconos de marcas (client/public/brand) para cuentas y redes. */
const LOGO: Record<string, string> = {
  twitch: "brand/logo-twitch.svg", youtube: "brand/logo-youtube.svg", x: "brand/logo-x.svg",
  tiktok: "brand/logo-tiktok.svg", instagram: "brand/logo-instagram.svg", steam: "brand/logo-steam.svg",
  riot: "brand/logo-riot.svg", epic: "brand/logo-epic.svg",
  discord: "brand/logo-discord.png", faceit: "brand/logo-faceit.png",
};
const IconoMarca = ({ plataforma, size = 14 }: { plataforma: string; size?: number }) =>
  LOGO[plataforma] ? <img src={pub(LOGO[plataforma])} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" /> : null;

/** URL de una red social: si el valor es un enlace se usa tal cual; si es usuario se construye. */
const urlRed = (k: string, v: string): string | null => {
  if (/^https?:\/\//i.test(v)) return v;
  const bases: Record<string, string> = {
    twitch: "https://www.twitch.tv/", youtube: "https://www.youtube.com/@", x: "https://x.com/",
    tiktok: "https://www.tiktok.com/@", instagram: "https://www.instagram.com/",
  };
  return bases[k] ? bases[k] + v.replace(/^@/, "") : null;
};

function Avatar({ src, nombre, size }: { src: string | null; nombre: string; size: number }) {
  return src ? <img src={src} alt="" width={size} height={size} className="chamfer object-cover" style={{ width: size, height: size }} loading="lazy" /> : <Initials name={nombre} size={size} />;
}

/* ---------------- Sala → Cuentas registradas ---------------- */
export function CuentasRegistradas() {
  const q = useApi<{ jugadores: JugadorLista[] }>("/int/jugadores");
  const [busqueda, setBusqueda] = useState("");
  const xs = q.data?.jugadores || [];
  const visibles = useMemo(() => {
    const query = normalizeText(busqueda);
    if (!query) return xs;
    return xs.filter((c) => {
      const hay = normalizeText([c.nick, c.elo != null ? String(c.elo) : "", c.fundador ? "fundador" : "jugador"].join(" "));
      return hay.includes(query);
    });
  }, [xs, busqueda]);

  if (q.isLoading) return <Skel n={2} />;
  if (q.error) return <ErrorBox error={q.error} what="las cuentas" onRetry={() => q.refetch()} />;
  if (!xs.length) return <Empty code="cuentas · 0" title="Sin cuentas públicas" />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          className="input h-10 w-full sm:w-72"
          placeholder="Buscar cuenta por nick o ELO…"
          aria-label="Buscar cuenta registrada"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          data-testid="input-buscar-cuenta"
        />
        <span className="small muted num">
          {visibles.length === xs.length
            ? `${xs.length} ${xs.length === 1 ? "cuenta" : "cuentas"}`
            : `${visibles.length} de ${xs.length} ${xs.length === 1 ? "cuenta" : "cuentas"}`}
        </span>
      </div>
      {visibles.length === 0 ? (
        <Empty
          code="cuentas · filtro"
          title="Ninguna cuenta coincide con tu búsqueda"
          action={<button type="button" className="btn btn-sm" onClick={() => setBusqueda("")}>Limpiar búsqueda</button>}
        />
      ) : (
        <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4" data-testid="cuentas-registradas">
          {visibles.map((c) => (
            <Link key={c.pid} href={"/u/" + c.pid} className="p-4 flex items-center gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"cuenta-" + c.pid}>
              <Avatar src={c.avatar} nombre={c.nick} size={40} />
              <div className="min-w-0 grow">
                <div className="d-3 truncate flex items-center gap-2">{c.nick}<Sello3D s={c.sello} size={26} /></div>
                <div className="small muted">{c.fundador ? "Fundador" : "Jugador"}{c.elo != null ? " · " + c.elo + " ELO" : ""}</div>
              </div>
              {c.nivel ? <NivelFaceit n={c.nivel} size={26} /> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- /u/:pid ---------------- */
const RED: Record<string, { l: string; url?: (h: string) => string }> = {
  twitch: { l: "Twitch", url: (h) => "https://www.twitch.tv/" + h },
  kick: { l: "Kick", url: (h) => "https://kick.com/" + h },
  youtube: { l: "YouTube" }, x: { l: "X" }, tiktok: { l: "TikTok" }, steam: { l: "Steam" }, discord: { l: "Discord" }, instagram: { l: "Instagram" },
  faceit: { l: "FACEIT", url: (h) => "https://www.faceit.com/es/players/" + h },
};

export function PerfilPublicoPagina() {
  const { pid } = useParams<{ pid: string }>();
  const { toast } = useFeedback();
  const q = useApi<{ perfil: Perfil }>("/int/u/" + pid);
  const cat = useCatalogoInsignias();
  const [bannerError, setBannerError] = useState(false);
  const perfilData = q.data?.perfil;

  useEffect(() => {
    setBannerError(false);
  }, [perfilData?.banner, pid]);

  useEffect(() => {
    if (!perfilData) return;
    const title = `${perfilData.nick} — Perfil VANTS GAMES`;
    document.title = title;
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", title);
    const tw = document.querySelector('meta[name="twitter:title"]');
    if (tw) tw.setAttribute("content", title);
  }, [perfilData]);

  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 ? <Empty code="404 · jugador" title="Este jugador no existe" action={<Link href="/ranking" className="link-arrow">Ver ranking →</Link>} /> : <ErrorBox error={q.error} what="el perfil" onRetry={() => q.refetch()} />}</div>;
  const p = perfilData!;
  const f = p.faceit, v = p.valorant;
  const minis = (p.insignias || []).filter((c) => c !== "MEMBER").slice(0, 6);
  const redes = Object.entries(p.redes || {}).filter(([, val]) => !!val);
  const logrosPct = computeAchievementPercent(p.logros.total, 1000);
  const winrateClamped = f?.winrate != null ? Math.max(0, Math.min(100, f.winrate)) : null;

  const compartirPerfil = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        toast({ kind: "ok", title: "Enlace del perfil copiado", description: `Ya puedes compartir la ficha de ${p.nick}.` });
      } else {
        toast({ kind: "info", title: "Copia la dirección desde tu navegador", description: url });
      }
    } catch {
      toast({ kind: "info", title: "Enlace listo para compartir", description: url });
    }
  };

  return (
    <>
      <header className="border-b" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
        {/* Banner del jugador (o retícula técnica si no configuró uno o falla la carga) */}
        <div className="relative overflow-hidden" style={{ height: 176 }}>
          {p.banner && !bannerError ? (
            <img
              src={p.banner}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
            />
          ) : <div className="hero-fondo absolute inset-0" aria-hidden="true" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, var(--grafito-1) 0%, rgba(17,17,19,.55) 55%, rgba(17,17,19,.15) 100%)" }} />
        </div>
        <div className="wrap relative z-10 pb-10 flex flex-wrap items-end gap-6" style={{ marginTop: -56 }}>
          <span className="relative inline-block shrink-0" style={{ border: "3px solid var(--grafito-1)" }}>
            <Avatar src={p.avatar} nombre={p.nick} size={112} />
            <SelloAvatar s={p.sello} size={40} />
          </span>
          <div className="min-w-0 grow">
            <Link href="/ranking" className="link-arrow mb-3 w-fit" style={{ display: "flex" }}>← Ranking</Link>
            <div className="eyebrow mb-2">{p.fundador ? "Fundador de VANTS" : "Jugador VANTS"}</div>
            <h1 className="d-1 flex flex-wrap items-center gap-3" data-testid="perfil-publico-nick">
              {p.nick}<Sello3D s={p.sello} size={26} />
              {minis.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5" data-testid="perfil-mininsignias">
                  {minis.map((code) => {
                    const d = (cat.data?.catalogo || []).find((x) => x.code === code);
                    return d ? <Insignia3D key={code} d={d} size={20} titulo={d.nombre} /> : null;
                  })}
                  {(p.insignias || []).length > minis.length + 1 && <span className="small muted num">+{p.insignias!.length - minis.length - 1}</span>}
                </span>
              )}
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.fundador && <span className="tag tag-rojo">Fundador</span>}
              <span className="tag">{p.xp} XP</span>
              {p.desde && <span className="tag">Desde {fecha(p.desde)}</span>}
              {p.cuentas.map((c) => { const r = RED[c.plataforma]; const u = r?.url?.(c.handle); return u ? <a key={c.plataforma} href={u} target="_blank" rel="noopener noreferrer" className="tag hover:text-[var(--rojo)]" style={{ gap: 6 }}><IconoMarca plataforma={c.plataforma} />{r.l} · {c.handle}</a> : <span key={c.plataforma} className="tag" style={{ gap: 6 }}><IconoMarca plataforma={c.plataforma} />{r?.l || c.plataforma}{c.plataforma === "steam" ? "" : " · " + c.handle}</span>; })}
            </div>
            {redes.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3" data-testid="perfil-redes">
                {redes.map(([k, val]) => {
                  const u = urlRed(k, val);
                  const contenido = <><IconoMarca plataforma={k} size={16} /><span>{val}</span></>;
                  return u
                    ? <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="tag hover:text-[var(--rojo)]" style={{ gap: 7, height: 26, paddingLeft: 10, paddingRight: 10 }}>{contenido}</a>
                    : <span key={k} className="tag" style={{ gap: 7, height: 26, paddingLeft: 10, paddingRight: 10 }}>{contenido}</span>;
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={compartirPerfil} data-testid="button-compartir-perfil">
              Compartir perfil
            </button>
          </div>
        </div>
      </header>
      <div className="wrap py-10 grid gap-6 md:grid-cols-3">
        <div className="panel panel-pad grid gap-3 content-start" data-testid="perfil-publico-faceit">
          <div className="eyebrow">FACEIT · CS2</div>
          {f ? (
            <>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-[var(--rojo)]"><NivelFaceit n={f.nivel} size={40} /><span className="d-2">{f.nick}</span></a>
              <div className="grid grid-cols-3 gap-3 small">
                <div><div className="muted text-xs">ELO</div><div className="num d-3">{f.elo ?? "—"}</div></div>
                <div><div className="muted text-xs">Partidas</div><div className="num d-3">{f.partidas ?? "—"}</div></div>
                <div><div className="muted text-xs">K/D</div><div className="num d-3">{f.kd != null ? f.kd.toFixed(2) : "—"}</div></div>
              </div>
              {winrateClamped != null && (
                <div className="grid gap-1.5 pt-2 border-t" style={{ borderColor: "var(--linea-suave)" }} data-testid="perfil-winrate-bar">
                  <div className="flex items-center justify-between text-xs">
                    <span className="muted">Victorias</span>
                    <span className="num font-semibold" style={{ color: winrateClamped >= 50 ? "var(--ok)" : "var(--blanco)" }}>{winrateClamped}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden" style={{ background: "var(--grafito-2)" }} aria-hidden="true">
                    <div className="h-full transition-all" style={{ width: `${winrateClamped}%`, background: winrateClamped >= 50 ? "var(--ok)" : "var(--rojo)" }} />
                  </div>
                </div>
              )}
            </>
          ) : <p className="small muted">Sin FACEIT vinculado.</p>}
        </div>
        <div className="panel panel-pad grid gap-3 content-start" data-testid="perfil-publico-valorant">
          <div className="eyebrow">VALORANT</div>
          {v && (v.tier || v.riot) ? (
            <div className="flex items-center gap-3">
              {v.icono && <img src={v.icono} alt="" width={48} height={48} />}
              <div><div className="d-2">{v.tier || "Sin rango"}</div><div className="small muted">{v.rr != null ? v.rr + " RR" : ""}{v.riot ? (v.rr != null ? " · " : "") + v.riot : ""}</div>{v.pico && <div className="text-xs muted">Pico: {v.pico}</div>}</div>
            </div>
          ) : <p className="small muted">Sin cuenta de Riot vinculada.</p>}
        </div>
        <div className="panel panel-pad grid gap-3 content-start" data-testid="perfil-publico-logros">
          <div className="eyebrow">Logros</div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="d-1 num">{p.logros.total}</div>
            <span className="small muted num">{logrosPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden" style={{ background: "var(--grafito-2)" }} aria-hidden="true" data-testid="perfil-logros-bar">
            <div className="h-full" style={{ width: `${logrosPct}%`, background: "var(--rojo)" }} />
          </div>
          <div className="small muted">{p.logros.faceit} de FACEIT · {p.logros.valorant} de VALORANT</div>
        </div>
        {p.fortnite && <div className="md:col-span-3"><PanelFortnite c={{ vinculada: true, ...p.fortnite }} /></div>}
      </div>
      <Section title="Insignias" eyebrow={(p.insignias || []).length + " conseguidas"} more={{ to: "/insignias", label: "Catálogo" }}>
        <div className="panel panel-pad grid gap-4" data-testid="perfil-publico-insignias">
          <FilaInsignias codes={p.insignias || []} size={80} vacio="Este jugador todavía no tiene insignias." />
          <ConcederInsignias pid={p.pid} tiene={p.insignias || []} />
        </div>
      </Section>
      <Section title="Equipos" eyebrow={p.equipos.length + " equipos"}>
        {p.equipos.length === 0 ? <Empty code="equipos · 0" title="Sin equipo todavía" /> : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-3">
            {p.equipos.map((e) => (
              <Link key={e.slug + e.rol} href={e.oficial ? "/equipo-vants" : "/equipos/" + e.slug} className="p-5 flex items-center gap-4 hover:bg-[var(--grafito-2)] transition-colors">
                <Avatar src={e.logo_url} nombre={e.tag || e.nombre} size={56} />
                <div className="min-w-0"><div className="d-3 truncate">{e.nombre}</div><div className="small muted flex gap-1.5 items-center flex-wrap mt-1">{e.oficial && <span className="tag tag-rojo">Roster oficial</span>}<GameTag g={e.juego} />{e.rol}</div></div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section title="Clips" eyebrow={p.clips.length + " clips públicos"}>
        {p.clips.length === 0 ? <Empty code="clips · 0" title="Sin clips públicos" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{p.clips.map((c) => <TarjetaClip key={c.id} c={c} />)}</div>}
      </Section>
    </>
  );
}

/** Solo el dueño: conceder o retirar insignias por invitación (SOCIO, PARTNER, CREATOR, VERIFIED, CHAMPION). */
function ConcederInsignias({ pid, tiene }: { pid: string; tiene: string[] }) {
  const rol = useRol();
  const cat = useCatalogoInsignias();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!rol.data?.owner) return null;
  const manuales = (cat.data?.catalogo || []).filter((b) => b.manual);
  if (!manuales.length) return null;
  async function cambiar(code: string, quitar: boolean) {
    setOcupado(code); setErr(null);
    try {
      await api("/int/insignias/conceder", { method: "POST", auth: true, body: { pid, code, quitar } });
      await qc.invalidateQueries({ queryKey: ["/int/u/" + pid, false] });
      qc.invalidateQueries({ queryKey: ["/int/insignias", false] });
      qc.invalidateQueries({ queryKey: ["/int/insignias/mias", true] });
    } catch (e) { setErr(mensajeError(e)); } finally { setOcupado(null); }
  }
  return (
    <div className="border-t pt-4 grid gap-3" style={{ borderColor: "var(--linea-suave)" }} data-testid="conceder-insignias">
      <div className="eyebrow">Dueño · conceder insignias por invitación</div>
      <div className="flex flex-wrap gap-2">
        {manuales.map((b) => {
          const ya = tiene.includes(b.code);
          return (
            <button key={b.code} type="button" disabled={ocupado === b.code} onClick={() => cambiar(b.code, ya)} className={"btn btn-sm " + (ya ? "btn-ghost" : "btn-rojo")} title={ya ? "Retirar" : "Conceder"}>
              <Insignia3D d={b} size={22} /> {ya ? "Retirar " : "Dar "}{b.nombre}
            </button>
          );
        })}
      </div>
      <p className="text-xs muted">Las de plan (PRO, PLUS, CREATOR) también se ponen solas al comprar. Si el jugador ya cumple el requisito automático, retirar la manual no la quita.</p>
      {err && <p className="small" style={{ color: "var(--rojo)" }}>{err}</p>}
    </div>
  );
}

/* ---------------- /equipo-vants ---------------- */
type Roster = {
  equipo: { slug: string; nombre: string; tag: string | null; juego: string | null; region: string | null; logo_url: string | null } | null;
  jugadores: { id: string; nombre: string; rol: string | null; juego: string | null; pais: string | null; orden: number; pid: string | null; avatar: string | null; cuenta: string | null; faceit: { nivel: number | null; elo: number | null; nick: string } | null }[];
};

function EditorEquipo({ r, onOk }: { r: Roster; onOk: () => void }) {
  const [f, setF] = useState({ nombre: r.equipo?.nombre || "VANTS", tag: r.equipo?.tag || "VTS", juego: r.equipo?.juego || "", region: r.equipo?.region || "LATAM" });
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "ok" | "error"; m?: string }>({ k: "idle" });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setSt({ k: "enviando" });
    try { await api("/int/roster-oficial/equipo", { method: "POST", auth: true, body: f }); setSt({ k: "ok", m: "Equipo guardado." }); onOk(); }
    catch (err) { setSt({ k: "error", m: mensajeError(err) }); }
  };
  return (
    <form onSubmit={enviar} className="panel panel-pad grid gap-3 content-start" data-testid="form-roster-equipo">
      <h3 className="d-3">Datos del equipo</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label htmlFor="ro-n">Nombre</label><input id="ro-n" className="input" required maxLength={40} value={f.nombre} onChange={set("nombre")} /></div>
        <div className="field"><label htmlFor="ro-t">Tag</label><input id="ro-t" className="input" maxLength={5} value={f.tag} onChange={set("tag")} /></div>
        <div className="field"><label htmlFor="ro-j">Juego principal</label><select id="ro-j" className="input" value={f.juego} onChange={set("juego")}>{opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</select></div>
        <div className="field"><label htmlFor="ro-r">Región</label><input id="ro-r" className="input" maxLength={40} value={f.region} onChange={set("region")} /></div>
      </div>
      <div className="flex items-center gap-3"><button className="btn btn-rojo" disabled={st.k === "enviando"}>{st.k === "enviando" ? "Guardando…" : "Guardar equipo"}</button>{st.m && <span className="small" style={{ color: st.k === "error" ? "#ff5468" : "var(--ok)" }}>{st.m}</span>}</div>
    </form>
  );
}

const VACIO = { id: "", nombre: "", rol: "Jugador", juego: "valorant", pais: "", pid: "", orden: "0" };
function EditorJugador({ inicial, onOk, onCancelar }: { inicial?: Roster["jugadores"][number]; onOk: () => void; onCancelar?: () => void }) {
  const cuentas = useApi<{ jugadores: JugadorLista[] }>("/int/jugadores");
  const [f, setF] = useState(inicial ? { id: inicial.id, nombre: inicial.nombre, rol: inicial.rol || "Jugador", juego: inicial.juego || "valorant", pais: inicial.pais || "", pid: inicial.pid || "", orden: String(inicial.orden || 0) } : VACIO);
  const [st, setSt] = useState<{ k: "idle" | "enviando" | "error"; m?: string }>({ k: "idle" });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setSt({ k: "enviando" });
    try { await api("/int/roster-oficial/jugador", { method: "POST", auth: true, body: { ...f, orden: Number(f.orden) || 0 } }); if (!inicial) setF(VACIO); setSt({ k: "idle" }); onOk(); }
    catch (err) { setSt({ k: "error", m: mensajeError(err) }); }
  };
  return (
    <form onSubmit={enviar} className="panel panel-pad grid gap-3 content-start" data-testid={"form-roster-jugador" + (inicial ? "-" + inicial.id : "")}>
      <h3 className="d-3">{inicial ? "Editar jugador" : "Añadir jugador"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="field col-span-2"><label>Cuenta VANTS (opcional)</label>
          <select className="input" value={f.pid} onChange={(e) => { const c = (cuentas.data?.jugadores || []).find((x) => x.pid === e.target.value); setF({ ...f, pid: e.target.value, nombre: f.nombre || (c ? c.nick : "") }); }}>
            <option value="">Sin cuenta vinculada</option>
            {(cuentas.data?.jugadores || []).map((c) => <option key={c.pid} value={c.pid}>{c.nick}{c.elo != null ? " · " + c.elo + " ELO" : ""}</option>)}
          </select>
          <span className="text-xs muted">Si eliges su cuenta, la tarjeta abre su perfil y muestra su nivel de FACEIT.</span>
        </div>
        <div className="field"><label>Nombre en el roster</label><input className="input" required minLength={2} maxLength={32} value={f.nombre} onChange={set("nombre")} /></div>
        <div className="field"><label>Rol</label><input className="input" maxLength={32} value={f.rol} onChange={set("rol")} placeholder="IGL, Entry, AWP, Coach…" /></div>
        <div className="field"><label>Juego</label><select className="input" value={f.juego} onChange={set("juego")}>{opcionesJuegos().map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</select></div>
        <div className="field"><label>País</label><input className="input" maxLength={40} value={f.pais} onChange={set("pais")} /></div>
        <div className="field"><label>Orden</label><input className="input" type="number" min={0} max={99} value={f.orden} onChange={set("orden")} /></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn btn-rojo" disabled={st.k === "enviando"}>{st.k === "enviando" ? "Guardando…" : inicial ? "Guardar" : "Añadir al roster"}</button>
        {onCancelar && <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>}
        {st.k === "error" && <span className="small" style={{ color: "#ff5468" }}>{st.m}</span>}
      </div>
    </form>
  );
}

export function RosterOficialPagina() {
  const { confirm, toast } = useFeedback();
  const qc = useQueryClient();
  const q = useApi<Roster>("/int/roster-oficial");
  const rol = useRol();
  const owner = !!rol.data?.owner;
  const [editar, setEditar] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ k: "ok" | "error"; m: string } | null>(null);
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["/int/roster-oficial", false] }); qc.invalidateQueries({ queryKey: ["/api/teams/vants", false] }); };
  const quitar = async (id: string) => {
    const ok = await confirm({ title: "Quitar del roster oficial", description: "¿Quitar a este jugador del roster oficial de VANTS?", confirmLabel: "Quitar jugador", danger: true });
    if (!ok) return;
    try { await api("/int/roster-oficial/quitar", { method: "POST", auth: true, body: { id } }); refrescar(); toast({ kind: "ok", title: "Jugador quitado del roster" }); }
    catch (e) { toast({ kind: "error", title: "No se pudo quitar del roster", description: mensajeError(e) }); }
  };
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16"><ErrorBox error={q.error} what="el roster oficial" onRetry={() => q.refetch()} /></div>;
  const r = q.data!;
  const e = r.equipo;
  const porJuego = JUEGOS.map((d) => ({ g: d.slug, xs: r.jugadores.filter((j) => j.juego === d.slug) })).filter((x) => x.xs.length);
const fueraRegistro = Array.from(new Set(r.jugadores.map((j) => j.juego).filter((g): g is string => !!g && !JUEGOS.some((d) => d.slug === g)))).map((g) => ({ g, xs: r.jugadores.filter((j) => j.juego === g) }));
porJuego.push(...fueraRegistro);
  return (
    <>
      <header className="border-b" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
        <div className="wrap py-12 flex flex-wrap items-end gap-6">
          {owner ? <FotoEquipo e={{ slug: "vants", nombre: e?.nombre || "VANTS", tag: e?.tag || "VTS", logo_url: e?.logo_url, capitan: true }} size={96} onCambio={(m) => { setAviso(m); refrescar(); }} /> : e?.logo_url ? <img src={e.logo_url} alt="" width={96} height={96} className="chamfer object-cover" style={{ width: 96, height: 96 }} /> : <Initials name={e?.tag || "VTS"} size={96} />}
          <div className="min-w-0 grow">
            <div className="eyebrow mb-2">Roster oficial</div>
            <h1 className="d-1">{e?.nombre || "Equipo VANTS"}</h1>
            <div className="flex flex-wrap gap-1.5 mt-3">{e?.tag && <span className="tag">{e.tag}</span>}{e?.juego ? <GameTag g={e.juego} /> : <><GameTag g="valorant" /><GameTag g="cs2" /></>}{e?.region && <span className="tag">{e.region}</span>}</div>
            {aviso && <p className="small mt-2" style={{ color: aviso.k === "error" ? "#ff5468" : "var(--ok)" }}>{aviso.m}</p>}
          </div>
          {owner && <button className={"btn " + (editar ? "btn-ghost" : "btn-rojo")} onClick={() => setEditar(!editar)} data-testid="button-editar-roster">{editar ? "Terminar edición" : "Editar roster"}</button>}
        </div>
      </header>
      {owner && editar && (
        <div className="wrap pt-8 grid gap-4 lg:grid-cols-2 items-start">
          <EditorEquipo r={r} onOk={refrescar} />
          <EditorJugador onOk={refrescar} />
        </div>
      )}
      {r.jugadores.length === 0 ? (
        <div className="wrap py-10"><Empty code="roster · 0" title="El roster oficial todavía no está publicado" text={owner ? "Pulsa «Editar roster» y añade a los jugadores del equipo VANTS." : "Cuando la organización publique la plantilla aparecerá aquí."} action={<Link href="/equipos" className="link-arrow">Ver equipos del circuito →</Link>} /></div>
      ) : porJuego.map(({ g, xs }) => (
        <Section key={g} title={nombreJuego(g)} eyebrow={xs.length + " jugadores"}>
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {xs.map((j) => editando === j.id ? (
              <div key={j.id} className="sm:col-span-2"><EditorJugador inicial={j} onOk={() => { setEditando(null); refrescar(); }} onCancelar={() => setEditando(null)} /></div>
            ) : (
              <div key={j.id} className="p-5 grid gap-3 content-start" data-testid={"roster-" + j.id}>
                {j.pid ? (
                  <Link href={"/u/" + j.pid} className="grid gap-3 hover:text-[var(--rojo)]"><Avatar src={j.avatar} nombre={j.nombre} size={56} /><div><div className="d-2">{j.nombre}</div><div className="small muted mt-1">{j.rol || "Jugador"}{j.pais ? " · " + j.pais : ""}</div></div></Link>
                ) : (
                  <><Avatar src={j.avatar} nombre={j.nombre} size={56} /><div><div className="d-2">{j.nombre}</div><div className="small muted mt-1">{j.rol || "Jugador"}{j.pais ? " · " + j.pais : ""}</div></div></>
                )}
                {j.faceit && <div className="flex items-center gap-2 small"><NivelFaceit n={j.faceit.nivel} size={24} /><span className="num">{j.faceit.elo ?? "—"} ELO</span></div>}
                {owner && editar && <div className="flex gap-3 text-xs"><button className="underline" onClick={() => setEditando(j.id)}>Editar</button><button className="underline muted" onClick={() => quitar(j.id)}>Quitar</button></div>}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

/* ---------------- Circuito → Equipos: equipos de FACEIT ---------------- */
type EquipoFc = {
  id: string; nombre: string; tag: string | null; avatar: string | null; url: string; lider: string | null;
  jugadores: { id: string; nickname: string; avatar: string | null; nivel: number | null; elo: number | null; pais: string | null; lider: boolean; url: string }[];
  estadisticas: { partidas: number | null; winrate: number | null; racha: number | null } | null;
};
export function EquiposFaceitCircuito() {
  const q = useApi<{ equipos: EquipoFc[] }>("/int/equipos-faceit");
  const xs = q.data?.equipos || [];
  if (q.isLoading) return <Skel n={2} />;
  if (q.error) return <ErrorBox error={q.error} what="los equipos de FACEIT" onRetry={() => q.refetch()} />;
  if (!xs.length) return <Empty code="faceit · 0" title="Ningún jugador VANTS tiene equipo en FACEIT" text="Vincula tu equipo en Mi perfil → Mis equipos." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="equipos-faceit">
      {xs.map((t) => (
        <article key={t.id} className="panel">
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="p-5 flex items-center gap-4 border-b hover:bg-[var(--grafito-2)] transition-colors" style={{ borderColor: "var(--linea-suave)" }}>
            <Avatar src={t.avatar} nombre={t.tag || t.nombre} size={56} />
            <div className="min-w-0 grow">
              <div className="d-3 truncate">{t.nombre}</div>
              <div className="flex flex-wrap gap-1.5 mt-1">{t.tag && <span className="tag">{t.tag}</span>}<span className="tag">FACEIT · CS2</span>{t.estadisticas?.partidas != null && <span className="tag">{t.estadisticas.partidas} partidas</span>}{t.estadisticas?.winrate != null && <span className="tag">{t.estadisticas.winrate} % victorias</span>}</div>
            </div>
            <span className="small muted shrink-0">FACEIT →</span>
          </a>
          <ul className="divide-y" style={{ borderColor: "var(--linea-suave)" }}>
            {t.jugadores.map((j) => (
              <li key={j.id}>
                <a href={j.url} target="_blank" rel="noopener noreferrer" className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--grafito-2)] transition-colors">
                  <Avatar src={j.avatar} nombre={j.nickname} size={32} />
                  <span className="font-semibold truncate">{j.nickname}</span>
                  {j.lider && <span className="tag tag-rojo">Líder</span>}
                  {j.pais && <span className="text-xs muted uppercase">{j.pais}</span>}
                  <span className="ml-auto flex items-center gap-2 small"><span className="num muted">{j.elo ?? "—"} ELO</span><NivelFaceit n={j.nivel} size={24} /></span>
                </a>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
