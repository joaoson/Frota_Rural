import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useChatActions, useMarkRead, useMessages, useReportMessage, useResolveThread, useSendMessage, useThread, useThreads, useUnreadCount } from "../hooks/useChat";
import { chatStore, net } from "@/test/container";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

const auth = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => auth }));

const messageDto = (id: string, extra = {}) => ({ id, thread_id: "rental:rental-a", sender_id: "tenant-a", receiver_id: "owner-a", content: `Mensagem ${id}`, sent_at: "2026-10-01T10:00:00Z", flagged_for_moderation: false, hidden: false, ...extra });
const threadDto = { thread_id: "rental:rental-a", scope: "rental", scope_id: "rental-a", scope_label: "Locação #A", peer: { id: "owner-a", name: "João", role: "locador" }, can_write: true, unread_count: 2, last_message: messageDto("m1", { read_at: "2026-10-01T11:00:00Z", client_id: "c1" }) };

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); auth.isAuthenticated = true; auth.isLoading = false; });

it("resolves the conversation of a rental with an optional peer and encodes opaque thread ids", async () => {
  net.http.send.mockResolvedValue(ok(threadDto));
  const resolve = renderHookWithQuery(() => useResolveThread());
  const thread = await act(() => resolve.result.current.mutateAsync({ scope: "rental", scopeId: "rental-a", peerId: "owner-a" }));
  expect(thread).toMatchObject({ threadId: "rental:rental-a", peer: { name: "João" }, lastMessage: { readAt: "2026-10-01T11:00:00Z", clientId: "c1" } });
  await chatStore.resolveThread("posting", "posting-a");
  await chatStore.getThread("rental:rental-a");
  expect(net.http.send.mock.calls.map(([request]) => request)).toEqual([
    { method: "POST", path: "chat/threads/resolve", body: { scope: "rental", scope_id: "rental-a", peer_id: "owner-a" } },
    { method: "POST", path: "chat/threads/resolve", body: { scope: "posting", scope_id: "posting-a" } },
    { method: "GET", path: "chat/threads/rental%3Arental-a" },
  ]);
});

it("lists threads per scope and pages messages by cursor", async () => {
  net.http.send.mockResolvedValueOnce(ok({ count: 1, limit: 20, offset: 0, results: [{ ...threadDto, peer: null, last_message: null }] }))
    .mockResolvedValueOnce(ok({ results: [messageDto("m2")], has_more: true, order: "desc" }));
  const threads = renderHookWithQuery(() => useThreads("rental"), net.queryClient);
  await waitFor(() => expect(threads.result.current.data?.results[0]).toMatchObject({ peer: null, lastMessage: null, canWrite: true, unreadCount: 2 }));
  const messages = await chatStore.listMessages("rental:rental-a", { before: "m3" } as never);
  expect(messages).toMatchObject({ hasMore: true, order: "desc", results: [{ id: "m2", readAt: null, clientId: null }] });
  expect(net.http.send.mock.calls.map(([request]) => request.query)).toEqual([{ scope: "rental" }, { before: "m3" }]);
  expect(renderHookWithQuery(() => useThreads(undefined, false)).result.current.fetchStatus).toBe("idle");
});

it("skips thread and message queries until a conversation is selected", async () => {
  expect(renderHookWithQuery(() => useThread(null)).result.current.fetchStatus).toBe("idle");
  expect(renderHookWithQuery(() => useMessages(null)).result.current.fetchStatus).toBe("idle");
  net.http.send.mockResolvedValueOnce(ok(threadDto)).mockResolvedValueOnce(ok({ results: [], has_more: false, order: "asc" }));
  const thread = renderHookWithQuery(() => useThread("rental:rental-a"));
  const messages = renderHookWithQuery(() => useMessages("rental:rental-a"));
  await waitFor(() => expect(thread.result.current.data?.scopeLabel).toBe("Locação #A"));
  await waitFor(() => expect(messages.result.current.data?.results).toEqual([]));
});

it("appends a sent message once and refreshes the inbox", async () => {
  net.queryClient.setQueryData(["chat", "messages", "rental:rental-a"], { results: [], hasMore: false, order: "asc" });
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(messageDto("m9")));
  const send = renderHookWithQuery(() => useSendMessage());
  await act(() => send.result.current.mutateAsync({ threadId: "rental:rental-a", content: "Olá", clientId: "c9" }));
  await act(() => send.result.current.mutateAsync({ threadId: "rental:rental-a", content: "Olá", clientId: "c9" }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "chat/threads/rental%3Arental-a/messages", body: { content: "Olá", client_id: "c9" } });
  expect(net.queryClient.getQueryData<{ results: unknown[] }>(["chat", "messages", "rental:rental-a"])?.results).toHaveLength(1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", "threads"] });
  chatStore.appendMessage("other-thread", { id: "x" } as never);
  expect(net.queryClient.getQueryData(["chat", "messages", "other-thread"])).toBeUndefined();
});

it("marks a conversation read up to a message and updates the unread badge", async () => {
  net.http.send.mockResolvedValue(ok({ updated: 2, read_at: "2026-10-01T12:00:00Z", unread_total: 3 }));
  const mark = renderHookWithQuery(() => useMarkRead());
  await act(() => mark.result.current.mutateAsync({ threadId: "rental:rental-a", upTo: "m2" }));
  await chatStore.markRead("rental:rental-a");
  expect(net.http.send.mock.calls.map(([request]) => request.body)).toEqual([{ up_to: "m2" }, {}]);
  expect(net.queryClient.getQueryData(["chat", "unread"])).toEqual({ unreadTotal: 3, unreadThreads: 0 });
});

it("shows zero unread instead of failing and waits for the session before asking", async () => {
  auth.isAuthenticated = false;
  expect(renderHookWithQuery(() => useUnreadCount()).result.current.fetchStatus).toBe("idle");
  auth.isAuthenticated = true;
  net.http.send.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(ok({ unread_total: 4, unread_threads: 2 }));
  const failed = renderHookWithQuery(() => useUnreadCount());
  await waitFor(() => expect(failed.result.current.data).toEqual({ unreadTotal: 0, unreadThreads: 0 }));
  const loaded = renderHookWithQuery(() => useUnreadCount());
  await waitFor(() => expect(loaded.result.current.data).toEqual({ unreadTotal: 4, unreadThreads: 2 }));
});

it("reports abusive messages to moderation", async () => {
  net.http.send.mockResolvedValue(ok(null));
  const report = renderHookWithQuery(() => useReportMessage());
  await act(() => report.result.current.mutateAsync({ messageId: "m1", reason: "Ofensa" }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "chat/messages/m1/report", body: { reason: "Ofensa" } });
});

it("exposes stable imperative chat actions bound to the store", async () => {
  const { result, rerender } = renderHook(() => useChatActions());
  const first = result.current; rerender();
  expect(result.current).toBe(first);
  net.http.send.mockResolvedValue(ok({ count: 0, limit: 20, offset: 0, results: [] }));
  await first.listThreads({ limit: 5 });
  net.http.send.mockResolvedValue(ok({ results: [], has_more: false, order: "asc" }));
  await first.listMessages("t");
  net.http.send.mockResolvedValue(ok(threadDto));
  await first.getThread("t"); await first.resolveThread("rental", "rental-a");
  net.http.send.mockResolvedValue(ok({ updated: 0, read_at: "x", unread_total: 0 }));
  await first.markRead("t");
  net.http.send.mockResolvedValue(ok(messageDto("m1")));
  await first.sendMessage("t", "Oi", "c1");
  net.http.send.mockResolvedValue(ok(null));
  await first.reportMessage("m1", "spam");
  first.setUnread({ unreadTotal: 1, unreadThreads: 1 });
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  await first.refreshUnread();
  await chatStore.invalidateMessages("t");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", "unread"] });
  expect(net.http.send).toHaveBeenCalledTimes(7);
  chatStore.clear();
  expect(net.queryClient.getQueryData(["chat", "unread"])).toBeUndefined();
});
