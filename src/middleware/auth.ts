import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  provider: "vants" | "auth0" | "google";
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

interface CachedTokenEntry {
  user: AuthenticatedUser;
  expiresAt: number;
}

const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || process.env.VITE_AUTH0_DOMAIN || "vants.eu.auth0.com")
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "");
const VANTS_AUTH_ISSUER = (process.env.VANTS_AUTH_ISSUER || "https://vants.cc").replace(/\/+$/, "");
const VANTS_AUTH_AUDIENCE = process.env.VANTS_AUTH_AUDIENCE || process.env.AUTH0_AUDIENCE || "https://api.vants.app";
const VANTS_AUTH_JWKS_URL =
  process.env.VANTS_AUTH_JWKS_URL || "https://vants-integraciones.vants.workers.dev/auth/.well-known/jwks.json";

// Short in-memory cache (60s) to avoid calling upstream userinfo on burst requests.
const tokenCache = new Map<string, CachedTokenEntry>();
const TOKEN_TTL_MS = 60_000;
let vantsJwksCache: { at: number; keys: JsonWebKey[] } | null = null;

function b64uToBuf(s: string): Uint8Array {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return Uint8Array.from(Buffer.from(b, "base64"));
}

async function verifyVantsJwt(token: string): Promise<AuthenticatedUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    sub?: string;
    exp?: number;
    email?: string;
    name?: string;
    picture?: string;
  };
  try {
    header = JSON.parse(Buffer.from(b64uToBuf(parts[0])).toString("utf8"));
    payload = JSON.parse(Buffer.from(b64uToBuf(parts[1])).toString("utf8"));
  } catch {
    return null;
  }

  const iss = String(payload.iss || "").replace(/\/+$/, "");
  if (header.alg !== "RS256" || iss !== VANTS_AUTH_ISSUER || !payload.sub) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (VANTS_AUTH_AUDIENCE && !auds.includes(VANTS_AUTH_AUDIENCE)) return null;

  try {
    if (!vantsJwksCache || Date.now() - vantsJwksCache.at > 3600_000) {
      const r = await fetch(VANTS_AUTH_JWKS_URL);
      if (!r.ok) return null;
      const data = (await r.json()) as { keys?: JsonWebKey[] };
      vantsJwksCache = { at: Date.now(), keys: Array.isArray(data.keys) ? data.keys : [] };
    }
    const jwk = vantsJwksCache.keys.find((k: any) => !header.kid || k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64uToBuf(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    return {
      uid: payload.sub.startsWith("google-oauth2|") ? payload.sub.slice("google-oauth2|".length) : payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      provider: "vants",
    };
  } catch {
    return null;
  }
}

async function fetchUserInfo(
  url: string,
  token: string,
  provider: "auth0" | "google",
): Promise<AuthenticatedUser | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      sub?: string;
      email?: string;
      nickname?: string;
      name?: string;
      picture?: string;
    };
    if (!data.sub) return null;
    return {
      uid: provider === "auth0" ? `auth0:${data.sub}` : data.sub,
      email: data.email,
      name: data.nickname || data.name,
      picture: data.picture,
      provider,
    };
  } catch {
    return null;
  }
}

export async function verifyBearerToken(token: string): Promise<AuthenticatedUser> {
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  // VANTS/Auth0 access tokens are 3-part JWTs; Google OAuth access tokens typically start with ya29.
  const looksLikeJwt = token.split(".").length === 3;
  let user: AuthenticatedUser | null = null;

  if (looksLikeJwt) {
    user = await verifyVantsJwt(token);
    if (!user) {
      user = await fetchUserInfo(`https://${AUTH0_DOMAIN}/userinfo`, token, "auth0");
    }
    if (!user) {
      user = await fetchUserInfo("https://www.googleapis.com/oauth2/v3/userinfo", token, "google");
    }
  } else {
    user = await fetchUserInfo("https://www.googleapis.com/oauth2/v3/userinfo", token, "google");
    if (!user) {
      user = await fetchUserInfo(`https://${AUTH0_DOMAIN}/userinfo`, token, "auth0");
    }
  }

  if (!user) {
    throw new Error("Token verification failed against VANTS Identity, Auth0 and Google OAuth");
  }

  if (tokenCache.size > 500) {
    tokenCache.clear();
  }
  tokenCache.set(token, { user, expiresAt: now + TOKEN_TTL_MS });
  return user;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Inicia sesión para realizar esta acción." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Token de sesión vacío." });
  }

  try {
    req.user = await verifyBearerToken(token);
    next();
  } catch (error) {
    console.error("Error verifying bearer token:", error);
    return res.status(401).json({ error: "Sesión inválida o expirada. Vuelve a iniciar sesión." });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      try {
        req.user = await verifyBearerToken(token);
      } catch {
        // Invalid optional token is treated as anonymous for public GET routes.
      }
    }
  }
  next();
};
