import { expect, it } from "vitest";

import { resolveApiBaseUrl, resolveWebSocketBaseUrl } from "../apiUrls";

it.each([["127.0.0.1", "localhost"], ["localhost", "127.0.0.1"]])(
  "keeps API cookies and sockets on the page's local hostname (%s)", (page, api) => {
    expect(resolveApiBaseUrl(`http://${api}:8000/api/`, `http://${page}:5173`, true)).toBe(`http://${page}:8000/api/`);
    expect(resolveWebSocketBaseUrl(`ws://${api}:8000`, `http://${page}:8000/api/`, `http://${page}:5173`, true)).toBe(`ws://${page}:8000`);
  },
);

it("preserves remote and production API overrides", () => {
  expect(resolveApiBaseUrl("https://api.example.com/api/", "http://127.0.0.1:5173", true)).toBe("https://api.example.com/api/");
  expect(resolveApiBaseUrl("http://localhost:8000/api/", "http://127.0.0.1:5173", false)).toBe("http://localhost:8000/api/");
});

it("resolves relative API and secure WebSocket URLs against the page", () => {
  const api = resolveApiBaseUrl("/api/", "https://frota.example.com", false);
  expect(api).toBe("https://frota.example.com/api/");
  expect(resolveWebSocketBaseUrl(undefined, api, "https://frota.example.com", false)).toBe("wss://frota.example.com");
});
