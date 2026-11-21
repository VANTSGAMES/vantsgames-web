import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  provider: "auth0" | "google";
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

// Short in-memory cache (60s) to avoid calling upstream userinfo on burst requests.
const tokenCache = new Map<string, CachedTokenEntry>();
const TOKEN_TTL_MS = 60_000;

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

  // Auth0 access tokens are 3-part JWTs; Google OAuth access tokens typically start with ya29.
  const looksLikeJwt = token.split(".").length === 3;
  let user: AuthenticatedUser | null = null;

  if (looksLikeJwt) {
    user = await fetchUserInfo(`https://${AUTH0_DOMAIN}/userinfo`, token, "auth0");
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
    throw new Error("Token verification failed against Auth0 and Google OAuth");
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
