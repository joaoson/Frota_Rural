import { useRef, useState } from "react";
import { useCreateCheckout } from "../hooks/usePayments";
import { HttpError } from "@/shared/http/errors";

export function RentalPaymentButton({ rentalId }: { rentalId: string }) {
  const checkout = useCreateCheckout();
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      const { url } = await checkout.mutateAsync(rentalId);
      window.location.assign(url);
    } catch (failure) {
      setError(failure instanceof HttpError ? failure.message : "Não foi possível abrir o pagamento. Tente novamente.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void pay()} disabled={checkout.isPending}
        className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary disabled:opacity-50">
        {checkout.isPending ? "Abrindo pagamento..." : "Pagar reserva"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
