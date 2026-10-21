import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminFilterBar } from "../components/AdminFilterBar";
import { AdminPage } from "../components/AdminPage";
import { AdminTable, AdminTableMessage } from "../components/AdminTable";
import { useModeratePosting, useModerateUser } from "../hooks/useModeration";
import { POSTING_STATUS_AFTER, USER_STATUS_AFTER } from "../types/moderation";
import { moderationStore, net } from "@/test/container";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

const person = (id: string) => ({ id, name: `Pessoa ${id}`, role: "locatario" });
beforeEach(() => { net.http.send.mockReset(); });

it.each([["warn", "warned"], ["suspend", "suspended"], ["ban", "banned"]] as const)(
  "applies the %s action to a user and refreshes the user list", async (action, status) => {
    const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
    net.http.send.mockResolvedValue(ok({ message: "Usuário atualizado." }));
    const moderate = renderHookWithQuery(() => useModerateUser());
    await act(async () => { expect(await moderate.result.current.mutateAsync({ userId: "user-a", action })).toBe("Usuário atualizado."); });
    expect(net.http.send).toHaveBeenCalledWith({ method: "PUT", path: `admin/users/user-a/${action}` });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users", "list"] });
    expect(USER_STATUS_AFTER[action]).toBe(status);
  },
);

it("approves or rejects postings with a reason and default confirmations", async () => {
  net.http.send.mockResolvedValue(ok(undefined));
  const moderate = renderHookWithQuery(() => useModeratePosting());
  await act(async () => { expect(await moderate.result.current.mutateAsync({ postingId: "posting-a", action: "approve" })).toBe("Anúncio aprovado."); });
  await act(async () => { expect(await moderate.result.current.mutateAsync({ postingId: "posting-a", action: "reject", reason: "Fotos inadequadas" })).toBe("Anúncio reprovado."); });
  await act(async () => { await moderate.result.current.mutateAsync({ postingId: "posting-b", action: "reject" }); });
  expect(net.http.send.mock.calls.map(([request]) => request)).toEqual([
    { method: "PUT", path: "admin/postings/posting-a/approve" },
    { method: "PUT", path: "admin/postings/posting-a/reject", body: { reason: "Fotos inadequadas" } },
    { method: "PUT", path: "admin/postings/posting-b/reject", body: { reason: "" } },
  ]);
  expect(POSTING_STATUS_AFTER).toEqual({ approve: "active", reject: "rejected" });
  net.http.send.mockResolvedValue(ok({}));
  expect(await moderationStore.moderateUser("user-a", "warn")).toBe("Ação aplicada.");
});

it("lists flagged chat messages with their reports and resolves them with an optional note", async () => {
  net.http.send.mockResolvedValueOnce(ok({ count: 1, limit: 20, offset: 0, results: [{
    message_id: "m1", thread_id: "t1", content: null, sent_at: "2026-10-01T10:00:00Z", hidden: true, sender: person("a"), receiver: null, source: "auto",
    reports: [{ id: "r1", reason: "Ofensa", reported_by: null, created_at: "2026-10-01T11:00:00Z" }],
  }] })).mockResolvedValue(ok(null));
  const [message] = await moderationStore.listFlaggedMessages();
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "admin/chat/messages", query: { status: "pending" } });
  expect(message).toMatchObject({ messageId: "m1", threadId: "t1", hidden: true, source: "auto", receiver: null, reports: [{ id: "r1", reportedBy: null, resolution: null }] });
  await moderationStore.resolveFlaggedMessage("m1", "hide", "Linguagem ofensiva");
  await moderationStore.resolveFlaggedMessage("m1", "dismiss");
  expect(net.http.send).toHaveBeenCalledWith({ method: "PUT", path: "admin/chat/messages/m1/resolve", body: { decision: "hide", note: "Linguagem ofensiva" } });
  expect(net.http.send).toHaveBeenLastCalledWith({ method: "PUT", path: "admin/chat/messages/m1/resolve", body: { decision: "dismiss" } });
  expect(() => moderationStore.clear()).not.toThrow();
});

it("renders the admin layout with search, refresh and table states", async () => {
  const onSearch = vi.fn(); const onRefresh = vi.fn(); const user = userEvent.setup();
  render(<AdminPage title="Usuários" onRefresh={onRefresh}>
    <AdminFilterBar search="" onSearchChange={onSearch} placeholder="Buscar usuário"><select aria-label="Status" /></AdminFilterBar>
    <AdminTable columns={[{ label: "Nome" }, { label: "Ações", align: "right" }]}>
      <AdminTableMessage colSpan={2} icon="inbox">Nenhum usuário</AdminTableMessage>
      <AdminTableMessage colSpan={2}>Carregando</AdminTableMessage>
    </AdminTable>
  </AdminPage>);
  await user.type(screen.getByPlaceholderText("Buscar usuário"), "a");
  await user.click(screen.getByRole("button", { name: /Atualizar/ }));
  expect(screen.getByRole("heading", { name: "Usuários" })).toBeInTheDocument();
  expect(onSearch).toHaveBeenCalledWith("a");
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("columnheader", { name: "Ações" })).toHaveClass("text-right");
  expect(within(screen.getAllByRole("row")[1]).getByRole("cell")).toHaveTextContent("Nenhum usuário");
});
