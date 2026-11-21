import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  Copy,
  Plus,
  Send,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Empty, ErrorBox, GameTag, PageHead, Skel } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { JUEGOS } from "@/lib/juegos";
import { gameLabel } from "@/lib/format";
import { communityFetch, useCommunitySession } from "@/lib/communityApi";
import {
  LFG_REGIONS,
  LFG_TYPE_OPTIONS,
  filterLfgListings,
  formatExpiryCountdown,
  validateLfgApplication,
  validateLfgDraft,
  type LfgApplicationItem,
  type LfgListingItem,
  type LfgType,
} from "@/lib/lfgHelpers";

const TYPE_BADGE: Record<LfgType, { label: string; tone: "rojo" | "ok" | "neutral" }> = {
  lft: { label: "LFT · Busco equipo", tone: "rojo" },
  lfg: { label: "LFG · Busco jugador", tone: "ok" },
  scrim: { label: "SCRIM · Entreno", tone: "neutral" },
};

const EMPTY_DRAFT = {
  type: "lft" as LfgType,
  gameSlug: "valorant",
  title: "",
  teamName: "",
  roleNeeded: "",
  rankLevel: "",
  schedule: "",
  region: "VE",
  slotsOpen: "1",
  contact: "",
  notes: "",
};

function typeTagClass(type: LfgType): string {
  const tone = TYPE_BADGE[type]?.tone;
  if (tone === "rojo") return "tag tag-rojo";
  if (tone === "ok") return "tag tag-ok";
  return "tag";
}

function ApplicationDrawer({
  listing,
  onStatusChanged,
}: {
  listing: LfgListingItem;
  onStatusChanged: () => void;
}) {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<LfgApplicationItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await communityFetch<{ applications: LfgApplicationItem[] }>(
        `/api/community/lfg/${listing.id}/applications`,
        { requireAuth: true },
      );
      setApps(data.applications || []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [listing.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDecision = async (appId: number, status: "accepted" | "declined") => {
    setBusyId(appId);
    try {
      await communityFetch(`/api/community/lfg/applications/${appId}`, {
        method: "PATCH",
        body: { status },
        requireAuth: true,
      });
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
      toast({
        kind: "ok",
        title: status === "accepted" ? "Solicitud aceptada" : "Solicitud rechazada",
      });
      onStatusChanged();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo actualizar", description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="mt-4 pt-4 grid gap-3"
      style={{ borderTop: "1px solid var(--linea-suave)" }}
      data-testid={`lfg-apps-drawer-${listing.id}`}
    >
      <div className="eyebrow">Solicitudes recibidas ({apps.length})</div>
      {loading ? (
        <Skel h={48} n={2} />
      ) : error ? (
        <p className="small" style={{ color: "#ff5468" }}>{error}</p>
      ) : apps.length === 0 ? (
        <p className="small muted">Todavía no has recibido solicitudes en este anuncio.</p>
      ) : (
        <div className="grid gap-2">
          {apps.map((app) => (
            <div
              key={app.id}
              className="p-3 grid gap-2"
              style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="small">{app.applicantNick}</strong>
                  <span className="tag">{app.role}</span>
                  <span className="small muted num">{app.contact}</span>
                </div>
                <span
                  className={
                    app.status === "accepted"
                      ? "tag tag-ok"
                      : app.status === "declined"
                        ? "tag tag-rojo"
                        : "tag"
                  }
                >
                  {app.status === "accepted"
                    ? "Aceptada"
                    : app.status === "declined"
                      ? "Rechazada"
                      : "Pendiente"}
                </span>
              </div>
              <p className="small" style={{ color: "var(--gris-1)" }}>{app.message}</p>
              {app.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === app.id}
                    onClick={() => handleDecision(app.id, "accepted")}
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden /> Aceptar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busyId === app.id}
                    onClick={() => handleDecision(app.id, "declined")}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LfgCard({
  item,
  isAuthenticated,
  onRequireSignIn,
  onDeleted,
  onApplied,
}: {
  item: LfgListingItem;
  isAuthenticated: boolean;
  onRequireSignIn: () => void;
  onDeleted: () => void;
  onApplied: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [applyOpen, setApplyOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [role, setRole] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.contact);
      toast({
        kind: "ok",
        title: "Contacto copiado",
        description: item.contact,
      });
    } catch {
      toast({
        kind: "info",
        title: "Contacto de " + item.authorNick,
        description: item.contact,
      });
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Eliminar anuncio",
      description: "Tu publicación desaparecerá del buscador junto con sus solicitudes.",
      details: [item.title, gameLabel(item.gameSlug)],
      confirmLabel: "Eliminar anuncio",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await communityFetch(`/api/community/lfg/${item.id}`, {
        method: "DELETE",
        requireAuth: true,
      });
      toast({ kind: "ok", title: "Anuncio eliminado" });
      onDeleted();
    } catch (err: any) {
      toast({ kind: "error", title: "No se pudo eliminar", description: err?.message });
    } finally {
      setDeleting(false);
    }
  };

  const handleApplySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const check = validateLfgApplication({ role, contact, message });
    if (!check.ok) {
      setFormError(check.error);
      return;
    }
    setSubmitting(true);
    try {
      await communityFetch(`/api/community/lfg/${item.id}/apply`, {
        method: "POST",
        body: check.data,
        requireAuth: true,
      });
      toast({
        kind: "ok",
        title: "Solicitud enviada",
        description: `Se notificó a ${item.authorNick}.`,
      });
      setApplyOpen(false);
      setRole("");
      setContact("");
      setMessage("");
      onApplied();
    } catch (err: any) {
      setFormError(err?.message || "No se pudo enviar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  const badge = TYPE_BADGE[item.type] || TYPE_BADGE.lft;
  const applyLabel = item.type === "scrim" ? "Proponer scrim" : "Solicitar unirse";

  return (
    <article
      className="panel panel-pad grid gap-4 content-between"
      data-testid={`lfg-card-${item.id}`}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={typeTagClass(item.type)}>{badge.label}</span>
            <GameTag g={item.gameSlug} />
            <span className="tag">{item.region}</span>
          </div>
          <span className="small muted num inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            {formatExpiryCountdown(item.expiresAt)}
          </span>
        </div>

        <div>
          <h3 className="d-3">{item.title}</h3>
          <p className="small muted mt-1">
            Publicado por <strong style={{ color: "var(--gris-1)" }}>{item.authorNick}</strong>
            {item.teamName ? ` · Equipo ${item.teamName}` : ""}
          </p>
        </div>

        <dl
          className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 small"
          style={{ background: "var(--negro)", border: "1px solid var(--linea-suave)" }}
        >
          <div>
            <dt className="muted text-xs uppercase tracking-wider">Rol / Posición</dt>
            <dd className="font-semibold mt-0.5">{item.roleNeeded}</dd>
          </div>
          <div>
            <dt className="muted text-xs uppercase tracking-wider">Rango / ELO</dt>
            <dd className="font-semibold mt-0.5">{item.rankLevel}</dd>
          </div>
          <div>
            <dt className="muted text-xs uppercase tracking-wider">Horario</dt>
            <dd className="mt-0.5" style={{ color: "var(--gris-1)" }}>{item.schedule}</dd>
          </div>
          <div>
            <dt className="muted text-xs uppercase tracking-wider">
              {item.type === "lft" ? "Contacto" : "Cupos libres"}
            </dt>
            <dd className="mt-0.5 num font-semibold">
              {item.type === "lft" ? item.contact : `${item.slotsOpen} ${item.slotsOpen === 1 ? "cupo" : "cupos"}`}
            </dd>
          </div>
        </dl>

        {item.notes && (
          <p className="small" style={{ color: "var(--gris-1)", lineHeight: 1.55 }}>
            {item.notes}
          </p>
        )}
      </div>

      <div className="grid gap-3 pt-2" style={{ borderTop: "1px solid var(--linea-suave)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={handleCopy}
            aria-label={`Copiar contacto de ${item.authorNick}`}
            data-testid={`lfg-copy-${item.id}`}
          >
            <Copy className="w-3.5 h-3.5" aria-hidden />
            Copiar contacto
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {item.isOwner ? (
              <>
                <button
                  type="button"
                  className={"btn btn-sm " + (appsOpen ? "btn-rojo" : "")}
                  aria-expanded={appsOpen}
                  onClick={() => setAppsOpen((v) => !v)}
                  data-testid={`lfg-toggle-apps-${item.id}`}
                >
                  <Users className="w-3.5 h-3.5" aria-hidden />
                  Solicitudes ({item.applicationsCount})
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={deleting}
                  onClick={handleDelete}
                  aria-label={`Eliminar anuncio ${item.title}`}
                  data-testid={`lfg-delete-${item.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  Eliminar
                </button>
              </>
            ) : item.hasApplied ? (
              <span className="tag tag-ok">Solicitud enviada</span>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-rojo"
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequireSignIn();
                    return;
                  }
                  setApplyOpen((v) => !v);
                }}
                aria-expanded={applyOpen}
                data-testid={`lfg-apply-btn-${item.id}`}
              >
                <Send className="w-3.5 h-3.5" aria-hidden />
                {applyLabel}
              </button>
            )}
          </div>
        </div>

        {applyOpen && !item.isOwner && !item.hasApplied && (
          <form
            onSubmit={handleApplySubmit}
            className="grid gap-3 p-3.5"
            style={{ background: "var(--negro)", border: "1px solid var(--linea)" }}
            data-testid={`lfg-apply-form-${item.id}`}
          >
            <div className="eyebrow">{applyLabel}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="grid gap-1 small">
                <span className="muted">Tu rol o equipo</span>
                <input
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={item.type === "scrim" ? "Nombre de tu equipo / Bo3" : "Ej. Controlador / IGL"}
                  maxLength={60}
                  required
                />
              </label>
              <label className="grid gap-1 small">
                <span className="muted">Tu Discord o contacto</span>
                <input
                  className="input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Ej. discord: @tuusuario"
                  maxLength={80}
                  required
                />
              </label>
            </div>
            <label className="grid gap-1 small">
              <span className="muted">Mensaje breve</span>
              <textarea
                className="input"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Rango, experiencia en torneos y disponibilidad."
                maxLength={320}
                required
              />
            </label>
            {formError && (
              <p className="small" role="alert" style={{ color: "#ff5468" }}>
                {formError}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setApplyOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-rojo"
                disabled={submitting}
              >
                {submitting ? "Enviando…" : "Enviar solicitud"}
              </button>
            </div>
          </form>
        )}

        {appsOpen && item.isOwner && (
          <ApplicationDrawer listing={item} onStatusChanged={onApplied} />
        )}
      </div>
    </article>
  );
}

export default function BuscadorEquipo() {
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const session = useCommunitySession();

  const [game, setGame] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [composerOpen, setComposerOpen] = useState(false);

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const listingsQuery = useQuery<{ listings: LfgListingItem[] }>({
    queryKey: ["community-lfg", session.isAuthenticated, session.displayName],
    queryFn: () => communityFetch<{ listings: LfgListingItem[] }>("/api/community/lfg"),
    staleTime: 20_000,
  });

  const allListings = listingsQuery.data?.listings || [];

  const filtered = useMemo(
    () =>
      filterLfgListings(allListings, {
        game,
        type: typeFilter,
        region: regionFilter,
        query: search,
      }),
    [allListings, game, typeFilter, regionFilter, search],
  );

  const refreshListings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["community-lfg"] });
  }, [queryClient]);

  const handleSignIn = async () => {
    try {
      await session.signIn("/comunidad/lfg");
      refreshListings();
    } catch (err: any) {
      toast({
        kind: "error",
        title: "No se pudo iniciar sesión",
        description: err?.message || "Inténtalo nuevamente.",
      });
    }
  };

  const handleToggleComposer = () => {
    if (!session.isAuthenticated) {
      handleSignIn();
      return;
    }
    setPublishError(null);
    if (game) {
      setDraft((d) => ({ ...d, gameSlug: game }));
    }
    setComposerOpen((v) => !v);
  };

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    setPublishError(null);
    const check = validateLfgDraft(draft);
    if (!check.ok) {
      setPublishError(check.error);
      return;
    }
    setPublishBusy(true);
    try {
      await communityFetch("/api/community/lfg", {
        method: "POST",
        body: check.data,
        requireAuth: true,
      });
      toast({
        kind: "ok",
        title: "Anuncio publicado",
        description: "Estará activo durante 7 días en el buscador de VANTS.",
      });
      setDraft({ ...EMPTY_DRAFT, gameSlug: draft.gameSlug, region: draft.region });
      setComposerOpen(false);
      refreshListings();
    } catch (err: any) {
      setPublishError(err?.message || "No se pudo publicar el anuncio.");
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Fase 1"
        title={
          <>
            Buscador de <span style={{ color: "var(--rojo)" }}>Equipo y Scrims</span>
          </>
        }
        lead="Encuentra roster competitivo (LFT), completa tu equipo (LFG) o pacta scrims en cualquiera de los 11 videojuegos del circuito VANTS. Los anuncios expiran automáticamente a los 7 días."
        actions={
          <button
            type="button"
            className="btn btn-rojo"
            onClick={handleToggleComposer}
            disabled={session.authBusy}
            data-testid="lfg-open-composer"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {composerOpen
              ? "Cerrar formulario"
              : session.isAuthenticated
                ? "Publicar anuncio"
                : session.authBusy
                  ? "Conectando…"
                  : "Iniciar sesión y publicar"}
          </button>
        }
      />

      <div className="wrap pb-16 grid gap-6 overflow-x-clip">
        {/* Session indicator bar */}
        <div
          className="panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 small min-w-0"
          style={{ borderColor: "var(--linea-suave)" }}
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" style={{ color: "var(--rojo)" }} aria-hidden />
            {session.isAuthenticated ? (
              <span className="min-w-0">
                Sesión activa como{" "}
                <strong style={{ color: "var(--blanco)" }}>{session.displayName}</strong> · Puedes publicar anuncios y gestionar solicitudes.
              </span>
            ) : (
              <span className="muted min-w-0">
                Explora anuncios abiertos gratis. Inicia sesión para publicar tarjetas LFT/LFG/Scrim o solicitar unirte.
              </span>
            )}
          </div>
          <span className="num muted text-xs shrink-0">
            {filtered.length} {filtered.length === 1 ? "anuncio activo" : "anuncios activos"} · Expiración 7d
          </span>
        </div>

        {/* Publish composer */}
        {composerOpen && session.isAuthenticated && (
          <section
            className="panel panel-pad chamfer grid gap-5 min-w-0"
            aria-label="Publicar anuncio de equipo o scrim"
            style={{ borderColor: "var(--linea)", boxShadow: "inset 0 2px 0 var(--rojo)" }}
            data-testid="lfg-composer"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Nuevo anuncio</div>
                <h2 className="d-2 mt-1">Publicar en el buscador</h2>
              </div>
              <span className="tag">Expira automáticamente en 7 días</span>
            </div>

            <form onSubmit={handlePublish} className="grid gap-4">
              {/* Type selector */}
              <div className="grid sm:grid-cols-3 gap-2" role="group" aria-label="Tipo de anuncio">
                {LFG_TYPE_OPTIONS.map((opt) => {
                  const active = draft.type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, type: opt.id }))}
                      aria-pressed={active}
                      className="p-3.5 text-left transition-colors"
                      style={{
                        background: active ? "var(--grafito-2)" : "var(--negro)",
                        border: `1px solid ${active ? "var(--rojo)" : "var(--linea-suave)"}`,
                      }}
                      data-testid={`lfg-draft-type-${opt.id}`}
                    >
                      <div className="d-3 text-sm">{opt.label}</div>
                      <p className="text-xs muted mt-1">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <label className="grid gap-1.5 small">
                  <span className="muted">Videojuego *</span>
                  <select
                    className="input"
                    value={draft.gameSlug}
                    onChange={(e) => setDraft((d) => ({ ...d, gameSlug: e.target.value }))}
                    data-testid="lfg-draft-game"
                  >
                    {JUEGOS.map((j) => (
                      <option key={j.slug} value={j.slug}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 small">
                  <span className="muted">Región *</span>
                  <select
                    className="input"
                    value={draft.region}
                    onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}
                    data-testid="lfg-draft-region"
                  >
                    {LFG_REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.type !== "lft" ? (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Cupos libres (1–10)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="input"
                      value={draft.slotsOpen}
                      onChange={(e) => setDraft((d) => ({ ...d, slotsOpen: e.target.value }))}
                      data-testid="lfg-draft-slots"
                    />
                  </label>
                ) : (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Contacto / Discord *</span>
                    <input
                      className="input"
                      value={draft.contact}
                      onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
                      placeholder="Ej. discord: @tuusuario"
                      maxLength={80}
                      required
                      data-testid="lfg-draft-contact"
                    />
                  </label>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <label className="grid gap-1.5 small">
                  <span className="muted">Titular del anuncio *</span>
                  <input
                    className="input"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder={
                      draft.type === "lft"
                        ? "Ej. Duelist Ascendente 3 buscando equipo para Copa VANTS"
                        : draft.type === "lfg"
                          ? "Ej. Buscamos IGL y Smoker para roster estable"
                          : "Ej. Scrim Bo3 hoy 21:00 VET — Nivel FACEIT 8+"
                    }
                    maxLength={90}
                    required
                    data-testid="lfg-draft-title"
                  />
                </label>

                {draft.type !== "lft" ? (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Nombre del equipo</span>
                    <input
                      className="input"
                      value={draft.teamName}
                      onChange={(e) => setDraft((d) => ({ ...d, teamName: e.target.value }))}
                      placeholder="Ej. VANTS Academy / Caracas Five"
                      maxLength={60}
                      data-testid="lfg-draft-team"
                    />
                  </label>
                ) : (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Rol o posición *</span>
                    <input
                      className="input"
                      value={draft.roleNeeded}
                      onChange={(e) => setDraft((d) => ({ ...d, roleNeeded: e.target.value }))}
                      placeholder="Ej. Duelist / Initiator / AWPer / Flex"
                      maxLength={60}
                      required
                      data-testid="lfg-draft-role"
                    />
                  </label>
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {draft.type !== "lft" && (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Rol requerido / Formato *</span>
                    <input
                      className="input"
                      value={draft.roleNeeded}
                      onChange={(e) => setDraft((d) => ({ ...d, roleNeeded: e.target.value }))}
                      placeholder={draft.type === "scrim" ? "Ej. 5v5 Bo3 · Map pool activo" : "Ej. IGL + Controlador"}
                      maxLength={60}
                      required
                      data-testid="lfg-draft-role"
                    />
                  </label>
                )}

                <label className="grid gap-1.5 small">
                  <span className="muted">Rango / ELO *</span>
                  <input
                    className="input"
                    value={draft.rankLevel}
                    onChange={(e) => setDraft((d) => ({ ...d, rankLevel: e.target.value }))}
                    placeholder="Ej. Inmortal 1+ / FACEIT Nvl 8 / Elite"
                    maxLength={50}
                    required
                    data-testid="lfg-draft-rank"
                  />
                </label>

                <label className="grid gap-1.5 small">
                  <span className="muted">Horario habitual *</span>
                  <input
                    className="input"
                    value={draft.schedule}
                    onChange={(e) => setDraft((d) => ({ ...d, schedule: e.target.value }))}
                    placeholder="Ej. Lun–Vie 20:00–23:00 VET"
                    maxLength={80}
                    required
                    data-testid="lfg-draft-schedule"
                  />
                </label>

                {draft.type !== "lft" && (
                  <label className="grid gap-1.5 small">
                    <span className="muted">Contacto / Discord *</span>
                    <input
                      className="input"
                      value={draft.contact}
                      onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
                      placeholder="Ej. discord: @capitan"
                      maxLength={80}
                      required
                      data-testid="lfg-draft-contact"
                    />
                  </label>
                )}
              </div>

              <label className="grid gap-1.5 small">
                <span className="muted">Detalles adicionales (opcional)</span>
                <textarea
                  className="input"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Requisitos de micrófono, torneos objetivo, servidor preferido (Miami / Bogotá / Santiago)..."
                  maxLength={400}
                  data-testid="lfg-draft-notes"
                />
              </label>

              {publishError && (
                <p className="small" role="alert" style={{ color: "#ff5468" }}>
                  {publishError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setComposerOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-rojo"
                  disabled={publishBusy}
                  data-testid="lfg-publish-submit"
                >
                  {publishBusy ? "Publicando…" : "Publicar anuncio"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Filter bar: 11 games + type + region + search */}
        <section className="grid gap-4 min-w-0" aria-label="Filtros del buscador">
          <div className="flex flex-wrap gap-1.5 min-w-0" role="group" aria-label="Filtrar por videojuego">
            <button
              type="button"
              className={"btn btn-sm " + (game === "" ? "btn-rojo" : "btn-ghost")}
              aria-pressed={game === ""}
              onClick={() => setGame("")}
              data-testid="lfg-game-all"
            >
              Todos los juegos
            </button>
            {JUEGOS.map((j) => (
              <button
                key={j.slug}
                type="button"
                className={"btn btn-sm " + (game === j.slug ? "btn-rojo" : "btn-ghost")}
                aria-pressed={game === j.slug}
                onClick={() => setGame(j.slug)}
                data-testid={`lfg-game-${j.slug}`}
              >
                {j.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 min-w-0">
            <div className="tabs flex-wrap max-w-full" role="tablist" aria-label="Tipo de búsqueda">
              {[
                { id: "", label: "Todos" },
                { id: "lft", label: "LFT · Equipo" },
                { id: "lfg", label: "LFG · Jugador" },
                { id: "scrim", label: "Scrims" },
              ].map((t) => (
                <button
                  key={t.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === t.id}
                  className="tab"
                  onClick={() => setTypeFilter(t.id)}
                  data-testid={`lfg-type-${t.id || "all"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-[180px_minmax(0,260px)] gap-2 w-full lg:w-auto">
              <select
                className="input w-full"
                aria-label="Filtrar por región"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                data-testid="lfg-region-select"
              >
                <option value="">Todas las regiones</option>
                {LFG_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              <input
                type="search"
                className="input w-full"
                aria-label="Buscar por rol, rango, equipo o horario"
                placeholder="Buscar rol, rango, equipo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="lfg-search-input"
              />
            </div>
          </div>
        </section>

        {/* Results list */}
        {listingsQuery.isLoading ? (
          <Skel h={148} n={3} />
        ) : listingsQuery.error ? (
          <ErrorBox
            error={{ code: "lfg_error" }}
            what="el buscador de equipos y scrims"
            onRetry={() => listingsQuery.refetch()}
          />
        ) : filtered.length === 0 ? (
          <Empty
            code={game ? `lfg · ${game}` : "lfg · 0"}
            title={
              allListings.length === 0
                ? "Todavía no hay anuncios publicados"
                : `No hay anuncios activos con estos filtros`
            }
            text={
              allListings.length === 0
                ? "Sé el primero en publicar tu perfil LFT, abrir cupos para tu equipo o pactar un scrim en cualquiera de los 11 juegos de VANTS."
                : "Prueba quitando un filtro de juego, región o tipo, o publica un nuevo anuncio ahora mismo."
            }
            action={
              <div className="flex flex-wrap gap-2 mt-1">
                {(game || typeFilter || regionFilter || search) && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setGame("");
                      setTypeFilter("");
                      setRegionFilter("");
                      setSearch("");
                    }}
                  >
                    Ver todos los juegos
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-rojo"
                  onClick={handleToggleComposer}
                >
                  {session.isAuthenticated ? "Publicar anuncio" : "Iniciar sesión y publicar"}
                </button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2" data-testid="lfg-listings-grid">
            {filtered.map((item) => (
              <LfgCard
                key={item.id}
                item={item}
                isAuthenticated={session.isAuthenticated}
                onRequireSignIn={handleSignIn}
                onDeleted={refreshListings}
                onApplied={refreshListings}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
