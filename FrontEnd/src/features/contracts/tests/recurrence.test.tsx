import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalRecurrenceDialog } from "../components/RentalRecurrenceDialog";
import { rentalToDomain } from "../api/contractMapper";
import { HttpContractRepository } from "../api/ContractRepository";
import { ContractStore } from "../api/ContractStore";
import { BadRequestError, ConflictError, NetworkError } from "@/shared/http/errors";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import type { HttpClient } from "@/shared/http/HttpClient";
import type { RecurrencePreview } from "../types/recurrence";

const mocks = vi.hoisted(() => ({ previewRecurrence: vi.fn(), createRecurrence: vi.fn(), createCheckout: vi.fn() }));
vi.mock("@/app/container", () => ({
  contractStore: { previewRecurrence: mocks.previewRecurrence, createRecurrence: mocks.createRecurrence },
  paymentStore: { createCheckout: mocks.createCheckout },
}));

const sourceDto = {
  id: "source-rental", postings: "posting-a", lessee: "tenant-a", operator: "operator-a",
  start_date: "2026-01-05T08:00:00Z", end_date: "2026-01-05T18:00:00Z", total_price: "840.00",
  status: "completed", machine_brand: "John Deere", machine_model: "5075E", contract_number: "FR-001",
};
const source = rentalToDomain(sourceDto);
const input = { first_start_date: "2099-10-05", frequency: "weekly" as const, occurrences: 2 };
const preview: RecurrencePreview = {
  source_rental: source.id, frequency: "weekly", occurrences: 2, total_price: "1680.00",
  dates: [
    { start_date: "2099-10-05T08:00:00Z", end_date: "2099-10-05T18:00:00Z", total_price: "840.00" },
    { start_date: "2099-10-12T08:00:00Z", end_date: "2099-10-12T18:00:00Z", total_price: "840.00" },
  ],
};
const createdDto = {
  id: "series-a", source_rental: source.id, frequency: "weekly", occurrences: 2, total_price: "1680.00",
  reservation_expires_at: "2099-10-01T09:30:00Z",
  rentals: preview.dates.map((date, i) => ({ ...sourceDto, ...date, id: `future-${i}`, status: "pending", recurrence: "series-a", recurrence_index: i + 1 })),
};
const created = { ...createdDto, rentals: createdDto.rentals.map(rentalToDomain) };

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <RentalRecurrenceDialog source={source} open onOpenChange={onOpenChange} />
  </QueryClientProvider>);
  return { onOpenChange };
}
function fillDate(value = input.first_start_date) {
  fireEvent.change(screen.getByLabelText("Primeira data futura"), { target: { value } });
}
async function requestPreview() {
  fillDate();
  fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
  await screen.findByRole("region", { name: "Prévia da recorrência" });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.previewRecurrence.mockResolvedValue(preview);
  mocks.createRecurrence.mockResolvedValue(created);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("recurring rental transport", () => {
  it("loads public occupancy without requiring other tenants' private rental data", async () => {
    const send = vi.fn().mockResolvedValue({ status: 200, data: { ocupados: [{
      id: "other-tenant-rental", start_date: preview.dates[0].start_date,
      end_date: preview.dates[0].end_date, status: "active",
    }] } });
    const store = new ContractStore(new HttpContractRepository({ send } as HttpClient), new QueryClient());
    const result = await store.listOccupancyByPosting("posting-a");
    expect(send).toHaveBeenCalledWith({ method: "GET", path: "postings/posting-a/ocupacao" });
    expect(result).toEqual([{ id: "other-tenant-rental", status: "active", startDate: new Date(preview.dates[0].start_date), endDate: new Date(preview.dates[0].end_date) }]);
  });
  it("sends only scheduling inputs and maps created reservations with recurrence metadata", async () => {
    const send = vi.fn().mockResolvedValueOnce({ status: 200, data: preview }).mockResolvedValueOnce({ status: 201, data: createdDto });
    const queryClient = new QueryClient();
    const invalidation = vi.spyOn(queryClient, "invalidateQueries");
    const store = new ContractStore(new HttpContractRepository({ send } as HttpClient), queryClient);
    expect(await store.previewRecurrence(source.id, input)).toEqual(preview);
    expect(send).toHaveBeenNthCalledWith(1, { method: "POST", path: "rentals/source-rental/recurrence/preview", body: input });
    const result = await store.createRecurrence(source.id, { ...input, idempotency_key: "stable-key" });
    expect(send).toHaveBeenNthCalledWith(2, { method: "POST", path: "rentals/source-rental/recurrence", body: { ...input, idempotency_key: "stable-key" } });
    expect(result.rentals[0]).toMatchObject({ recurrenceId: "series-a", recurrenceIndex: 1, startDate: new Date(preview.dates[0].start_date) });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["contracts", "rentals"] });
  });
});

describe("programar recorrência", () => {
  it("reuses a completed rental, previews before creation, and never automatically opens checkout", async () => {
    renderDialog();
    expect(screen.getByText("John Deere 5075E")).toBeTruthy();
    expect(screen.getByText("Mesmo operador da locação original")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Criar 2 reservas" })).toBeNull();
    expect(mocks.previewRecurrence).not.toHaveBeenCalled();
    await requestPreview();
    expect(mocks.previewRecurrence).toHaveBeenCalledWith(source.id, input);
    expect(mocks.createRecurrence).not.toHaveBeenCalled();
    expect(screen.getByText(/Nenhuma cobrança é automática/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByText("2 novas reservas criadas.");
    expect(mocks.createRecurrence).toHaveBeenCalledWith(source.id, { ...input, idempotency_key: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    expect(screen.getAllByRole("button", { name: "Pagar reserva" })).toHaveLength(2);
    expect(screen.getByText(/Cada reserva deve ser paga separadamente/)).toBeTruthy();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Programar outras datas" }));
    expect((screen.getByLabelText("Primeira data futura") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Criar 2 reservas" })).toBeNull();
    expect(mocks.createRecurrence).toHaveBeenCalledTimes(1);
  });

  it("invalidates the preview on changed parameters and rejects late responses even after A → B → A", async () => {
    const old = deferred<RecurrencePreview>();
    mocks.previewRecurrence.mockReturnValueOnce(old.promise);
    renderDialog();
    fillDate();
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    fillDate("2099-10-06");
    fillDate();
    await act(async () => old.resolve(preview));
    expect(screen.queryByRole("region", { name: "Prévia da recorrência" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    await screen.findByRole("region", { name: "Prévia da recorrência" });
    fireEvent.change(screen.getByLabelText("Frequência"), { target: { value: "monthly" } });
    expect(screen.queryByRole("button", { name: "Criar 2 reservas" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Quantidade de novas reservas"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    await waitFor(() => expect(mocks.previewRecurrence).toHaveBeenLastCalledWith(source.id, { ...input, frequency: "monthly", occurrences: 3 }));
  });

  it("prevents duplicate create requests and keeps the same idempotency key on network retry", async () => {
    const pending = deferred<typeof created>();
    mocks.createRecurrence.mockRejectedValueOnce(new NetworkError()).mockReturnValueOnce(pending.promise);
    const { onOpenChange } = renderDialog();
    await requestPreview();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByRole("alert");
    const first = mocks.createRecurrence.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    const busy = screen.getByRole("button", { name: "Criando reservas..." }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.createRecurrence).toHaveBeenCalledTimes(2);
    expect(mocks.createRecurrence.mock.calls[1][1]).toEqual(first);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Primeira data futura") as HTMLInputElement).disabled).toBe(true);
    await act(async () => pending.resolve(created));
    await screen.findByText("2 novas reservas criadas.");
  });

  it("creates a valid stable UUID on HTTP deployments without randomUUID", async () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    mocks.createRecurrence.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(created);
    renderDialog();
    await requestPreview();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByRole("alert");
    const key = mocks.createRecurrence.mock.calls[0][1].idempotency_key;
    expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByText("2 novas reservas criadas.");
    expect(mocks.createRecurrence.mock.calls[1][1].idempotency_key).toBe(key);
  });

  it("unlocks the form when UUID creation fails before sending a request", async () => {
    vi.stubGlobal("crypto", { getRandomValues: () => { throw new Error("Random generator unavailable"); } });
    const { onOpenChange } = renderDialog();
    await requestPreview();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByRole("alert");
    expect(mocks.createRecurrence).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Primeira data futura") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Criar 2 reservas" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("changes the idempotency key only after scheduling parameters change", async () => {
    mocks.createRecurrence.mockRejectedValue(new NetworkError());
    renderDialog();
    await requestPreview();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByRole("alert");
    const originalKey = mocks.createRecurrence.mock.calls[0][1].idempotency_key;
    fillDate("2099-10-06");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    await screen.findByRole("button", { name: "Criar 2 reservas" });
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByRole("alert");
    expect(mocks.createRecurrence.mock.calls[1][1].idempotency_key).not.toBe(originalKey);
  });

  it("shows field, non-field and availability conflicts and clears them when edited", async () => {
    mocks.previewRecurrence.mockRejectedValueOnce(new BadRequestError("Dados inválidos", {
      first_start_date: ["Escolha uma data futura."], non_field_errors: ["As reservas não podem se sobrepor."],
    })).mockRejectedValueOnce(new ConflictError("Maquinário indisponível em 12/10/2099."));
    renderDialog();
    fillDate();
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Primeira data futura: Escolha uma data futura.");
    expect(screen.getByRole("alert").textContent).toContain("As reservas não podem se sobrepor.");
    fillDate("2099-10-06");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar datas e valores" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Maquinário indisponível");
    expect(mocks.createRecurrence).not.toHaveBeenCalled();
  });

  it("requires a future date and 2–12 occurrences", () => {
    renderDialog();
    const submit = screen.getByRole("button", { name: "Consultar datas e valores" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fillDate("2001-01-01");
    expect(submit.disabled).toBe(true);
    fillDate();
    for (const value of ["1", "13", "2.5", ""]) {
      fireEvent.change(screen.getByLabelText("Quantidade de novas reservas"), { target: { value } });
      expect(submit.disabled).toBe(true);
    }
    fireEvent.change(screen.getByLabelText("Quantidade de novas reservas"), { target: { value: "12" } });
    expect(submit.disabled).toBe(false);
  });

  it("opens payment only for the clicked generated reservation and displays checkout errors", async () => {
    mocks.createCheckout.mockRejectedValueOnce(new ConflictError("Reserva expirada. Programe novas datas."));
    renderDialog();
    await requestPreview();
    fireEvent.click(screen.getByRole("button", { name: "Criar 2 reservas" }));
    await screen.findByText("2 novas reservas criadas.");
    fireEvent.click(screen.getAllByRole("button", { name: "Pagar reserva" })[1]);
    await screen.findByRole("alert");
    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.createCheckout).toHaveBeenCalledWith("future-1");
    expect(screen.getByRole("alert").textContent).toContain("Reserva expirada");
  });

  it.each(["completed", "closed"])("makes recurrence and details available on historical %s rental cards", (status) => {
    const onScheduleRecurrence = vi.fn();
    render(<RentalCard rental={{ id: source.id, status, contract: "FR-001", machine: "Trator", period: "05/01/2026", total: "R$ 840,00" }}
      counterparty={{ label: "Locador", name: "José", icon: "person", className: "" }}
      detailsOpen={false} onToggleDetails={vi.fn()} onScheduleRecurrence={onScheduleRecurrence}
      review={{ buttonLabel: "Avaliar", title: "Avaliar", prompt: "Avalie", open: false, onToggle: vi.fn(), rating: 5, onRatingChange: vi.fn(), comment: "", onCommentChange: vi.fn(), submitting: false, onSubmit: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: /Programar recorrência/ }));
    expect(onScheduleRecurrence).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Ver Detalhes/ })).toBeTruthy();
  });
});
