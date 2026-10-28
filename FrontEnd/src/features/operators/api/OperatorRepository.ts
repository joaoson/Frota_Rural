import type { HttpClient } from "@/shared/http/HttpClient";

import type { Operator } from "../types/operator";
import { operatorApiSchema, operatorListApiSchema } from "../types/operatorSchemas";
import { toDomain, type OperatorPayload } from "./operatorMapper";

// Sem barra final. O servidor deriva o dono da equipe do token: nenhum endpoint
// daqui aceita o id do empregador.
const COLLECTION = "users/operators";

export interface OperatorRepository {
  list(): Promise<Operator[]>;
  create(payload: OperatorPayload): Promise<Operator>;
  update(id: string, payload: Partial<OperatorPayload>): Promise<Operator>;
  unlink(id: string): Promise<void>;
}

export class HttpOperatorRepository implements OperatorRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(): Promise<Operator[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: COLLECTION });
    return operatorListApiSchema.parse(response.data).map(toDomain);
  }

  async create(payload: OperatorPayload): Promise<Operator> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: COLLECTION,
      body: payload,
    });
    return toDomain(operatorApiSchema.parse(response.data));
  }

  async update(id: string, payload: Partial<OperatorPayload>): Promise<Operator> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `${COLLECTION}/${id}`,
      body: payload,
    });
    return toDomain(operatorApiSchema.parse(response.data));
  }

  /** Desvincula da equipe; a conta do operador continua existindo. */
  async unlink(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `${COLLECTION}/${id}` });
  }
}
