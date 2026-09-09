import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatSocket } from "../hooks/useChatSocket";

const state = vi.hoisted(() => ({ token: "old-token", authenticated: true, logout: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/container", () => ({
  tokenStore: { getAccessToken: () => state.token },
  sessionService: { refresh: state.refresh },
}));
vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ tokens: { access: "old-token" }, isAuthenticated: state.authenticated, isLoading: false, logout: state.logout }),
}));

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 0;
  protocols: string[];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(_url: string, protocols: string[]) {
    this.protocols = protocols;
    TestSocket.instances.push(this);
  }
}

beforeEach(() => {
  state.token = "old-token";
  state.authenticated = true;
  TestSocket.instances = [];
  state.refresh.mockImplementation(async () => { state.token = "fresh-token"; });
  vi.stubGlobal("WebSocket", TestSocket);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("reconnects with the shared token store after refreshing an expired socket token", async () => {
  renderHook(() => useChatSocket({}));
  await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
  expect(TestSocket.instances[0].protocols).toEqual(["bearer", "old-token"]);
  act(() => TestSocket.instances[0].onclose?.({ code: 4401 }));
  await waitFor(() => expect(TestSocket.instances).toHaveLength(2));
  expect(TestSocket.instances[1].protocols).toEqual(["bearer", "fresh-token"]);
  expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(state.logout).not.toHaveBeenCalled();
});

it("does not reconnect on visibility changes after logout", async () => {
  state.authenticated = false;
  renderHook(() => useChatSocket({}));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(TestSocket.instances).toHaveLength(0);
});
