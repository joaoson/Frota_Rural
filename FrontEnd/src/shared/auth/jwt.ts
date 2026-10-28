export interface JwtPayload {
  user_id: string;
  exp: number;
  iat: number;
  jti: string;
  token_type: string;
  email?: string;
  role?: string;
}

export function parseJwt<T = JwtPayload>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

export function isExpired(payload: JwtPayload, now: Date = new Date()): boolean {
  return payload.exp * 1000 <= now.getTime();
}
