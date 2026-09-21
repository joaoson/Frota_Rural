import { type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GerenciarAnuncio from "../GerenciarAnuncio";
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(undefined), posting: { id: "posting-a", hourlyRate: 100, status: "active", locationAddress: "Castro, PR", locationCep: "84165000", latitude: -24.79, longitude: -50.01, availabilityStart: null, availabilityEnd: null, machineBrand: "John Deere", machineModel: "S790", description: "", photos: [] } }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a" }) }));
vi.mock("@/features/contracts/hooks/useContracts", () => ({ useRentalsAsLessor: () => ({ data: [] }) }));
vi.mock("@/features/reviews/hooks/useReviews", () => ({ useReceivedReviews: () => ({ data: [] }) }));
vi.mock("@/features/postings/hooks/usePostings", () => ({ usePosting: () => ({ data: mocks.posting }), useUpdatePosting: () => ({ mutateAsync: mocks.save }), useDeletePosting: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/shared/hooks/useCepLookup", () => ({ useCepLookup: () => ({ lookup: vi.fn() }), isCepComplete: () => false }));
vi.mock("@/components/MapaLocalizacao", () => ({ default: () => null }));
vi.mock("@/shared/components/PageShell", () => ({ PageShell: ({ children }: { children: ReactNode }) => children }));
afterEach(() => { cleanup(); mocks.save.mockClear(); mocks.posting.status = "active"; });
function open() { render(<MemoryRouter initialEntries={["/dashboard/gerenciar-anuncio/posting-a"]}><Routes><Route path="/dashboard/gerenciar-anuncio/:id" element={<GerenciarAnuncio />} /><Route path="/dashboard" element={<p>Anúncios</p>} /></Routes></MemoryRouter>); }
it("preserves stored location coordinates and CEP when only the price changes", async () => {
  open(); fireEvent.change(screen.getByLabelText("Valor por Hora (R$) *"), { target: { value: "250" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: "posting-a", payload: expect.objectContaining({ hourly_rate: "250", location_lat: -24.79, location_lng: -50.01, location_cep: "84165-000" }) }));
});
it("clears coordinates for a changed address until geocoding resolves, and omits sample analytics", async () => {
  open(); expect(screen.queryByText("1.245")).toBeNull(); expect(screen.queryByText("R$ 18.400")).toBeNull();
  fireEvent.change(screen.getByLabelText("Localização *"), { target: { value: "Curitiba, PR" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: "posting-a", payload: expect.objectContaining({ location_address: "Curitiba, PR", location_lat: null, location_lng: null }) }));
});

it("keeps moderated listings locked while allowing corrections without republishing", async () => {
  mocks.posting.status = "rejected";
  open();
  expect((screen.getByLabelText("Status do Anúncio") as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByText(/a publicação depende da moderação da plataforma/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Descrição corrigida" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: "posting-a", payload: expect.objectContaining({ status: "rejected", description: "Descrição corrigida" }) }));
});
