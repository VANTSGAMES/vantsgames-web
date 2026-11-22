import { useState, type FormEvent } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Shield,
  Sparkles,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { GameTag, Initials } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { communityFetch } from "@/lib/communityApi";
import { JUEGOS } from "@/lib/juegos";
import { fecha, hora } from "@/lib/format";
import {
  EVENT_MODALITIES,
  EVENT_TYPES,
  eventModalityLabel,
  eventTypeLabel,
  formatEventCountdown,
  isSafeHttpUrl,
  validateEventDraft,
  type CommunityEventItem,
  type CommunityEventsResponse,
  type EventModality,
  type EventStatus,
  type EventType,
} from "@/lib/eventsHelpers";

export function EventCard({
  event,
  isAuthenticated,
  isModerator,
  onRequireSignIn,
  onUpdated,
}: {
  event: CommunityEventItem;
  isAuthenticated: boolean;
  isModerator: boolean;
  onRequireSignIn: () => void;
  onUpdated: (next: CommunityEventsResponse) => void;
}) {
  const { toast } = useFeedback();
  const [roleNote, setRoleNote] = useState(event.viewerRsvp?.roleNote || "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState<"rsvp" | "cancel" | "checkin" | "mod" | null>(null);

  const startDate = new Date(event.startsAt);
  const dayNum = String(startDate.getDate()).padStart(2, "0");
  const monthShort = fecha(event.startsAt, { month: "short" });
  const timeRange =
    hora(event.startsAt) + (event.endsAt ? ` – ${hora(event.endsAt)}` : "");
  const countdown = formatEventCountdown(event.startsAt);
  const hasRsvp = Boolean(event.viewerRsvp);

  const handleRsvp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    if (!event.isOpenForRsvp) return;
    setBusy("rsvp");
    try {
      const updated = await communityFetch<CommunityEventsResponse & { rsvpStatus?: string }>(
        `/api/community/events/${encodeURIComponent(event.id)}/rsvp`,
        {
          method: "POST",
          body: { roleNote: roleNote.trim() || undefined },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      setNoteOpen(false);
      toast({
        kind: "ok",
        title:
          updated.rsvpStatus === "waitlist"
            ? "Añadido a la lista de espera"
            : "Asistencia confirmada (RSVP)",
        description: event.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo registrar tu RSVP",
        description: err?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!isAuthenticated) return;
    setBusy("cancel");
    try {
      const updated = await communityFetch<CommunityEventsResponse>(
        `/api/community/events/${encodeURIComponent(event.id)}/rsvp`,
        {
          method: "DELETE",
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "info",
        title: "Inscripción cancelada",
        description: `Liberaste tu lugar en ${event.title}.`,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo cancelar",
        description: err?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCheckIn = async () => {
    if (!isAuthenticated) return;
    setBusy("checkin");
    try {
      const updated = await communityFetch<CommunityEventsResponse & { checkedIn?: boolean }>(
        `/api/community/events/${encodeURIComponent(event.id)}/checkin`,
        {
          method: "POST",
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "ok",
        title: updated.checkedIn ? "Check-in confirmado" : "Check-in retirado",
        description: event.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "Error de check-in",
        description: err?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleModStatus = async (status: EventStatus) => {
    setBusy("mod");
    try {
      const updated = await communityFetch<CommunityEventsResponse>(
        `/api/community/events/${encodeURIComponent(event.id)}`,
        {
          method: "PATCH",
          body: { status },
          requireAuth: true,
        },
      );
      onUpdated(updated);
      toast({
        kind: "ok",
        title: "Estado del evento actualizado",
        description: event.title,
      });
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo actualizar el evento",
        description: err?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  const statusTag =
    event.status === "cancelled" ? (
      <span className="tag tag-rojo">Cancelado</span>
    ) : event.status === "closed" || event.isPast ? (
      <span className="tag">Cerrado</span>
    ) : event.isFull ? (
      <span className="tag tag-aviso">Cupo lleno · Espera</span>
    ) : (
      <span className="tag tag-ok">Inscripción abierta</span>
    );

  return (
    <article
      className="panel p-5 sm:p-6 flex flex-col justify-between gap-4"
      style={{
        borderColor: event.featured ? "rgba(229, 36, 59, 0.45)" : undefined,
      }}
      data-testid={"event-card-" + event.id}
    >
      <div className="grid gap-3.5">
        {/* Top Header: Date box + Metadata */}
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 w-16 py-2.5 text-center grid gap-0.5"
            style={{
              background: event.featured ? "rgba(229, 36, 59, 0.14)" : "var(--grafito-2)",
              border: event.featured
                ? "1px solid rgba(229, 36, 59, 0.5)"
                : "1px solid var(--linea-suave)",
            }}
          >
            <span className="num d-2 leading-none">{dayNum}</span>
            <span className="small muted uppercase tracking-wider">{monthShort}</span>
          </div>

          <div className="min-w-0 grow grid gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {event.featured ? (
                <span className="tag tag-rojo inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  Destacado
                </span>
              ) : null}
              <span className="tag">{eventTypeLabel(event.type)}</span>
              {event.gameSlug === "general" ? (
                <span className="tag">General</span>
              ) : (
                <GameTag g={event.gameSlug} />
              )}
              <span className="tag">{eventModalityLabel(event.modality)}</span>
              {statusTag}
            </div>

            <h3 className="d-3">{event.title}</h3>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 small muted">
              <span className="inline-flex items-center gap-1 num">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {timeRange} · {countdown}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {event.location}
              </span>
            </div>
          </div>
        </div>

        <p className="small muted">{event.description}</p>

        {/* Capacity Progress Bar */}
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 small num">
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" style={{ color: "var(--rojo)" }} aria-hidden="true" />
              <strong>
                {event.confirmedCount} / {event.capacity}
              </strong>{" "}
              <span className="muted">confirmados</span>
              {event.waitlistCount > 0 ? (
                <span className="tag">{event.waitlistCount} en espera</span>
              ) : null}
            </span>
            <span className="muted">
              {event.spotsLeft > 0
                ? `${event.spotsLeft} ${event.spotsLeft === 1 ? "cupo libre" : "cupos libres"}`
                : "Lista de espera activa"}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden"
            style={{ background: "var(--grafito-2)" }}
            role="progressbar"
            aria-valuenow={event.fillPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Cupos ocupados en ${event.title}`}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${event.fillPercent}%`,
                background: event.isFull ? "var(--aviso, #f59e0b)" : "var(--rojo)",
              }}
            />
          </div>
        </div>

        {/* Confirmed Attendees Preview */}
        {event.attendeesPreview.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="small muted">Asistentes:</span>
            {event.attendeesPreview.map((a, idx) => (
              <span
                key={`${a.nick}-${idx}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs"
                style={{
                  background: "var(--grafito-2)",
                  border: a.checkedIn
                    ? "1px solid var(--ok)"
                    : "1px solid var(--linea-suave)",
                }}
              >
                <Initials name={a.nick} size={18} />
                <span>{a.nick}</span>
                {a.checkedIn ? (
                  <CheckCircle2 className="w-3 h-3" style={{ color: "var(--ok)" }} aria-label="Check-in listo" />
                ) : null}
              </span>
            ))}
            {event.confirmedCount > event.attendeesPreview.length ? (
              <span className="small muted num">
                +{event.confirmedCount - event.attendeesPreview.length} más
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Optional Note Input when expanding RSVP */}
        {noteOpen && event.isOpenForRsvp ? (
          <form onSubmit={handleRsvp} className="grid gap-2 pt-2">
            <label className="grid gap-1">
              <span className="small muted">
                Rol, Riot ID / FACEIT o nota opcional (máx. 120 caracteres)
              </span>
              <input
                type="text"
                className="input"
                maxLength={120}
                placeholder="Ej. Duelista / Inmortal 1 · Discord: jugador#1234"
                value={roleNote}
                onChange={(e) => setRoleNote(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-sm btn-rojo" disabled={busy !== null}>
                {busy === "rsvp"
                  ? "Guardando…"
                  : hasRsvp
                    ? "Actualizar nota"
                    : event.isFull
                      ? "Unirme a lista de espera"
                      : "Confirmar asistencia"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setNoteOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Footer Actions */}
      <footer
        className="pt-3.5 flex flex-wrap items-center justify-between gap-3"
        style={{ borderTop: "1px solid var(--linea-suave)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {hasRsvp ? (
            <>
              <span
                className={
                  event.viewerRsvp?.status === "confirmed"
                    ? "tag tag-ok inline-flex items-center gap-1"
                    : "tag tag-aviso inline-flex items-center gap-1"
                }
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {event.viewerRsvp?.status === "confirmed"
                  ? event.viewerRsvp.checkedIn
                    ? "Confirmado · Check-in listo"
                    : "Cupo confirmado"
                  : "En lista de espera"}
              </span>

              {event.viewerRsvp?.status === "confirmed" && event.status !== "cancelled" ? (
                <button
                  type="button"
                  className={
                    "btn btn-sm " + (event.viewerRsvp.checkedIn ? "btn-ghost" : "btn-rojo")
                  }
                  disabled={busy !== null}
                  onClick={handleCheckIn}
                  data-testid={"event-checkin-" + event.id}
                >
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {busy === "checkin"
                    ? "…"
                    : event.viewerRsvp.checkedIn
                      ? "Quitar check-in"
                      : "Hacer Check-in"}
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy !== null}
                onClick={handleCancel}
                data-testid={"event-cancel-" + event.id}
              >
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {busy === "cancel" ? "Cancelando…" : "Cancelar RSVP"}
              </button>
            </>
          ) : event.isOpenForRsvp ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-rojo"
                disabled={busy !== null}
                onClick={() => handleRsvp()}
                data-testid={"event-rsvp-" + event.id}
              >
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                {busy === "rsvp"
                  ? "Registrando…"
                  : event.isFull
                    ? "Unirme a lista de espera"
                    : "Confirmar asistencia (RSVP)"}
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setNoteOpen((v) => !v)}
                >
                  {noteOpen ? "Ocultar nota" : "+ Añadir rol / ID"}
                </button>
              ) : null}
            </>
          ) : (
            <span className="small muted">Inscripciones cerradas</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event.streamUrl && isSafeHttpUrl(event.streamUrl) ? (
            <a
              href={event.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-ghost inline-flex items-center gap-1"
            >
              Ver transmisión
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : null}

          {isModerator ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy !== null}
              onClick={() => handleModStatus(event.status === "open" ? "closed" : "open")}
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              {event.status === "open" ? "Cerrar cupos" : "Reabrir"}
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

export function CreateEventForm({
  onCreated,
  onCancel,
}: {
  onCreated: (next: CommunityEventsResponse) => void;
  onCancel: () => void;
}) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("showmatch");
  const [gameSlug, setGameSlug] = useState("valorant");
  const [modality, setModality] = useState<EventModality>("online");
  const [location, setLocation] = useState("Discord VANTS · Sala Oficial");
  const [streamUrl, setStreamUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [featured, setFeatured] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const check = validateEventDraft({
      title,
      type,
      gameSlug,
      modality,
      location,
      streamUrl: streamUrl.trim() || undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      capacity: Number(capacity),
      featured,
      description,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);
    try {
      const updated = await communityFetch<CommunityEventsResponse>("/api/community/events", {
        method: "POST",
        body: check.data,
        requireAuth: true,
      });
      onCreated(updated);
      toast({
        kind: "ok",
        title: "Evento publicado",
        description: check.data.title,
      });
    } catch (err: any) {
      setError(err?.message || "No se pudo publicar el evento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="panel p-5 sm:p-6 grid gap-4 mb-6"
      data-testid="create-event-form"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Moderación · Nuevo Evento o Showmatch</div>
          <h3 className="d-3 mt-1">Abrir inscripciones RSVP para la comunidad</h3>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cerrar
        </button>
      </div>

      <label className="grid gap-1.5">
        <span className="small muted">Título del evento</span>
        <input
          type="text"
          className="input"
          required
          maxLength={120}
          placeholder="Ej. Showmatch CS2 · Capitanes de Comunidad"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5">
          <span className="small muted">Tipo</span>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Videojuego</span>
          <select
            className="input"
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
          >
            <option value="general">General (todos)</option>
            {JUEGOS.map((j) => (
              <option key={j.slug} value={j.slug}>
                {j.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Modalidad</span>
          <select
            className="input"
            value={modality}
            onChange={(e) => setModality(e.target.value as EventModality)}
          >
            {EVENT_MODALITIES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Cupos máximos</span>
          <input
            type="number"
            min={2}
            max={500}
            className="input"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="small muted">Inicio</span>
          <input
            type="datetime-local"
            className="input"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Fin (opcional)</span>
          <input
            type="datetime-local"
            className="input"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="small muted">Lugar / Plataforma</span>
          <input
            type="text"
            className="input"
            required
            maxLength={140}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="small muted">Enlace de transmisión o Discord (opcional)</span>
          <input
            type="url"
            className="input"
            placeholder="https://www.twitch.tv/..."
            maxLength={400}
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
          />
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="small muted">Descripción</span>
        <textarea
          className="input"
          rows={3}
          required
          maxLength={600}
          placeholder="Formato del showmatch, reglas rápidas, premios o requisitos de check-in."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 small cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
        />
        Marcar como evento destacado
      </label>

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
          {busy ? "Publicando…" : "Publicar evento"}
        </button>
      </div>
    </form>
  );
}
