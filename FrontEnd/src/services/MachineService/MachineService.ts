import { AxiosInstance } from "@/services/AxiosInstance";

type UserApi = {
  id: string;
};

type CreateMachinePayload = {
  owner: string;
  renagro_number: string;
  brand: string;
  model: string;
  year?: number;
  technical_specifications?: string;
  usage_purpose?: string;
};

export type MachineListItem = {
  id: string;
  owner: string;
  renagro_number: string;
  brand: string;
  model: string;
  year?: number | null;
  technical_specifications?: string | null;
  usage_purpose?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

class MachineService {
  private MACHINES_ENDPOINT = "machines/";
  private USERS_ENDPOINT = "users/";

  async list(params?: { owner?: string; status?: string; brand?: string; model?: string }) {
    const response = await AxiosInstance.get<MachineListItem[]>(this.MACHINES_ENDPOINT, { params });
    return response.data;
  }

  async getRandomOwnerId(): Promise<string | null> {
    const response = await AxiosInstance.get<UserApi[]>(this.USERS_ENDPOINT);
    const users = response.data;
    if (!users.length) return null;

    const randomIndex = Math.floor(Math.random() * users.length);
    return users[randomIndex].id;
  }

  async create(data: CreateMachinePayload) {
    const response = await AxiosInstance.post(this.MACHINES_ENDPOINT, data);
    return response.data;
  }

  async update(id: string, data: Partial<CreateMachinePayload>) {
    const response = await AxiosInstance.patch(`${this.MACHINES_ENDPOINT}${id}/`, data);
    return response.data;
  }

  async remove(id: string) {
    const response = await AxiosInstance.delete(`${this.MACHINES_ENDPOINT}${id}/`);
    return response.data;
  }
}

export const machineService = new MachineService();
