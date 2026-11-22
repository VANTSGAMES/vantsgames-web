/**
 * Sesión nativa de VANTS GAMES (VANTS Identity en Cloudflare + D1).
 * Soporta Google OpenID Connect (PKCE) y código OTP de 6 dígitos por correo,
 * con Access Token RS256 solo en memoria y Refresh Token rotativo en cookie HttpOnly.
 *
 * `login({ signup, returnTo })` abre /entrar o /registro para que el jugador
 * elija entre Google o correo electrónico, y al entrar regresa a `returnTo`.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setTokenProvider, api } from "./api";

const ENABLED = import.meta.env.VITE_AUTH_ENABLED === "1";
const HASH_ROUTER = import.meta.env.VITE_ROUTER !== "history";

/** Base para /auth/*: "" usa same-origin (https://vants.cc/auth/*). */
const AUTH_ORIGIN = ((import.meta.env.VITE_AUTH_ORIGIN as string | undefined) || "").replace(/\/$/, "");

export type AuthStatus = "cargando" | "anonimo" | "autenticado" | "no_disponible" | "error";

export interface VantsUser {
  sub?: string;
  email?: string;
  name?: string;
  nickname?: string;
  picture?: string;
}

interface VantsSessionToken {
  accessToken: string;
  expiresAt: number;
}

interface AuthCtx {
  status: AuthStatus;
  user: VantsUser | null;
  login: (opts?: { signup?: boolean; returnTo?: string }) => Promise<void>;
  loginWithGoogle: (returnTo?: string) => void;
  startEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  status: "cargando",
  user: null,
  login: async () => {},
  loginWithGoogle: () => {},
  startEmailOtp: async () => {},
  verifyEmailOtp: async () => {},
  logout: async () => {},
});

function vantsAuthUrl(path: string): string {
  return AUTH_ORIGIN + path;
}

function safePath(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return "/perfil";
  if (s === "/" || s === "/entrar" || s === "/registro" || s === "/recuperar") return "/perfil";
  return s;
}

function navigateClient(target: string) {
  if (HASH_ROUTER) {
    window.location.hash = "#" + target;
    window.scrollTo({ top: 0 });
    return;
  }
  window.history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

function toUser(raw: { sub?: string; email?: string | null; name?: string | null; picture?: string | null } | null): VantsUser | null {
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
  const [status, setStatus] = useState<AuthStatus>(ENABLED ? "cargando" : "no_disponible");
  const [user, setUser] = useState<VantsUser | null>(null);
  const vantsTokenRef = useRef<VantsSessionToken | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const refreshVantsSession = async (): Promise<{ token: string; user: VantsUser | null } | null> => {
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
        // Protocolo de comunicaciones: primera vez del usuario → bienvenida
        // al canal privado de registros (el endpoint es idempotente).
        api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
      } else {
        setUser(null);
        setStatus("anonimo");
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
      loginWithGoogle: (returnTo?: string) => {
        const back = safePath(returnTo || window.location.pathname);
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
        const base = opts?.signup ? "/registro" : "/entrar";
        const back = safePath(opts?.returnTo || window.location.pathname);
        const qs = back && back !== "/perfil" ? "?returnTo=" + encodeURIComponent(back) : "";
        navigateClient(base + qs);
      },
      logout: async () => {
        vantsTokenRef.current = null;
        setUser(null);
        setStatus("anonimo");
        await fetch(vantsAuthUrl("/auth/logout"), {
          method: "POST",
          credentials: "include",
          headers: { accept: "application/json" },
        }).catch(() => null);
        window.location.href = "/";
      },
    }),
    [status, user],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const AUTH_ENABLED = ENABLED;
