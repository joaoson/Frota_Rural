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

class MachineService {
  private MACHINES_ENDPOINT = "machines/";
  private USERS_ENDPOINT = "users/";

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
}

export const machineService = new MachineService();
