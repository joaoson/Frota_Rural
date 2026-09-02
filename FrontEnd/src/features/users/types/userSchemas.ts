import { z } from "zod";

import { passwordSchema } from "@/features/auth/types/authSchemas";
import { validateCNPJ } from "@/shared/utils/validation/validateCNPJ";
import { validateCPF } from "@/shared/utils/validation/validateCPF";

export const UserRole = {
  Locador: "locador",
  Locatario: "locatario",
  Operador: "operador",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;

export const documentSchema = z
  .string()
  .trim()
  .min(1, "Documento é obrigatório.")
  .superRefine((value, ctx) => {
    const digits = value.replace(/\D/g, "");

    if (digits.length !== CPF_LENGTH && digits.length !== CNPJ_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: "Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos).",
      });
      return;
    }

    const isValid = digits.length === CPF_LENGTH ? validateCPF(digits) : validateCNPJ(digits);
    if (!isValid) {
      ctx.addIssue({
        code: "custom",
        message:
          digits.length === CNPJ_LENGTH
            ? "CNPJ inválido. Verifique os dígitos informados."
            : "CPF inválido. Verifique os dígitos informados.",
      });
    }
  });

export function maxBirthDate(today: Date = new Date()): string {
  const limit = new Date(today);
  limit.setFullYear(limit.getFullYear() - 18);
  return limit.toISOString().split("T")[0];
}

export const signupFormSchema = z.object({
  role: z.enum([UserRole.Locador, UserRole.Locatario, UserRole.Operador]),
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .min(3, "Nome deve ter no mínimo 3 caracteres.")
    .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Nome deve conter apenas letras."),
  birthDate: z
    .string()
    .min(1, "Data de nascimento é obrigatória.")
    .refine((value) => value >= "1900-01-01", "Data inválida.")
    .refine(
      (value) => value <= maxBirthDate(),
      "É necessário ter 18 anos ou mais para se cadastrar.",
    ),
  document: documentSchema,
  email: z.string().trim().min(1, "E-mail é obrigatório.").email("E-mail inválido."),
  phone: z
    .string()
    .trim()
    .min(1, "Telefone é obrigatório.")
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length === 10 || digits.length === 11;
    }, "Telefone deve ter 10 ou 11 dígitos."),
  cep: z
    .string()
    .trim()
    .min(1, "CEP é obrigatório.")
    .refine((value) => value.replace(/\D/g, "").length === 8, "CEP deve ter exatamente 8 dígitos."),
  address: z
    .string()
    .trim()
    .min(1, "Endereço é obrigatório.")
    .min(5, "Endereço deve ter pelo menos 5 caracteres."),
  city: z
    .string()
    .trim()
    .min(1, "Cidade é obrigatória.")
    .min(2, "Cidade deve ter pelo menos 2 caracteres."),
  state: z.string().min(1, "Selecione o estado."),
  password: passwordSchema,
});
export type SignupFormValues = z.infer<typeof signupFormSchema>;

export const userApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  role: z.string(),
  address: z.string(),
  cep: z.string().nullish(),
  birth_date: z.string(),
  status: z.string().nullish(),
  last_login: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type UserApi = z.infer<typeof userApiSchema>;
export const userListApiSchema = z.array(userApiSchema);
