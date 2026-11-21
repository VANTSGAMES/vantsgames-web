import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  Shield,
  Trash2,
  Trophy,
  Unlock,
  Vote,
  XCircle,
} from "lucide-react";
import { GameTag } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { communityFetch } from "@/lib/communityApi";
import { JUEGOS } from "@/lib/juegos";
import { fecha } from "@/lib/format";
import {
  POLL_KINDS,
  formatPollCountdown,
  pickemStageLabel,
  pollKindLabel,
  validateCustomPollDraft,
  type CommunityVotingResponse,
  type PickemMatchWithStats,
  type PollKind,
  type PollWithResults,
} from "@/lib/votingHelpers";

export function PollCard({
  poll,
  isAuthenticated,
  isModerator,
  onRequireSignIn,
  onUpdated,
}: {
  poll: PollWithResults;
  isAuthenticated: boolean;
  isModerator: boolean;
  onRequireSignIn: () => void;
  onUpdated: (next: CommunityVotingResponse) => void;
}) {
  const { toast } = useFeedback();
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const handleVote = async (optionId: string) => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    if (!poll.isOpenForVoting) return;
    setBusyOptionId(optionId);
    try {
      const updated = await communityFetch<CommunityVotingResponse>(
        `/api/community/polls/${encodeURIComponent(poll.id)}/vote`,
        {
          method: "POST",
          body: { optionId },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "ok",
        title: poll.viewerOptionId ? "Voto actualizado" : "Voto registrado",
        description: poll.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo registrar tu voto",
        description: err?.message,
      });
    } finally {
      setBusyOptionId(null);
    }
  };

  const handleToggleStatus = async () => {
    setStatusBusy(true);
    try {
      const nextStatus = poll.status === "open" ? "closed" : "open";
      const updated = await communityFetch<CommunityVotingResponse>(
        `/api/community/polls/${encodeURIComponent(poll.id)}`,
        {
          method: "PATCH",
          body: { status: nextStatus },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "ok",
        title: nextStatus === "closed" ? "Encuesta cerrada" : "Encuesta reabierta",
        description: poll.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "Error al actualizar la encuesta",
        description: err?.message,
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const countdown = formatPollCountdown(poll.closesAt);

  return (
    <article
      className="panel p-5 sm:p-6 flex flex-col justify-between gap-4"
      data-testid={"poll-card-" + poll.id}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={poll.kind === "torneo" ? "tag tag-rojo" : "tag"}>
              {poll.badge || pollKindLabel(poll.kind)}
            </span>
            {poll.gameSlug ? <GameTag g={poll.gameSlug} /> : null}
            <span className={poll.isOpenForVoting ? "tag tag-ok" : "tag"}>
              {poll.isOpenForVoting ? "Abierta" : "Cerrada"}
            </span>
          </div>
          <span className="small muted num inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            {countdown}
          </span>
        </div>

        <div className="grid gap-1">
          <h3 className="d-3">{poll.title}</h3>
          <p className="small muted">{poll.description}</p>
        </div>

        <div className="grid gap-2 mt-1" role="group" aria-label={"Opciones de " + poll.title}>
          {poll.options.map((opt) => {
            const isSelected = poll.viewerOptionId === opt.id;
            const isBusy = busyOptionId === opt.id;
            const barWidth = poll.totalVotes > 0 ? Math.max(opt.percent, opt.votes > 0 ? 3 : 0) : 0;

            return (
              <button
                key={opt.id}
                type="button"
                disabled={!poll.isOpenForVoting || busyOptionId !== null}
                onClick={() => handleVote(opt.id)}
                aria-pressed={isSelected}
                data-testid={`poll-opt-${poll.id}-${opt.id}`}
                className="relative overflow-hidden text-left w-full px-3.5 py-3 transition-colors"
                style={{
                  background: isSelected ? "rgba(229, 36, 59, 0.12)" : "var(--grafito-2)",
                  border: isSelected ? "1px solid var(--rojo)" : "1px solid var(--linea-suave)",
                  cursor: poll.isOpenForVoting ? "pointer" : "not-allowed",
                  opacity: !poll.isOpenForVoting && !isSelected ? 0.8 : 1,
                }}
              >
                {/* Live percentage bar */}
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    background: isSelected
                      ? "rgba(229, 36, 59, 0.22)"
                      : "rgba(255, 255, 255, 0.06)",
                  }}
                />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="grid gap-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSelected ? (
                        <CheckCircle2
                          className="w-4 h-4 shrink-0"
                          style={{ color: "var(--rojo)" }}
                          aria-hidden="true"
                        />
                      ) : (
                        <Vote className="w-3.5 h-3.5 shrink-0 muted" aria-hidden="true" />
                      )}
                      <span className="font-semibold text-sm">{opt.label}</span>
                      {opt.tag ? <span className="tag">{opt.tag}</span> : null}
                      {isSelected ? (
                        <span className="tag tag-rojo">Tu voto</span>
                      ) : null}
                    </div>
                    {opt.subtitle ? (
                      <span className="small muted pl-5">{opt.subtitle}</span>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0 num">
                    <div className="font-bold text-sm">
                      {isBusy ? "…" : `${opt.percent}%`}
                    </div>
                    <div className="small muted">
                      {opt.votes} {opt.votes === 1 ? "voto" : "votos"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <footer
        className="pt-3 flex flex-wrap items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--linea-suave)" }}
      >
        <div className="small muted num">
          {poll.totalVotes} {poll.totalVotes === 1 ? "voto registrado" : "votos registrados"}
          {poll.viewerOptionId
            ? " · Puedes cambiar tu voto mientras siga abierta"
            : isAuthenticated
              ? " · Selecciona una opción para votar"
              : " · Exclusivo para cuentas registradas"}
        </div>

        {isModerator ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={statusBusy}
            onClick={handleToggleStatus}
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            {poll.status === "open" ? "Cerrar encuesta" : "Reabrir encuesta"}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

export function PickemMatchCard({
  match,
  isAuthenticated,
  isModerator,
  onRequireSignIn,
  onUpdated,
}: {
  match: PickemMatchWithStats;
  isAuthenticated: boolean;
  isModerator: boolean;
  onRequireSignIn: () => void;
  onUpdated: (next: CommunityVotingResponse) => void;
}) {
  const { toast } = useFeedback();
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [modBusy, setModBusy] = useState(false);

  const canPredict = !match.locked && !match.winnerId;

  const handlePredict = async (teamId: string) => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    if (!canPredict) return;
    setBusyTeamId(teamId);
    try {
      const updated = await communityFetch<CommunityVotingResponse>(
        `/api/community/pickem/${encodeURIComponent(match.id)}/predict`,
        {
          method: "POST",
          body: { pickedTeamId: teamId },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      const chosen = teamId === match.teamA.id ? match.teamA.name : match.teamB.name;
      toast({
        kind: "ok",
        title: "Predicción guardada",
        description: `Elegiste a ${chosen} en ${match.tournamentName}.`,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo guardar la predicción",
        description: err?.message,
      });
    } finally {
      setBusyTeamId(null);
    }
  };

  const handleModerate = async (payload: { winnerId?: string | null; locked?: boolean }) => {
    setModBusy(true);
    try {
      const updated = await communityFetch<CommunityVotingResponse>(
        `/api/community/pickem/${encodeURIComponent(match.id)}`,
        {
          method: "PATCH",
          body: payload,
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "ok",
        title: "Serie Pick'em actualizada",
        description: match.tournamentName,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo actualizar la serie",
        description: err?.message,
      });
    } finally {
      setModBusy(false);
    }
  };

  const teams = [
    { team: match.teamA, picks: match.teamAPicks, percent: match.teamAPercent },
    { team: match.teamB, picks: match.teamBPicks, percent: match.teamBPercent },
  ];

  return (
    <article
      className="panel p-5 flex flex-col justify-between gap-4"
      data-testid={"pickem-card-" + match.id}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={match.stage === "final" ? "tag tag-rojo" : "tag"}>
              {pickemStageLabel(match.stage)}
            </span>
            <GameTag g={match.gameSlug} />
            <span className="tag num">{match.bestOf}</span>
          </div>
          <span className="tag tag-rojo num">+{match.points} pts</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="d-3">{match.tournamentName}</h3>
          <span className="small muted num">
            {match.winnerId
              ? "Finalizado"
              : match.locked
                ? "Predicciones cerradas"
                : fecha(match.startsAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Team VS Buttons */}
        <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label={"Predicción para " + match.tournamentName}>
          {teams.map(({ team, picks, percent }) => {
            const isPicked = match.viewerPickTeamId === team.id;
            const isWinner = match.winnerId === team.id;
            const isBusy = busyTeamId === team.id;

            let border = "1px solid var(--linea-suave)";
            let bg = "var(--grafito-2)";
            if (isWinner) {
              border = "1px solid var(--ok)";
              bg = "rgba(34, 197, 94, 0.12)";
            } else if (isPicked) {
              border = "1px solid var(--rojo)";
              bg = "rgba(229, 36, 59, 0.14)";
            }

            return (
              <button
                key={team.id}
                type="button"
                disabled={!canPredict || busyTeamId !== null}
                onClick={() => handlePredict(team.id)}
                aria-pressed={isPicked}
                data-testid={`pickem-btn-${match.id}-${team.id}`}
                className="p-3.5 text-left grid gap-1.5 transition-colors"
                style={{
                  background: bg,
                  border,
                  cursor: canPredict ? "pointer" : "not-allowed",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tag num">{team.seed} · {team.tag}</span>
                  {isWinner ? (
                    <span className="tag tag-ok inline-flex items-center gap-1">
                      <Trophy className="w-3 h-3" aria-hidden="true" />
                      Ganador
                    </span>
                  ) : isPicked ? (
                    <span className="tag tag-rojo">Tu pick</span>
                  ) : null}
                </div>
                <div className="font-bold text-base truncate">{team.name}</div>
                <div className="small muted num">
                  {isBusy
                    ? "Guardando…"
                    : match.totalPicks > 0
                      ? `${percent}% (${picks} ${picks === 1 ? "pick" : "picks"})`
                      : "Sin predicciones aún"}
                </div>
              </button>
            );
          })}
        </div>

        {/* Community split bar */}
        <div className="grid gap-1">
          <div className="h-1.5 w-full overflow-hidden flex" style={{ background: "var(--grafito-2)" }}>
            <div
              style={{
                width: `${match.teamAPercent}%`,
                background: "var(--rojo)",
                transition: "width 240ms ease",
              }}
            />
            <div
              style={{
                width: `${match.teamBPercent}%`,
                background: "rgba(255, 255, 255, 0.25)",
                transition: "width 240ms ease",
              }}
            />
          </div>
          <div className="flex items-center justify-between small muted num">
            <span>{match.teamA.tag} {match.teamAPercent}%</span>
            <span>{match.totalPicks} predicciones</span>
            <span>{match.teamB.tag} {match.teamBPercent}%</span>
          </div>
        </div>
      </div>

      <footer
        className="pt-3 flex flex-wrap items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--linea-suave)" }}
      >
        <div className="small flex items-center gap-1.5">
          {match.viewerOutcome === "hit" ? (
            <span className="tag tag-ok inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Acierto · +{match.points} pts
            </span>
          ) : match.viewerOutcome === "miss" ? (
            <span className="tag inline-flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Fallo · 0 pts
            </span>
          ) : match.viewerOutcome === "pending" ? (
            <span className="muted">Predicción registrada · pendiente de resultado oficial</span>
          ) : (
            <span className="muted">
              {canPredict
                ? isAuthenticated
                  ? "Elige al ganador antes del inicio de la serie"
                  : "Inicia sesión para guardar tu predicción"
                : "Serie cerrada"}
            </span>
          )}
        </div>

        {isModerator ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={modBusy}
              onClick={() => handleModerate({ locked: !match.locked })}
            >
              {match.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {match.locked ? "Abrir" : "Bloquear"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={modBusy}
              onClick={() => handleModerate({ winnerId: match.teamA.id })}
            >
              Ganó {match.teamA.tag}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={modBusy}
              onClick={() => handleModerate({ winnerId: match.teamB.id })}
            >
              Ganó {match.teamB.tag}
            </button>
            {match.winnerId ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={modBusy}
                onClick={() => handleModerate({ winnerId: null, locked: false })}
              >
                Reiniciar
              </button>
            ) : null}
          </div>
        ) : null}
      </footer>
    </article>
  );
}

export function CreatePollForm({
  onCreated,
  onCancel,
}: {
  onCreated: (next: CommunityVotingResponse) => void;
  onCancel: () => void;
}) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<PollKind>("torneo");
  const [gameSlug, setGameSlug] = useState("general");
  const [closesInDays, setClosesInDays] = useState("5");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateOption = (idx: number, val: string) => {
    setOptions((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const addOption = () => {
    if (options.length < 6) setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const check = validateCustomPollDraft({
      title,
      description,
      kind,
      gameSlug,
      closesInDays: Number(closesInDays),
      options,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);
    try {
      const updated = await communityFetch<CommunityVotingResponse>("/api/community/polls", {
        method: "POST",
        body: {
          title: check.data.title,
          description: check.data.description,
          kind: check.data.kind,
          gameSlug: check.data.gameSlug,
          closesInDays: check.data.closesInDays,
          options: check.data.options.map((o) => o.label),
        },
        requireAuth: true,
      });
      onCreated(updated);
      toast({
        kind: "ok",
        title: "Encuesta oficial publicada",
        description: check.data.title,
      });
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la encuesta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="panel p-5 sm:p-6 grid gap-4 mb-6"
      data-testid="create-poll-form"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Moderación · Nueva Encuesta Oficial</div>
          <h3 className="d-3 mt-1">Publicar votación para jugadores registrados</h3>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cerrar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="small muted">Categoría</span>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as PollKind)}
          >
            {POLL_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Videojuego (opcional)</span>
          <select
            className="input"
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
          >
            <option value="general">General (todos los juegos)</option>
            {JUEGOS.map((j) => (
              <option key={j.slug} value={j.slug}>
                {j.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Duración (días)</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input"
            value={closesInDays}
            onChange={(e) => setClosesInDays(e.target.value)}
          />
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="small muted">Pregunta de la encuesta</span>
        <input
          type="text"
          className="input"
          placeholder="Ej. ¿Qué formato prefieres para la Copa Relámpago de CS2?"
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="small muted">Descripción breve</span>
        <textarea
          className="input"
          rows={2}
          maxLength={360}
          placeholder="Explica qué se decide con esta votación oficial."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="small muted">Opciones (mín. 2, máx. 6)</span>
          {options.length < 6 ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={addOption}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Añadir opción
            </button>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                className="input flex-1"
                placeholder={`Opción ${idx + 1}`}
                maxLength={90}
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-label={`Quitar opción ${idx + 1}`}
                  onClick={() => removeOption(idx)}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <p className="small" style={{ color: "var(--rojo)" }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-sm btn-rojo" disabled={busy}>
          {busy ? "Publicando…" : "Publicar encuesta oficial"}
        </button>
      </div>
    </form>
  );
}
