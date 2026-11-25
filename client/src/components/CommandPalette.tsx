import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { JUEGOS } from "@/lib/juegos";
import { normalizeText, searchCommandItems, type CommandItem } from "@/lib/discovery";
import { api, esAppNativa, type Paged, type Team, type Tournament } from "@/lib/api";

const EN_APP_NATIVA = esAppNativa();

/** Esenciales curados (el resto de la navegación ya vive en el header/menú). */
const ESPECIALES: CommandItem[] = [
  { id: "home", label: "Inicio", hint: "Portada del circuito VANTS GAMES", to: "/", group: "Ir a", keywords: ["home", "portada"] },
  { id: "ir-torneos", label: "Torneos", hint: "Próximos, en curso y archivo", to: "/torneos", group: "Ir a", keywords: ["competicion"] },
  { id: "ir-ranking", label: "Ranking global", hint: "Jugadores por ELO de FACEIT", to: "/ranking", group: "Ir a", keywords: ["sala"] },
  { id: "ir-clips", label: "Clips", hint: "Destacados de la comunidad", to: "/clips", group: "Ir a" },
  { id: "ir-planes", label: "Planes", hint: "PRO, CREATOR y Pase S4", to: "/membresias", group: "Ir a" },
  { id: "ir-empresas", label: "Empresas", hint: "Patrocinios y alianzas", to: "/empresas", group: "Ir a", keywords: ["b2b", "marcas"] },
  { id: "ir-soporte", label: "Soporte", hint: "Abrir un ticket", to: "/perfil/soporte", group: "Ir a", keywords: ["ticket", "ayuda"] },
  ...(!EN_APP_NATIVA
    ? [{ id: "ir-app", label: "App Android", hint: "Descargar VANTS Movil APK", to: "https://vants.cc/VANTSMovil.apk", group: "Ir a", keywords: ["apk", "descargar", "movil"] }]
    : []),
];

const JUEGOS_ITEMS: CommandItem[] = JUEGOS.map((j) => ({
  id: "juego-" + j.slug,
  label: `Torneos de ${j.nombre}`,
  hint: `${j.plataforma}${j.integrado ? " · Estadísticas integradas" : " · Circuito VANTS"}`,
  to: `/torneos?juego=${j.slug}`,
  group: "Juegos del circuito",
  keywords: [j.slug, j.label, j.plataforma, "torneos", "juego"],
}));

interface Vivo { items: CommandItem[]; cargando: boolean }

/** Motor de resultados en vivo: torneos, equipos y jugadores de la plataforma. */
function useResultadosVivo(abierto: boolean, consulta: string): Vivo {
  const torneos = useQuery<{ data: Paged<Tournament> }>({
    queryKey: ["palette-torneos"],
    queryFn: () => api<{ data: Paged<Tournament> }>("/api/tournaments?porPagina=60"),
    enabled: abierto,
    staleTime: 60_000,
  });
  const equipos = useQuery<{ data: Team[] }>({
    queryKey: ["palette-equipos"],
    queryFn: () => api<{ data: Team[] }>("/api/teams"),
    enabled: abierto,
    staleTime: 60_000,
  });
  const jugadores = useQuery<{ faceit: { nick: string; pos: number; elo: number | null; url: string }[] }>({
    queryKey: ["palette-jugadores"],
    queryFn: () => api<{ faceit: { nick: string; pos: number; elo: number | null; url: string }[] }>("/int/ranking"),
    enabled: abierto,
    staleTime: 120_000,
  });

  return useMemo(() => {
    const q = normalizeText(consulta);
    if (q.length < 2) return { items: [], cargando: false };
    const tocar = (n: string) => normalizeText(n).includes(q);
    const items: CommandItem[] = [];
    for (const t of (torneos.data?.data.items || []).slice(0, 60)) {
      if (tocar(t.nombre) || tocar(t.game?.nombre || "") || tocar(t.formato || "")) {
        items.push({ id: "torneo-" + t.slug, label: t.nombre, hint: [t.game?.nombre, t.formato, t.region].filter(Boolean).join(" · "), to: "/torneos/" + t.slug, group: "Torneos", keywords: ["vivo"] });
      }
      if (items.filter((i) => i.group === "Torneos").length >= 5) break;
    }
    for (const e of (equipos.data?.data || []).slice(0, 80)) {
      if (tocar(e.nombre) || tocar(e.tag || "") || tocar(e.slug)) {
        items.push({ id: "equipo-" + e.slug, label: e.nombre + (e.tag ? " [" + e.tag + "]" : ""), hint: "Equipo del circuito", to: "/equipos/" + e.slug, group: "Equipos", keywords: ["vivo"] });
      }
      if (items.filter((i) => i.group === "Equipos").length >= 5) break;
    }
    for (const j of jugadores.data?.faceit || []) {
      if (tocar(j.nick)) {
        items.push({ id: "jug-" + j.nick, label: j.nick, hint: "Jugador VANTS · ELO " + (j.elo ?? "—"), to: "/ranking", group: "Jugadores", keywords: ["vivo"] });
      }
      if (items.filter((i) => i.group === "Jugadores").length >= 5) break;
    }
    const cargando = torneos.isLoading || equipos.isLoading || jugadores.isLoading;
    return { items, cargando };
  }, [consulta, torneos.data, equipos.data, jugadores.data, torneos.isLoading, equipos.isLoading, jugadores.isLoading]);
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce: la consulta en vivo se dispara a los 220ms de dejar de teclear.
  useEffect(() => {
    const id = window.setTimeout(() => setConsulta(texto), 220);
    return () => window.clearTimeout(id);
  }, [texto]);

  const vivo = useResultadosVivo(open, consulta);

  const results = useMemo(() => {
    const estaticos = searchCommandItems([...ESPECIALES, ...JUEGOS_ITEMS], consulta);
    const estaticosRecortados = estaticos.slice(0, consulta.length >= 2 ? 6 : 12);
    return [...vivo.items, ...estaticosRecortados];
  }, [consulta, vivo.items]);

  const grouped = useMemo(() => {
    const map = new Map<string, { item: CommandItem; flatIdx: number }[]>();
    results.forEach((item, flatIdx) => {
      const list = map.get(item.group) || [];
      list.push({ item, flatIdx });
      map.set(item.group, list);
    });
    return Array.from(map.entries());
  }, [results]);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setTexto("");
      setConsulta("");
      setActiveIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [results.length]);

  const abrir = (item: CommandItem) => {
    onOpenChange(false);
    if (/^https:\/\//.test(item.to)) window.open(item.to, "_blank", "noopener");
    else setLocation(item.to);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      abrir(results[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 sm:pt-24"
      style={{ background: "rgba(5, 5, 7, 0.78)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Buscador rápido de VANTS GAMES"
      data-testid="command-palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden border shadow-2xl"
        style={{
          background: "var(--grafito-1)",
          borderColor: "var(--linea)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.75), inset 0 2px 0 var(--rojo)",
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--linea-suave)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ color: "var(--gris-2)" }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar torneos, equipos, jugadores o juegos…"
            aria-label="Buscar en VANTS"
            className="w-full bg-transparent text-sm outline-none focus:outline-none focus-visible:outline-none"
            style={{ color: "var(--blanco)", outline: "none" }}
            data-testid="command-palette-input"
          />
          {vivo.cargando && consulta.length >= 2 ? (
            <span className="text-xs muted shrink-0" style={{ fontFamily: "var(--f-mono)" }}>…</span>
          ) : null}
          <button type="button" onClick={() => onOpenChange(false)} className="tag shrink-0 cursor-pointer hover:text-white" aria-label="Cerrar buscador">ESC</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Resultados">
          {results.length === 0 ? (
            <div className="py-10 text-center small muted">
              {consulta.length >= 2
                ? "Sin coincidencias para «" + consulta + "». Prueba con un juego (VALORANT, CS2) o un nombre."
                : "Escribe para buscar torneos, equipos y jugadores en tiempo real, o navega por juegos."}
            </div>
          ) : (
            grouped.map(([group, entries]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-widest muted flex items-center gap-2" style={{ fontFamily: "var(--f-mono)" }}>
                  {group}
                  {group === "Torneos" || group === "Equipos" || group === "Jugadores" ? <span style={{ color: "var(--ok)" }}>· en vivo</span> : null}
                </div>
                {entries.map(({ item, flatIdx }) => {
                  const active = flatIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => abrir(item)}
                      data-testid={"cmd-item-" + item.id}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors"
                      style={{
                        background: active ? "var(--grafito-2)" : "transparent",
                        borderLeft: active ? "2px solid var(--rojo)" : "2px solid transparent",
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: active ? "var(--blanco)" : "var(--gris-1)" }}>{item.label}</div>
                        {item.hint && <div className="text-xs muted truncate">{item.hint}</div>}
                      </div>
                      <span className="text-xs muted shrink-0" style={{ fontFamily: "var(--f-mono)" }}>↵</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs muted"
          style={{ borderColor: "var(--linea-suave)", background: "var(--negro)", fontFamily: "var(--f-mono)" }}
        >
          <span>↑↓ navegar · ↵ abrir · ESC cerrar</span>
          <span>{results.length === 1 ? "1 resultado" : results.length + " resultados"}</span>
        </div>
      </div>
    </div>
  );
}
