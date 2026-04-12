import { AxiosInstance } from "@/services/AxiosInstance";

export const UserRole = {
  Locador: "locador",
  Locatario: "locatario",
  Operador: "operador",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

class UserService {
  private SIGNUP_ENDPOINT = "users/create";

  async register(data: CreateUserRequest) {
    const response = await AxiosInstance.post(this.SIGNUP_ENDPOINT, data);
    return response.data;
  }
}

export type CreateUserRequest = {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  role: UserRole;
  address: string;
  city: string;
  state: string;
  cep: string;
  password: string;
};

export const userService = new UserService();
