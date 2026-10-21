import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { canDo, isConfirmedRental, isOpenRental, rentalPhase, rentalPhaseBadge } from "../types/rentalLifecycle";

afterEach(cleanup);

describe("rental lifecycle helpers", () => {
  it("prefer the server phase and fall back to the stored status", () => {
    expect(rentalPhase({ status: "signed", phase: "em_uso" })).toBe("em_uso");
    expect(rentalPhase({ status: "active" })).toBe("aguardando_assinaturas");
    expect(rentalPhaseBadge({ status: "signed", phase: "devolvida" }).label).toBe("Aguardando Conclusão");
  });

  it("count paid, unfinished rentals as active and keep unpaid ones open", () => {
    const rentals = [
      { status: "pending" }, { status: "awaiting_payment" }, { status: "active" },
      { status: "signed", phase: "em_uso" }, { status: "signed", phase: "devolvida" },
      { status: "completed" }, { status: "cancelled" },
    ];
    expect(rentals.filter(isConfirmedRental)).toHaveLength(3);
    expect(rentals.filter(isOpenRental)).toHaveLength(5);
  });

  it("follow the server's allowed actions when present", () => {
    expect(canDo({ status: "pending", allowedActions: [] }, "cancel")).toBe(false);
    expect(canDo({ status: "signed", allowedActions: ["complete"] }, "complete")).toBe(true);
    expect(canDo({ status: "pending" }, "cancel")).toBe(true);
  });
});

describe("rental card", () => {
  const base = { id: "rental-a", status: "pending", contract: "FR-A", machine: "Trator", period: "2026", total: "R$ 10,00" };
  const counterparty = { label: "Locatário", name: "Maria", icon: "person", className: "" };
  const review = { buttonLabel: "Avaliar", title: "Avaliar", prompt: "Avalie", open: false, onToggle: vi.fn(), rating: 5, onRatingChange: vi.fn(), comment: "", onCommentChange: vi.fn(), submitting: false, onSubmit: vi.fn() };

  it("hides cancellation the server does not allow and shows the tenant's notes", () => {
    render(<MemoryRouter><RentalCard rental={{ ...base, phase: "reserva", allowedActions: ["pay"], notes: "Entrar pela porteira 2." }}
      counterparty={counterparty} review={review} detailsOpen onToggleDetails={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Recusar" })).toBeNull();
    expect(screen.getByText("Entrar pela porteira 2.")).toBeTruthy();
  });

  it("labels the phase instead of the raw status", () => {
    render(<MemoryRouter><RentalCard rental={{ ...base, status: "signed", phase: "em_uso", allowedActions: [] }}
      counterparty={counterparty} review={review} detailsOpen={false} onToggleDetails={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("Em Uso")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Analisar" }));
  });
});
