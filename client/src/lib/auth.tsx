/**
 * Sesión con Auth0 (mismo inquilino que la plataforma: vants.eu.auth0.com).
 * Auth0 solo identifica; el perfil, permisos y datos viven en Cloudflare
 * y el Worker valida el JWT en cada petición privada.
 *
 * VITE_AUTH_ENABLED=1 se activa en el build de Cloudflare, cuyo origen debe estar
 * registrado en Auth0 (Allowed Callback / Logout / Web Origins). En cualquier
 * otro entorno la sesión queda "no_disponible" y se explica, sin simularla.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Auth0Client, User } from "@auth0/auth0-spa-js";
import { setTokenProvider } from "./api";

const DOMAIN = (import.meta.env.VITE_AUTH0_DOMAIN as string) || "vants.eu.auth0.com";
const CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID as string) || "oaOmNizh7HrASWfmfM29bN284IMJvqPG";
const AUDIENCE = (import.meta.env.VITE_AUTH0_AUDIENCE as string) || "https://api.vants.app";
const ENABLED = import.meta.env.VITE_AUTH_ENABLED === "1";

export type AuthStatus = "cargando" | "anonimo" | "autenticado" | "no_disponible" | "error";

interface AuthCtx {
  status: AuthStatus;
  user: User | null;
  login: (opts?: { signup?: boolean; returnTo?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  status: "cargando",
  user: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<Auth0Client | null>(null);
  const [status, setStatus] = useState<AuthStatus>(ENABLED ? "cargando" : "no_disponible");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!ENABLED) return;
    let vivo = true;
    (async () => {
      try {
        const { createAuth0Client } = await import("@auth0/auth0-spa-js");
        const c = await createAuth0Client({
          domain: DOMAIN,
          clientId: CLIENT_ID,
          authorizationParams: { audience: AUDIENCE, redirect_uri: window.location.origin + "/" },
          cacheLocation: "localstorage",
          useRefreshTokens: true,
        });
        const q = new URLSearchParams(window.location.search);
        if (q.has("code") && q.has("state")) {
          const r = await c.handleRedirectCallback();
          const back = (r.appState && (r.appState as any).returnTo) || "/perfil";
          window.history.replaceState({}, "", back);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        const ok = await c.isAuthenticated();
        if (!vivo) return;
        setClient(c);
        setTokenProvider(async () => {
          try {
            return (await c.getTokenSilently({ authorizationParams: { audience: AUDIENCE } })) || null;
          } catch {
            return null;
          }
        });
        if (ok) {
          setUser((await c.getUser()) || null);
          setStatus("autenticado");
        } else setStatus("anonimo");
      } catch {
        if (vivo) setStatus("error");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      login: async (opts) => {
        if (!client) return;
        await client.loginWithRedirect({
          appState: { returnTo: opts?.returnTo || window.location.pathname },
          authorizationParams: {
            audience: AUDIENCE,
            scope: "openid profile email offline_access",
            ...(opts?.signup ? { screen_hint: "signup" } : {}),
          },
        });
      },
      logout: async () => {
        if (!client) return;
        setTokenProvider(null);
        await client.logout({ logoutParams: { returnTo: window.location.origin + "/" } });
      },
    }),
    [client, status, user],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const AUTH_ENABLED = ENABLED;
export const AUTH0_DOMAIN = DOMAIN;
export const AUTH0_CLIENT_ID = CLIENT_ID;
