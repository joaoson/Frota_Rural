import type { HttpClient } from "@/shared/http/HttpClient";

import type { User } from "../types/user";
import { userApiSchema, userListApiSchema } from "../types/userSchemas";
import { type CreateUserPayload, toDomain } from "./userMapper";

/** `users/` tem barra final; `users/create` e `users/{id}` não têm. */
const COLLECTION_PATH = "users/";
const CREATE_PATH = "users/create";

export interface UpdateProfileInput {
  name?: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  cep?: string;
}

export interface UserRepository {
  list(): Promise<User[]>;
  findById(id: string): Promise<User>;
  create(payload: CreateUserPayload): Promise<User>;
  updateProfile(id: string, input: UpdateProfileInput): Promise<User>;
  changePassword(id: string, currentPassword: string, newPassword: string): Promise<void>;
}

export class HttpUserRepository implements UserRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(): Promise<User[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: COLLECTION_PATH });
    return userListApiSchema.parse(response.data).map(toDomain);
  }

  async findById(id: string): Promise<User> {
    const response = await this.http.send<unknown>({ method: "GET", path: `users/${id}` });
    return toDomain(userApiSchema.parse(response.data));
  }

  async create(payload: CreateUserPayload): Promise<User> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: CREATE_PATH,
      body: payload,
    });
    return toDomain(userApiSchema.parse(response.data));
  }

  /**
   * Só PATCH, de propósito.
   *
   * `PUT /api/users/{id}` exige `password` e o grava **sem hash**, quebrando o
   * login da conta em silêncio. Não expor o método é a forma de garantir que
   * ninguém o use por engano.
   */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<User> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `users/${id}`,
      body: input,
    });
    return toDomain(userApiSchema.parse(response.data));
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    await this.http.send<unknown>({
      method: "POST",
      path: `users/${id}/change-password`,
      body: { current_password: currentPassword, new_password: newPassword },
    });
  }
}
