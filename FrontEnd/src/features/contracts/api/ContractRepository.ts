import type { HttpClient } from "@/shared/http/HttpClient";

import type { ContratoData } from "../types/contractDocument";
import type { Contract, Rental } from "../types/rental";
import {
  contractApiSchema,
  type CreateRentalPayload,
  rentalApiSchema,
  rentalListApiSchema,
  type SignatureRole,
} from "../types/rentalSchemas";
import { contractToDomain, rentalToDomain } from "./contractMapper";

/** Coleções com barra final; detalhe e `{id}/sign` sem. */
const RENTALS_PATH = "rentals/";
const CONTRACTS_PATH = "contracts/";

export interface RentalFilter {
  lesseeId?: string;
  lessorId?: string;
}

export interface ContractRepository {
  listRentals(filter: RentalFilter): Promise<Rental[]>;
  findRentalById(id: string): Promise<Rental>;
  createRental(payload: CreateRentalPayload): Promise<Rental>;
  listContracts(): Promise<Contract[]>;
  /** Payload agregado montado à mão pelo backend — formato próprio. */
  findContractDocument(id: string): Promise<ContratoData>;
  sign(id: string, role: SignatureRole, name?: string): Promise<Contract>;
}

export class HttpContractRepository implements ContractRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async listRentals(filter: RentalFilter): Promise<Rental[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: RENTALS_PATH,
      query: { lessee: filter.lesseeId, lessor: filter.lessorId },
    });
    return rentalListApiSchema.parse(response.data).map(rentalToDomain);
  }

  async findRentalById(id: string): Promise<Rental> {
    const response = await this.http.send<unknown>({ method: "GET", path: `rentals/${id}` });
    return rentalToDomain(rentalApiSchema.parse(response.data));
  }

  /** Cria a locação. O backend cria o contrato como efeito colateral. */
  async createRental(payload: CreateRentalPayload): Promise<Rental> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: RENTALS_PATH,
      body: payload,
    });
    return rentalToDomain(rentalApiSchema.parse(response.data));
  }

  async listContracts(): Promise<Contract[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: CONTRACTS_PATH });
    return contractApiSchema.array().parse(response.data).map(contractToDomain);
  }

  /**
   * `GET /api/contracts/{id}` NÃO devolve o ContractSerializer: devolve um
   * documento agregado, montado à mão na view. E o `{id}` aceita tanto o id do
   * contrato quanto o da locação.
   */
  async findContractDocument(id: string): Promise<ContratoData> {
    const response = await this.http.send<ContratoData>({
      method: "GET",
      path: `contracts/${id}`,
    });
    return response.data;
  }

  async sign(id: string, role: SignatureRole, name?: string): Promise<Contract> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `contracts/${id}/sign`,
      body: { role, name },
    });
    return contractToDomain(contractApiSchema.parse(response.data));
  }
}
