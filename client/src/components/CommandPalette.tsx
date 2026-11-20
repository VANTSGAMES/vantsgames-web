import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation } from "wouter";
import { NAV } from "@/lib/nav";
import { JUEGOS } from "@/lib/juegos";
import { searchCommandItems, type CommandItem } from "@/lib/discovery";

const BASE_ITEMS: CommandItem[] = [
  { id: "home", label: "Inicio", hint: "Portada del circuito VANTS GAMES", to: "/", group: "Navegación", keywords: ["home", "portada"] },
  ...NAV.flatMap((g) =>
    g.links
      .filter((l) => !l.privado)
      .map((l) => ({
        id: "nav-" + l.to,
        label: l.label,
        hint: l.hint,
        to: l.to,
        group: g.label,
        keywords: [g.label],
      })),
  ),
  ...JUEGOS.map((j) => ({
    id: "juego-" + j.slug,
    label: `Torneos de ${j.nombre}`,
    hint: `${j.plataforma}${j.integrado ? " · Integrado con estadísticas y logros" : " · Circuito VANTS"}`,
    to: `/torneos?juego=${j.slug}`,
    group: "Juegos del circuito",
    keywords: [j.slug, j.label, j.plataforma, "torneos", "juego"],
  })),
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCommandItems(BASE_ITEMS, query), [query]);

  // Agrupar resultados conservando el orden de relevancia
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
      setQuery("");
      setActiveIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (to: string) => {
    onOpenChange(false);
    setLocation(to);
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
      go(results[activeIndex].to);
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ir a torneos, juegos (VALORANT, CS2, FC 27…), Workspace, membresías…"
            aria-label="Buscar sección o juego"
            className="w-full bg-transparent text-sm outline-none focus:outline-none focus-visible:outline-none"
            style={{ color: "var(--blanco)", outline: "none" }}
            data-testid="command-palette-input"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="tag shrink-0 cursor-pointer hover:text-white"
            aria-label="Cerrar buscador"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Resultados de navegación">
          {results.length === 0 ? (
            <div className="py-10 text-center small muted">
              Sin coincidencias para «{query}». Prueba con un juego (VALORANT, CS2, Smash) o sección (Workspace, Planes).
            </div>
          ) : (
            grouped.map(([group, entries]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-widest muted" style={{ fontFamily: "var(--f-mono)" }}>
                  {group}
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
                      onClick={() => go(item.to)}
                      data-testid={"cmd-item-" + item.id}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors"
                      style={{
                        background: active ? "var(--grafito-2)" : "transparent",
                        borderLeft: active ? "2px solid var(--rojo)" : "2px solid transparent",
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: active ? "var(--blanco)" : "var(--gris-1)" }}>
                          {item.label}
                        </div>
                        {item.hint && <div className="text-xs muted truncate">{item.hint}</div>}
                      </div>
                      <span className="text-xs muted shrink-0" style={{ fontFamily: "var(--f-mono)" }}>
                        ↵
                      </span>
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
          <span>{results.length === 1 ? "1 acceso" : `${results.length} accesos`}</span>
        </div>
      </div>
    </div>
  );
}
