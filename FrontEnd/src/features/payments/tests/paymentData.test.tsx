import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RentalPaymentButton } from "../components/RentalPaymentButton";
import { useCreateCheckout, usePaymentStatus } from "../hooks/usePayments";
import { ServerError } from "@/shared/http/errors";
import type { HttpResponse } from "@/shared/http/HttpClient";
import { net, paymentStore } from "@/test/container";
import { ok } from "@/test/http";
import { renderHookWithQuery, renderWithProviders } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const assign = vi.fn();
beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); vi.stubGlobal("location", { ...window.location, assign }); });
afterEach(() => { vi.unstubAllGlobals(); });

it("opens Stripe checkout once even if the tenant clicks repeatedly", async () => {
  let resolve!: (value: HttpResponse<unknown>) => void;
  net.http.send.mockReturnValue(new Promise<HttpResponse<unknown>>(r => { resolve = r; }));
  const { user } = renderWithProviders(<RentalPaymentButton rentalId="rental-a" />);
  const button = screen.getByRole("button", { name: "Pagar reserva" });
  await user.click(button);
  await user.click(button);
  expect(await screen.findByRole("button", { name: "Abrindo pagamento..." })).toBeDisabled();
  await act(async () => resolve(ok({ url: "https://checkout.stripe.test/s1", amount: "840.00" })));
  expect(net.http.send).toHaveBeenCalledOnce();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "rentals/rental-a/checkout" });
  expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/s1");
});

it.each([
  [new ServerError(502, "Pagamento indisponível."), "Pagamento indisponível."],
  [new Error("boom"), "Não foi possível abrir o pagamento. Tente novamente."],
])("explains why checkout could not open (%#)", async (failure, message) => {
  net.http.send.mockRejectedValue(failure);
  const { user } = renderWithProviders(<RentalPaymentButton rentalId="rental-a" />);
  await user.click(screen.getByRole("button", { name: "Pagar reserva" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(assign).not.toHaveBeenCalled();
});

it("polls payment status while Stripe has not confirmed and stops when approved", async () => {
  net.http.send.mockResolvedValueOnce(ok({ status: "pending", amount: "840.00", rental_status: "awaiting_payment" }))
    .mockResolvedValue(ok({ status: "approved", amount: "840.00", rental_status: "active" }));
  const status = renderHookWithQuery(() => usePaymentStatus("rental-a", 10), net.queryClient);
  await waitFor(() => expect(status.result.current.data).toEqual({ status: "approved", amount: "840.00", rentalStatus: "active" }));
  const calls = net.http.send.mock.calls.length;
  await new Promise(r => setTimeout(r, 40));
  expect(net.http.send).toHaveBeenCalledTimes(calls);
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "rentals/rental-a/payment" });
  expect(renderHookWithQuery(() => usePaymentStatus(null)).result.current.fetchStatus).toBe("idle");
});

it("refreshes notifications after creating a checkout and exposes status helpers", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValueOnce(ok({ url: "https://checkout", amount: "1.00" })).mockResolvedValue(ok({ status: "expired", amount: "1.00", rental_status: "pending" }));
  const checkout = renderHookWithQuery(() => useCreateCheckout());
  await act(() => checkout.result.current.mutateAsync("rental-a"));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  expect((await paymentStore.getStatus("rental-a")).status).toBe("expired");
  await paymentStore.invalidateStatus("rental-a");
  expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ["payments", "status", "rental-a"] });
  paymentStore.clear();
});
