import { AxiosInstance } from "@/services/AxiosInstance";
import type { Operator } from "./models/Operator";
import type { CreateOperatorRequest } from "./models/CreateOperatorRequest";
import type { UpdateOperatorRequest } from "./models/UpdateOperatorRequest";

/**
 * Equipe de operadores do usuário autenticado. O servidor deriva o dono da
 * equipe do token — nenhum endpoint aqui aceita o id do empregador.
 */
class OperatorService {
  private ENDPOINT = "users/operators";

  async list(): Promise<Operator[]> {
    const response = await AxiosInstance.get<Operator[]>(this.ENDPOINT);
    return response.data;
  }

  async create(data: CreateOperatorRequest): Promise<Operator> {
    const response = await AxiosInstance.post<Operator>(this.ENDPOINT, data);
    return response.data;
  }

  async update(id: string, data: UpdateOperatorRequest): Promise<Operator> {
    const response = await AxiosInstance.patch<Operator>(
      `${this.ENDPOINT}/${id}`,
      data,
    );
    return response.data;
  }

  /** Desvincula da equipe; a conta do operador continua existindo. */
  async unlink(id: string): Promise<void> {
    await AxiosInstance.delete(`${this.ENDPOINT}/${id}`);
  }
}

export const operatorService = new OperatorService();
