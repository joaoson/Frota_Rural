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

/** Evidência gravada pelo servidor, no formato bruto da trilha de auditoria. */
export interface SignatureEvidenceRecord {
  id: string;
  contract: string;
  role: "locador" | "locatario";
  signer: string | null;
  signer_name: string;
  signer_email: string;
  document_version: string;
  document_hash: string;
  hash_algorithm: string;
  signed_at: string;
  ip_address: string;
  user_agent: string;
  otp_verified: boolean;
  previous_hash: string;
  record_hash: string;
}

export interface SignatureReceipt {
  rental: Rental | null;
  evidence: SignatureEvidenceRecord | null;
}

export interface ContractEvidence {
  contrato_id: string;
  aluguel_id: string;
  status: string;
  documento: { versao: string; hash: string; algoritmo: string };
  /** false quando algum registro foi alterado ou o encadeamento não fecha. */
  cadeia_integra: boolean;
  inconsistencias: string[];
  assinaturas: SignatureEvidenceRecord[];
  fundamento_legal: string;
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

  async requestSignatureOtp(id: string, role: "locador" | "locatario"): Promise<{ sentTo: string; expiresInSeconds: number }> {
    const response = await AxiosInstance.post(`contracts/${id}/otp`, { role });
    return {
      sentTo: response.data.sent_to,
      expiresInSeconds: response.data.expires_in_seconds,
    };
  }

  /**
   * Registra o aceite. O servidor grava a evidência (hash SHA-256 do documento
   * aceito, timestamp UTC, IP, User-Agent e signatário) em log imutável — nada
   * disso é enviado pelo cliente, justamente para ter valor probatório.
   */
  async signContract(
    id: string,
    role: "locador" | "locatario",
    signatureName: string,
    otp?: string,
  ): Promise<SignatureReceipt> {
    const response = await AxiosInstance.post(`contracts/${id}/sign`, {
      role,
      name: signatureName,
      ...(otp ? { otp } : {}),
    });
    return {
      rental: await this.getRentalById(id),
      evidence: response.data?.signature_evidence ?? null,
    };
  }

  /** Trilha de auditoria completa do aceite, com a conferência do encadeamento. */
  async getContractEvidence(id: string): Promise<ContractEvidence> {
    const response = await AxiosInstance.get<ContractEvidence>(`contracts/${id}/evidence`);
    return response.data;
  }
}

export const contractService = new ContractService();
