import { act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { contractToDomain, toRentalDateTime } from "../api/contractMapper";
import { useCancelRental, useCompleteRental, useContractDocument, useContractEvidence, useCreateRental, useRecordMeterReading, useRentalsAsLessee, useRentalsAsLessor, useRequestSignatureOtp, useSignContract } from "../hooks/useContracts";
import { isFullySigned, isSignedBy, rentalHasContract, rentalMachineName } from "../types/rental";
import { rentalStatusBadge } from "../types/rentalBadges";
import type { RentalApi } from "../types/rentalSchemas";
import { contractStore, net } from "@/test/container";
import { buildRental, rentalDto } from "@/test/factories";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const evidence = { id: "ev-1", contract: "contract-a", role: "locatario", signer: "tenant-a", signer_name: "Maria Silva", signer_email: "maria@example.com",
  document_version: "v2", document_hash: "abc", hash_algorithm: "sha256", signed_at: "2026-09-01T10:00:00Z", ip_address: "10.0.0.1",
  user_agent: "Firefox", otp_verified: true, previous_hash: "000", record_hash: "def" };

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("loads the rentals of the signed-in party only after the user id is known", async () => {
  net.http.send.mockResolvedValue(ok([rentalDto()]));
  expect(renderHookWithQuery(() => useRentalsAsLessee(null), net.queryClient).result.current.fetchStatus).toBe("idle");
  expect(renderHookWithQuery(() => useRentalsAsLessor(null), net.queryClient).result.current.fetchStatus).toBe("idle");
  const tenant = renderHookWithQuery(() => useRentalsAsLessee("tenant-a"), net.queryClient);
  const owner = renderHookWithQuery(() => useRentalsAsLessor("owner-a"), net.queryClient);
  await waitFor(() => expect(tenant.result.current.data).toHaveLength(1));
  await waitFor(() => expect(owner.result.current.data).toHaveLength(1));
  expect(net.http.send.mock.calls.map(([request]) => request.query)).toEqual([{ lessee: "tenant-a", lessor: undefined }, { lessee: undefined, lessor: "owner-a" }]);
});

it("books a rental and refreshes rentals and notifications", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(rentalDto()));
  const create = renderHookWithQuery(() => useCreateRental());
  const payload = { postings: "posting-a", lessee: "tenant-a", start_date: toRentalDateTime("2026-09-01", "start"), end_date: toRentalDateTime("2026-09-02", "end"), total_price: 2000, status: "pending" };
  await act(() => create.result.current.mutateAsync(payload));
  expect(payload).toMatchObject({ start_date: "2026-09-01T08:00:00Z", end_date: "2026-09-02T18:00:00Z" });
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "rentals", body: payload });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts", "rentals"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
});

it("quotes a period, reads the booking policy and the posting calendar", async () => {
  net.http.send.mockResolvedValueOnce(ok({ tarifa_hora: "100.00", horas_por_diaria: 8, valor_diaria: "800.00", diarias: 2, subtotal: "1600.00", taxa_percentual: "0.05", taxa_valor: "80.00", total: "1680.00" }))
    .mockResolvedValueOnce(ok({ antecedencia_minima_dias: 2, data_minima_inicio: "2026-10-23" }))
    .mockResolvedValueOnce(ok([rentalDto()]))
    .mockResolvedValueOnce(ok({ ocupados: [{ id: "rental-a", start_date: "2026-11-01T08:00:00Z", end_date: "2026-11-02T18:00:00Z", status: "signed" }] }));
  expect(await contractStore.quotePosting("posting-a", "2026-11-01", "2026-11-02")).toEqual({ hourlyRate: 100, hoursPerDay: 8, dailyRate: 800, days: 2, subtotal: 1600, feeRate: 0.05, fee: 80, total: 1680 });
  expect(await contractStore.bookingPolicy()).toEqual({ minNoticeDays: 2, earliestStartDate: "2026-10-23" });
  expect(await contractStore.listByPosting("posting-a")).toHaveLength(1);
  expect(await contractStore.listOccupancyByPosting("posting-a")).toEqual([{ id: "rental-a", status: "signed", startDate: new Date("2026-11-01T08:00:00Z"), endDate: new Date("2026-11-02T18:00:00Z") }]);
  expect(net.http.send.mock.calls.map(([request]) => request.path)).toEqual(["postings/posting-a/cotacao", "rentals/policy", "rentals", "postings/posting-a/ocupacao"]);
});

it("signs with an OTP and the read revision, returning the evidence and refreshing the contract", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValueOnce(ok({ sent_to: "m***@example.com", expires_in_seconds: 300 }))
    .mockResolvedValueOnce(ok({ signature_evidence: evidence, rental_details: rentalDto({ status: "signed" }) }))
    .mockResolvedValueOnce(ok({}));
  const otp = renderHookWithQuery(() => useRequestSignatureOtp());
  const sign = renderHookWithQuery(() => useSignContract());
  expect(await act(() => otp.result.current.mutateAsync({ id: "contract-a", role: "locatario" }))).toEqual({ sentTo: "m***@example.com", expiresInSeconds: 300 });
  const receipt = await act(() => sign.result.current.mutateAsync({ id: "contract-a", role: "locatario", name: "Maria Silva", otp: "123456", revisionId: "rev-2" }));
  expect(receipt.evidence).toMatchObject({ contractId: "contract-a", signerName: "Maria Silva", otpVerified: true, recordHash: "def" });
  expect(receipt.rental?.status).toBe("signed");
  // Sem OTP e sem revisão: o servidor decide se o aceite precisa de confirmação.
  expect(await contractStore.sign("contract-a", "locador", "João")).toEqual({ rental: null, evidence: null });
  expect(net.http.send.mock.calls.map(([request]) => request.body)).toEqual([
    { role: "locatario", revision_id: null },
    { role: "locatario", name: "Maria Silva", revision_id: "rev-2", otp: "123456" },
    { role: "locador", name: "João", revision_id: null },
  ]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts", "evidence", "contract-a"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts", "document", "contract-a"] });
});

it("shows the audit trail and whether its hash chain is intact", async () => {
  net.http.send.mockResolvedValue(ok({ contrato_id: "contract-a", aluguel_id: "rental-a", status: "signed", documento: { versao: "v2", hash: "abc", algoritmo: "sha256" },
    cadeia_integra: false, inconsistencias: ["Registro 2 alterado"], assinaturas: [evidence], fundamento_legal: "MP 2.200-2/2001" }));
  expect(renderHookWithQuery(() => useContractEvidence(null)).result.current.fetchStatus).toBe("idle");
  const trail = renderHookWithQuery(() => useContractEvidence("contract-a"));
  await waitFor(() => expect(trail.result.current.data).toMatchObject({ chainIntact: false, inconsistencies: ["Registro 2 alterado"], document: { algorithm: "sha256" }, signatures: [{ role: "locatario" }] }));
});

it("loads the contract document only for a selected contract", async () => {
  net.http.send.mockResolvedValue(ok({ numero: "FR-1" }));
  expect(renderHookWithQuery(() => useContractDocument(null)).result.current.fetchStatus).toBe("idle");
  const document = renderHookWithQuery(() => useContractDocument("contract-a"));
  await waitFor(() => expect(document.result.current.data).toEqual({ numero: "FR-1" }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "contracts/contract-a" });
});

it("records meter readings with warnings and completes the rental with the final reading", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValueOnce(ok({ rental: rentalDto({ status: "active" }), warnings: ["Leitura abaixo da anterior"] }))
    .mockResolvedValueOnce(ok({ rental: rentalDto({ status: "active" }) }))
    .mockResolvedValue(ok(rentalDto({ status: "completed", final_hour_meter: 1300 })));
  const record = renderHookWithQuery(() => useRecordMeterReading());
  const complete = renderHookWithQuery(() => useCompleteRental());
  expect((await act(() => record.result.current.mutateAsync({ id: "rental-a", kind: "check_out", value: 1300, note: "Fim" }))).warnings).toEqual(["Leitura abaixo da anterior"]);
  expect((await contractStore.recordMeterReading("rental-a", "check_in", 1200)).warnings).toEqual([]);
  await act(() => complete.result.current.mutateAsync({ id: "rental-a", finalHourMeter: 1300 }));
  await contractStore.completeRental("rental-a");
  expect(net.http.send.mock.calls.map(([request]) => request.body)).toEqual([
    { kind: "check_out", value: 1300, note: "Fim" }, { kind: "check_in", value: 1200, note: "" }, { final_hour_meter: 1300 }, {},
  ]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts", "machine-usage"] });
});

it("cancels with a reason and previews the refund policy", async () => {
  net.http.send.mockResolvedValueOnce(ok({ allowed: true, refund_amount: "1500.00", retained_amount: "500.00", reason_code: "late", policy_text: "Retém 25%.", policy_version: "2026-01" }))
    .mockResolvedValue(ok(rentalDto({ status: "cancelled", // O valor chega como texto na API; o schema o converte para número.
      refunds: [{ id: "re-1", amount: "1500.00", status: "pending" }] as unknown as RentalApi["refunds"] })));
  expect(await contractStore.previewCancellation("rental-a")).toEqual({ allowed: true, refundAmount: 1500, retainedAmount: 500, reasonCode: "late", policyText: "Retém 25%.", policyVersion: "2026-01" });
  const cancel = renderHookWithQuery(() => useCancelRental());
  const rental = await act(() => cancel.result.current.mutateAsync({ id: "rental-a", reason: "Chuva" }));
  expect(rental.refunds).toEqual([{ id: "re-1", amount: 1500, status: "pending" }]);
  expect(net.http.send).toHaveBeenLastCalledWith({ method: "POST", path: "rentals/rental-a/cancel", body: { reason: "Chuva" } });
});

it("maps contracts and derives who still has to sign", () => {
  const contract = contractToDomain({ id: "contract-a", rental: "rental-a", accepted_by_lessor: true, accepted_by_lessee: null, rental_details: rentalDto() });
  expect(contract).toMatchObject({ documentUrl: null, status: null, acceptedByLessee: null, rental: { id: "rental-a" } });
  expect([isFullySigned(contract), isSignedBy(contract, "locador"), isSignedBy(contract, "locatario")]).toEqual([false, true, false]);
  expect(isFullySigned({ ...contract, acceptedByLessee: true })).toBe(true);
  expect(contractToDomain({ id: "c", rental: "r" }).rental).toBeNull();
  expect(rentalMachineName(buildRental({ machine_brand: null, machine_model: null }))).toBe("Maquinário");
  expect([rentalHasContract(buildRental()), rentalHasContract(buildRental({ contract_status: "pending" }))]).toEqual([false, true]);
  expect(buildRental({ start_date: "not a date", total_price: "abc" })).toMatchObject({ startDate: null, totalPrice: null });
});

it.each([
  ["pending", "Reserva Pendente"], ["awaiting_payment", "Aguardando Pagamento"], ["signed", "Contrato Assinado"], ["active", "Locação Ativa"],
  ["closed", "Encerrada"], ["completed", "Concluída"], ["cancelled", "Locação Cancelada"], [null, ""],
])("labels rental status %s", (status, label) => {
  expect(rentalStatusBadge(status).label).toBe(label);
});

it("forgets contract data on logout", () => {
  net.queryClient.setQueryData(["contracts", "rentals", {}], []);
  contractStore.clear();
  expect(net.queryClient.getQueryData(["contracts", "rentals", {}])).toBeUndefined();
});
