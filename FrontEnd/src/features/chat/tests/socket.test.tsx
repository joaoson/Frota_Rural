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

const messageDto = {
  id: "m2", thread_id: "t1", sender_id: "peer", receiver_id: "me", content: "chegou",
  sent_at: "2026-10-01T00:00:00Z", read_at: null, flagged_for_moderation: false, hidden: false,
};
async function connected(handlers = {}) {
  const hook = renderHook(() => useChatSocket(handlers));
  await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
  const socket = TestSocket.instances[0];
  return { hook, socket };
}

it("routes every server event to its handler and ignores malformed frames", async () => {
  const handlers = { onMessage: vi.fn(), onRead: vi.fn(), onHidden: vi.fn(), onTyping: vi.fn(), onUnread: vi.fn(), onThreadUpdated: vi.fn(), onError: vi.fn(), onAck: vi.fn() };
  const { socket } = await connected(handlers);
  const frame = (data: unknown) => socket.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  act(() => {
    socket.onopen?.();
    frame("{not json");
    frame({ type: "message.new", thread_id: "t1", message: messageDto });
    frame({ type: "message.read", thread_id: "t1", reader_id: "peer", message_ids: ["m1"], up_to: "m1" });
    frame({ type: "message.read", thread_id: "t1", reader_id: "peer", up_to: "m1" });
    frame({ type: "message.hidden", thread_id: "t1", message_id: "m2" });
    frame({ type: "typing", thread_id: "t1", user_id: "peer", is_typing: 1 });
    frame({ type: "unread.updated", unread_total: 4, unread_threads: 2 });
    frame({ type: "thread.updated", thread: { thread_id: "t1", scope: "rental", scope_id: "r1", scope_label: "Locação", peer: null, can_write: true, unread_count: 1, last_message: messageDto } });
    frame({ type: "message.ack", thread_id: "t1", message: messageDto });
    frame({ type: "error" });
    frame({ type: "pong" });
  });
  expect(handlers.onMessage).toHaveBeenCalledWith("t1", expect.objectContaining({ id: "m2", content: "chegou" }));
  expect(handlers.onRead).toHaveBeenNthCalledWith(1, "t1", "peer", ["m1"], "m1");
  expect(handlers.onRead).toHaveBeenNthCalledWith(2, "t1", "peer", [], "m1");
  expect(handlers.onHidden).toHaveBeenCalledWith("t1", "m2");
  expect(handlers.onTyping).toHaveBeenCalledWith("t1", "peer", true);
  expect(handlers.onUnread).toHaveBeenCalledWith({ unreadTotal: 4, unreadThreads: 2 });
  expect(handlers.onThreadUpdated).toHaveBeenCalledWith(expect.objectContaining({ threadId: "t1", unreadCount: 1 }));
  expect(handlers.onAck).not.toHaveBeenCalled();
  expect(handlers.onError).toHaveBeenCalledWith({ code: "", message: "A mensagem não pôde ser enviada." });
});

it("sends commands only while open and resubscribes wanted threads after reconnecting", async () => {
  const onResync = vi.fn();
  const { hook, socket } = await connected({ onResync });
  expect(hook.result.current.sendMessage("t1", "oi", "c1")).toBe(false);
  act(() => hook.result.current.subscribe("t1"));
  act(() => { socket.readyState = TestSocket.OPEN; socket.onopen?.(); });
  expect(hook.result.current.status).toBe("open");
  expect(onResync).toHaveBeenCalledWith(["t1"]);
  expect(hook.result.current.sendMessage("t1", "oi", "c1")).toBe(true);
  hook.result.current.sendRead("t1", "m9");
  hook.result.current.sendRead("t1");
  hook.result.current.sendTyping("t1", true);
  act(() => hook.result.current.unsubscribe("t1"));
  expect(socket.send.mock.calls.map(([raw]) => JSON.parse(raw))).toEqual([
    { type: "thread.subscribe", thread_id: "t1" },
    { type: "message.send", thread_id: "t1", content: "oi", client_id: "c1" },
    { type: "message.read", thread_id: "t1", up_to: "m9" },
    { type: "message.read", thread_id: "t1" },
    { type: "typing", thread_id: "t1", is_typing: true },
    { type: "thread.unsubscribe", thread_id: "t1" },
  ]);
});

it("pings to keep the connection alive and drops a silent connection", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { socket } = await connected();
    act(() => { socket.readyState = TestSocket.OPEN; socket.onopen?.(); });
    act(() => { vi.advanceTimersByTime(25_000); });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
    act(() => { vi.advanceTimersByTime(35_000); });
    expect(socket.close).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("backs off between reconnections, waits longer when rate limited and stops on normal closes", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  try {
    const { hook } = await connected();
    act(() => TestSocket.instances[0].onclose?.({ code: 1006 }));
    expect(hook.result.current.status).toBe("closed");
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(TestSocket.instances).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(TestSocket.instances).toHaveLength(2);
    act(() => TestSocket.instances[1].onclose?.({ code: 4429 }));
    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(TestSocket.instances).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(TestSocket.instances).toHaveLength(3);
    act(() => TestSocket.instances[2].onclose?.({ code: 4403 }));
    act(() => TestSocket.instances[2].onclose?.({ code: 1000 }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(TestSocket.instances).toHaveLength(3);
  } finally { vi.useRealTimers(); }
});

it("resets the backoff after a stable connection and reconnects when the tab becomes visible", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { hook } = await connected();
    act(() => { TestSocket.instances[0].onopen?.(); });
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    act(() => TestSocket.instances[0].onclose?.({ code: 1006 }));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(TestSocket.instances).toHaveLength(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(TestSocket.instances).toHaveLength(2);
    act(() => { TestSocket.instances[1].readyState = TestSocket.OPEN; });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(TestSocket.instances).toHaveLength(2);
    hook.unmount();
    expect(TestSocket.instances[1].close).toHaveBeenCalledWith(1000);
  } finally { vi.useRealTimers(); }
});

it("logs out when refreshing an expired token fails and does not connect without a token", async () => {
  state.refresh.mockRejectedValue(new Error("expired"));
  await connected();
  act(() => TestSocket.instances[0].onclose?.({ code: 4401 }));
  await waitFor(() => expect(state.logout).toHaveBeenCalledTimes(1));
  cleanup();
  TestSocket.instances = [];
  state.token = "";
  renderHook(() => useChatSocket({}));
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(TestSocket.instances).toHaveLength(0);
});
