import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { api, assetUrl, type Team, type PtPlayer, type AccountPlayer, type Paged } from "@/lib/api";
import { PageHead, Section, Empty, Skel, ErrorBox, GameTag, Initials } from "@/components/ui-vants";
import { TeamTile, PlayerTile, MatchRow } from "@/components/domain";
import { fecha, gameLabel } from "@/lib/format";

function useRosters(teams: Team[] | undefined) {
  const qs = useQueries({
    queries: (teams || []).map((t) => ({ queryKey: ["/api/teams/" + t.slug], queryFn: () => api<{ data: Team }>("/api/teams/" + t.slug), staleTime: 60_000 })),
  });
  const loading = qs.some((q) => q.isLoading);
  const players: (PtPlayer & { team?: Team })[] = [];
  qs.forEach((q) => { const t = q.data?.data; (t?.plantilla || []).forEach((p) => players.push({ ...p, team: t })); });
  return { loading, players };
}

export function SalaJugadores() {
  const teams = useApi<{ data: Team[] }>("/api/teams");
  const cuentas = useApi<{ data: Paged<AccountPlayer> }>("/api/players?porPagina=50");
  const { loading, players } = useRosters(teams.data?.data);
  const [q, setQ] = useState("");
  const [juego, setJuego] = useState("");
  const vis = players.filter((p) => (!juego || p.game?.slug === juego) && (!q || p.nombre.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHead eyebrow="Sala" title={<>Sala de <span style={{ color: "var(--rojo)" }}>jugadores</span></>} lead="Jugadores en plantillas del circuito y cuentas registradas en VANTS." />
      <div className="wrap grid gap-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <input className="input w-full sm:w-80" placeholder="Buscar jugador" aria-label="Buscar jugador" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-buscar-jugador" />
          <div className="flex gap-1" role="group" aria-label="Juego">
            {[["", "Todos"], ["valorant", "VALORANT"], ["cs2", "CS2"]].map(([v, l]) => <button key={v} className={"btn btn-sm " + (juego === v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === v} onClick={() => setJuego(v)}>{l}</button>)}
          </div>
        </div>
        {teams.isLoading || loading ? <Skel /> : teams.error ? <ErrorBox error={teams.error} what="los jugadores" /> : vis.length === 0 ? (
          <Empty code="jugadores · 0" title={q || juego ? "Ningún jugador coincide con el filtro" : "Todavía no hay jugadores en plantillas"} />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-3">{vis.map((p) => <PlayerTile key={p.slug} p={p} />)}</div>
        )}
      </div>
      <Section title="Cuentas registradas" eyebrow="Plataforma">
        {cuentas.isLoading ? <Skel n={2} /> : cuentas.error ? <ErrorBox error={cuentas.error} what="las cuentas" /> : (cuentas.data?.data.items || []).length === 0 ? (
          <Empty code="cuentas · 0" title="Sin cuentas públicas" />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {cuentas.data!.data.items.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-3">
                <Initials name={c.display_name || c.nombre || "?"} />
                <div className="min-w-0"><div className="d-3 truncate">{c.display_name || c.nombre}</div><div className="small muted">{c.role === "owner" ? "Fundador" : "Jugador"}{c.region ? " · " + c.region : ""}</div></div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

export function Equipos() {
  const q = useApi<{ data: Team[] }>("/api/teams");
  const [juego, setJuego] = useState("");
  const vis = (q.data?.data || []).filter((t) => !juego || t.game === juego);
  return (
    <>
      <PageHead eyebrow="Circuito" title="Equipos del circuito" lead="Equipos registrados en VANTS con su plantilla y sus partidas." />
      <div className="wrap grid gap-4">
        <div className="flex gap-1" role="group" aria-label="Juego">
          {[["", "Todos"], ["valorant", "VALORANT"], ["cs2", "CS2"]].map(([v, l]) => <button key={v} className={"btn btn-sm " + (juego === v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === v} onClick={() => setJuego(v)} data-testid={"filter-equipos-" + (v || "todos")}>{l}</button>)}
        </div>
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="los equipos" /> : vis.length === 0 ? (
          <Empty code={"equipos · " + (juego || "todos")} title="No hay equipos en esta categoría" />
        ) : <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-3">{vis.map((t) => <TeamTile key={t.slug} t={t} />)}</div>}
      </div>
    </>
  );
}

function TeamView({ slug, oficial = false }: { slug: string; oficial?: boolean }) {
  const q = useApi<{ data: Team }>("/api/teams/" + slug);
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 ? <Empty code="404 · equipo" title="Este equipo no existe" action={<Link href="/equipos" className="link-arrow">Ver equipos →</Link>} /> : <ErrorBox error={q.error} what="el equipo" />}</div>;
  const t = q.data!.data;
  return (
    <>
      <header className="border-b" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
        <div className="wrap py-12 flex flex-wrap items-end gap-6">
          {t.logo_url ? <img src={assetUrl(t.logo_url)!} alt="" width={96} height={96} className="chamfer" /> : <Initials name={t.tag || t.nombre} size={96} />}
          <div className="min-w-0">
            {!oficial && <Link href="/equipos" className="link-arrow mb-3 w-fit" style={{ display: "flex" }}>← Equipos</Link>}
            <div className="eyebrow mb-2">{oficial ? "Roster oficial" : "Equipo"}</div>
            <h1 className="d-1">{t.nombre}</h1>
            <div className="flex flex-wrap gap-1.5 mt-3">{t.tag && <span className="tag">{t.tag}</span>}<GameTag g={t.game} />{t.region && <span className="tag">{t.region}</span>}{t.is_demo && <span className="tag tag-aviso">Demo</span>}</div>
          </div>
        </div>
      </header>
      <Section title="Plantilla" eyebrow={(t.plantilla || []).length + " jugadores"}>
        {(t.plantilla || []).length === 0 ? <Empty code="plantilla · 0" title="Plantilla sin publicar" /> : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {t.plantilla!.map((p) => (
              <Link key={p.slug} href={"/jugadores/" + p.slug} className="p-5 grid gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"roster-" + p.slug}>
                <Initials name={p.nombre} size={56} />
                <div><div className="d-2">{p.nombre}</div><div className="small muted mt-1">{p.rol || "Jugador"}{p.pais ? " · " + p.pais : ""}</div></div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section title="Partidas" eyebrow="Historial">
        <div className="panel">{(t.partidas || []).length === 0 ? <Empty code="partidas · 0" title="Sin partidas registradas" /> : t.partidas!.map((m, i) => <MatchRow key={i} m={m} />)}</div>
      </Section>
    </>
  );
}

export function EquipoDetalle() {
  const { slug } = useParams<{ slug: string }>();
  return <TeamView slug={slug} />;
}
export function EquipoVants() {
  return <TeamView slug="vants" oficial />;
}

export function JugadorDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useApi<{ data: PtPlayer & { equipo?: Team } }>("/api/players/" + slug);
  if (q.isLoading) return <div className="wrap py-16"><Skel n={3} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 ? <Empty code="404 · jugador" title="Este jugador no existe" action={<Link href="/sala" className="link-arrow">Ir a la sala →</Link>} /> : <ErrorBox error={q.error} what="el jugador" />}</div>;
  const p = q.data!.data;
  return (
    <>
      <header className="border-b" style={{ borderColor: "var(--linea-suave)", background: "var(--grafito-1)" }}>
        <div className="wrap py-12 flex flex-wrap items-end gap-6">
          <Initials name={p.nombre} size={112} />
          <div>
            <Link href="/sala" className="link-arrow mb-3 w-fit" style={{ display: "flex" }}>← Sala</Link>
            <div className="eyebrow mb-2">{p.rol || "Jugador"}</div>
            <h1 className="d-1">{p.nombre}</h1>
            <div className="flex flex-wrap gap-1.5 mt-3"><GameTag g={p.game} />{p.pais && <span className="tag">{p.pais}</span>}{p.is_demo && <span className="tag tag-aviso">Demo</span>}</div>
          </div>
        </div>
      </header>
      <div className="wrap py-10 grid gap-6 md:grid-cols-3">
        <div className="panel panel-pad"><div className="eyebrow mb-2">Equipo</div>{p.equipo ? <Link href={"/equipos/" + p.equipo.slug} className="d-2 block hover:text-[var(--rojo)]">{p.equipo.nombre}</Link> : <span className="muted">Agente libre</span>}</div>
        <div className="panel panel-pad"><div className="eyebrow mb-2">Juego</div><div className="d-2">{gameLabel(p.game) || "—"}</div></div>
        <div className="panel panel-pad"><div className="eyebrow mb-2">Estadísticas</div><p className="muted small">Las estadísticas aparecerán cuando el jugador dispute partidas registradas o vincule su cuenta de FACEIT.</p></div>
        {p.bio && <div className="panel panel-pad md:col-span-3"><div className="eyebrow mb-2">Bio</div><p>{p.bio}</p></div>}
      </div>
    </>
  );
}

export function Ranking() {
  const q = useApi<any>("/api/gpr");
  const [reg, setReg] = useState(0);
  const regions: any[] = q.data?.regions || [];
  return (
    <>
      <PageHead eyebrow="Ranking global" title="Ranking global" lead="Clasificación de equipos calculada en el servidor. El power ranking de VCT procede de Riot Games; el ranking propio de VANTS se publicará con la primera temporada." />
      <div className="wrap">
        {q.isLoading ? <Skel n={6} h={44} /> : q.error ? <ErrorBox error={q.error} what="el ranking" /> : regions.length === 0 ? <Empty code="ranking · 0" title="Ranking sin calcular" /> : (
          <>
            <div className="tabs mb-4" role="tablist">{regions.map((r, i) => <button key={r.id} role="tab" className="tab" aria-selected={reg === i} onClick={() => setReg(i)} data-testid={"tab-region-" + r.id}>{r.n}</button>)}</div>
            <div className="panel">
              <div className="row grid-cols-[48px_1fr_80px_90px] small muted" style={{ background: "var(--grafito-2)" }}><span>#</span><span>Equipo</span><span>Tag</span><span className="text-right">Puntos</span></div>
              <ol>
                {(regions[reg]?.equipos || []).map((e: any, i: number) => (
                  <li key={e.t + i} className="row grid-cols-[48px_1fr_80px_90px]">
                    <span className="num" style={{ color: i < 3 ? "var(--rojo)" : "var(--gris-2)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-semibold truncate">{e.n}</span>
                    <span className="tag w-fit">{e.t}</span>
                    <span className="num text-right">{e.p}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="small muted mt-3">Fuente: {q.data.source === "riot" ? "Riot Games (VCT Global Power Ranking)" : q.data.source} · calculado el {fecha(q.data.calculated, { day: "2-digit", month: "long", year: "numeric" })} · {q.data.total} equipos.</p>
          </>
        )}
      </div>
    </>
  );
}

export function Ranked() {
  return (
    <>
      <PageHead eyebrow="VANTS Ranked" title={<>VANTS <span style={{ color: "var(--rojo)" }}>Ranked</span></>} lead="Partidas con rango propio de VANTS para VALORANT y CS2. El emparejamiento y los puntos se calculan en el servidor." />
      <div className="wrap grid gap-6 md:grid-cols-3">
        {[
          ["01", "Vincula tu cuenta", "Conecta FACEIT o Riot para verificar tu identidad competitiva."],
          ["02", "Entra en cola", "El servidor empareja jugadores por nivel y región."],
          ["03", "Sube de rango", "Cada resultado verificado suma o resta puntos de temporada."],
        ].map(([n, t, d]) => <div key={n} className="panel panel-pad"><div className="num muted">{n}</div><div className="d-3 mt-2">{t}</div><p className="small muted mt-2">{d}</p></div>)}
      </div>
      <Section title="Clasificación de la temporada">
        <Empty code="ranked · sin temporada" title="La temporada de Ranked todavía no ha empezado" text="La tabla aparecerá cuando el backend publique la primera temporada. No se muestran posiciones provisionales." />
      </Section>
    </>
  );
}
