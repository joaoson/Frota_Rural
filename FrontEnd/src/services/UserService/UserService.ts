import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";
import type { CreateUserRequest } from "./models/CreateUserRequest";
import type { LoginUserRequest } from "./models/LoginUserRequest";
import type { User } from "./models/User";
import { UserError, UserServiceError } from "./errors/UserError";

class UserService {
  private SIGNUP_ENDPOINT = "users/create";
  private LIST_ENDPOINT = "users/";
  private LOGIN_ENDPOINT = "login";
  private VERIFY_ENDPOINT = "login/verify";

  async register(data: CreateUserRequest) {
    const response = await AxiosInstance.post(this.SIGNUP_ENDPOINT, data);
    return response.data;
  }

  async list(): Promise<User[]> {
    const response = await AxiosInstance.get<User[]>(this.LIST_ENDPOINT);
    return response.data;
  }

  async login(data: LoginUserRequest) {
    try {
      const response = await AxiosInstance.post(this.LOGIN_ENDPOINT, data);
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;

        if (status === 400 || status === 401 || status === 404) {
          throw new UserServiceError(UserError.InvalidCredentials);
        }
      }
      throw new UserServiceError(UserError.ServerError);
    }
  }

  async verify(token: String) {
    try {
      await AxiosInstance.post(this.VERIFY_ENDPOINT, {
        token: token,
      });
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;

        if (status === 400 || status === 401 || status === 404) {
          throw new UserServiceError(UserError.AuthError);
        }
      }
      throw new UserServiceError(UserError.ServerError);
    }
  }
}

export const userService = new UserService();
