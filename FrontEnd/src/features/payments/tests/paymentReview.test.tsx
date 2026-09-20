import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import Reservar from "@/pages/postings/Reservar";
import { paymentStatusApiSchema } from "../types/paymentSchemas";
import { isPaid } from "../types/payment";

const mocks = vi.hoisted(() => ({ getStatus: vi.fn(), findRentalById: vi.fn(), findContractDocument: vi.fn(), listByPosting: vi.fn(), listOccupancyByPosting: vi.fn(), findPosting: vi.fn() }));
vi.mock("@/app/container", () => ({
  paymentStore: { getStatus: mocks.getStatus },
  contractStore: { listByPosting: mocks.listByPosting, listOccupancyByPosting: mocks.listOccupancyByPosting, findRentalById: mocks.findRentalById, findContractDocument: mocks.findContractDocument },
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
