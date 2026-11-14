import { useApi } from "./useApi";
import { useAuth } from "./auth";

export type EstadoMembresia = {
  activo: boolean;
  plan: string | null;
  planes: string[];
  nombre: string | null;
  origen: string | null;
  caduca: string | null;
  periodo: string | null;
  todos: boolean;
};

/**
 * Estado del plan del usuario logueado (`GET /int/membresia`).
 * Devuelve `sinPlan: true` solo cuando el servidor confirmó que no hay
 * ningún plan activo — nunca por omisión ni en preview.
 */
export function useMembresia() {
  const { status } = useAuth();
  const q = useApi<EstadoMembresia>(status === "autenticado" ? "/int/membresia" : null, { auth: true });
  return {
    ...q,
    cargando: status === "cargando" || (status === "autenticado" && q.isLoading),
    sinPlan: !!q.data && !q.data.activo && !q.data.todos,
  };
}
