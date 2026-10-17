import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import Reservar from "@/pages/postings/Reservar";
import { paymentStatusApiSchema } from "../types/paymentSchemas";
import { ServerError } from "@/shared/http/errors";
import { rentalToDomain } from "@/features/contracts/api/contractMapper";
import { isPaid } from "../types/payment";

const mocks = vi.hoisted(() => ({ createRental: vi.fn(), createCheckout: vi.fn(), getStatus: vi.fn(), findRentalById: vi.fn(), findContractDocument: vi.fn(), listByPosting: vi.fn(), listOccupancyByPosting: vi.fn(), findPosting: vi.fn() }));
vi.mock("@/app/container", () => ({
  paymentStore: { getStatus: mocks.getStatus, createCheckout: mocks.createCheckout },
  contractStore: { createRental: mocks.createRental, listByPosting: mocks.listByPosting, listOccupancyByPosting: mocks.listOccupancyByPosting, findRentalById: mocks.findRentalById, findContractDocument: mocks.findContractDocument },
  postingStore: { findById: mocks.findPosting },
}));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "tenant-a" }) }));

beforeEach(() => {
  mocks.listOccupancyByPosting.mockResolvedValue([]);
  mocks.findPosting.mockResolvedValue({ id: "posting-a", hourlyRate: 100, machineBrand: "John Deere", machineModel: "5075E" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); window.history.replaceState({}, "", "/"); });

function renderBooking() {
  return render(<MemoryRouter initialEntries={[window.location.pathname + window.location.search]}><Routes><Route path="/reservar/:id" element={<Reservar />} /></Routes></MemoryRouter>);
}

describe("payment return recovery", () => {
  it("keeps pending payment context after timeout so a refresh retries the same rental", async () => {
    vi.useFakeTimers();
    mocks.getStatus.mockResolvedValue({ status: "pending", amount: "840.00", rentalStatus: "awaiting_payment" });
    window.history.replaceState({}, "", "/reservar/posting-a?pagamento=sucesso&locacao=rental-a&inicio=2099-10-05");
    const first = renderBooking();
    await act(async () => { await vi.advanceTimersByTimeAsync(20 * 700); });
    expect(mocks.getStatus).toHaveBeenCalledTimes(20);
    expect(window.location.search).toContain("locacao=rental-a");
    expect(window.location.search).toContain("pagamento=sucesso");
    first.unmount();
    mocks.getStatus.mockResolvedValue({ status: "requires_review", amount: "840.00", rentalStatus: "cancelled" });
    renderBooking();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.getStatus).toHaveBeenLastCalledWith("rental-a");
    expect(screen.getByRole("alert").textContent).toContain("Pagamento em análise");
    expect(window.location.search).toBe("?inicio=2099-10-05");
  });

  it("clears terminal expired payment parameters while keeping unrelated search parameters", async () => {
    mocks.getStatus.mockResolvedValue({ status: "expired", amount: "840.00", rentalStatus: "pending" });
    window.history.replaceState({}, "", "/reservar/posting-a?pagamento=sucesso&locacao=rental-a&inicio=2099-10-05");
    renderBooking();
    await act(async () => {});
    expect(window.location.search).toBe("?inicio=2099-10-05");
    expect(screen.queryByText("Confirmando seu pagamento")).toBeNull();
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
  });
});

describe("public occupancy calendar", () => {
  it("blocks another tenant's reserved date and cleaning buffer using only the public endpoint", async () => {
    const day = new Date();
    day.setDate(day.getDate() + 14);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    mocks.listOccupancyByPosting.mockResolvedValue([{ id: "other-tenant-rental", status: "active", startDate: new Date(`${date}T08:00:00Z`), endDate: new Date(`${date}T18:00:00Z`) }]);
    window.history.replaceState({}, "", "/reservar/posting-a");
    renderBooking();
    const blockedDays = await screen.findAllByTitle("Indisponível: reserva ou limpeza");
    expect(blockedDays).toHaveLength(3);
    expect(blockedDays.some((button) => button.textContent === String(day.getDate()))).toBe(true);
    expect(blockedDays.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(mocks.listOccupancyByPosting).toHaveBeenCalledWith("posting-a");
    expect(mocks.listByPosting).not.toHaveBeenCalled();
  });
});

describe("payment requiring review", () => {
  it("accepts the review status without treating it as a confirmed payment", () => {
    const result = paymentStatusApiSchema.parse({ status: "requires_review", amount: "840.00", rental_status: "cancelled" });
    expect(isPaid({ status: result.status, amount: result.amount, rentalStatus: result.rental_status })).toBe(false);
  });

  it("stops confirmation and shows a persistent support message without unlocking the contract", async () => {
    mocks.getStatus.mockResolvedValue({ status: "requires_review", amount: "840.00", rentalStatus: "cancelled" });
    window.history.replaceState({}, "", "/reservar/posting-a?pagamento=sucesso&locacao=rental-a");
    renderBooking();
    expect((await screen.findByRole("alert")).textContent).toContain("Pagamento em análise");
    expect(screen.getByRole("alert").textContent).toContain("rental-a");
    expect(screen.queryByText("Confirmando seu pagamento")).toBeNull();
    expect(screen.queryByText("Pagamento confirmado")).toBeNull();
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
    expect(mocks.findContractDocument).not.toHaveBeenCalled();
    expect(mocks.findRentalById).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});

describe("checkout failure recovery", () => {
  const rental = rentalToDomain({ id: "rental-a", postings: "posting-a", lessee: "tenant-a", start_date: "2099-10-05T08:00:00Z", end_date: "2099-10-05T18:00:00Z", total_price: "840.00", status: "pending" });
  it("retries the same rental after provider failure, including after a reload", async () => {
    mocks.createRental.mockResolvedValue(rental);
    mocks.findRentalById.mockResolvedValue(rental);
    mocks.createCheckout.mockRejectedValue(new ServerError(503, "O provedor de pagamentos precisa ser configurado."));
    window.history.replaceState({}, "", "/reservar/posting-a");
    const first = renderBooking();
    const day = (await screen.findAllByTitle("Selecionar data"))[0];
    fireEvent.click(day); fireEvent.click(day);
    fireEvent.click(screen.getByRole("button", { name: "Avançar para Pagamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Pagar e Avançar" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("O provedor de pagamentos precisa ser configurado.");
    expect(window.location.search).toBe("?locacao=rental-a");
    fireEvent.click(screen.getByRole("button", { name: "Pagar e Avançar" }));
    await waitFor(() => expect(mocks.createCheckout).toHaveBeenCalledTimes(2));
    expect(mocks.createRental).toHaveBeenCalledTimes(1);
    first.unmount();
    renderBooking();
    await screen.findByRole("button", { name: "Pagar e Avançar" });
    fireEvent.click(screen.getByRole("button", { name: "Pagar e Avançar" }));
    await waitFor(() => expect(mocks.createCheckout).toHaveBeenCalledTimes(3));
    expect(mocks.createRental).toHaveBeenCalledTimes(1);
    expect(mocks.createCheckout).toHaveBeenLastCalledWith("rental-a");
  });
  it("retains the reservation when returning from canceled checkout", async () => {
    mocks.findRentalById.mockResolvedValue(rental);
    mocks.createCheckout.mockRejectedValue(new ServerError(503, "Pagamento indisponível."));
    window.history.replaceState({}, "", "/reservar/posting-a?pagamento=cancelado&locacao=rental-a");
    renderBooking();
    fireEvent.click(await screen.findByRole("button", { name: "Pagar e Avançar" }));
    await screen.findByRole("alert");
    expect(window.location.search).toBe("?locacao=rental-a");
    expect(mocks.createCheckout).toHaveBeenCalledWith("rental-a");
    expect(mocks.createRental).not.toHaveBeenCalled();
  });
});

it("stops payment polling when the booking page is unmounted", async () => {
  vi.useFakeTimers();
  mocks.getStatus.mockResolvedValue({ status: "pending", amount: "840.00", rentalStatus: "awaiting_payment" });
  window.history.replaceState({}, "", "/reservar/posting-a?pagamento=sucesso&locacao=rental-a");
  const page = renderBooking();
  await act(async () => {});
  expect(mocks.getStatus).toHaveBeenCalledTimes(1);
  page.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(mocks.getStatus).toHaveBeenCalledTimes(1);
});
it("keeps confirmed payment context when loading its contract fails", async () => {
  mocks.getStatus.mockResolvedValue({ status: "approved", amount: "840.00", rentalStatus: "active" });
  mocks.findRentalById.mockResolvedValue(rentalToDomain({ id: "rental-a", postings: "posting-a", lessee: "tenant-a", start_date: "2099-10-05T08:00:00Z", end_date: "2099-10-05T18:00:00Z", status: "active" }));
  mocks.findContractDocument.mockRejectedValue(new ServerError(503, "Documento temporariamente indisponível."));
  window.history.replaceState({}, "", "/reservar/posting-a?pagamento=sucesso&locacao=rental-a");
  renderBooking();
  await screen.findByText("Documento temporariamente indisponível.");
  expect(window.location.search).toContain("pagamento=sucesso");
  expect(window.location.search).toContain("locacao=rental-a");
  expect(screen.queryByText("Pagamento confirmado com sucesso!")).toBeNull();
});
