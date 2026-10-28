import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Mensagens from "@/pages/messages/Mensagens";
import ChatInboxPanel from "../components/ChatInboxPanel";
import type { ChatSocketHandlers } from "../hooks/useChatSocket";
import type { ChatMessage, ChatThread, MessagePage } from "../types/chat";

const TID = "rental:r1:me:peer";

const mocks = vi.hoisted(() => ({
  listeners: new Set<{ get: () => ChatSocketHandlers }>(),
  socket: {
    status: "open", subscribe: vi.fn(), unsubscribe: vi.fn(), sendMessage: vi.fn(), sendRead: vi.fn(), sendTyping: vi.fn(),
  },
  chat: {
    listThreads: vi.fn(), listMessages: vi.fn(), getThread: vi.fn(), markRead: vi.fn(), sendMessage: vi.fn(),
    reportMessage: vi.fn(), resolveThread: vi.fn(), setUnread: vi.fn(), refreshUnread: vi.fn(),
  },
  toastError: vi.fn(),
}));
vi.mock("@/contexts/useChatSocket", async () => {
  const React = await import("react");
  return {
    useChatSocketContext: () => mocks.socket,
    useChatEvents: (handlers: ChatSocketHandlers) => {
      const ref = React.useRef(handlers);
      React.useEffect(() => { ref.current = handlers; });
      React.useEffect(() => {
        const entry = { get: () => ref.current };
        mocks.listeners.add(entry);
        return () => { mocks.listeners.delete(entry); };
      }, []);
    },
  };
});
vi.mock("@/features/chat/hooks/useChat", () => ({ useChatActions: () => mocks.chat }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "me" }) }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

function emit<K extends keyof ChatSocketHandlers>(name: K, ...args: Parameters<NonNullable<ChatSocketHandlers[K]>>) {
  act(() => {
    mocks.listeners.forEach((listener) => (listener.get()[name] as ((...a: unknown[]) => void) | undefined)?.(...args));
  });
}

function message(index: number, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${index}`, threadId: TID, senderId: "peer", receiverId: "me", content: `mensagem ${index}`,
    sentAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(), readAt: null,
    flaggedForModeration: false, hidden: false, clientId: null, ...overrides,
  };
}

function thread(index = 0, overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    threadId: index ? `rental:r${index}:me:peer` : TID, scope: "rental", scopeId: `r${index}`, scopeLabel: `Locação ${index}`,
    peer: { id: "peer", name: `Pessoa ${index}`, role: "locador" }, canWrite: true, unreadCount: 0, lastMessage: null, ...overrides,
  };
}

const page = (results: ChatMessage[], hasMore = false, order: MessagePage["order"] = "desc"): MessagePage =>
  ({ results: order === "desc" ? [...results].reverse() : results, hasMore, order });

function openConversation() {
  render(<MemoryRouter initialEntries={[`/mensagens/${encodeURIComponent(TID)}`]}><Routes><Route path="/mensagens/:threadId" element={<Mensagens />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  mocks.listeners.clear();
  mocks.socket.sendMessage.mockReturnValue(true);
  mocks.socket.sendRead.mockReturnValue(true);
  mocks.chat.listThreads.mockResolvedValue({ count: 1, limit: 50, offset: 0, results: [thread()] });
  mocks.chat.getThread.mockResolvedValue(thread());
  mocks.chat.markRead.mockResolvedValue({ updated: 0, readAt: "", unreadTotal: 0 });
  mocks.chat.refreshUnread.mockResolvedValue(undefined);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

describe("open conversation", () => {
  it("marks a message read when it arrives in the visible conversation, but not in a hidden tab", async () => {
    mocks.chat.listMessages.mockResolvedValue(page([message(1)]));
    openConversation();
    await screen.findByText("mensagem 1");
    await waitFor(() => expect(mocks.chat.markRead).toHaveBeenCalledTimes(1));

    emit("onMessage", TID, message(2));
    await screen.findByText("mensagem 2");
    await waitFor(() => expect(mocks.socket.sendRead).toHaveBeenCalledWith(TID));

    mocks.socket.sendRead.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    emit("onMessage", TID, message(3));
    await screen.findByText("mensagem 3");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(mocks.socket.sendRead).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(mocks.socket.sendRead).toHaveBeenCalledWith(TID));
  });

  it("loads 120 messages page by page, in order and without duplicates", async () => {
    const all = Array.from({ length: 120 }, (_, i) => message(i + 1));
    mocks.chat.listMessages.mockImplementation(async (_tid: string, cursor: { before_id?: string; limit?: number }) => {
      const end = cursor.before_id ? all.findIndex((m) => m.id === cursor.before_id) : all.length;
      const start = Math.max(0, end - (cursor.limit ?? 50));
      return page(all.slice(start, end), start > 0);
    });
    openConversation();
    await screen.findByText("mensagem 120");
    expect(screen.queryByText("mensagem 70")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mensagens anteriores" }));
    await screen.findByText("mensagem 70");
    fireEvent.click(screen.getByRole("button", { name: "Carregar mensagens anteriores" }));
    await screen.findByText("mensagem 1");
    expect(screen.queryByRole("button", { name: "Carregar mensagens anteriores" })).toBeNull();
    const rendered = screen.getAllByText(/^mensagem \d+$/).map((node) => node.textContent);
    expect(rendered).toEqual(all.map((m) => m.content));
    expect(mocks.chat.listMessages).toHaveBeenLastCalledWith(TID, { before: all[20].sentAt, before_id: "m21", limit: 50 });
  });

  it("recovers the first message received while an empty conversation was offline", async () => {
    mocks.chat.listMessages.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([message(1)]));
    openConversation();
    await waitFor(() => expect(mocks.socket.subscribe).toHaveBeenCalledWith(TID));
    emit("onResync", [TID]);
    await screen.findByText("mensagem 1");
    expect(mocks.chat.listMessages).toHaveBeenLastCalledWith(TID, { limit: 50 });
  });

  it("catches up from the last confirmed message, never from a pending bubble", async () => {
    mocks.chat.listMessages.mockResolvedValue(page([message(1)]));
    openConversation();
    await screen.findByText("mensagem 1");
    mocks.socket.sendMessage.mockReturnValue(true);
    fireEvent.change(screen.getByPlaceholderText("Escreva uma mensagem..."), { target: { value: "ainda pendente" } });
    fireEvent.keyDown(screen.getByPlaceholderText("Escreva uma mensagem..."), { key: "Enter" });
    await screen.findByText("ainda pendente");
    mocks.chat.listMessages.mockResolvedValueOnce(page([message(2)], false, "asc"));
    emit("onResync", [TID]);
    await screen.findByText("mensagem 2");
    expect(mocks.chat.listMessages).toHaveBeenLastCalledWith(TID, { after: message(1).sentAt, after_id: "m1", limit: 200 });
  });

  it("a retry whose original was already stored is confirmed by the acknowledgment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.chat.listMessages.mockResolvedValue(page([]));
    openConversation();
    const composer = await screen.findByPlaceholderText("Escreva uma mensagem...");
    fireEvent.change(composer, { target: { value: "oi" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    await screen.findByText("oi");
    const [, , clientId] = mocks.socket.sendMessage.mock.lastCall as [string, string, string];
    act(() => { vi.advanceTimersByTime(10_001); }); // the echo was lost
    fireEvent.click(await screen.findByRole("button", { name: /Reenviar/ }));
    expect(mocks.socket.sendMessage).toHaveBeenLastCalledWith(TID, "oi", clientId);
    emit("onAck", TID, clientId, message(9, { senderId: "me", receiverId: "peer", content: "oi", clientId }));
    act(() => { vi.advanceTimersByTime(10_001); });
    expect(screen.queryByRole("button", { name: /Reenviar/ })).toBeNull();
    expect(screen.getAllByText("oi")).toHaveLength(1);
  });

  it("fails a refused send immediately with the server's reason and rereads write permission", async () => {
    mocks.chat.listMessages.mockResolvedValue(page([]));
    openConversation();
    const composer = await screen.findByPlaceholderText("Escreva uma mensagem...");
    fireEvent.change(composer, { target: { value: "posso?" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    const [, , clientId] = mocks.socket.sendMessage.mock.lastCall as [string, string, string];
    mocks.chat.getThread.mockResolvedValue(thread(0, { canWrite: false }));
    mocks.chat.listThreads.mockResolvedValue({ count: 1, limit: 50, offset: 0, results: [thread(0, { canWrite: false })] });
    emit("onError", { code: "forbidden", message: "Esta conversa é somente leitura.", threadId: TID, clientId });
    expect(await screen.findByRole("button", { name: /Reenviar/ })).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith("Esta conversa é somente leitura.");
    await waitFor(() => expect(screen.getByPlaceholderText("Esta conversa é somente leitura.")).toBeTruthy());
  });
});

describe("inbox", () => {
  it("updates the dashboard panel while mounted and reaches threads past the first page", async () => {
    const first = Array.from({ length: 50 }, (_, i) => thread(i + 1));
    const rest = Array.from({ length: 10 }, (_, i) => thread(i + 51));
    mocks.chat.listThreads.mockImplementation(async ({ offset = 0 }: { offset?: number }) =>
      ({ count: 60, limit: 50, offset, results: offset ? rest : first }));
    render(<MemoryRouter><ChatInboxPanel subtitle="Conversas" /></MemoryRouter>);
    await screen.findByText("Pessoa 1");
    expect(screen.queryByText("Pessoa 60")).toBeNull();

    emit("onThreadUpdated", thread(99, { lastMessage: message(1, { content: "nova conversa" }) }));
    expect(await screen.findByText("nova conversa")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Carregar mais conversas" }));
    await screen.findByText("Pessoa 60");
    expect(screen.queryByRole("button", { name: "Carregar mais conversas" })).toBeNull();
  });
});
