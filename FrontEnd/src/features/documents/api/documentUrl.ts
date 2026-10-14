import { getApiBaseUrl } from "@/shared/http/apiUrls";

/** File references remain unchanged in payloads; only display links need an absolute URL. */
export function documentUrl(path: string, apiBaseUrl = getApiBaseUrl()): string {
  const origin = new URL(apiBaseUrl).origin;
  const url = new URL(path, `${origin}/`);
  return ["http:", "https:"].includes(url.protocol) ? url.href : "";
}
