import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Error inesperado al mostrar esta sección.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[VANTS ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--negro)" }}>
        <div className="panel panel-pad chamfer max-w-lg w-full grid gap-4">
          <div className="eyebrow">Recuperación</div>
          <h1 className="d-2">Algo falló en esta vista</h1>
          <p className="small muted">{this.state.message}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="btn btn-rojo btn-sm"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                window.location.hash = "#/";
                window.location.reload();
              }}
            >
              Volver al inicio
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Reintentar vista
            </button>
          </div>
        </div>
      </div>
    );
  }
}
