import { AxiosInstance } from "@/services/AxiosInstance";

type MachineApi = {
  id: string;
};

export type CreatePostingPayload = {
  machinery: string;
  hourly_rate: number;
  location_lat?: number;
  location_lng?: number;
  location_address?: string;
  availability_start?: string;
  availability_end?: string;
  description?: string;
  status?: string;
};

class PostingService {
  private POSTINGS_ENDPOINT = "postings/";
  private MACHINES_ENDPOINT = "machines/";

  async getRandomMachineryId(): Promise<string | null> {
    const response = await AxiosInstance.get<MachineApi[]>(this.MACHINES_ENDPOINT);
    const machines = response.data;
    if (!machines.length) return null;

    const randomIndex = Math.floor(Math.random() * machines.length);
    return machines[randomIndex].id;
  }

  async create(data: CreatePostingPayload) {
    const response = await AxiosInstance.post(this.POSTINGS_ENDPOINT, data);
    return response.data;
  }

  async list(filters?: { machinery?: string; status?: string }) {
    const response = await AxiosInstance.get(this.POSTINGS_ENDPOINT, {
      params: filters,
    });
    return response.data;
  }

  async getById(id: string) {
    const response = await AxiosInstance.get(`${this.POSTINGS_ENDPOINT}${id}`);
    return response.data;
  }

  async update(id: string, data: Partial<CreatePostingPayload>) {
    const response = await AxiosInstance.patch(`${this.POSTINGS_ENDPOINT}${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await AxiosInstance.delete(`${this.POSTINGS_ENDPOINT}${id}`);
    return response.data;
  }
}

export const postingService = new PostingService();
