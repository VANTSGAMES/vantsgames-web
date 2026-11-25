import { Component, type ErrorInfo, type ReactNode } from "react";
import { esAppNativa } from "../lib/api";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };
  private lastPath = typeof window !== "undefined" ? window.location.href : "";

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Error inesperado al mostrar esta sección.",
    };
  }

  private handleRouteCheck = () => {
    if (typeof window === "undefined") return;
    const nowPath = window.location.href;
    if (this.state.hasError && nowPath !== this.lastPath) {
      this.lastPath = nowPath;
      this.setState({ hasError: false, message: "" });
    } else {
      this.lastPath = nowPath;
    }
  };

  componentDidMount() {
    window.addEventListener("popstate", this.handleRouteCheck);
    window.addEventListener("hashchange", this.handleRouteCheck);
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.handleRouteCheck);
    window.removeEventListener("hashchange", this.handleRouteCheck);
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.lastPath = typeof window !== "undefined" ? window.location.href : "";
    console.error("[VANTS ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const isChunkErr = /dynamically imported module|module script failed|Loading chunk/i.test(this.state.message);
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--negro)" }}>
        <div className="panel panel-pad chamfer max-w-lg w-full grid gap-4">
          <div className="eyebrow">Recuperación</div>
          <h1 className="d-2">Algo falló en esta vista</h1>
          <p className="small muted">
            {isChunkErr
              ? "Se publicó una versión nueva de VANTS GAMES. Pulsa Reintentar vista para cargar la versión actualizada."
              : this.state.message}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="btn btn-rojo btn-sm"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                if (esAppNativa() || import.meta.env.VITE_ROUTER !== "history") {
                  window.location.hash = "#/";
                } else {
                  window.location.href = "/";
                }
              }}
            >
              Volver al inicio
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (isChunkErr) {
                  window.location.reload();
                  return;
                }
                this.setState({ hasError: false, message: "" });
              }}
            >
              Reintentar vista
            </button>
          </div>
        </div>
      </div>
    );
  }
}
