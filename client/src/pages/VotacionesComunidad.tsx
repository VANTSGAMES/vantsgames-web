import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Plus,
  Shield,
  Target,
  Trophy,
  Vote,
} from "lucide-react";
import { Empty, ErrorBox, Initials, PageHead, Section, Skel } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { CreatePollForm, PickemMatchCard, PollCard } from "@/components/VotingWidgets";
import { communityFetch, useCommunitySession } from "@/lib/communityApi";
import {
  POLL_KINDS,
  filterPollsByKind,
  type CommunityVotingResponse,
  type PollKind,
} from "@/lib/votingHelpers";

type VotingViewMode = "all" | "polls" | "pickem";

export default function VotacionesComunidad() {
  const [, navigate] = useLocation();
  const { toast } = useFeedback();
  const queryClient = useQueryClient();
  const session = useCommunitySession();

  const [viewMode, setViewMode] = useState<VotingViewMode>("all");
  const [pollKindFilter, setPollKindFilter] = useState<"all" | PollKind>("all");
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  const votingQuery = useQuery<CommunityVotingResponse>({
    queryKey: ["community-voting", session.isAuthenticated ? session.displayName || "auth" : "anon"],
    queryFn: () => communityFetch<CommunityVotingResponse>("/api/community/voting"),
    staleTime: 20_000,
  });

  const handleUpdated = useCallback(
    (next: CommunityVotingResponse) => {
      queryClient.setQueryData(
        ["community-voting", session.isAuthenticated ? session.displayName || "auth" : "anon"],
        next,
      );
      queryClient.invalidateQueries({ queryKey: ["community-voting", "preview"] });
    },
    [queryClient, session.displayName, session.isAuthenticated],
  );

  const handleRequireSignIn = useCallback(() => {
    toast({
      kind: "info",
      title: "Sesión requerida",
      description: "Inicia sesión con tu cuenta VANTS o Google para votar y participar en el Pick'em.",
    });
    navigate("/entrar");
  }, [navigate, toast]);

  const data = votingQuery.data;
  const polls = data?.polls || [];
  const pickemMatches = data?.pickemMatches || [];
  const summary = data?.pickemSummary;
  const leaderboard = data?.leaderboard || [];
  const isModerator = Boolean(data?.viewer?.isModerator);

  const visiblePolls = useMemo(
    () => filterPollsByKind(polls, pollKindFilter),
    [polls, pollKindFilter],
  );

  const openPollsCount = useMemo(
    () => polls.filter((p) => p.isOpenForVoting).length,
    [polls],
  );

  const totalCommunityVotes = useMemo(
    () => polls.reduce((acc, p) => acc + p.totalVotes, 0),
    [polls],
  );

  const totalPickemPicks = useMemo(
    () => pickemMatches.reduce((acc, m) => acc + m.totalPicks, 0),
    [pickemMatches],
  );

  const userVotesCast = useMemo(
    () => polls.filter((p) => p.viewerOptionId !== null).length,
    [polls],
  );

  const pickemPercent =
    summary && summary.maxPoints > 0
      ? Math.round((summary.points / summary.maxPoints) * 100)
      : 0;

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Fase 4"
        title={
          <>
            Encuestas y <span style={{ color: "var(--rojo)" }}>Votaciones</span>
          </>
        }
        lead="Votaciones oficiales exclusivas para cuentas activas: decide el próximo torneo comunitario, vota el Clip de la Semana o MVP y compite en el Pick'em de finales."
        actions={
          <div className="flex flex-wrap gap-2">
            {isModerator ? (
              <button
                type="button"
                className="btn btn-sm btn-rojo"
                onClick={() => setShowCreatePoll((v) => !v)}
                data-testid="voting-new-poll-btn"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Nueva encuesta
              </button>
            ) : null}
            <Link href="/comunidad/misiones" className="btn btn-sm btn-ghost">
              Misiones Semanales
            </Link>
            <Link href="/comunidad" className="btn btn-sm btn-ghost">
              ← Comunidad
            </Link>
          </div>
        }
      />

      <div className="wrap">
        {/* Session Status Banner */}
        {!session.isAuthenticated ? (
          <div
            className="panel p-4 mb-4 flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: "rgba(229, 36, 59, 0.35)" }}
            data-testid="voting-auth-banner"
          >
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: "var(--rojo)" }} aria-hidden="true" />
                <strong className="text-sm uppercase tracking-wider">
                  Votaciones exclusivas para jugadores registrados
                </strong>
              </div>
              <p className="small muted">
                Puedes consultar los resultados y enfrentamientos en vivo. Inicia sesión con Auth0 o Google para emitir tu voto (1 por cuenta) y entrar al Ranking Pick'em.
              </p>
            </div>
            <Link href="/entrar" className="btn btn-sm btn-rojo">
              Entrar / Registrarse →
            </Link>
          </div>
        ) : null}

        {/* KPI Overview Strip */}
        <div
          className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 mb-4"
          style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}
          data-testid="voting-kpi-strip"
        >
          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Encuestas activas</div>
            <div className="d-2 num mt-0.5">
              {votingQuery.isLoading ? "…" : `${openPollsCount} / ${polls.length}`}
            </div>
            <div className="small muted mt-0.5">
              {session.isAuthenticated
                ? `Tus votos emitidos: ${userVotesCast}`
                : `${totalCommunityVotes} votos totales`}
            </div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Series Pick'em</div>
            <div className="d-2 num mt-0.5">
              {votingQuery.isLoading ? "…" : pickemMatches.length}
            </div>
            <div className="small muted mt-0.5">
              {summary
                ? session.isAuthenticated
                  ? `Tus picks: ${summary.picksSubmitted} / ${summary.totalMatches}`
                  : `${totalPickemPicks} predicciones totales`
                : "Semifinales y Gran Final"}
            </div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Tu puntaje Pick'em</div>
            <div className="d-2 num mt-0.5" style={{ color: "var(--rojo)" }}>
              {summary ? `${summary.points} / ${summary.maxPoints} pts` : "0 / 60 pts"}
            </div>
            <div className="small muted mt-0.5">
              {summary && summary.resolvedCount > 0
                ? `${summary.hits} aciertos · ${summary.accuracyPercent}% precisión`
                : "10 pts Semifinal · 20 pts Gran Final"}
            </div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Participantes Pick'em</div>
            <div className="d-2 num mt-0.5">{leaderboard.length}</div>
            <div className="small muted mt-0.5">
              {leaderboard.length > 0
                ? `Líder actual: ${leaderboard[0].nick}`
                : "Ranking en vivo de aciertos"}
            </div>
          </div>
        </div>

        {/* Top View Switcher */}
        <div className="tabs mb-2" role="tablist" aria-label="Secciones de votaciones">
          {[
            { id: "all" as const, label: "Todo (Encuestas + Pick'em)" },
            { id: "polls" as const, label: `Encuestas y MVP (${polls.length})` },
            { id: "pickem" as const, label: `Pick'em Finales (${pickemMatches.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={viewMode === tab.id}
              className="tab"
              onClick={() => setViewMode(tab.id)}
              data-testid={"voting-tab-" + tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showCreatePoll && isModerator ? (
          <CreatePollForm
            onCreated={(next) => {
              handleUpdated(next);
              setShowCreatePoll(false);
            }}
            onCancel={() => setShowCreatePoll(false)}
          />
        ) : null}

        {votingQuery.isLoading ? (
          <Skel h={220} n={2} />
        ) : votingQuery.error ? (
          <ErrorBox
            error={{ code: "500", message: (votingQuery.error as Error).message }}
            what="las votaciones oficiales"
            onRetry={() => votingQuery.refetch()}
          />
        ) : null}
      </div>

      {/* SECTION 1: OFFICIAL POLLS (NEXT TOURNAMENT + CLIP OF THE WEEK / MVP) */}
      {!votingQuery.isLoading && !votingQuery.error && (viewMode === "all" || viewMode === "polls") ? (
        <Section
          id="encuestas-oficiales"
          eyebrow="Voto de la Comunidad"
          title="Encuestas Oficiales, Clip de la Semana y MVP"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar encuestas por tipo">
              <button
                type="button"
                className={"btn btn-sm " + (pollKindFilter === "all" ? "btn-rojo" : "btn-ghost")}
                aria-pressed={pollKindFilter === "all"}
                onClick={() => setPollKindFilter("all")}
                data-testid="poll-filter-all"
              >
                Todas ({polls.length})
              </button>
              {POLL_KINDS.map((k) => {
                const count = polls.filter((p) => p.kind === k.value).length;
                if (count === 0 && pollKindFilter !== k.value) return null;
                return (
                  <button
                    key={k.value}
                    type="button"
                    className={"btn btn-sm " + (pollKindFilter === k.value ? "btn-rojo" : "btn-ghost")}
                    aria-pressed={pollKindFilter === k.value}
                    onClick={() => setPollKindFilter(k.value)}
                    data-testid={"poll-filter-" + k.value}
                  >
                    {k.label} ({count})
                  </button>
                );
              })}
            </div>
            <span className="small muted inline-flex items-center gap-1.5">
              <Vote className="w-3.5 h-3.5" aria-hidden="true" />
              1 voto verificado por cuenta · resultados en tiempo real
            </span>
          </div>

          {visiblePolls.length === 0 ? (
            <Empty
              code="encuestas · 0"
              title="No hay encuestas en esta categoría"
              text="Cambia el filtro para explorar las demás votaciones oficiales activas de VANTS GAMES."
              action={
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setPollKindFilter("all")}
                >
                  Ver todas las encuestas
                </button>
              }
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2" data-testid="polls-grid">
              {visiblePolls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  isAuthenticated={session.isAuthenticated}
                  isModerator={isModerator}
                  onRequireSignIn={handleRequireSignIn}
                  onUpdated={handleUpdated}
                />
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {/* SECTION 2: PICK'EM FINALS & ACCURACY LEADERBOARD */}
      {!votingQuery.isLoading && !votingQuery.error && (viewMode === "all" || viewMode === "pickem") ? (
        <>
          <Section
            id="pickem-finales"
            eyebrow="Predicciones Oficiales"
            title="Pick'em de Finales · Temporada 4"
          >
            {/* Personal Pick'em Progress Bar */}
            {summary ? (
              <div className="panel p-5 mb-6 grid gap-3" data-testid="pickem-progress-panel">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" style={{ color: "var(--rojo)" }} aria-hidden="true" />
                    <strong className="text-sm uppercase tracking-wider">
                      Tu progreso Pick'em S4
                    </strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 small num">
                    <span className="tag tag-rojo">{summary.points} / {summary.maxPoints} pts</span>
                    <span className="tag">{summary.picksSubmitted} / {summary.totalMatches} series</span>
                    {summary.resolvedCount > 0 ? (
                      <span className="tag tag-ok">{summary.accuracyPercent}% precisión</span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="h-2 w-full overflow-hidden"
                  style={{ background: "var(--grafito-2)" }}
                  role="progressbar"
                  aria-valuenow={pickemPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Puntaje Pick'em acumulado"
                >
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${pickemPercent}%`,
                      background: "var(--rojo)",
                    }}
                  />
                </div>
                <p className="small muted">
                  Selecciona al ganador de cada serie antes de que inicie el partido. Cada Semifinal acertada suma <strong>10 pts</strong> y cada Gran Final suma <strong>20 pts</strong>.
                </p>
              </div>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2" data-testid="pickem-grid">
              {pickemMatches.map((match) => (
                <PickemMatchCard
                  key={match.id}
                  match={match}
                  isAuthenticated={session.isAuthenticated}
                  isModerator={isModerator}
                  onRequireSignIn={handleRequireSignIn}
                  onUpdated={handleUpdated}
                />
              ))}
            </div>
          </Section>

          <Section
            id="ranking-pickem"
            eyebrow="Tabla de Precisión"
            title="Ranking de Aciertos Pick'em"
          >
            {leaderboard.length === 0 ? (
              <Empty
                code="pickem · 0"
                title="El ranking de aciertos aún está esperando tus predicciones"
                text="Envía tus picks en las Semifinales y Grandes Finales de arriba. En cuanto registres tu primera predicción aparecerás aquí y sumarás puntos al cerrarse cada serie."
                action={
                  session.isAuthenticated ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-rojo"
                      onClick={() =>
                        document.getElementById("pickem-finales")?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      Hacer mis predicciones ↑
                    </button>
                  ) : (
                    <Link href="/entrar" className="btn btn-sm btn-rojo">
                      Iniciar sesión para participar →
                    </Link>
                  )
                }
              />
            ) : (
              <div className="panel overflow-x-auto" data-testid="pickem-leaderboard">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="small muted uppercase tracking-wider"
                      style={{ borderBottom: "1px solid var(--linea-suave)" }}
                    >
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Jugador</th>
                      <th className="py-3 px-4 text-right">Picks</th>
                      <th className="py-3 px-4 text-right">Aciertos</th>
                      <th className="py-3 px-4 text-right">Precisión</th>
                      <th className="py-3 px-4 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row) => (
                      <tr
                        key={row.userId}
                        style={{
                          borderBottom: "1px solid var(--linea-suave)",
                          background: row.isViewer ? "rgba(229, 36, 59, 0.08)" : undefined,
                        }}
                      >
                        <td className="py-3 px-4 num font-bold">
                          {row.rank === 1 ? (
                            <span className="inline-flex items-center gap-1" style={{ color: "var(--rojo)" }}>
                              <Trophy className="w-3.5 h-3.5" aria-hidden="true" />1
                            </span>
                          ) : (
                            row.rank
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Initials name={row.nick} size={28} />
                            <span className="font-semibold">{row.nick}</span>
                            {row.isViewer ? <span className="tag tag-rojo">Tú</span> : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right num muted">
                          {row.picksSubmitted} / {pickemMatches.length}
                        </td>
                        <td className="py-3 px-4 text-right num">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--ok)" }} aria-hidden="true" />
                            {row.hits} / {row.resolvedCount}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right num">
                          <span className="tag">{row.accuracyPercent}%</span>
                        </td>
                        <td className="py-3 px-4 text-right num font-bold">
                          <span className="inline-flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" style={{ color: "var(--rojo)" }} aria-hidden="true" />
                            {row.points} pts
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
