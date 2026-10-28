import { act, render, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ChatSocketProvider } from "../ChatSocketContext";
import { useChatEvents, useChatSocketContext } from "../useChatSocket";
import type { ChatSocketHandlers } from "@/features/chat/hooks/useChatSocket";
import type { ChatMessage, ChatThread } from "@/features/chat/types/chat";
import { net } from "@/test/container";

const socket = vi.hoisted(() => ({ dispatcher: null as ChatSocketHandlers | null, api: { status: "open", subscribe: vi.fn(), unsubscribe: vi.fn(), sendMessage: vi.fn(), sendRead: vi.fn(), sendTyping: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/features/chat/hooks/useChatSocket", () => ({ useChatSocket: (handlers: ChatSocketHandlers) => { socket.dispatcher = handlers; return socket.api; } }));

const wrapper = ({ children }: { children: ReactNode }) => <ChatSocketProvider>{children}</ChatSocketProvider>;
const message = { id: "m1", threadId: "t1" } as ChatMessage;
const thread = { threadId: "t1" } as ChatThread;

beforeEach(() => { net.queryClient.clear(); socket.dispatcher = null; });

it("fans every socket event out to all registered screens", () => {
  const first = { onMessage: vi.fn(), onAck: vi.fn(), onError: vi.fn(), onRead: vi.fn(), onHidden: vi.fn(), onTyping: vi.fn(), onThreadUpdated: vi.fn(), onUnread: vi.fn(), onResync: vi.fn() };
  const second = { onMessage: vi.fn() };
  const { unmount } = renderHook(() => { useChatEvents(first); useChatEvents(second); }, { wrapper });
  const d = socket.dispatcher!;
  act(() => {
    d.onMessage?.("t1", message);
    d.onAck?.("t1", "c1", message);
    d.onError?.({ code: "x", message: "erro" });
    d.onRead?.("t1", "u1", ["m1"], "m1");
    d.onHidden?.("t1", "m1");
    d.onTyping?.("t1", "u1", true);
    d.onThreadUpdated?.(thread);
    d.onUnread?.({ unreadTotal: 3, unreadThreads: 1 });
    d.onResync?.(["t1"]);
  });
  expect(first.onMessage).toHaveBeenCalledWith("t1", message);
  expect(second.onMessage).toHaveBeenCalledWith("t1", message);
  expect(first.onAck).toHaveBeenCalledWith("t1", "c1", message);
  expect(first.onError).toHaveBeenCalledWith({ code: "x", message: "erro" });
  expect(first.onRead).toHaveBeenCalledWith("t1", "u1", ["m1"], "m1");
  expect(first.onHidden).toHaveBeenCalledWith("t1", "m1");
  expect(first.onTyping).toHaveBeenCalledWith("t1", "u1", true);
  expect(first.onThreadUpdated).toHaveBeenCalledWith(thread);
  expect(first.onUnread).toHaveBeenCalledWith({ unreadTotal: 3, unreadThreads: 1 });
  expect(first.onResync).toHaveBeenCalledWith(["t1"]);
  unmount();
  act(() => d.onMessage?.("t1", message));
  expect(first.onMessage).toHaveBeenCalledTimes(1);
});

it("keeps the unread badge current on any route and rereads it after reconnecting", () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  render(<ChatSocketProvider><span /></ChatSocketProvider>);
  act(() => socket.dispatcher!.onUnread?.({ unreadTotal: 5, unreadThreads: 2 }));
  expect(net.queryClient.getQueryData(["chat", "unread"])).toEqual({ unreadTotal: 5, unreadThreads: 2 });
  act(() => socket.dispatcher!.onResync?.([]));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", "unread"] });
});

it("uses the latest handlers without re-registering and exposes the socket commands", () => {
  const calls: string[] = [];
  const { rerender, result } = renderHook(({ label }) => { useChatEvents({ onTyping: () => calls.push(label) }); return useChatSocketContext(); }, { wrapper, initialProps: { label: "primeiro" } });
  rerender({ label: "segundo" });
  act(() => socket.dispatcher!.onTyping?.("t1", "u1", false));
  expect(calls).toEqual(["segundo"]);
  // Handlers ausentes não quebram o despacho.
  act(() => { socket.dispatcher!.onMessage?.("t1", message); socket.dispatcher!.onHidden?.("t1", "m1"); });
  result.current.subscribe("t1");
  expect(socket.api.subscribe).toHaveBeenCalledWith("t1");
});

it("requires the provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useChatSocketContext())).toThrow("useChatSocketContext precisa estar dentro de ChatSocketProvider");
});
