import { z } from "zod";

import { BRAZILIAN_STATES } from "@/shared/utils/brazilianStates";
import { validateDocument } from "@/shared/utils/validation/validateDocument";

export const operatorApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  address: z.string(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  cep: z.string().nullish(),
  birth_date: z.string(),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export const operatorListApiSchema = z.array(operatorApiSchema);
export type OperatorApi = z.infer<typeof operatorApiSchema>;

function maxBirthDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split("T")[0];
}

/**
 * Mesmas regras do cadastro público: os dois formulários pedem exatamente os
 * mesmos dados, e manter duas cópias garantiria que uma ficasse para trás.
 */
export const operatorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .min(3, "Nome deve ter no mínimo 3 caracteres.")
    .regex(/^[A-Za-zÀ-ÿ\s]+$/, "Nome deve conter apenas letras."),
  birthDate: z
    .string()
    .min(1, "Data de nascimento é obrigatória.")
    .refine((v) => v <= maxBirthDate(), "É necessário ter 18 anos ou mais para se cadastrar."),
  document: z.string().refine(validateDocument, "Informe um CPF ou CNPJ válido."),
  email: z.string().min(1, "E-mail é obrigatório.").email("E-mail inválido."),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório.")
    .refine((v) => [10, 11].includes(v.replace(/\D/g, "").length), "Telefone deve ter 10 ou 11 dígitos."),
  cep: z
    .string()
    .refine((v) => !v || v.replace(/\D/g, "").length === 8, "CEP deve ter 8 dígitos."),
  address: z
    .string()
    .trim()
    .min(1, "Endereço é obrigatório.")
    .min(5, "Endereço deve ter pelo menos 5 caracteres."),
  city: z.string().trim().min(1, "Cidade é obrigatória.").min(2, "Cidade deve ter pelo menos 2 caracteres."),
  state: z.enum(BRAZILIAN_STATES, { message: "Selecione o estado." }),
  password: z.string().optional(),
});
export type OperatorFormValues = z.infer<typeof operatorFormSchema>;
