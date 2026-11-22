/**
 * Sesión principal de VANTS GAMES.
 * Soporta dos proveedores seleccionados por VITE_AUTH_PROVIDER:
 * - "auth0" (por defecto durante coexistencia dual): Auth0 (vants.eu.auth0.com).
 * - "vants" (VANTS Identity en Cloudflare): Google OpenID Connect (PKCE) +
 *   código OTP por correo, con JWT RS256 en memoria y cookie HttpOnly de refresh.
 *
 * Ambos mantienen exactamente la misma interfaz useAuth() para todos los
 * componentes de la web. En entornos sin VITE_AUTH_ENABLED=1 la sesión queda
 * "no_disponible" y nunca se simula.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Auth0Client, User } from "@auth0/auth0-spa-js";
import { setTokenProvider, api } from "./api";

const DOMAIN = (import.meta.env.VITE_AUTH0_DOMAIN as string) || "vants.eu.auth0.com";
const CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID as string) || "oaOmNizh7HrASWfmfM29bN284IMJvqPG";
const AUDIENCE = (import.meta.env.VITE_AUTH0_AUDIENCE as string) || "https://api.vants.app";
const ENABLED = import.meta.env.VITE_AUTH_ENABLED === "1";

export type AuthProviderMode = "auth0" | "vants";
export const AUTH_PROVIDER: AuthProviderMode =
  String(import.meta.env.VITE_AUTH_PROVIDER || "auth0").toLowerCase() === "vants" ? "vants" : "auth0";

/** Base para /auth/* en modo "vants": "" usa same-origin (vants.cc/auth/*). */
const AUTH_ORIGIN = ((import.meta.env.VITE_AUTH_ORIGIN as string | undefined) || "").replace(/\/$/, "");

export type AuthStatus = "cargando" | "anonimo" | "autenticado" | "no_disponible" | "error";

interface VantsSessionToken {
  accessToken: string;
  expiresAt: number;
}

interface AuthCtx {
  status: AuthStatus;
  user: User | null;
  provider: AuthProviderMode;
  login: (opts?: { signup?: boolean; returnTo?: string }) => Promise<void>;
  loginWithGoogle: (returnTo?: string) => void;
  startEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  status: "cargando",
  user: null,
  provider: AUTH_PROVIDER,
  login: async () => {},
  loginWithGoogle: () => {},
  startEmailOtp: async () => {},
  verifyEmailOtp: async () => {},
  logout: async () => {},
});

function vantsAuthUrl(path: string): string {
  return AUTH_ORIGIN + path;
}

function toUser(raw: { sub?: string; email?: string | null; name?: string | null; picture?: string | null } | null): User | null {
  if (!raw || !raw.sub) return null;
  return {
    sub: raw.sub,
    email: raw.email || undefined,
    name: raw.name || undefined,
    nickname: raw.name || (raw.email ? raw.email.split("@")[0] : undefined),
    picture: raw.picture || undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<Auth0Client | null>(null);
  const [status, setStatus] = useState<AuthStatus>(ENABLED ? "cargando" : "no_disponible");
  const [user, setUser] = useState<User | null>(null);
  const vantsTokenRef = useRef<VantsSessionToken | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const refreshVantsSession = async (): Promise<{ token: string; user: User | null } | null> => {
    try {
      const r = await fetch(vantsAuthUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!r.ok) {
        vantsTokenRef.current = null;
        return null;
      }
      const d = (await r.json()) as {
        ok?: boolean;
        access_token?: string;
        expires_in?: number;
        user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null };
      };
      if (!d.ok || !d.access_token) {
        vantsTokenRef.current = null;
        return null;
      }
      const ttlMs = Math.max(60, Number(d.expires_in) || 3600) * 1000;
      vantsTokenRef.current = {
        accessToken: d.access_token,
        expiresAt: Date.now() + ttlMs,
      };
      return { token: d.access_token, user: toUser(d.user || null) };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!ENABLED) return;
    let vivo = true;

    if (AUTH_PROVIDER === "vants") {
      setTokenProvider(async () => {
        const cur = vantsTokenRef.current;
        if (cur && cur.expiresAt - Date.now() > 60_000) return cur.accessToken;
        if (!refreshInFlightRef.current) {
          refreshInFlightRef.current = refreshVantsSession()
            .then((res) => (res ? res.token : null))
            .finally(() => {
              refreshInFlightRef.current = null;
            });
        }
        return refreshInFlightRef.current;
      });

      (async () => {
        const res = await refreshVantsSession();
        if (!vivo) return;
        if (res && res.user) {
          setUser(res.user);
          setStatus("autenticado");
          api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
        } else {
          setUser(null);
          setStatus("anonimo");
        }
      })();

      return () => {
        vivo = false;
      };
    }

    (async () => {
      try {
        const { createAuth0Client } = await import("@auth0/auth0-spa-js");
        const c = await createAuth0Client({
          domain: DOMAIN,
          clientId: CLIENT_ID,
          authorizationParams: { audience: AUDIENCE, redirect_uri: window.location.origin + "/" },
          cacheLocation: "localstorage",
          useRefreshTokens: true,
          useRefreshTokensFallback: true,
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
          // Protocolo de comunicaciones: primera vez del usuario → bienvenida
          // al canal privado de registros (el endpoint es idempotente).
          api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
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
      provider: AUTH_PROVIDER,
      loginWithGoogle: (returnTo?: string) => {
        const back = returnTo && returnTo.startsWith("/") ? returnTo : window.location.pathname || "/perfil";
        window.location.href = vantsAuthUrl("/auth/google/start?returnTo=" + encodeURIComponent(back));
      },
      startEmailOtp: async (email: string) => {
        const r = await fetch(vantsAuthUrl("/auth/email/start"), {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || d.ok === false) throw new Error(d.error || "error_" + r.status);
      },
      verifyEmailOtp: async (email: string, code: string) => {
        const r = await fetch(vantsAuthUrl("/auth/email/verify"), {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          access_token?: string;
          expires_in?: number;
          user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null };
        };
        if (!r.ok || !d.ok || !d.access_token) throw new Error(d.error || "error_" + r.status);
        const ttlMs = Math.max(60, Number(d.expires_in) || 3600) * 1000;
        vantsTokenRef.current = {
          accessToken: d.access_token,
          expiresAt: Date.now() + ttlMs,
        };
        const u = toUser(d.user || null);
        setUser(u);
        setStatus("autenticado");
        api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
      },
      login: async (opts) => {
        if (AUTH_PROVIDER === "vants") {
          const back = opts?.returnTo || window.location.pathname || "/perfil";
          window.location.href = vantsAuthUrl("/auth/google/start?returnTo=" + encodeURIComponent(back));
          return;
        }
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
        if (AUTH_PROVIDER === "vants") {
          vantsTokenRef.current = null;
          setUser(null);
          setStatus("anonimo");
          await fetch(vantsAuthUrl("/auth/logout"), {
            method: "POST",
            credentials: "include",
            headers: { accept: "application/json" },
          }).catch(() => null);
          window.location.href = "/";
          return;
        }
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
