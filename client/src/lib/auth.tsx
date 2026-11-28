/**
 * Sesión nativa de VANTS GAMES (VANTS Identity en Cloudflare + D1).
 * Funciona 100% dentro de la aplicación (Android, iOS, Tablets y Web) sin sacar
 * al jugador al navegador externo:
 *  - En Android nativo: Google Play Games Services v2 + Google Sign-In nativo + Email OTP.
 *  - En iOS / Tablet nativo: Google Identity Services in-app + Email OTP de 6 dígitos.
 *  - En Web (https://vants.cc): Google OIDC PKCE first-party + Email OTP + cookie HttpOnly.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setTokenProvider, api, esAppNativa, INT_ORIGIN } from "./api";
import { useFeedback } from "../components/FeedbackProvider";
import {
  autenticarPlayGames,
  getCapacitor,
  obtenerPerfilPlayGames,
  sincronizarExperienciaPlayGamesEnServidor,
} from "./dispositivosJuegos";

const NATIVE_APP = esAppNativa();
const ENABLED = import.meta.env.VITE_AUTH_ENABLED === "1" || NATIVE_APP;
const HASH_ROUTER = import.meta.env.VITE_ROUTER !== "history" || NATIVE_APP;
const NATIVE_RT_STORAGE_KEY = "vants_native_rt_v1";

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ||
  "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com";

/** Base para /auth/*: en web "" usa same-origin (https://vants.cc/auth/*); en app nativa usa https://int.vants.cc. */
const RAW_AUTH_ORIGIN = ((import.meta.env.VITE_AUTH_ORIGIN as string | undefined) || "").replace(/\/$/, "");
const AUTH_ORIGIN = RAW_AUTH_ORIGIN || (NATIVE_APP ? INT_ORIGIN : "");

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
  esNativo: boolean;
  login: (opts?: { signup?: boolean; returnTo?: string }) => Promise<void>;
  loginWithGoogle: (returnTo?: string) => void;
  loginWithPlayGames: (returnTo?: string) => Promise<boolean>;
  startEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  status: "cargando",
  user: null,
  esNativo: false,
  login: async () => {},
  loginWithGoogle: () => {},
  loginWithPlayGames: async () => false,
  startEmailOtp: async () => {},
  verifyEmailOtp: async () => {},
  logout: async () => {},
});

function vantsAuthUrl(path: string): string {
  return AUTH_ORIGIN + path;
}

function leerRefreshNativo(): string | null {
  if (!NATIVE_APP) return null;
  try {
    return localStorage.getItem(NATIVE_RT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function guardarRefreshNativo(rt?: string | null) {
  if (!NATIVE_APP) return;
  try {
    if (rt) localStorage.setItem(NATIVE_RT_STORAGE_KEY, rt);
    else localStorage.removeItem(NATIVE_RT_STORAGE_KEY);
  } catch {
    // Ignorar si almacenamiento restringido
  }
}

function safePath(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return "/perfil";
  if (s === "/" || s === "/entrar" || s === "/registro" || s === "/recuperar") return "/perfil";
  return s;
}

function currentAppPath(): string {
  if (typeof window === "undefined") return "/perfil";
  if (HASH_ROUTER) {
    const h = window.location.hash.replace(/^#/, "").split("?")[0];
    return h || "/";
  }
  return window.location.pathname || "/";
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

/** Carga Google Identity Services dentro de la app para obtener un token sin salir del WebView */
async function obtenerAccessTokenGisInApp(): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const w = window as any;
  if (!w.google?.accounts?.oauth2) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        setTimeout(() => resolve(), 1500);
        return;
      }
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("gsi_no_disponible"));
      document.head.appendChild(s);
    }).catch(() => {});
  }
  if (!w.google?.accounts?.oauth2?.initTokenClient) return null;
  return new Promise<string | null>((resolve) => {
    try {
      const client = w.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile https://www.googleapis.com/auth/drive.file",
        callback: (resp: { access_token?: string; error?: string }) => {
          resolve(resp?.access_token || null);
        },
        error_callback: () => resolve(null),
      });
      client.requestAccessToken({ prompt: "select_account" });
    } catch {
      resolve(null);
    }
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(ENABLED ? "cargando" : "no_disponible");
  const [user, setUser] = useState<VantsUser | null>(null);
  const vantsTokenRef = useRef<VantsSessionToken | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const statusRef = useRef<AuthStatus>(ENABLED ? "cargando" : "no_disponible");
  useEffect(() => { statusRef.current = status; }, [status]);
  const { toast } = useFeedback();

  const activarSesionLocal = (d: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null } | null;
  }) => {
    const ttlMs = Math.max(60, Number(d.expires_in) || 3600) * 1000;
    vantsTokenRef.current = {
      accessToken: d.access_token,
      expiresAt: Date.now() + ttlMs,
    };
    if (d.refresh_token) guardarRefreshNativo(d.refresh_token);
    const u = toUser(d.user || null);
    setUser(u);
    setStatus("autenticado");
    api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
    // Si estamos en Android nativo, sincronizar también el nivel y XP de Google Play Juegos
    if (NATIVE_APP) {
      obtenerPerfilPlayGames({ conSesionVants: true }).catch(() => {});
    }
    return u;
  };

  /**
   * Intercambia credenciales nativas (Play Games serverAuthCode, Google Sign-In idToken o GIS accessToken)
   * directamente con VANTS Identity sin salir jamás de la aplicación.
   */
  const intercambiarCredencialInApp = async (payload: Record<string, unknown>): Promise<boolean> => {
    const r = await fetch(vantsAuthUrl("/auth/playgames/exchange"), {
      method: "POST",
      credentials: NATIVE_APP ? "omit" : "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const d = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null };
    };
    if (!r.ok || !d.ok || !d.access_token) return false;
    activarSesionLocal({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_in: d.expires_in,
      user: d.user,
    });
    return true;
  };

  const refreshVantsSession = async (): Promise<{ token: string; user: VantsUser | null } | null> => {
    const dentro = async (): Promise<{ token: string; user: VantsUser | null } | null> => {
      const nativeRt = leerRefreshNativo();
      if (NATIVE_APP && !nativeRt) {
        return null;
      }
      try {
        const headers: Record<string, string> = { accept: "application/json" };
        let body: string | undefined;
        if (nativeRt) {
          headers["content-type"] = "application/json";
          body = JSON.stringify({ refresh_token: nativeRt });
        }
        const r = await fetch(vantsAuthUrl("/auth/refresh"), {
          method: "POST",
          credentials: NATIVE_APP ? "omit" : "include",
          headers,
          body,
        });
        if (!r.ok) {
          vantsTokenRef.current = null;
          guardarRefreshNativo(null);
          if (statusRef.current === "autenticado") {
            setUser(null);
            setStatus("anonimo");
            toast({ kind: "error", title: "Tu sesión caducó", description: "Inicia sesión aquí mismo en la app para continuar." });
          }
          return null;
        }
        const d = (await r.json()) as {
          ok?: boolean;
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null };
        };
        if (!d.ok || !d.access_token) {
          vantsTokenRef.current = null;
          return null;
        }
        if (d.refresh_token) guardarRefreshNativo(d.refresh_token);
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
    const locks = (navigator as unknown as { locks?: { request: (nombre: string, fn: () => Promise<unknown>) => Promise<unknown> } }).locks;
    if (!locks?.request) return dentro();
    return (await locks.request("vants-auth-refresh", dentro)) as { token: string; user: VantsUser | null } | null;
  };

  useEffect(() => {
    if (!ENABLED) return;
    let vivo = true;

    setTokenProvider(async (opts?: { force?: boolean }) => {
      const cur = vantsTokenRef.current;
      if (!opts?.force && cur && cur.expiresAt - Date.now() > 60_000) return cur.accessToken;
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
        if (NATIVE_APP) {
          obtenerPerfilPlayGames({ conSesionVants: true }).catch(() => {});
        }
        return;
      }

      // En Android nativo: intentar inicio silencioso automático con Google Play Juegos v2
      if (NATIVE_APP) {
        try {
          const pg = await obtenerPerfilPlayGames({ requestAuthCode: true });
          if (vivo && pg.autenticado && pg.serverAuthCode) {
            const ok = await intercambiarCredencialInApp({
              serverAuthCode: pg.serverAuthCode,
              playerId: pg.playerId,
              displayName: pg.displayName,
              title: pg.title,
              currentLevel: pg.currentLevel,
              nextLevel: pg.nextLevel,
              currentXpTotal: pg.currentXpTotal,
              levelMinXp: pg.levelMinXp,
              levelMaxXp: pg.levelMaxXp,
            });
            if (ok) return;
          }
        } catch {
          // Continuar en modo anónimo dentro de la app
        }
      }

      if (!vivo) return;
      setUser(null);
      setStatus("anonimo");
    })();

    const procesarCallbackNativo = async (data: { rt?: string; returnTo?: string; authError?: string } | null) => {
      if (!vivo || !data) return;
      if (data.authError) {
        toast({
          kind: "error",
          title: "Acceso cancelado",
          description: "Puedes volver a intentarlo o usar tu código de 6 dígitos por correo.",
        });
        return;
      }
      if (!data.rt) return;
      guardarRefreshNativo(data.rt);
      const res = await refreshVantsSession();
      if (!vivo || !res || !res.user) return;
      setUser(res.user);
      setStatus("autenticado");
      api("/int/registro", { method: "POST", auth: true, body: {} }).catch(() => {});
      obtenerPerfilPlayGames({ conSesionVants: true }).catch(() => {});
      toast({ kind: "ok", title: `Bienvenido, ${res.user.nickname || res.user.name || "Jugador"}` });
      navigateClient(safePath(data.returnTo || "/perfil"));
    };

    const cap = getCapacitor();
    let authListenerHandle: { remove?: () => void } | null = null;
    if (NATIVE_APP && cap?.Plugins?.VantsGames) {
      if (cap.Plugins.VantsGames.consumePendingAuthRedirect) {
        cap.Plugins.VantsGames.consumePendingAuthRedirect()
          .then((pending: any) => {
            if (pending?.hasCallback) void procesarCallbackNativo(pending);
          })
          .catch(() => {});
      }
      if (cap.Plugins.VantsGames.addListener) {
        Promise.resolve(
          cap.Plugins.VantsGames.addListener("nativeAuthCallback", (payload: any) => {
            void procesarCallbackNativo(payload);
          }),
        )
          .then((h: any) => {
            authListenerHandle = h;
          })
          .catch(() => {});
      }
    }

    return () => {
      vivo = false;
      try {
        authListenerHandle?.remove?.();
      } catch {
        // Ignorar
      }
    };
  }, []);

  const iniciarConPlayGamesONativo = async (returnTo?: string): Promise<boolean> => {
    const destinoFinal = safePath(returnTo || currentAppPath());
    const cap = getCapacitor();

    // 1. Android Nativo: Google Play Games Services v2 + Google Sign-In nativo en app
    if (cap?.Plugins?.VantsGames) {
      const pg = await autenticarPlayGames({ requestAuthCode: true, sincronizar: false });
      if (pg.autenticado && pg.serverAuthCode) {
        const ok = await intercambiarCredencialInApp({
          serverAuthCode: pg.serverAuthCode,
          playerId: pg.playerId,
          displayName: pg.displayName,
          title: pg.title,
          currentLevel: pg.currentLevel,
          nextLevel: pg.nextLevel,
          currentXpTotal: pg.currentXpTotal,
          levelMinXp: pg.levelMinXp,
          levelMaxXp: pg.levelMaxXp,
        });
        if (ok) {
          toast({
            kind: "ok",
            title: `Bienvenido, ${pg.displayName || "Jugador"}`,
            description: pg.currentLevel ? `Google Play Juegos · Nivel ${pg.currentLevel} sincronizado` : "Sesión iniciada con Google Play Juegos.",
          });
          navigateClient(destinoFinal);
          return true;
        }
      }

      if (cap.Plugins.VantsGames.signInGoogleNative) {
        const gRes = await cap.Plugins.VantsGames.signInGoogleNative().catch(() => null);
        if (gRes?.authenticated && (gRes.idToken || gRes.serverAuthCode)) {
          const ok = await intercambiarCredencialInApp({
            idToken: gRes.idToken,
            serverAuthCode: gRes.serverAuthCode,
            avatarUrl: gRes.avatarUrl,
            playerId: pg.playerId,
            displayName: pg.displayName || gRes.displayName,
            title: pg.title,
            currentLevel: pg.currentLevel,
            nextLevel: pg.nextLevel,
            currentXpTotal: pg.currentXpTotal,
            levelMinXp: pg.levelMinXp,
            levelMaxXp: pg.levelMaxXp,
          });
          if (ok) {
            if (pg.autenticado) {
              sincronizarExperienciaPlayGamesEnServidor(pg).catch(() => {});
            }
            toast({ kind: "ok", title: "Sesión iniciada en VANTS" });
            navigateClient(destinoFinal);
            return true;
          }
        }
        // Si el usuario canceló explícitamente el selector de cuentas, no abrir otra hoja
        if (gRes?.statusCode === 12501 || gRes?.statusCode === 16 || gRes?.error === "cancelado") {
          return false;
        }
      }

      // Respaldo 100% in-app mediante Custom Tab oficial (#0A0A0B) + retorno cc.vants.app://auth-callback
      if (cap.Plugins.VantsGames.openInAppAuth) {
        const oauthInAppUrl = vantsAuthUrl("/auth/google/start?native=1&returnTo=" + encodeURIComponent(destinoFinal));
        const opened = await cap.Plugins.VantsGames.openInAppAuth({ url: oauthInAppUrl }).catch(() => null);
        if (opened?.opened) {
          return true;
        }
      }
    }

    const esAndroidNativo = Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android");

    // 2. iOS / Tablet no-Android: respaldo In-App con Google Identity Services
    if (!esAndroidNativo) {
      const accessToken = await obtenerAccessTokenGisInApp();
      if (accessToken) {
        const ok = await intercambiarCredencialInApp({ accessToken });
        if (ok) {
          toast({ kind: "ok", title: "Sesión iniciada en VANTS" });
          navigateClient(destinoFinal);
          return true;
        }
      }
    }

    const rutaActual = currentAppPath();
    if (rutaActual !== "/entrar" && rutaActual !== "/registro") {
      const qs = destinoFinal && destinoFinal !== "/perfil" ? "?returnTo=" + encodeURIComponent(destinoFinal) : "";
      navigateClient("/entrar" + qs);
    }
    setTimeout(() => {
      const campoEmail = document.getElementById("otp-em") as HTMLInputElement | null;
      campoEmail?.focus?.();
    }, 120);

    toast({
      kind: "info",
      title: "Acceso directo en la app",
      description: "Ingresa tu correo aquí abajo para recibir tu código instantáneo de 6 dígitos sin salir de la aplicación.",
    });
    return false;
  };

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      esNativo: NATIVE_APP,
      loginWithGoogle: (returnTo?: string) => {
        const back = safePath(returnTo || currentAppPath());
        if (NATIVE_APP) {
          void iniciarConPlayGamesONativo(back);
          return;
        }
        window.location.href = vantsAuthUrl("/auth/google/start?returnTo=" + encodeURIComponent(back));
      },
      loginWithPlayGames: async (returnTo?: string) => {
        return iniciarConPlayGamesONativo(returnTo);
      },
      startEmailOtp: async (email: string) => {
        const r = await fetch(vantsAuthUrl("/auth/email/start"), {
          method: "POST",
          credentials: NATIVE_APP ? "omit" : "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || d.ok === false) throw new Error(d.error || "error_" + r.status);
      },
      verifyEmailOtp: async (email: string, code: string) => {
        const r = await fetch(vantsAuthUrl("/auth/email/verify"), {
          method: "POST",
          credentials: NATIVE_APP ? "omit" : "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          user?: { sub?: string; email?: string | null; name?: string | null; picture?: string | null };
        };
        if (!r.ok || !d.ok || !d.access_token) throw new Error(d.error || "error_" + r.status);
        activarSesionLocal({
          access_token: d.access_token,
          refresh_token: d.refresh_token,
          expires_in: d.expires_in,
          user: d.user,
        });
      },
      login: async (opts) => {
        const base = opts?.signup ? "/registro" : "/entrar";
        const back = safePath(opts?.returnTo || currentAppPath());
        const qs = back && back !== "/perfil" ? "?returnTo=" + encodeURIComponent(back) : "";
        navigateClient(base + qs);
      },
      logout: async () => {
        const rt = leerRefreshNativo();
        vantsTokenRef.current = null;
        guardarRefreshNativo(null);
        setUser(null);
        setStatus("anonimo");
        await fetch(vantsAuthUrl("/auth/logout"), {
          method: "POST",
          credentials: NATIVE_APP ? "omit" : "include",
          headers: rt ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
          body: rt ? JSON.stringify({ refresh_token: rt }) : undefined,
        }).catch(() => null);
        navigateClient("/");
      },
    }),
    [status, user],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const AUTH_ENABLED = ENABLED;
