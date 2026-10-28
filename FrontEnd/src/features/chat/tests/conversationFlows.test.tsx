import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Mensagens from "@/pages/messages/Mensagens";
import type { ChatSocketHandlers } from "../hooks/useChatSocket";
import type { ChatMessage, ChatThread, MessagePage } from "../types/chat";
import { renderWithProviders } from "@/test/render";

const TID = "rental:r1:me:peer";
const mocks = vi.hoisted(() => ({
  listeners: new Set<{ get: () => ChatSocketHandlers }>(),
  socket: { status: "open", subscribe: vi.fn(), unsubscribe: vi.fn(), sendMessage: vi.fn(), sendRead: vi.fn(), sendTyping: vi.fn() },
  chat: { listThreads: vi.fn(), listMessages: vi.fn(), getThread: vi.fn(), markRead: vi.fn(), sendMessage: vi.fn(), reportMessage: vi.fn(), resolveThread: vi.fn(), setUnread: vi.fn(), refreshUnread: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/contexts/useChatSocket", async () => {
  const React = await import("react");
  return {
    useChatSocketContext: () => mocks.socket,
    useChatEvents: (handlers: ChatSocketHandlers) => {
      const ref = React.useRef(handlers);
      React.useEffect(() => { ref.current = handlers; });
      React.useEffect(() => { const entry = { get: () => ref.current }; mocks.listeners.add(entry); return () => { mocks.listeners.delete(entry); }; }, []);
    },
  };
});
vi.mock("@/features/chat/hooks/useChat", () => ({ useChatActions: () => mocks.chat }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "me" }) }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

function emit<K extends keyof ChatSocketHandlers>(name: K, ...args: Parameters<NonNullable<ChatSocketHandlers[K]>>) {
  act(() => { mocks.listeners.forEach(listener => (listener.get()[name] as ((...a: unknown[]) => void) | undefined)?.(...args)); });
}
const message = (index: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${index}`, threadId: TID, senderId: "peer", receiverId: "me", content: `mensagem ${index}`,
  sentAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(), readAt: null, flaggedForModeration: false, hidden: false, clientId: null, ...overrides,
});
const thread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
  threadId: TID, scope: "rental", scopeId: "r1", scopeLabel: "Locação #1", peer: { id: "peer", name: "João", role: "locador" },
  canWrite: true, unreadCount: 2, lastMessage: null, ...overrides,
});
const page = (results: ChatMessage[], hasMore = false): MessagePage => ({ results, hasMore, order: "asc" });
const open = (path = `/mensagens/${encodeURIComponent(TID)}`) => renderWithProviders(<Mensagens />, { route: path, path: path === "/mensagens" ? "/mensagens" : "/mensagens/:threadId", routes: path === "/mensagens" ? { "/mensagens/:threadId": <Mensagens /> } : { "/mensagens": <Mensagens /> } });

beforeEach(() => {
  mocks.listeners.clear();
  mocks.socket.status = "open";
  mocks.socket.sendMessage.mockReturnValue(true);
  mocks.socket.sendRead.mockReturnValue(true);
  mocks.chat.listThreads.mockResolvedValue({ count: 1, limit: 50, offset: 0, results: [thread()] });
  mocks.chat.getThread.mockResolvedValue(thread());
  mocks.chat.listMessages.mockResolvedValue(page([message(1)]));
  mocks.chat.markRead.mockResolvedValue({ updated: 0, readAt: "", unreadTotal: 0 });
  mocks.chat.refreshUnread.mockResolvedValue(undefined);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  let uuid = 0;
  vi.stubGlobal("crypto", { ...crypto, randomUUID: () => `client-${++uuid}` });
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it("asks to pick a conversation and opens one from the inbox", async () => {
  const { user } = open("/mensagens");
  expect(screen.getByText("Escolha uma conversa para começar.")).toBeInTheDocument();
  await user.click(await screen.findByText("João"));
  expect(await screen.findByText("mensagem 1")).toBeInTheDocument();
  expect(mocks.socket.subscribe).toHaveBeenCalledWith(TID);
});

it("sends through the socket and falls back to REST when it is down", async () => {
  mocks.socket.sendMessage.mockReturnValueOnce(true).mockReturnValueOnce(false);
  mocks.chat.sendMessage.mockResolvedValue(message(9, { senderId: "me", content: "Pelo REST", clientId: "client-2" }));
  const { user } = open();
  await screen.findByText("mensagem 1");
  await user.type(screen.getByPlaceholderText("Escreva uma mensagem..."), "Pelo socket{Enter}");
  expect(mocks.socket.sendMessage).toHaveBeenCalledWith(TID, "Pelo socket", "client-1");
  emit("onAck", TID, "client-1", message(8, { senderId: "me", content: "Pelo socket", clientId: "client-1" }));
  expect(screen.getAllByText("Pelo socket")).toHaveLength(1);
  await user.type(screen.getByPlaceholderText("Escreva uma mensagem..."), "Pelo REST");
  await user.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(mocks.chat.sendMessage).toHaveBeenCalledWith(TID, "Pelo REST", "client-2"));
  expect(screen.getAllByText("Pelo REST")).toHaveLength(1);
});

it("marks a failed REST send for retry and resends with the same client id", async () => {
  mocks.socket.sendMessage.mockReturnValue(false);
  mocks.chat.sendMessage.mockRejectedValueOnce(new Error("Sem conexão.")).mockResolvedValueOnce(message(9, { senderId: "me", content: "Olá", clientId: "client-1" }));
  const { user } = open();
  await screen.findByText("mensagem 1");
  await user.type(screen.getByPlaceholderText("Escreva uma mensagem..."), "Olá{Enter}");
  await user.click(await screen.findByRole("button", { name: /Reenviar/ }));
  await waitFor(() => expect(mocks.chat.sendMessage).toHaveBeenCalledTimes(2));
  expect(mocks.chat.sendMessage).toHaveBeenLastCalledWith(TID, "Olá", "client-1");
  expect(mocks.toast.error).toHaveBeenCalledWith("Sem conexão.");
});

it("marks a message as failed when the socket never confirms it", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { user } = open();
  await screen.findByText("mensagem 1");
  await user.type(screen.getByPlaceholderText("Escreva uma mensagem..."), "Sem eco{Enter}");
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole("button", { name: /Reenviar/ })).toBeInTheDocument();
});

it("shows read receipts, moderation removals and typing", async () => {
  mocks.chat.listMessages.mockResolvedValue(page([message(1), message(2, { senderId: "me", content: "minha" })]));
  open();
  await screen.findByText("minha");
  emit("onRead", TID, "peer", ["m2"], "m2");
  expect(screen.getByText("done_all")).toBeInTheDocument();
  emit("onRead", "outra", "peer", ["m1"], "m1");
  emit("onHidden", TID, "m1");
  expect(screen.getByText("Mensagem removida pela moderação.")).toBeInTheDocument();
  emit("onHidden", "outra", "m2");
  emit("onTyping", TID, "peer", true);
  expect(screen.getByText("digitando...")).toBeInTheDocument();
  emit("onTyping", TID, "peer", false);
  expect(screen.queryByText("digitando...")).not.toBeInTheDocument();
  emit("onMessage", "outra", message(5));
  emit("onAck", "outra", "x", message(6));
  expect(screen.queryByText("mensagem 5")).not.toBeInTheDocument();
});

it("tells the user the chat is reconnecting", async () => {
  mocks.socket.status = "connecting";
  open();
  expect(await screen.findByText("Locação #1 · reconectando...")).toBeInTheDocument();
});

it("ignores errors for other conversations and rereads permission when forbidden", async () => {
  const { user } = open();
  await screen.findByText("mensagem 1");
  emit("onError", { code: "x", message: "sem cliente" });
  emit("onError", { code: "x", message: "outra conversa", clientId: "c", threadId: "outra" });
  expect(mocks.toast.error).not.toHaveBeenCalled();
  await user.type(screen.getByPlaceholderText("Escreva uma mensagem..."), "Oi{Enter}");
  mocks.chat.getThread.mockRejectedValueOnce(new Error("offline"));
  emit("onError", { code: "forbidden", message: "Locação cancelada.", clientId: "client-1", threadId: TID });
  expect(mocks.toast.error).toHaveBeenCalledWith("Locação cancelada.");
  await waitFor(() => expect(mocks.chat.listThreads).toHaveBeenCalledTimes(2));
  emit("onError", { code: "rate_limited", message: "Calma.", clientId: "desconhecido" });
  expect(mocks.toast.error).toHaveBeenLastCalledWith("Calma.");
});

it("catches up across pages after reconnecting, only for the open conversation", async () => {
  mocks.chat.listMessages.mockResolvedValueOnce(page([message(1)]))
    .mockResolvedValueOnce(page([message(2)], true))
    .mockResolvedValueOnce(page([message(3)], false));
  open();
  await screen.findByText("mensagem 1");
  emit("onResync", ["outra"]);
  emit("onResync", [TID]);
  expect(await screen.findByText("mensagem 3")).toBeInTheDocument();
  expect(mocks.chat.listMessages).toHaveBeenNthCalledWith(3, TID, { after: message(2).sentAt, after_id: "m2", limit: 200 });
  mocks.chat.listMessages.mockRejectedValueOnce(new Error("offline"));
  emit("onResync", [TID]);
  expect(screen.getByText("mensagem 3")).toBeInTheDocument();
});

it("falls back to REST to mark incoming messages read when the socket cannot", async () => {
  mocks.socket.sendRead.mockReturnValue(false);
  open();
  await screen.findByText("mensagem 1");
  mocks.chat.markRead.mockClear();
  emit("onMessage", TID, message(2));
  await waitFor(() => expect(mocks.chat.markRead).toHaveBeenCalledWith(TID), { timeout: 2000 });
  await waitFor(() => expect(mocks.chat.refreshUnread).toHaveBeenCalled());
  emit("onMessage", TID, message(3, { senderId: "me" }));
});

it("reports a message after describing the problem", async () => {
  mocks.chat.reportMessage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Já denunciada."));
  const { user } = open();
  await screen.findByText("mensagem 1");
  await user.click(screen.getByTitle("Denunciar mensagem"));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByPlaceholderText(/Descreva o que houve/), "Ofensa");
  await user.click(within(dialog).getByRole("button", { name: /Enviar denúncia/ }));
  await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Denúncia registrada."));
  expect(mocks.chat.reportMessage).toHaveBeenCalledWith("m1", "Ofensa");
  await user.click(screen.getByTitle("Denunciar mensagem"));
  const again = await screen.findByRole("dialog");
  await user.type(within(again).getByPlaceholderText(/Descreva o que houve/), "Spam");
  await user.click(within(again).getByRole("button", { name: /Enviar denúncia/ }));
  await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Já denunciada."));
});

it("explains when a conversation or older messages cannot be loaded", async () => {
  mocks.chat.listMessages.mockResolvedValueOnce(page([message(5)], true)).mockRejectedValueOnce(new Error("Histórico indisponível."));
  const { user } = open();
  await user.click(await screen.findByRole("button", { name: "Carregar mensagens anteriores" }));
  await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Histórico indisponível."));
});

it("shows an error when the conversation cannot be opened and the inbox fails", async () => {
  mocks.chat.getThread.mockRejectedValue("boom");
  mocks.chat.listThreads.mockRejectedValueOnce(new Error("Inbox fora do ar.")).mockResolvedValue({ count: 1, limit: 50, offset: 0, results: [thread()] });
  const { user } = open();
  await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Não foi possível abrir a conversa."));
  await user.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  expect((await screen.findAllByText("João")).length).toBeGreaterThan(0);
});

it("keeps read-only conversations from accepting new messages and returns to the inbox on mobile", async () => {
  mocks.chat.getThread.mockResolvedValue(thread({ canWrite: false, peer: null }));
  mocks.chat.listThreads.mockResolvedValue({ count: 0, limit: 50, offset: 0, results: [] });
  const { user } = open();
  expect(await screen.findByPlaceholderText("Esta conversa é somente leitura.")).toBeDisabled();
  expect(screen.getByText("Usuário")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Voltar" }));
  expect(await screen.findByText("Escolha uma conversa para começar.")).toBeInTheDocument();
});
