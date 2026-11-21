import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Empty, ErrorBox, GameTag, Initials, PageHead, Section, Skel } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { communityFetch, useCommunitySession } from "@/lib/communityApi";
import {
  MISSION_CATEGORIES,
  SEASON_TIERS,
  filterMissionsByCategory,
  missionCategoryLabel,
  type MissionWithProgress,
  type WeeklyMissionsResponse,
} from "@/lib/missionsHelpers";

function MissionCard({
  mission,
  isAuthenticated,
  onRequireSignIn,
  onUpdated,
}: {
  mission: MissionWithProgress;
  isAuthenticated: boolean;
  onRequireSignIn: () => void;
  onUpdated: (next: WeeklyMissionsResponse) => void;
}) {
  const { toast } = useFeedback();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(mission.proofNote || "");
  const [busy, setBusy] = useState(false);

  const handleRecordProgress = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    setBusy(true);
    try {
      const updated = await communityFetch<WeeklyMissionsResponse>(
        `/api/community/missions/${mission.code}/progress`,
        {
          method: "POST",
          body: { note: note.trim() || undefined },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      setNoteOpen(false);
      toast({
        kind: "ok",
        title: "Avance registrado",
        description: mission.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo registrar el avance",
        description: err?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async () => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    setBusy(true);
    try {
      const res = await communityFetch<WeeklyMissionsResponse & { xpAwarded?: number }>(
        `/api/community/missions/${mission.code}/claim`,
        {
          method: "POST",
          requireAuth: true,
        },
      );
      onUpdated(res);
      toast({
        kind: "ok",
        title: `+${res.xpAwarded || mission.xp} XP reclamados`,
        description: `Misión completada: ${mission.title}`,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo reclamar el XP",
        description: err?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const readyToClaim = mission.completed && !mission.claimed;

  return (
    <article
      className="panel panel-pad grid gap-4 content-between"
      style={
        mission.claimed
          ? { borderColor: "rgba(43, 213, 118, 0.35)" }
          : readyToClaim
            ? { borderColor: "var(--linea)", boxShadow: "inset 0 2px 0 var(--rojo)" }
            : undefined
      }
      data-testid={`mission-card-${mission.code}`}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="tag">{missionCategoryLabel(mission.category)}</span>
            <span className="tag">{mission.badgeTag}</span>
            {mission.games?.map((g) => (
              <GameTag key={g} g={g} />
            ))}
          </div>
          <span
            className={mission.claimed ? "tag tag-ok num" : "tag tag-rojo num"}
          >
            +{mission.xp} XP
          </span>
        </div>

        <div>
          <h3 className="d-3">{mission.title}</h3>
          <p className="small muted mt-1.5" style={{ lineHeight: 1.55 }}>
            {mission.description}
          </p>
        </div>

        {/* Individual Progress Bar */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="muted">
              {mission.claimed
                ? "Recompensa reclamada"
                : readyToClaim
                  ? "Objetivo alcanzado · Lista para reclamar"
                  : mission.trackingMode === "auto_or_manual"
                    ? "Sincronización automática + registro manual"
                    : "Progreso semanal"}
            </span>
            <span className="num font-semibold" style={{ color: "var(--blanco)" }}>
              {mission.current}/{mission.target} ({mission.percent}%)
            </span>
          </div>
          <div
            className="w-full h-2 overflow-hidden"
            style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
            role="progressbar"
            aria-valuenow={mission.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progreso de ${mission.title}`}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${mission.percent}%`,
                background: mission.claimed ? "var(--ok)" : "var(--rojo)",
              }}
            />
          </div>
        </div>

        {mission.proofNote && (
          <p className="text-xs muted">
            Referencia guardada: <span style={{ color: "var(--gris-1)" }}>{mission.proofNote}</span>
          </p>
        )}
      </div>

      <div className="grid gap-3 pt-2" style={{ borderTop: "1px solid var(--linea-suave)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={mission.actionTo} className="btn btn-sm btn-ghost">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            {mission.actionLabel}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {mission.claimed ? (
              <span className="tag tag-ok inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                Completada
              </span>
            ) : readyToClaim ? (
              <button
                type="button"
                className="btn btn-sm btn-rojo"
                disabled={busy}
                onClick={handleClaim}
                data-testid={`mission-claim-${mission.code}`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden />
                {busy ? "Reclamando…" : `Reclamar +${mission.xp} XP`}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequireSignIn();
                    return;
                  }
                  setNoteOpen((v) => !v);
                }}
                aria-expanded={noteOpen}
                data-testid={`mission-progress-btn-${mission.code}`}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Registrar avance (+1)
              </button>
            )}
          </div>
        </div>

        {noteOpen && isAuthenticated && !mission.completed && !mission.claimed && (
          <form
            onSubmit={handleRecordProgress}
            className="grid gap-2.5 p-3"
            style={{ background: "var(--negro)", border: "1px solid var(--linea)" }}
          >
            <label className="grid gap-1 text-xs">
              <span className="muted">
                Nota o referencia opcional (ej. nombre del torneo, enlace del clip o equipo)
              </span>
              <input
                type="text"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Copa VANTS VALORANT · Ronda 1"
                maxLength={200}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setNoteOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-rojo"
                disabled={busy}
              >
                {busy ? "Guardando…" : "Confirmar avance"}
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

export default function MisionesComunidad() {
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const session = useCommunitySession();
  const [category, setCategory] = useState<string>("");

  const queryKey = ["community-missions", session.isAuthenticated, session.displayName];

  const missionsQuery = useQuery<WeeklyMissionsResponse>({
    queryKey,
    queryFn: () => communityFetch<WeeklyMissionsResponse>("/api/community/missions"),
    staleTime: 20_000,
  });

  const data = missionsQuery.data;
  const missions = data?.missions || [];
  const filteredMissions = useMemo(
    () => filterMissionsByCategory(missions, category),
    [missions, category],
  );

  const handleUpdated = useCallback(
    (next: WeeklyMissionsResponse) => {
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ["community-missions"] });
    },
    [queryClient, queryKey],
  );

  const handleSignIn = async () => {
    try {
      await session.signIn("/comunidad/misiones");
      queryClient.invalidateQueries({ queryKey: ["community-missions"] });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo iniciar sesión",
        description: err?.message || "Inténtalo nuevamente.",
      });
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Fase 3"
        title={
          <>
            Retos y <span style={{ color: "var(--rojo)" }}>Misiones Semanales</span>
          </>
        }
        lead="Completa desafíos cada semana para sumar XP de Temporada 4, desbloquear insignias de comunidad y subir en la tabla de Top contribuidores."
        actions={
          !session.isAuthenticated ? (
            <button
              type="button"
              className="btn btn-rojo"
              onClick={handleSignIn}
              disabled={session.authBusy}
              data-testid="missions-signin-btn"
            >
              {session.authBusy ? "Conectando…" : "Iniciar sesión para participar"}
            </button>
          ) : (
            <div className="tag tag-ok inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" aria-hidden />
              {data?.summary.tier.name || "Recluta S4"}
            </div>
          )
        }
      />

      <div className="wrap pb-16 grid gap-8 overflow-x-clip">
        {missionsQuery.isLoading ? (
          <Skel h={140} n={3} />
        ) : missionsQuery.error || !data ? (
          <ErrorBox
            error={{ code: "misiones_error" }}
            what="las misiones semanales"
            onRetry={() => missionsQuery.refetch()}
          />
        ) : (
          <>
            {/* Personal Weekly Progress & Season Badge Overview */}
            <section
              className="panel panel-pad chamfer grid gap-5 min-w-0"
              style={{ borderColor: "var(--linea)", boxShadow: "inset 0 2px 0 var(--rojo)" }}
              aria-label="Resumen semanal de XP e insignias"
              data-testid="missions-summary-panel"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid gap-1">
                  <div className="eyebrow">
                    Semana {data.weekKey} · {data.weekRangeLabel}
                  </div>
                  <h2 className="d-2">
                    {session.isAuthenticated ? (
                      <>
                        Progreso de{" "}
                        <span style={{ color: "var(--rojo)" }}>{session.displayName}</span>
                      </>
                    ) : (
                      "Tu progreso semanal de Temporada 4"
                    )}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag inline-flex items-center gap-1.5 num">
                    <Clock className="w-3.5 h-3.5" aria-hidden />
                    {data.resetsInLabel}
                  </span>
                  <span
                    className="tag font-semibold"
                    style={{ borderColor: data.summary.tier.accent, color: data.summary.tier.accent }}
                  >
                    Insignia: {data.summary.tier.name}
                  </span>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 small">
                  <span>
                    <strong className="num" style={{ color: "var(--blanco)" }}>
                      {data.summary.xpEarned} / {data.summary.maxWeeklyXp} XP
                    </strong>{" "}
                    <span className="muted">
                      · {data.summary.missionsClaimed} de {data.summary.totalMissions} misiones completadas
                    </span>
                  </span>
                  <span className="muted num">
                    {data.summary.nextTier
                      ? `Faltan ${data.summary.xpToNextTier} XP para ${data.summary.nextTier.name}`
                      : "Rango máximo semanal alcanzado"}
                  </span>
                </div>
                <div
                  className="w-full h-3 overflow-hidden"
                  style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
                  role="progressbar"
                  aria-valuenow={data.summary.percentOverall}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progreso total de XP semanal"
                >
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${data.summary.percentOverall}%`,
                      background: "var(--rojo)",
                    }}
                  />
                </div>
              </div>

              {/* Season S4 Tier Strip */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {SEASON_TIERS.map((t) => {
                  const unlocked = data.summary.xpEarned >= t.minXp;
                  return (
                    <div
                      key={t.id}
                      className="p-3 flex items-center justify-between gap-2"
                      style={{
                        background: "var(--negro)",
                        border: `1px solid ${unlocked ? t.accent : "var(--linea-suave)"}`,
                        opacity: unlocked ? 1 : 0.65,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: unlocked ? t.accent : "var(--gris-1)" }}>
                          {t.name}
                        </div>
                        <div className="text-xs muted num">{t.minXp}+ XP</div>
                      </div>
                      <span className={unlocked ? "tag tag-ok" : "tag"}>
                        {unlocked ? "Activa" : "Bloqueada"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!session.isAuthenticated && (
                <div
                  className="p-3 flex flex-wrap items-center justify-between gap-3 small"
                  style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
                >
                  <span className="muted inline-flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0" style={{ color: "var(--rojo)" }} aria-hidden />
                    Inicia sesión con tu cuenta de VANTS o Google para guardar tu avance, reclamar XP y aparecer en el Top semanal.
                  </span>
                  <button type="button" className="btn btn-sm btn-rojo" onClick={handleSignIn}>
                    Iniciar sesión
                  </button>
                </div>
              )}
            </section>

            {/* Category filter tabs + Missions grid */}
            <section className="grid gap-5 min-w-0" aria-label="Desafíos activos de la semana">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="tabs flex-wrap max-w-full" role="tablist" aria-label="Filtrar misiones por categoría">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={category === ""}
                    className="tab"
                    onClick={() => setCategory("")}
                    data-testid="missions-cat-all"
                  >
                    Todas ({missions.length})
                  </button>
                  {MISSION_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={category === cat.id}
                      className="tab"
                      onClick={() => setCategory(cat.id)}
                      data-testid={`missions-cat-${cat.id}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <span className="small muted num">
                  {filteredMissions.length} {filteredMissions.length === 1 ? "desafío" : "desafíos"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2" data-testid="missions-grid">
                {filteredMissions.map((mission) => (
                  <MissionCard
                    key={mission.code}
                    mission={mission}
                    isAuthenticated={session.isAuthenticated}
                    onRequireSignIn={handleSignIn}
                    onUpdated={handleUpdated}
                  />
                ))}
              </div>
            </section>

            {/* Top Weekly Contributors Leaderboard */}
            <Section
              id="top-contribuidores"
              eyebrow={`Ranking semanal · ${data.weekKey}`}
              title="Top contribuidores de la semana"
              className="!px-0 !py-2"
            >
              {data.leaderboard.length === 0 ? (
                <Empty
                  code="top · 0"
                  title="La tabla semanal espera a su primer líder"
                  text="Completa cualquier misión y reclama su XP esta semana para inaugurar el ranking de Top contribuidores de VANTS."
                  action={
                    !session.isAuthenticated ? (
                      <button type="button" className="btn btn-sm btn-rojo" onClick={handleSignIn}>
                        Iniciar sesión y sumar XP
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="panel overflow-x-auto" data-testid="missions-leaderboard">
                  <table className="w-full text-left border-collapse small">
                    <thead>
                      <tr
                        className="text-xs uppercase tracking-wider muted"
                        style={{ borderBottom: "1px solid var(--linea)" }}
                      >
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Jugador</th>
                        <th className="py-3 px-4">Insignia S4</th>
                        <th className="py-3 px-4 text-right">Misiones</th>
                        <th className="py-3 px-4 text-right">XP Semanal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((row) => (
                        <tr
                          key={row.userId}
                          style={{
                            borderBottom: "1px solid var(--linea-suave)",
                            background: row.isViewer ? "rgba(255, 13, 46, 0.08)" : undefined,
                          }}
                        >
                          <td className="py-3 px-4 num font-bold">
                            {row.rank === 1 ? (
                              <span className="inline-flex items-center gap-1" style={{ color: "var(--rojo)" }}>
                                <Trophy className="w-3.5 h-3.5" aria-hidden /> #1
                              </span>
                            ) : (
                              `#${row.rank}`
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <Initials name={row.nick} size={30} />
                              <span className="font-semibold">
                                {row.nick}
                                {row.isViewer ? " (Tú)" : ""}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className="tag"
                              style={{ borderColor: row.tier.accent, color: row.tier.accent }}
                            >
                              {row.tier.name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right num">
                            {row.missionsCompleted}/{data.summary.totalMissions}
                          </td>
                          <td className="py-3 px-4 text-right num font-bold" style={{ color: "var(--blanco)" }}>
                            {row.xp} XP
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  );
}
