import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RentalCard } from "../components/RentalCard";
import { ReviewsSection } from "../components/ReviewsSection";
import type { Review } from "@/features/reviews/types/review";
vi.mock("@/features/reviews/hooks/useReviews", () => ({ useDeleteReview: () => ({ mutateAsync: vi.fn() }) }));
afterEach(cleanup);
const rental = { id: "rental-a", status: "pending", contract: "FR-A", machine: "Trator", period: "2026", total: "R$ 10,00" };
const counterparty = { label: "Locador", name: "João", icon: "person", className: "" };
const review = { buttonLabel: "Avaliar", title: "Avaliar", prompt: "Avalie", open: false, onToggle: vi.fn(), rating: 5, onRatingChange: vi.fn(), comment: "", onCommentChange: vi.fn(), submitting: false, onSubmit: vi.fn() };
it("requires confirmation before cancelling and offers real details without an analysis route", () => {
  const cancel = vi.fn(), details = vi.fn();
  render(<MemoryRouter><RentalCard rental={rental} counterparty={counterparty} review={review} detailsOpen={false} onToggleDetails={details} onCancel={cancel} cancelLabel="Cancelar reserva" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Analisar" }));
  expect(details).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Reagendar" })).toBeNull();
});
it("does not offer duplicate reviews or cancellation of a completed rental", () => {
  render(<MemoryRouter><RentalCard rental={{...rental, status: "completed"}} counterparty={counterparty} review={{...review, alreadyReviewed: true}} detailsOpen={false} onToggleDetails={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>);
  expect(screen.queryByRole("button", { name: "Avaliar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Recusar" })).toBeNull();
  expect(screen.getByText("Avaliação enviada")).toBeTruthy();
});
it("paginates received and given reviews independently", () => {
  const reviews = Array.from({ length: 7 }, (_, index): Review => ({ id: `review-${index}`, rentalId: `rental-${index}`, reviewerId: "other", reviewerName: `Autor ${index}`, revieweeId: "me", revieweeName: "Maria", rating: 5, comment: `Comentário ${index}`, createdAt: new Date("2026-09-01") }));
  render(<ReviewsSection receivedReviews={reviews} givenReviews={[]} />);
  expect(screen.queryByText("Autor 6")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.getByText("Autor 6")).toBeTruthy();
  expect(screen.queryByText("Autor 0")).toBeNull();
});

it("requires a valid refund preview, displays retained value, and submits the reason", async () => {
  const cancel = vi.fn();
  const preview = vi.fn().mockRejectedValueOnce(new Error("Pagamento em confirmação")).mockResolvedValue({ allowed: true, refundAmount: 90, retainedAmount: 10, policyText: "Estorno de 90%", policyVersion: "2026-10-21", reasonCode: "late_tenant_cancellation" });
  render(<MemoryRouter><RentalCard rental={{ ...rental, status: "active", allowedActions: ["cancel"] }} counterparty={counterparty} review={review} detailsOpen={false} onToggleDetails={vi.fn()} onCancel={cancel} onPreviewCancellation={preview} cancelLabel="Cancelar reserva" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
  expect((screen.getByRole("button", { name: "Confirmar cancelamento" }) as HTMLButtonElement).disabled).toBe(true);
  await screen.findByText("Pagamento em confirmação");
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Estorno de 90%");
  expect(screen.getByText(/Valor retido:/).textContent).toMatch(/10,00/);
  fireEvent.change(screen.getByLabelText("Motivo do cancelamento (opcional)"), { target: { value: "Chuva forte" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
  expect(cancel).toHaveBeenCalledWith("Chuva forte");
});

it("keeps the refund outcome visible after cancellation", () => {
  render(<MemoryRouter><RentalCard rental={{ ...rental, status: "cancelled", refunds: [{ id: "refund", amount: 100, status: "failed" }] }} counterparty={counterparty} review={review} detailsOpen={false} onToggleDetails={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole("status").textContent).toContain("Estorno falhou");
  expect(screen.getByRole("status").textContent).toContain("datas já foram liberadas");
});
