import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Plus, Shield } from "lucide-react";
import { Empty, ErrorBox, PageHead, Skel } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { CreateEventForm, EventCard } from "@/components/EventWidgets";
import { communityFetch, useCommunitySession } from "@/lib/communityApi";
import { JUEGOS } from "@/lib/juegos";
import {
  EVENT_TYPES,
  filterCommunityEvents,
  type CommunityEventsResponse,
} from "@/lib/eventsHelpers";

export default function EventosComunidad() {
  const [, navigate] = useLocation();
  const { toast } = useFeedback();
  const queryClient = useQueryClient();
  const session = useCommunitySession();

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const eventsQuery = useQuery<CommunityEventsResponse>({
    queryKey: ["community-events", session.isAuthenticated ? session.displayName || "auth" : "anon"],
    queryFn: () => communityFetch<CommunityEventsResponse>("/api/community/events"),
    staleTime: 20_000,
  });

  const handleUpdated = useCallback(
    (next: CommunityEventsResponse) => {
      queryClient.setQueryData(
        ["community-events", session.isAuthenticated ? session.displayName || "auth" : "anon"],
        next,
      );
      queryClient.invalidateQueries({ queryKey: ["community-events", "preview"] });
    },
    [queryClient, session.displayName, session.isAuthenticated],
  );

  const handleRequireSignIn = useCallback(() => {
    toast({
      kind: "info",
      title: "Sesión requerida",
      description: "Inicia sesión con tu cuenta VANTS o Google para confirmar tu asistencia (RSVP).",
    });
    navigate("/entrar");
  }, [navigate, toast]);

  const data = eventsQuery.data;
  const events = data?.events || [];
  const summary = data?.summary;
  const isModerator = Boolean(data?.viewer?.isModerator);

  const visibleEvents = useMemo(
    () =>
      filterCommunityEvents(events, {
        type: typeFilter,
        gameSlug: gameFilter,
        onlyMine,
      }),
    [events, typeFilter, gameFilter, onlyMine],
  );

  const availableGames = useMemo(() => {
    const slugs = new Set(events.map((e) => e.gameSlug));
    return JUEGOS.filter((j) => slugs.has(j.slug));
  }, [events]);

  const hasFilters = typeFilter !== "all" || gameFilter !== "all" || onlyMine;

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Fase 5"
        title={
          <>
            Eventos y <span style={{ color: "var(--rojo)" }}>Showmatches</span>
          </>
        }
        lead="Reserva tu cupo con inscripción RSVP, entra a la lista de espera automática si se llena y confirma tu check-in en showmatches, scrims abiertas, copas relámpago y watch parties."
        actions={
          <div className="flex flex-wrap gap-2">
            {isModerator ? (
              <button
                type="button"
                className="btn btn-sm btn-rojo"
                onClick={() => setShowCreateForm((v) => !v)}
                data-testid="events-new-btn"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Nuevo evento
              </button>
            ) : null}
            <Link href="/comunidad/votaciones" className="btn btn-sm btn-ghost">
              Votaciones y Pick'em
            </Link>
            <Link href="/comunidad" className="btn btn-sm btn-ghost">
              ← Comunidad
            </Link>
          </div>
        }
      />

      <div className="wrap pb-16">
        {/* Session Notice */}
        {!session.isAuthenticated ? (
          <div
            className="panel p-4 mb-4 flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: "rgba(229, 36, 59, 0.35)" }}
            data-testid="events-auth-banner"
          >
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: "var(--rojo)" }} aria-hidden="true" />
                <strong className="text-sm uppercase tracking-wider">
                  Inscripción RSVP y Check-in para jugadores registrados
                </strong>
              </div>
              <p className="small muted">
                Inicia sesión con tu cuenta VANTS o Google para apartar tu cupo, recibir ascenso automático desde lista de espera y activar tu check-in en vivo.
              </p>
            </div>
            <Link href="/entrar" className="btn btn-sm btn-rojo">
              Entrar / Registrarse →
            </Link>
          </div>
        ) : null}

        {/* KPI Overview Strip */}
        <div
          className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 mb-5"
          style={{ background: "var(--linea-suave)", border: "1px solid var(--linea-suave)" }}
          data-testid="events-kpi-strip"
        >
          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Próximos eventos</div>
            <div className="d-2 num mt-0.5">
              {eventsQuery.isLoading ? "…" : summary?.totalUpcoming ?? 0}
            </div>
            <div className="small muted mt-0.5">Showmatches, scrims y quedadas</div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Inscripciones totales</div>
            <div className="d-2 num mt-0.5">
              {eventsQuery.isLoading ? "…" : summary?.totalRsvps ?? 0}
            </div>
            <div className="small muted mt-0.5">Cupos confirmados y en espera</div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Tus RSVP confirmados</div>
            <div className="d-2 num mt-0.5" style={{ color: "var(--rojo)" }}>
              {eventsQuery.isLoading ? "…" : summary?.userConfirmedCount ?? 0}
            </div>
            <div className="small muted mt-0.5">
              {summary && summary.userWaitlistCount > 0
                ? `${summary.userWaitlistCount} en lista de espera`
                : "Listos para check-in"}
            </div>
          </div>

          <div className="p-4" style={{ background: "var(--grafito-1)" }}>
            <div className="small muted uppercase tracking-wider">Lista de espera</div>
            <div className="d-2 num mt-0.5">Automática</div>
            <div className="small muted mt-0.5">Si alguien cancela, sube el siguiente</div>
          </div>
        </div>

        {/* Moderator Create Event Form */}
        {showCreateForm && isModerator ? (
          <CreateEventForm
            onCreated={(next) => {
              handleUpdated(next);
              setShowCreateForm(false);
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        ) : null}

        {/* Filters */}
        <div className="grid gap-3 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de evento">
              <button
                type="button"
                className={"btn btn-sm " + (typeFilter === "all" ? "btn-rojo" : "btn-ghost")}
                aria-pressed={typeFilter === "all"}
                onClick={() => setTypeFilter("all")}
                data-testid="events-type-all"
              >
                Todos ({events.length})
              </button>
              {EVENT_TYPES.map((t) => {
                const count = events.filter((e) => e.type === t.value).length;
                if (count === 0 && typeFilter !== t.value) return null;
                return (
                  <button
                    key={t.value}
                    type="button"
                    className={"btn btn-sm " + (typeFilter === t.value ? "btn-rojo" : "btn-ghost")}
                    aria-pressed={typeFilter === t.value}
                    onClick={() => setTypeFilter(t.value)}
                    data-testid={"events-type-" + t.value}
                  >
                    {t.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session.isAuthenticated ? (
                <button
                  type="button"
                  className={"btn btn-sm " + (onlyMine ? "btn-rojo" : "btn-ghost")}
                  aria-pressed={onlyMine}
                  onClick={() => setOnlyMine((v) => !v)}
                  data-testid="events-filter-mine"
                >
                  <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Mis inscripciones
                </button>
              ) : null}
              {hasFilters ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setTypeFilter("all");
                    setGameFilter("all");
                    setOnlyMine(false);
                  }}
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          </div>

          {/* Game filter row */}
          {availableGames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por videojuego">
              <button
                type="button"
                className={"btn btn-sm " + (gameFilter === "all" ? "btn-rojo" : "btn-ghost")}
                aria-pressed={gameFilter === "all"}
                onClick={() => setGameFilter("all")}
                data-testid="events-game-all"
              >
                Todos los juegos
              </button>
              {availableGames.map((j) => (
                <button
                  key={j.slug}
                  type="button"
                  className={"btn btn-sm " + (gameFilter === j.slug ? "btn-rojo" : "btn-ghost")}
                  aria-pressed={gameFilter === j.slug}
                  onClick={() => setGameFilter(j.slug)}
                  data-testid={"events-game-" + j.slug}
                >
                  {j.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Event Cards Grid */}
        {eventsQuery.isLoading ? (
          <Skel h={220} n={3} />
        ) : eventsQuery.error ? (
          <ErrorBox
            error={{ code: "500", message: (eventsQuery.error as Error).message }}
            what="los eventos y showmatches"
            onRetry={() => eventsQuery.refetch()}
          />
        ) : visibleEvents.length === 0 ? (
          <Empty
            code="eventos · 0"
            title={
              onlyMine
                ? "Todavía no tienes inscripciones RSVP"
                : "No hay eventos que coincidan con tu filtro"
            }
            text={
              onlyMine
                ? "Confirma tu asistencia en cualquier showmatch, scrim abierta o copa relámpago para verlo aquí."
                : "Prueba limpiando los filtros para explorar toda la agenda comunitaria de VANTS."
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setTypeFilter("all");
                    setGameFilter("all");
                    setOnlyMine(false);
                  }}
                >
                  Ver todos los eventos
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-5" data-testid="events-list">
            {visibleEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isAuthenticated={session.isAuthenticated}
                isModerator={isModerator}
                onRequireSignIn={handleRequireSignIn}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
