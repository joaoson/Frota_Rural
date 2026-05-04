export function parseJwt<T = Record<string, unknown>>(token: string): T {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64)) as T;
}

export type JwtPayload = {
  user_id: string;
  exp: number;
  iat: number;
  jti: string;
  token_type: string;
};
