// client/src/lib/vantsAiApi.ts

export interface AiCuota {
  fecha: string;
  plan: "free" | "pase" | "pro" | "creator" | "socio";
  limite: number;
  usados: number;
  restantes: number;
}

export interface AiEstado {
  ok: boolean;
  configurado: boolean;
  modelos: { router: string; expert: string };
  gateway: boolean;
  bus: boolean;
  owner: boolean;
  origen: string;
  cuota: AiCuota;
  agentes: Array<"scouting" | "sponsorship" | "community">;
}

export interface ScoutingReport {
  performance_score: number;
  tier_sugerido: string;
  rol_ideal?: string;
  fortalezas: string[];
  areas_mejora: string[];
  plan_entrenamiento_7d?: string[];
  recomendacion_fichaje: string;
}

export interface ScoutJugadorResponse {
  ok: boolean;
  task_id: string;
  jugador: { pid: string; nick: string };
  telemetria: Record<string, unknown>;
  reporte: ScoutingReport;
  cuota: AiCuota;
}

export interface DispatchResponse {
  ok: boolean;
  task_id: string;
  status: "completed" | "pending_approval" | "approved" | "rejected";
  routing: {
    target_agent: "scouting" | "sponsorship" | "community";
    priority: number;
    reasoning: string;
    needs_external_action: boolean;
    mentioned_player?: string | null;
  };
  metadata: Record<string, unknown>;
  response: string;
  requiere_aprobacion: boolean;
}

export interface AiTaskRow {
  id: string;
  auth0_sub?: string;
  user_role?: string;
  target_agent: "scouting" | "sponsorship" | "community";
  priority: number;
  status: "completed" | "pending_approval" | "approved" | "rejected";
  prompt: string;
  response: string;
  metadata_json?: string | null;
  action_json?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export class VantsAiError extends Error {
  code: string;
  status: number;
  cuota?: AiCuota;

  constructor(code: string, status: number, cuota?: AiCuota) {
    super(code);
    this.code = code;
    this.status = status;
    this.cuota = cuota;
  }
}

function aiApiBase(): string {
  if (typeof window !== "undefined") {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const proto = window.location.protocol;
    const isNative =
      Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) ||
      proto === "capacitor:" ||
      proto === "ionic:" ||
      (window.location.hostname === "localhost" &&
        proto === "https:" &&
        (window.location.port === "" || window.location.port === "443"));
    if (isNative) return "https://vants.cc/api/ai";
  }
  return "/api/ai";
}

async function aiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${aiApiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new VantsAiError(
      String(data?.error || `http_${res.status}`),
      res.status,
      data?.cuota
    );
  }
  return data as T;
}

export const vantsAiApi = {
  estado: (token: string) => aiFetch<AiEstado>("/estado", token, { method: "GET" }),

  scoutJugador: (token: string, params: { pid?: string; nick?: string } = {}) =>
    aiFetch<ScoutJugadorResponse>("/scout/jugador", token, {
      method: "POST",
      body: JSON.stringify(params),
    }),

  dispatch: (
    token: string,
    payload: {
      prompt: string;
      user_role?: string;
      context_data?: Record<string, unknown>;
    }
  ) =>
    aiFetch<DispatchResponse>("/dispatch", token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listarTareas: (
    token: string,
    opts: { scope?: "admin" | "mine"; status?: string } = {}
  ) => {
    const q = new URLSearchParams();
    if (opts.scope === "admin") q.set("scope", "admin");
    if (opts.status) q.set("status", opts.status);
    const qs = q.toString();
    return aiFetch<{ ok: boolean; tasks: AiTaskRow[] }>(
      `/tasks${qs ? `?${qs}` : ""}`,
      token,
      { method: "GET" }
    );
  },

  revisarTarea: (token: string, taskId: string, accion: "approve" | "reject") =>
    aiFetch<{ ok: boolean; task_id: string; status: string; ejecucion?: unknown }>(
      `/tasks/${encodeURIComponent(taskId)}/${accion}`,
      token,
      { method: "POST", body: "{}" }
    ),
};
