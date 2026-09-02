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
