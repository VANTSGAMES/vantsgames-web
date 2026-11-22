import { useCallback, useEffect, useState } from "react";
import { AUTH_ENABLED, useAuth } from "./auth";
import { getAuthToken } from "./api";
import {
  getCurrentWorkspaceUser,
  getWorkspaceAccessToken,
  initWorkspaceAuth,
  signInWithGoogleBasic,
  type WorkspaceUser,
} from "./googleWorkspace";

export async function getActiveCommunityToken(): Promise<string | null> {
  const vantsToken = await getAuthToken();
  if (vantsToken) return vantsToken;
  return getWorkspaceAccessToken();
}

export async function communityFetch<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; requireAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = await getActiveCommunityToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (opts.requireAuth) {
    throw new Error("Inicia sesión con tu cuenta de VANTS o Google para realizar esta acción.");
  }

  const init: RequestInit = {
    method: opts.method || "GET",
    headers,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  }
  return data as T;
}

export interface CommunitySession {
  isAuthenticated: boolean;
  displayName: string | null;
  provider: "vants" | "google" | null;
  authBusy: boolean;
  signIn: (returnTo?: string) => Promise<void>;
}

/**
 * Unifica la sesión de VANTS Identity (producción vants.cc) y Google Identity Services (preview/Workspace)
 * para las funciones de Comunidad sin requerir Firebase.
 */
export function useCommunitySession(): CommunitySession {
  const vants = useAuth();
  const [googleUser, setGoogleUser] = useState<WorkspaceUser | null>(() => getCurrentWorkspaceUser());
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    return initWorkspaceAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null),
    );
  }, []);

  const vantsSignedIn = vants.status === "autenticado" && Boolean(vants.user);
  const googleSignedIn = Boolean(googleUser && getWorkspaceAccessToken());

  const isAuthenticated = vantsSignedIn || googleSignedIn;
  const provider: "vants" | "google" | null = vantsSignedIn
    ? "vants"
    : googleSignedIn
      ? "google"
      : null;

  const displayName = vantsSignedIn
    ? vants.user?.nickname || vants.user?.name || vants.user?.email || "Jugador"
    : googleSignedIn
      ? googleUser?.displayName || googleUser?.email || "Jugador"
      : null;

  const signIn = useCallback(
    async (returnTo?: string) => {
      if (AUTH_ENABLED && vants.status !== "no_disponible") {
        await vants.login({ returnTo: returnTo || "/comunidad/lfg" });
        return;
      }
      setAuthBusy(true);
      try {
        await signInWithGoogleBasic();
      } finally {
        setAuthBusy(false);
      }
    },
    [vants],
  );

  return {
    isAuthenticated,
    displayName,
    provider,
    authBusy,
    signIn,
  };
}
