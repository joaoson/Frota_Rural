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

it("logs out after a second rejected token even when both handshakes were accepted", async () => {
  renderHook(() => useChatSocket({}));
  await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
  act(() => {
    TestSocket.instances[0].onopen?.();
    TestSocket.instances[0].onclose?.({ code: 4401 });
  });
  await waitFor(() => expect(TestSocket.instances).toHaveLength(2));
  act(() => {
    TestSocket.instances[1].onopen?.();
    TestSocket.instances[1].onclose?.({ code: 4401 });
  });
  expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(state.logout).toHaveBeenCalledTimes(1);
});

it("delivers sender acknowledgments and refusals tied to the refused send", async () => {
  const onAck = vi.fn();
  const onError = vi.fn();
  renderHook(() => useChatSocket({ onAck, onError }));
  await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
  const socket = TestSocket.instances[0];
  const message = {
    id: "m1", thread_id: "t1", sender_id: "me", receiver_id: "peer", content: "oi",
    sent_at: "2026-10-01T00:00:00Z", read_at: null, flagged_for_moderation: false, hidden: false, client_id: "c1",
  };
  act(() => {
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ type: "message.ack", thread_id: "t1", client_id: "c1", message, created: false }) });
    socket.onmessage?.({ data: JSON.stringify({ type: "error", code: "rate_limited", message: "Aguarde.", thread_id: "t1", client_id: "c2" }) });
  });
  expect(onAck).toHaveBeenCalledWith("t1", "c1", expect.objectContaining({ id: "m1", clientId: "c1" }));
  expect(onError).toHaveBeenCalledWith({ code: "rate_limited", message: "Aguarde.", threadId: "t1", clientId: "c2" });
});
