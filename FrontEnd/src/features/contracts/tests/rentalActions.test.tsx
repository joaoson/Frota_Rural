import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { HttpContractRepository } from "../api/ContractRepository";
import { ContractStore } from "../api/ContractStore";
import { rentalToDomain } from "../api/contractMapper";
import { situacaoAssinatura } from "../types/rental";
import AnaliseLocacao from "@/pages/contracts/AnaliseLocacao";
import type { HttpClient } from "@/shared/http/HttpClient";
const mocks = vi.hoisted(() => ({ find: vi.fn(), resolve: vi.fn() }));
vi.mock("@/app/container", () => ({ contractStore: { findRentalById: mocks.find }, chatStore: { resolveThread: mocks.resolve } }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, () => null])));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const dto = { id: "rental-a", postings: "posting-a", lessee: "tenant-a", lessor_id: "owner-a", operator: "operator-a", start_date: "2026-01-01T08:00:00Z", end_date: "2026-01-03T18:00:00Z", total_price: "2000", status: "pending" };
it("cancels through the server and refreshes rentals and notifications", async () => {
  const send = vi.fn().mockResolvedValue({ status: 200, data: { ...dto, status: "cancelled" } });
  const cache = new QueryClient(); const invalidate = vi.spyOn(cache, "invalidateQueries");
  const store = new ContractStore(new HttpContractRepository({ send } as HttpClient), cache);
  expect(await store.cancelRental("rental-a")).toMatchObject({ status: "cancelled" });
  expect(send).toHaveBeenCalledWith({ method: "PATCH", path: "rentals/rental-a", body: { status: "cancelled" } });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts", "rentals"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
});
it("signs the revision that was read and takes the rental from the same response", async () => {
  const send = vi.fn().mockResolvedValueOnce({ status: 200, data: { id: "contract-a", rental: dto.id, rental_details: { ...dto, status: "signed" } } });
  const repository = new HttpContractRepository({ send } as HttpClient);
  const receipt = await repository.sign("contract-a", "locatario", "Maria Silva", "123456", "revision-1");
  expect(receipt.rental).toMatchObject({ id: dto.id, status: "signed" });
  // A second read that failed would make a recorded acceptance look refused.
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    method: "POST", path: "contracts/contract-a/sign",
    body: { role: "locatario", name: "Maria Silva", revision_id: "revision-1", otp: "123456" },
  });
});
it("does not offer signing before payment or after cancellation", () => {
  const pending = { status: "pending", acceptedByLessor: false, acceptedByLessee: false };
  expect(situacaoAssinatura(pending).podeAssinarComoLocatario).toBe(false);
  expect(situacaoAssinatura({ ...pending, status: "active" }).podeAssinarComoLocatario).toBe(true);
  expect(situacaoAssinatura({ ...pending, status: "cancelled" }).podeAssinarComoLocador).toBe(false);
});
it("opens the owner's rental conversation even when an operator is assigned", async () => {
  mocks.find.mockResolvedValue(rentalToDomain(dto)); mocks.resolve.mockResolvedValue({ threadId: "rental-thread" });
  render(<MemoryRouter initialEntries={[`/dashboard-locatario/locacoes/${dto.id}`]}><Routes><Route path="/dashboard-locatario/locacoes/:rentalId" element={<AnaliseLocacao />} /><Route path="/mensagens/:id" element={<p>Conversa aberta</p>} /></Routes></MemoryRouter>);
  await screen.findByText("Análise da locação");
  expect(screen.getByText("0 dias")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Mensagens da locação" }));
  await screen.findByText("Conversa aberta");
  expect(mocks.resolve).toHaveBeenCalledWith("rental", dto.id, "owner-a");
});
