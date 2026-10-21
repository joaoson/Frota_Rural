import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RentalCard, type RentalCardData } from "@/features/dashboard/components/RentalCard";
import AnaliseLocacao from "@/pages/contracts/AnaliseLocacao";
import type { HttpClient } from "@/shared/http/HttpClient";
import { HttpContractRepository } from "../api/ContractRepository";
import { rentalToDomain } from "../api/contractMapper";

const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/app/container", () => ({ contractStore: { findRentalById: mocks.find }, chatStore: { resolveThread: vi.fn() } }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map((name) => [name, () => null])));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const reading = (id: string, value: number) => ({ id, value, note: "", recorded_at: "2026-10-20T10:00:00Z", recorded_by: "owner-a" });
const dto = {
  id: "rental-a", postings: "posting-a", lessee: "tenant-a", lessor_id: "owner-a",
  start_date: "2026-10-19T08:00:00Z", end_date: "2026-10-20T18:00:00Z", total_price: "3024.00", status: "signed",
  phase: "devolvida", allowed_actions: ["record_check_in", "record_check_out", "complete"],
  meter: { check_in: reading("r1", 1000), check_out: null, hours_used: null, reference_hours: 16 },
};

function card(overrides: Partial<RentalCardData> = {}, handlers: Partial<Parameters<typeof RentalCard>[0]> = {}) {
  const rental = rentalToDomain(dto);
  const data: RentalCardData = {
    id: rental.id, status: rental.status, phase: rental.phase, allowedActions: rental.allowedActions, meter: rental.meter,
    contract: "#CTR-A", machine: "Trator", period: "19/10 a 20/10", total: "R$ 3.024,00", ...overrides,
  };
  const review = { buttonLabel: "Avaliar", title: "Avaliar", prompt: "", open: false, onToggle: vi.fn(), rating: 5, onRatingChange: vi.fn(), comment: "", onCommentChange: vi.fn(), submitting: false, onSubmit: vi.fn() };
  render(<MemoryRouter><RentalCard rental={data} counterparty={{ label: "Locatário", name: "Maria", icon: "person", className: "" }}
    review={review} detailsOpen onToggleDetails={vi.fn()} {...handlers} /></MemoryRouter>);
}

describe("owner meter actions", () => {
  it("validates and records a reading with a note", async () => {
    const onRecordReading = vi.fn().mockResolvedValue(true);
    card({}, { onRecordReading, onComplete: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /Registrar devolução/ }));
    expect(screen.getByText(/não alteram o valor da locação/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Leitura (horas)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar leitura" }));
    expect((await screen.findByRole("alert")).textContent).toContain("horas inteiras");
    expect(onRecordReading).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Leitura (horas)"), { target: { value: "1250" } });
    fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: " painel ok " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar leitura" }));
    await waitFor(() => expect(onRecordReading).toHaveBeenCalledWith("check_out", 1250, "painel ok"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar leitura" })).toBeNull());
  });

  it("completes with an optional check-out reading, never requiring one", async () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    card({}, { onRecordReading: vi.fn(), onComplete });
    fireEvent.click(screen.getByRole("button", { name: /Concluir locação/ }));
    fireEvent.change(screen.getByLabelText(/Leitura de devolução/), { target: { value: "1250" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conclusão" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(1250));

    cleanup();
    card({ meter: null }, { onRecordReading: vi.fn(), onComplete });
    fireEvent.click(screen.getByRole("button", { name: /Concluir locação/ }));
    expect(screen.queryByLabelText(/Leitura de devolução/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conclusão" }));
    await waitFor(() => expect(onComplete).toHaveBeenLastCalledWith(undefined));
  });

  it("offers no meter controls the server does not allow", () => {
    card({ allowedActions: [] }, { onRecordReading: vi.fn(), onComplete: vi.fn() });
    expect(screen.queryByRole("button", { name: /Registrar|Concluir/ })).toBeNull();
  });

  it("shows hours used next to the reference as information", () => {
    const rental = rentalToDomain({ ...dto, meter: { ...dto.meter, check_out: reading("r2", 1250), hours_used: 250 } });
    card({ meter: rental.meter });
    expect(screen.getByText(/250 h \(referência: 16 h\)/)).toBeTruthy();
    expect(screen.getByText(/informativo, não altera o valor/)).toBeTruthy();
  });
});

describe("rental analysis", () => {
  it("shows the usage card from the recorded readings", async () => {
    mocks.find.mockResolvedValue(rentalToDomain({ ...dto, meter: { ...dto.meter, check_out: reading("r2", 1030), hours_used: 30 } }));
    render(<MemoryRouter initialEntries={["/analise/rental-a"]}><Routes><Route path="/analise/:rentalId" element={<AnaliseLocacao />} /></Routes></MemoryRouter>);
    await screen.findByText("Uso do equipamento");
    expect(screen.getByText("30 h")).toBeTruthy();
    expect(screen.getByText("15 h")).toBeTruthy();
    expect(screen.getByText(/não alteram o valor da locação/)).toBeTruthy();
  });
});

describe("meter API calls", () => {
  it("posts readings and completion to their commands and maps machine usage", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ status: 201, data: { rental: dto, warnings: ["confira o painel"] } })
      .mockResolvedValueOnce({ status: 200, data: { ...dto, status: "completed" } })
      .mockResolvedValueOnce({ status: 200, data: { locacoes_concluidas: 2, diarias: 4, locacoes_com_leitura: 1, horas_registradas: 30, media_horas_por_diaria: "15.0", referencia_horas_por_diaria: 8, ultima_leitura: null } });
    const repository = new HttpContractRepository({ send } as HttpClient);
    expect((await repository.recordMeterReading("rental-a", "check_in", 1000, "ok")).warnings).toEqual(["confira o painel"]);
    expect(send).toHaveBeenLastCalledWith({ method: "POST", path: "rentals/rental-a/meter-readings", body: { kind: "check_in", value: 1000, note: "ok" } });
    expect((await repository.completeRental("rental-a", 1030)).status).toBe("completed");
    expect(send).toHaveBeenLastCalledWith({ method: "POST", path: "rentals/rental-a/complete", body: { final_hour_meter: 1030 } });
    expect(await repository.machineUsage("machine-a")).toMatchObject({ completedRentals: 2, averageHoursPerDay: 15 });
  });
});
