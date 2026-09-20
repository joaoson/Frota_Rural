export const DEFAULT_BASE_URL = "http://localhost:8000/api/";

function alignLocalHostname(url: URL, pageOrigin: string, development: boolean): URL {
  const page = new URL(pageOrigin);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  // Different loopback names are different sites: SameSite=Lax refresh cookies
  // cannot accompany a request from 127.0.0.1 to localhost.
  if (development && loopback.has(page.hostname) && loopback.has(url.hostname)) {
    url.hostname = page.hostname;
  }
  return url;
}

export function resolveApiBaseUrl(configured: string | undefined, pageOrigin: string, development: boolean): string {
  return alignLocalHostname(new URL(configured || DEFAULT_BASE_URL, pageOrigin), pageOrigin, development).href;
}

export function resolveWebSocketBaseUrl(configured: string | undefined, apiBaseUrl: string, pageOrigin: string, development: boolean): string {
  const url = alignLocalHostname(new URL(configured || apiBaseUrl, pageOrigin), pageOrigin, development);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  if (!configured) url.pathname = url.pathname.replace(/\/?api\/?$/, "");
  return url.href.replace(/\/$/, "");
}

export function getApiBaseUrl(configured = import.meta.env.VITE_API_BASE_URL): string {
  return resolveApiBaseUrl(configured, window.location.origin, import.meta.env.DEV);
}
