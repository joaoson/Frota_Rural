import { AxiosInstance } from "@/services/AxiosInstance";
import type { CreateUserRequest } from "./models/CreateUserRequest";

class UserService {
  private SIGNUP_ENDPOINT = "users/create";

  async register(data: CreateUserRequest) {
    const response = await AxiosInstance.post(this.SIGNUP_ENDPOINT, data);
    return response.data;
  }
}

export const userService = new UserService();
