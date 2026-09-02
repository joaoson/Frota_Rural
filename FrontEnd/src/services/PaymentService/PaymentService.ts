import { AxiosInstance } from "@/services/AxiosInstance";

export interface CheckoutSession {
  url: string;
  amount: string;
}

export interface StatusPagamento {
  status: "pending" | "approved" | "expired";
  amount: string;
  rental_status: string;
}

class PaymentService {
  async criarCheckout(rentalId: string): Promise<CheckoutSession> {
    const response = await AxiosInstance.post<CheckoutSession>(
      `rentals/${rentalId}/checkout`,
    );
    return response.data;
  }

  async getStatus(rentalId: string): Promise<StatusPagamento> {
    const response = await AxiosInstance.get<StatusPagamento>(
      `rentals/${rentalId}/payment`,
    );
    return response.data;
  }
}

export const paymentService = new PaymentService();
