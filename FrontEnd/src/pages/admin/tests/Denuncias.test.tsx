import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Denuncias from "../Denuncias";
import { ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { serve } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));

const flagged = (overrides = {}) => ({ message_id: "m1", thread_id: "t1", content: "Pague por fora", sent_at: "2026-10-01T10:00:00Z", hidden: false,
  sender: { id: "a", name: "Maria", role: "locatario" }, receiver: { id: "b", name: "João", role: "locador" }, source: "report",
  reports: [{ id: "r1", reason: "Tentativa de fraude", reported_by: null, created_at: "2026-10-01T11:00:00Z" }], ...overrides });
const page = (results: unknown[]) => ({ count: results.length, limit: 20, offset: 0, results });

beforeEach(() => { net.http.send.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

it("shows pending flagged messages with parties, origin and reasons", async () => {
  serve(net.http, { "GET admin/chat/messages": () => page([flagged(), flagged({ message_id: "m2", sender: null, receiver: null, source: "auto", reports: [] })]) });
  renderWithProviders(<Denuncias />);
  expect(screen.getByText("Carregando...")).toBeInTheDocument();
  const first = (await screen.findAllByText("Pague por fora"))[0].closest("tr")!;
  expect(within(first).getByText("Maria → João")).toBeInTheDocument();
  expect(within(first).getByText("Denúncia")).toBeInTheDocument();
  expect(within(first).getByText("Tentativa de fraude")).toBeInTheDocument();
  expect(screen.getByText("? → ?")).toBeInTheDocument();
  expect(screen.getByText("Automática")).toBeInTheDocument();
});

it.each([["Arquivar", "dismiss"], ["Ocultar", "hide"]])("records the “%s” decision and reloads the queue", async (button, decision) => {
  let pending = [flagged()];
  serve(net.http, {
    "GET admin/chat/messages": () => page(pending),
    "PUT admin/chat/messages/m1/resolve": () => { pending = []; return null; },
  });
  const { user } = renderWithProviders(<Denuncias />);
  await user.click(await screen.findByRole("button", { name: button }));
  expect(await screen.findByText("Nenhuma mensagem pendente de moderação.")).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith("Decisão registrada.");
  expect(net.http.send).toHaveBeenCalledWith({ method: "PUT", path: "admin/chat/messages/m1/resolve", body: { decision } });
});

it("reports queue and decision failures", async () => {
  serve(net.http, { "GET admin/chat/messages": () => { throw new ServerError(500, "Fila indisponível."); } });
  const first = renderWithProviders(<Denuncias />);
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Fila indisponível."));
  first.unmount();
  net.http.send.mockImplementation(async request => {
    if (request.method === "GET") return { status: 200, data: page([flagged()]) };
    throw "boom";
  });
  const { user } = renderWithProviders(<Denuncias />);
  await user.click(await screen.findByRole("button", { name: "Ocultar" }));
  expect(toast.error).toHaveBeenLastCalledWith("Falha ao registrar a decisão.");
  net.http.send.mockRejectedValue("boom");
  renderWithProviders(<Denuncias />);
  await vi.waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("Falha ao carregar a fila."));
});
