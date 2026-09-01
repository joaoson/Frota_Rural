import type { HttpClient } from "@/shared/http/HttpClient";

import type { Machine } from "../types/machine";
import {
  type CreateMachinePayload,
  machineApiSchema,
  machineListApiSchema,
} from "../types/machineSchemas";
import { toDomain } from "./machineMapper";

/**
 * A API é assimétrica quanto à barra final:
 *   coleção  → `machines/`   (obrigatória)
 *   detalhe  → `machines/id` (proibida)
 * Inverter qualquer uma das duas resulta em 404 ou num redirect que perde o corpo.
 */
const COLLECTION_PATH = "machines/";

export interface MachineFilter {
  ownerId?: string;
  status?: string;
  brand?: string;
  model?: string;
}

/** Porta declarada pelo consumidor. Devolve entidades, nunca DTOs. */
export interface MachineRepository {
  list(filter?: MachineFilter): Promise<Machine[]>;
  create(payload: CreateMachinePayload): Promise<Machine>;
  update(id: string, payload: Partial<CreateMachinePayload>): Promise<Machine>;
  remove(id: string): Promise<void>;
}

export class HttpMachineRepository implements MachineRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(filter: MachineFilter = {}): Promise<Machine[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: COLLECTION_PATH,
      query: {
        owner: filter.ownerId,
        status: filter.status,
        brand: filter.brand,
        model: filter.model,
      },
    });

    // Sem paginação no backend: a lista chega como array cru.
    return machineListApiSchema.parse(response.data).map(toDomain);
  }

  async create(payload: CreateMachinePayload): Promise<Machine> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: COLLECTION_PATH,
      body: payload,
    });

    return toDomain(machineApiSchema.parse(response.data));
  }

  /** Detalhe NÃO leva barra final — ver nota no topo. */
  async update(id: string, payload: Partial<CreateMachinePayload>): Promise<Machine> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `machines/${id}`,
      body: payload,
    });
    return toDomain(machineApiSchema.parse(response.data));
  }

  async remove(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `machines/${id}` });
  }
}
