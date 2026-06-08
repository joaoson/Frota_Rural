import { AxiosInstance } from "@/services/AxiosInstance";
import type { ContratoData } from "@/pages/Contrato/types";

export interface Rental {
  id: string;
  postingId: string;
  lesseeId: string;
  lessorId: string;
  machineName: string;
  period: string;
  startDate: string;
  endDate: string;
  total: string;
  contractNumber: string;
  status: "pending" | "active" | "completed" | "cancelled" | "signed" | "closed";
  image?: string;
  observacoes?: string;
  hoursUsed?: number;
  initialHorimeter?: number;
  finalHorimeter?: number;
}

class ContractService {
  async createRental(payload: {
    postingId: string;
    lesseeId: string;
    lessorId: string;
    machineName: string;
    startDate: string;
    endDate: string;
    total: number;
    observacoes?: string;
  }): Promise<Rental> {
    const response = await AxiosInstance.post("rentals/", {
      postings: payload.postingId,
      lessee: payload.lesseeId,
      start_date: payload.startDate + "T08:00:00Z",
      end_date: payload.endDate + "T18:00:00Z",
      total_price: payload.total,
      status: "pending",
    });
    const r = response.data;
    return {
      id: r.id,
      postingId: r.postings,
      lesseeId: r.lessee,
      lessorId: payload.lessorId,
      machineName: payload.machineName,
      period: `${payload.startDate} a ${payload.endDate}`,
      startDate: payload.startDate,
      endDate: payload.endDate,
      total: payload.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      contractNumber: r.contract_number,
      status: r.status,
    };
  }

  async listByLessee(lesseeId: string): Promise<Rental[]> {
    const response = await AxiosInstance.get<any[]>("rentals/", {
      params: { lessee: lesseeId }
    });
    return response.data.map(r => ({
      id: r.id,
      postingId: r.postings,
      lesseeId: r.lessee,
      lessorId: "lessor-default",
      machineName: `${r.machine_brand || ""} ${r.machine_model || ""}`.trim() || "Maquinário",
      period: `${r.start_date.split("T")[0]} a ${r.end_date.split("T")[0]}`,
      startDate: r.start_date.split("T")[0],
      endDate: r.end_date.split("T")[0],
      total: parseFloat(r.total_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      contractNumber: r.contract_number,
      status: r.status,
    }));
  }

  async listByLessor(lessorId: string): Promise<Rental[]> {
    const response = await AxiosInstance.get<any[]>("rentals/", {
      params: { lessor: lessorId }
    });
    return response.data.map(r => ({
      id: r.id,
      postingId: r.postings,
      lesseeId: r.lessee,
      lessorId: lessorId,
      machineName: `${r.machine_brand || ""} ${r.machine_model || ""}`.trim() || "Maquinário",
      period: `${r.start_date.split("T")[0]} a ${r.end_date.split("T")[0]}`,
      startDate: r.start_date.split("T")[0],
      endDate: r.end_date.split("T")[0],
      total: parseFloat(r.total_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      contractNumber: r.contract_number,
      status: r.status,
    }));
  }

  async getRentalById(id: string): Promise<Rental | null> {
    const response = await AxiosInstance.get<any>(`rentals/${id}`);
    const r = response.data;
    return {
      id: r.id,
      postingId: r.postings,
      lesseeId: r.lessee,
      lessorId: "lessor-default",
      machineName: `${r.machine_brand || ""} ${r.machine_model || ""}`.trim() || "Maquinário",
      period: `${r.start_date.split("T")[0]} a ${r.end_date.split("T")[0]}`,
      startDate: r.start_date.split("T")[0],
      endDate: r.end_date.split("T")[0],
      total: parseFloat(r.total_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      contractNumber: r.contract_number,
      status: r.status,
    };
  }

  async getContractById(id: string): Promise<ContratoData | null> {
    const response = await AxiosInstance.get<ContratoData>(`contracts/${id}`);
    return response.data;
  }

  async signContract(id: string, role: "locador" | "locatario", signatureName: string): Promise<Rental | null> {
    await AxiosInstance.post(`contracts/${id}/sign`, {
      role,
      name: signatureName
    });
    return this.getRentalById(id);
  }
}

export const contractService = new ContractService();
