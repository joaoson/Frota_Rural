import { z } from "zod";

import type { HttpClient } from "./HttpClient";
import { HttpError } from "./errors";

// Gateway para o ViaCEP (API pública)
export const viaCepSchema = z.object({
  cep: z.string(),
  logradouro: z.string(),
  complemento: z.string().optional(),
  bairro: z.string(),
  localidade: z.string(),
  uf: z.string(),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

export type ViaCepResponse = z.infer<typeof viaCepSchema>;

export interface Address {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

export const CEP_LENGTH = 8;

export class CepNotFound extends HttpError {
  constructor(cep: string) {
    super("cep_not_found", "CEP não encontrado.", 404);
    this.cep = cep;
  }
  readonly cep: string;
}

export class ViaCepClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async findByCep(rawCep: string): Promise<Address> {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== CEP_LENGTH) throw new CepNotFound(cep);

    const response = await this.http.send<unknown>({
      method: "GET",
      path: `${cep}/json/`,
    });

    const data = viaCepSchema.parse(response.data);
    if (data.erro) throw new CepNotFound(cep);

    return {
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
      cep: data.cep,
    };
  }
}
