import { CuentasRegistradas, RosterOficialPagina } from "./PerfilPublico";
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { useApi } from "@/lib/useApi";
import { filtrosJuegos } from "@/lib/juegos";
import { filterTeams } from "@/lib/discovery";
import { api, assetUrl, type Team, type PtPlayer, type AccountPlayer, type Paged } from "@/lib/api";
import { PageHead, Section, Empty, Skel, ErrorBox, GameTag, Initials } from "@/components/ui-vants";
import { TeamTile, PlayerTile, MatchRow } from "@/components/domain";
import { fecha, gameLabel } from "@/lib/format";
import { EquiposCTA, MiembrosVants, FaceitDeJugador } from "./Vants";
import { UpsellPlan } from "./Torneos";
import { useMembresia } from "@/lib/useMembresia";

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
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Juego">
            {filtrosJuegos().map((j) => <button key={j.v} className={"btn btn-sm " + (juego === j.v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === j.v} onClick={() => setJuego(j.v)}>{j.l}</button>)}
          </div>
        </div>
        {teams.isLoading || loading ? <Skel /> : teams.error ? <ErrorBox error={teams.error} what="los jugadores" onRetry={() => teams.refetch()} /> : vis.length === 0 ? (
          <Empty code="jugadores · 0" title={q || juego ? "Ningún jugador coincide con el filtro" : "Todavía no hay jugadores en plantillas"} />
        ) : (
          <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-3">{vis.map((p) => <PlayerTile key={p.slug} p={p} />)}</div>
        )}
      </div>
      <Section title="Cuentas registradas" eyebrow="Plataforma">
        <CuentasRegistradas />
      </Section>
    </>
  );
}

export function Equipos() {
  const q = useApi<{ data: Team[] }>("/api/teams");
  const [juego, setJuego] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const vis = useMemo(() => filterTeams(q.data?.data || [], { juego, query: busqueda }), [q.data, juego, busqueda]);
  return (
    <>
      <PageHead eyebrow="Circuito" title="Equipos del circuito" lead="Equipos registrados en VANTS con su plantilla y sus partidas. Crea el tuyo e invita a tus compañeros con un código." />
      <div className="wrap grid gap-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <input
            className="input w-full sm:w-80"
            placeholder="Buscar equipo por nombre, tag o región"
            aria-label="Buscar equipo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            data-testid="input-buscar-equipo"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Juego">
            {filtrosJuegos().map((j) => <button key={j.v} className={"btn btn-sm " + (juego === j.v ? "btn-rojo" : "btn-ghost")} aria-pressed={juego === j.v} onClick={() => setJuego(j.v)} data-testid={"filter-equipos-" + (j.v || "todos")}>{j.l}</button>)}
          </div>
        </div>
        {q.isLoading ? <Skel /> : q.error ? <ErrorBox error={q.error} what="los equipos" onRetry={() => q.refetch()} /> : vis.length === 0 ? (
          <Empty code={"equipos · " + (juego || "todos")} title={busqueda ? "Ningún equipo coincide con la búsqueda" : "No hay equipos en esta categoría"} />
        ) : <div className="grid-auto grid sm:grid-cols-2 lg:grid-cols-3">{vis.map((t) => <TeamTile key={t.slug} t={t} />)}</div>}
      </div>
      <EquiposCTA />
    </>
  );
}

/** Foto y ficha VANTS de un jugador de plantilla, buscando su nombre entre los alias de las cuentas. */
function useCuentasPorAlias() {
  const q = useApi<{ jugadores: { pid: string; nick: string; avatar: string | null; alias?: string[] }[] }>("/int/jugadores");
  return (nombre: string) => { const n = nombre.toLowerCase(); return (q.data?.jugadores || []).find((j) => j.nick.toLowerCase() === n || (j.alias || []).includes(n)) || null; };
}

function TeamView({ slug, oficial = false }: { slug: string; oficial?: boolean }) {
  const q = useApi<{ data: Team }>("/api/teams/" + slug);
  const cuenta = useCuentasPorAlias();
  if (q.isLoading) return <div className="wrap py-16"><Skel n={4} /></div>;
  const noExiste = q.error && (q.error.status === 404 || /no encontrado/i.test(q.error.code));
  if (q.error && oficial && noExiste)
    return (
      <>
        <PageHead eyebrow="Roster oficial" title="Equipo VANTS" />
        <div className="wrap pb-20"><Empty code="roster · 0" title="El roster oficial todavía no está publicado" text="Cuando la organización registre el equipo VANTS desde el panel de administración aparecerá aquí con su plantilla." action={<Link href="/equipos" className="link-arrow">Ver equipos del circuito →</Link>} /></div>
      </>
    );
  if (q.error) return <div className="wrap py-16">{noExiste ? <Empty code="404 · equipo" title="Este equipo no existe" action={<Link href="/equipos" className="link-arrow">Ver equipos →</Link>} /> : <ErrorBox error={q.error} what="el equipo" />}</div>;
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
            {t.plantilla!.map((p) => { const c = cuenta(p.nombre); return (
              <Link key={p.slug} href={c ? "/u/" + c.pid : "/jugadores/" + p.slug} className="p-5 grid gap-3 hover:bg-[var(--grafito-2)] transition-colors" data-testid={"roster-" + p.slug}>
                {c?.avatar ? <img src={c.avatar} alt="" width={56} height={56} className="chamfer object-cover" style={{ width: 56, height: 56 }} referrerPolicy="no-referrer" /> : <Initials name={p.nombre} size={56} />}
                <div><div className="d-2">{p.nombre}</div><div className="small muted mt-1">{p.rol || "Jugador"}{p.pais ? " · " + p.pais : ""}</div></div>
              </Link>
            ); })}
          </div>
        )}
      </Section>
      <MiembrosVants slug={t.slug} />
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
  return <RosterOficialPagina />;
}

export function JugadorDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useApi<{ data: PtPlayer & { equipo?: Team } }>("/api/players/" + slug);
  if (q.isLoading) return <div className="wrap py-16"><Skel n={3} /></div>;
  if (q.error) return <div className="wrap py-16">{q.error.status === 404 || /no encontrado/i.test(q.error.code) ? <Empty code="404 · jugador" title="Este jugador no existe" action={<Link href="/sala" className="link-arrow">Ir a la sala →</Link>} /> : <ErrorBox error={q.error} what="el jugador" />}</div>;
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
        <div className="panel panel-pad"><div className="eyebrow mb-2">FACEIT</div><FaceitDeJugador slug={p.slug} /></div>
        {p.bio && <div className="panel panel-pad md:col-span-3"><div className="eyebrow mb-2">Bio</div><p>{p.bio}</p></div>}
      </div>
    </>
  );
}

export function Ranked() {
  const mem = useMembresia();
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
      {mem.sinPlan && (
        <div className="wrap pb-2">
          <UpsellPlan motivo="ranked" />
        </div>
      )}
      <Section title="Clasificación de la temporada">
        <Empty code="ranked · sin temporada" title="La temporada de Ranked todavía no ha empezado" text="La tabla aparecerá cuando el backend publique la primera temporada. No se muestran posiciones provisionales." />
      </Section>
    </>
  );
}
