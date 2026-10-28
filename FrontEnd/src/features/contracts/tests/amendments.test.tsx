import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractAmendmentsPanel } from "../components/ContractAmendmentsPanel";
import { ContractStore } from "../api/ContractStore";
import { HttpContractRepository } from "../api/ContractRepository";
import type { ContratoData } from "../types/contractDocument";
import type { HttpClient } from "@/shared/http/HttpClient";
import { situacaoAssinatura } from "../types/rental";

const state = vi.hoisted(() => ({ store: null as ContractStore | null }));
vi.mock("@/app/container", () => ({ get contractStore() { return state.store; } }));
const dto = { id: "amendment", contract: "contract", proposer: "tenant", proposer_name: "Maria", base_revision: "rev-1", original_start: "2027-01-01T08:00:00Z", original_end: "2027-01-03T18:00:00Z", proposed_start: "2027-02-01T08:00:00Z", proposed_end: "2027-02-03T18:00:00Z", reason: "Colheita", status: "pending", expires_at: "2026-12-15T08:00:00Z" };
const document = { revisao: { id: "rev-1" }, contrato: { diarias: 3 }, gestao: { allowed_actions: ["amend"], start_date: dto.original_start, end_date: dto.original_end } } as ContratoData;
let cache: QueryClient;
let send: ReturnType<typeof vi.fn>;
beforeEach(() => { cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); send = vi.fn(); state.store = new ContractStore(new HttpContractRepository({ send } as HttpClient), cache); });
afterEach(() => { cleanup(); cache.clear(); });
function show(actorId = "tenant") { render(<QueryClientProvider client={cache}><ContractAmendmentsPanel contractId="contract" actorId={actorId} document={document} /></QueryClientProvider>); }

it("sends the displayed revision and preserves the contracted times, then waits for the counterpart", async () => {
  let proposed = false;
  send.mockImplementation(async ({ method }) => { if (method === "POST") { proposed = true; return { data: dto }; } return { data: proposed ? [dto] : [] }; });
  show();
  await screen.findByLabelText("Novo início");
  fireEvent.change(screen.getByLabelText("Novo início"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Novo término"), { target: { value: "2027-02-03" } });
  fireEvent.change(screen.getByLabelText("Motivo da alteração"), { target: { value: "Colheita" } });
  fireEvent.click(screen.getByRole("button", { name: "Solicitar alteração" }));
  await screen.findByText("Aguardando resposta");
  expect(send).toHaveBeenCalledWith({ method: "POST", path: "contracts/contract/amendments", body: { base_revision: "rev-1", proposed_start: new Date(dto.proposed_start).toISOString(), proposed_end: new Date(dto.proposed_end).toISOString(), reason: "Colheita" } });
  expect(screen.getByRole("button", { name: "Retirar solicitação" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Aceitar novas datas" })).toBeNull();
});

it.each(["accept", "reject"])("lets the counterpart %s and invalidates rental, document and notifications", async action => {
  let decided = false;
  send.mockImplementation(async ({ method }) => { if (method === "POST") { decided = true; return { data: { ...dto, status: action === "accept" ? "accepted" : "rejected" } }; } return { data: [{ ...dto, status: decided ? (action === "accept" ? "accepted" : "rejected") : "pending" }] }; });
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  show("owner");
  fireEvent.click(await screen.findByRole("button", { name: action === "accept" ? "Aceitar novas datas" : "Recusar alteração" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ method: "POST", path: `contracts/contract/amendments/amendment/${action}`, body: {} }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  expect(screen.queryByRole("button", { name: "Retirar solicitação" })).toBeNull();
});

it("keeps the proposal visible if availability changed while accepting", async () => {
  send.mockImplementation(async ({ method }) => { if (method === "POST") throw new Error("As novas datas estão ocupadas."); return { data: [dto] }; });
  show("owner");
  fireEvent.click(await screen.findByRole("button", { name: "Aceitar novas datas" }));
  expect((await screen.findByRole("alert")).textContent).toContain("As novas datas estão ocupadas.");
  expect(screen.getByText(/Datas anteriores:/)).toBeTruthy();
  expect(screen.getByText(/Datas propostas:/)).toBeTruthy();
});

it("does not offer signing after the deadline", () => {
  expect(situacaoAssinatura({ status: "active", acceptedByLessor: false, acceptedByLessee: false, signatureDeadline: new Date(0) }).podeAssinarComoLocatario).toBe(false);
});
