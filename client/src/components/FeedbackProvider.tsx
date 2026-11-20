import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

export interface ConfirmOptions {
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ToastItem {
  id: number;
  kind: "ok" | "error" | "info";
  title: string;
  description?: string;
}

interface FeedbackCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (t: Omit<ToastItem, "id">) => void;
}

const Ctx = createContext<FeedbackCtx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setDialog(opts);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const fn = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (fn) fn(value);
  }, []);

  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}

      <AlertDialog.Root open={!!dialog} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(5, 5, 7, 0.78)" }}
          />
          <AlertDialog.Content
            className="fixed left-1/2 top-1/2 z-[100] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 panel panel-pad chamfer grid gap-4"
            style={{
              background: "var(--grafito-1)",
              border: "1px solid var(--linea)",
              boxShadow: "inset 0 2px 0 var(--rojo), 0 24px 64px rgba(0, 0, 0, 0.7)",
            }}
            data-testid="confirm-dialog"
          >
            <div className="eyebrow">{dialog?.danger ? "Confirmar acción" : "Confirmación"}</div>
            <AlertDialog.Title className="d-2" style={{ color: "var(--blanco)" }}>
              {dialog?.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="small muted" style={{ lineHeight: 1.6 }}>
              {dialog?.description}
            </AlertDialog.Description>
            {dialog?.details && dialog.details.length > 0 && (
              <ul
                className="grid gap-1.5 p-3 small"
                style={{
                  background: "var(--negro)",
                  border: "1px solid var(--linea-suave)",
                  color: "var(--gris-1)",
                }}
              >
                {dialog.details.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span style={{ color: "var(--rojo)" }} aria-hidden>▸</span>
                    <span className="break-words">{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => settle(false)}
                  data-testid="confirm-cancel"
                >
                  {dialog?.cancelLabel || "Cancelar"}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={"btn btn-sm " + (dialog?.danger !== false ? "btn-rojo" : "")}
                  onClick={() => settle(true)}
                  data-testid="confirm-accept"
                >
                  {dialog?.confirmLabel || "Confirmar"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-[85] grid gap-2 w-[min(92vw,360px)]"
          aria-live="polite"
          data-testid="toast-region"
        >
          {toasts.map((t) => {
            const accent =
              t.kind === "ok"
                ? "var(--ok)"
                : t.kind === "error"
                  ? "var(--rojo)"
                  : "var(--gris-1)";
            return (
              <div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                className="panel p-3.5 flex items-start gap-3 reveal"
                style={{
                  background: "var(--grafito-1)",
                  borderColor: "var(--linea)",
                  borderLeft: `3px solid ${accent}`,
                }}
              >
                <div className="min-w-0 grow">
                  <div className="font-semibold small" style={{ color: "var(--blanco)" }}>
                    {t.title}
                  </div>
                  {t.description && (
                    <p className="text-xs muted mt-0.5 break-words">{t.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-xs muted hover:text-white px-1"
                  aria-label="Cerrar aviso"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useFeedback debe usarse dentro de FeedbackProvider.");
  }
  return ctx;
}
