import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/authContextValue";
import type { HttpClient } from "@/shared/http/HttpClient";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { rentalHasContract } from "@/features/contracts/types/rental";
import { rentalToDomain } from "@/features/contracts/api/contractMapper";
import NotificationPopover from "@/components/NotificationPopover";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { HttpNotificationRepository } from "../api/NotificationRepository";
import { NotificationStore } from "../api/NotificationStore";
import { notificationDestination, type NotificationFilter, type PlatformNotification } from "../types/notification";

const mocks = vi.hoisted(() => ({ store: null as NotificationStore | null }));
vi.mock("@/app/container", () => ({ get notificationStore() { return mocks.store; } }));

const notification: PlatformNotification = {
  id: "notice-1", kind: "rental", title: "Reserva recebida", message: "Seu trator foi reservado para outubro.",
  created_at: "2026-09-20T14:00:00Z", read_at: null, is_read: false,
  rental: "rental-1", posting: "posting-1", contract: "contract-1",
};
let notices: PlatformNotification[];
let queryClient: QueryClient;
const repository = { list: vi.fn(), setRead: vi.fn(), dismiss: vi.fn(), readAll: vi.fn() };
const baseAuth: AuthContextValue = {
  tokens: { access: "session" }, userId: "tenant-a", userRole: "locatario", isAuthenticated: true, isLoading: false,
  login: vi.fn(), setUserRole: vi.fn(), logout: vi.fn(),
};

function Providers({ children, auth = baseAuth }: { children: React.ReactNode; auth?: AuthContextValue }) {
  return <QueryClientProvider client={queryClient}><AuthContext.Provider value={auth}><MemoryRouter>{children}</MemoryRouter></AuthContext.Provider></QueryClientProvider>;
}
function inbox(auth = baseAuth) {
  return <Providers auth={auth}><NotificationPopover /><NotificationsPanel /></Providers>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}

beforeEach(() => {
  vi.resetAllMocks();
  focusManager.setFocused(true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.store = new NotificationStore(repository, queryClient);
  notices = [ { ...notification }, { ...notification, id: "notice-2", kind: "contract", title: "Contrato disponível" } ];
  repository.list.mockImplementation(async (filter: NotificationFilter) => {
    const filtered = notices.filter((item) => (!filter.kind || item.kind === filter.kind) && (filter.unread === undefined || item.is_read !== filter.unread));
    return { results: filtered.slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 20)).map((item) => ({ ...item })), count: filtered.length, unread_count: notices.filter((item) => !item.is_read).length };
  });
  repository.setRead.mockImplementation(async (id: string, isRead: boolean) => {
    notices = notices.map((item) => item.id === id ? { ...item, is_read: isRead } : item);
    return notices.find((item) => item.id === id)!;
  });
  repository.dismiss.mockImplementation(async (id: string) => { notices = notices.filter((item) => item.id !== id); });
  repository.readAll.mockImplementation(async () => { notices = notices.map((item) => ({ ...item, is_read: true })); });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.useRealTimers(); focusManager.setFocused(undefined); });

describe("notification transport", () => {
  it("validates list results, forwards cancellation and sends private item actions", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ data: { results: [notification], count: 1, unread_count: 1 } })
      .mockResolvedValueOnce({ data: { ...notification, is_read: true } })
      .mockResolvedValueOnce({ data: undefined })
      .mockResolvedValueOnce({ data: { updated: 1, unread_count: 0 } });
    const transport = new HttpNotificationRepository({ send } as HttpClient);
    const signal = new AbortController().signal;
    const filter = { limit: 20, offset: 20, kind: "rental" as const, unread: true };
    expect((await transport.list(filter, signal)).unread_count).toBe(1);
    await transport.setRead("id/unsafe", true);
    await transport.dismiss("id/unsafe");
    await transport.readAll();
    expect(send).toHaveBeenNthCalledWith(1, { method: "GET", path: "notifications/", query: filter, signal });
    expect(send).toHaveBeenNthCalledWith(2, { method: "PATCH", path: "notifications/id%2Funsafe", body: { is_read: true } });
    expect(send).toHaveBeenNthCalledWith(3, { method: "DELETE", path: "notifications/id%2Funsafe" });
    expect(send).toHaveBeenNthCalledWith(4, { method: "POST", path: "notifications/read-all", body: {} });
    send.mockResolvedValueOnce({ data: { results: [], unread_count: -1, count: 0 } });
    await expect(transport.list({})).rejects.toThrow();
  });

  it("constructs participant destinations from local IDs and handles removed references", () => {
    expect(notificationDestination(notification, "locatario")).toBe("/dashboard-locatario?tab=locacoes#locacao-rental-1");
    expect(notificationDestination(notification, "locador")).toBe("/dashboard?tab=reservas#locacao-rental-1");
    expect(notificationDestination({ ...notification, kind: "contract" }, "locatario")).toBe("/contrato/contract-1");
    expect(notificationDestination({ ...notification, rental: null, contract: null }, "locador")).toBeNull();
  });
});

describe("persistent notification inbox", () => {
  it("updates the shared bell after read, unread, mark-all and dismiss actions", async () => {
    render(inbox());
    await screen.findByRole("button", { name: "Notificações, 2 não lidas" });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida: Reserva recebida" }));
    await screen.findByRole("button", { name: "Notificações, 1 não lidas" });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como não lida: Reserva recebida" }));
    await screen.findByRole("button", { name: "Notificações, 2 não lidas" });
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas como lidas" }));
    await screen.findByRole("button", { name: "Notificações" } );
    expect(repository.readAll).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button", { name: /^Marcar como não lida:/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar notificação: Reserva recebida" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Reserva recebida" })).toBeNull());
    expect(repository.dismiss).toHaveBeenCalledWith("notice-1");
    expect(screen.getByRole("heading", { name: "Contrato disponível" })).toBeTruthy();
  });

  it("renders a loading state, offers fetch retry, and distinguishes an empty inbox", async () => {
    const pending = deferred<{ results: PlatformNotification[]; count: number; unread_count: number }>();
    repository.list.mockReturnValueOnce(pending.promise);
    render(inbox());
    expect(screen.getByText("Carregando notificações...")).toBeTruthy();
    await act(async () => pending.resolve({ results: [], count: 0, unread_count: 0 }));
    await screen.findByText("Nenhuma notificação por enquanto");
    repository.list.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { await mocks.store!.invalidate("tenant-a"); });
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível atualizar");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Reserva recebida" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("preserves unread state on failed writes and lets the user retry", async () => {
    repository.setRead.mockRejectedValueOnce(new Error("Offline"));
    render(inbox());
    fireEvent.click(await screen.findByRole("button", { name: "Marcar como lida: Reserva recebida" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Notificações, 2 não lidas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar como lida: Reserva recebida" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida: Reserva recebida" }));
    await screen.findByRole("button", { name: "Notificações, 1 não lidas" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("filters and pages the server inbox while retaining the global unread count", async () => {
    notices = Array.from({ length: 23 }, (_, i) => ({ ...notification, id: `item-${i}`, title: `Reserva ${i + 1}`, kind: i === 22 ? "payment" : "rental", is_read: i === 0 }));
    render(inbox());
    await screen.findByRole("heading", { name: "Reserva 20" });
    expect(screen.queryByRole("heading", { name: "Reserva 21" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próximas" }));
    await screen.findByRole("heading", { name: "Reserva 21" });
    expect(screen.queryByRole("heading", { name: "Reserva 1" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Tipo de notificação"), { target: { value: "payment" } });
    await screen.findByRole("heading", { name: "Reserva 23" });
    expect(repository.list).toHaveBeenCalledWith({ limit: 20, offset: 0, kind: "payment" }, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Notificações, 22 não lidas" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Tipo de notificação"), { target: { value: "contract" } });
    await screen.findByText("Nenhuma notificação neste filtro");
    fireEvent.click(screen.getByLabelText("Somente não lidas"));
    await waitFor(() => expect(repository.list).toHaveBeenCalledWith({ limit: 20, offset: 0, kind: "contract", unread: true }, expect.any(AbortSignal)));
  });

  it("opens an accessible popover with working inbox and contract links", async () => {
    render(<Providers><NotificationPopover /></Providers>);
    fireEvent.click(await screen.findByRole("button", { name: "Notificações, 2 não lidas" }));
    await screen.findByRole("dialog", { name: "Central de notificações" });
    expect(screen.getByRole("link", { name: "Ver todas as notificações" }).getAttribute("href")).toBe("/dashboard-locatario?tab=notificacoes");
    expect(screen.getByRole("link", { name: "Ver contrato" }).getAttribute("href")).toBe("/contrato/contract-1");
    fireEvent.click(screen.getByRole("link", { name: "Ver contrato" }));
    await waitFor(() => expect(repository.setRead).toHaveBeenCalledWith("notice-2", true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not fetch before auth is ready and hides cached items on account switch or logout", async () => {
    const loadingAuth = { ...baseAuth, isLoading: true };
    const view = render(inbox(loadingAuth));
    expect(repository.list).not.toHaveBeenCalled();
    view.rerender(inbox());
    await screen.findByRole("heading", { name: "Reserva recebida" });
    const late = deferred<{ results: PlatformNotification[]; count: number; unread_count: number }>();
    repository.list.mockReturnValueOnce(late.promise);
    view.rerender(inbox({ ...baseAuth, userId: "tenant-b" }));
    expect(screen.queryByRole("heading", { name: "Reserva recebida" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notificações, 2 não lidas" })).toBeNull();
    view.rerender(inbox({ ...baseAuth, userId: null, isAuthenticated: false, tokens: null }));
    await act(async () => late.resolve({ results: [notification], count: 1, unread_count: 1 }));
    expect(screen.queryByRole("heading", { name: "Reserva recebida" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Notificações/ })).toBeNull();
  });

  it("refreshes at 30 seconds and on focus, with background polling paused", async () => {
    vi.useFakeTimers();
    render(inbox());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const initial = repository.list.mock.calls.length;
    expect(initial).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(repository.list.mock.calls.length).toBe(initial + 1);
    focusManager.setFocused(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(repository.list.mock.calls.length).toBe(initial + 1);
    await act(async () => { focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(1); });
    expect(repository.list.mock.calls.length).toBe(initial + 2);
  });
});


describe("notification destinations", () => {
  it("focuses a different rental when a new notification changes only the URL fragment", () => {
    const card = (id: string) => <RentalCard key={id}
      rental={{ id, status: "completed", machine: "Trator", contract: null, period: "Setembro", total: "R$ 1.000" }}
      counterparty={{ label: "Locador", name: "José", icon: "person", className: "" }}
      detailsOpen={false} onToggleDetails={vi.fn()}
      review={{ buttonLabel: "Avaliar", title: "Avaliar", prompt: "Avalie", open: false, onToggle: vi.fn(), rating: 5, onRatingChange: vi.fn(), comment: "", onCommentChange: vi.fn(), submitting: false, onSubmit: vi.fn() }} />;
    render(<Providers>
      <Link to="/dashboard-locatario?tab=locacoes#locacao-first">Primeira locação</Link>
      <Link to="/dashboard-locatario?tab=locacoes#locacao-second">Segunda locação</Link>
      {card("first")}{card("second")}
    </Providers>);
    fireEvent.click(screen.getByRole("link", { name: "Primeira locação" }));
    expect(document.activeElement?.id).toBe("locacao-first");
    fireEvent.click(screen.getByRole("link", { name: "Segunda locação" }));
    expect(document.activeElement?.id).toBe("locacao-second");
  });

  it("does not infer a contract from a historical rental's generated display number", () => {
    const source = { id: "historical-rental", postings: "posting-1", lessee: "tenant-a", start_date: "2026-01-01T08:00:00Z", end_date: "2026-01-01T18:00:00Z", contract_number: "#CTR-HIST", contract_id: null, contract_status: null };
    const rentals = [
      rentalToDomain(source),
      rentalToDomain({ ...source, id: "new-rental", contract_id: "real-contract", contract_status: null }),
      rentalToDomain({ ...source, id: "legacy-rental", contract_status: "pending" }),
    ];
    expect(rentals.filter(rentalHasContract).map((item) => item.id)).toEqual(["new-rental", "legacy-rental"]);
    expect(rentals[0].contractNumber).toBe("#CTR-HIST");
  });
});
