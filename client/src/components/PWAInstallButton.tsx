import { useState } from "react";
import { useOnlineStatus, usePWAInstall } from "@/lib/usePWAInstall";

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={compact ? "btn btn-sm w-full justify-between" : "btn btn-sm btn-ghost flex items-center gap-1.5"}
        aria-label="Instalar aplicación VANTS GAMES"
        data-testid="button-pwa-install"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span>Instalar app</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={compact ? "btn btn-sm w-full justify-between" : "btn btn-sm btn-ghost flex items-center gap-1.5"}
          aria-label="Cómo instalar VANTS GAMES en iOS"
          data-testid="button-pwa-ios"
        >
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(5,5,7,0.78)", backdropFilter: "blur(6px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Instalar VANTS GAMES en iOS"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowIOSGuide(false);
            }}
          >
            <div
              className="w-full max-w-sm p-6 border grid gap-4"
              style={{
                background: "var(--grafito-1)",
                borderColor: "var(--linea)",
                boxShadow: "inset 0 2px 0 var(--rojo)",
              }}
            >
              <div>
                <div className="eyebrow mb-2">Aplicación web</div>
                <h3 className="d-3">Instalar en iPhone / iPad</h3>
              </div>
              <ol className="grid gap-2 small muted list-decimal pl-4">
                <li>Pulsa el botón <strong>Compartir</strong> en la barra de Safari.</li>
                <li>Desliza y selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
                <li>Confirma tocando <strong>Añadir</strong> para abrir VANTS como app.</li>
              </ol>
              <button type="button" className="btn btn-sm btn-rojo w-full" onClick={() => setShowIOSGuide(false)}>
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3.5 py-2 border text-xs font-medium"
      style={{
        background: "var(--grafito-1)",
        borderColor: "rgba(245,192,68,0.5)",
        color: "var(--aviso)",
        fontFamily: "var(--f-mono)",
      }}
      data-testid="offline-indicator"
    >
      <span>Sin conexión — Mostrando datos en caché</span>
    </div>
  );
}
