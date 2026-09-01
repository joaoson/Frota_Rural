import { z } from "zod";

import { BRAND_KEYS, OTHER_BRAND } from "./brands";

const MIN_YEAR = 1980;
const RENAGRO_PATTERN = /^BR\d{10}$/i;

function maxYear(): number {
  return new Date().getFullYear() + 1;
}

/**
 * Resposta da API — Anti-Corruption Layer.
 *
 * Quase tudo é nullable porque o model do Django declara `blank=True,
 * null=True` em todos os campos exceto `id` e `owner`. Validar aqui transforma
 * o tipo numa garantia de runtime: hoje um `type` some na compilação e uma
 * mudança de campo no backend só aparece em produção.
 */
export const machineApiSchema = z.object({
  id: z.string(),
  owner: z.string(),
  renagro_number: z.string().nullish(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  year: z.number().nullish(),
  technical_specifications: z.string().nullish(),
  usage_purpose: z.string().nullish(),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type MachineApi = z.infer<typeof machineApiSchema>;

export const machineListApiSchema = z.array(machineApiSchema);

/**
 * Formulário. Os campos numéricos são string porque é isso que um `<input>`
 * entrega; a conversão acontece no mapper.
 *
 * O padrão `BR` + 10 dígitos é uma regra do front — o backend aceita qualquer
 * string de até 100 caracteres e só impõe unicidade.
 */
export const machineFormSchema = z
  .object({
    renagroNumber: z
      .string()
      .trim()
      .min(1, "Registro Renagro é obrigatório.")
      .regex(
        RENAGRO_PATTERN,
        "O registro Renagro deve conter BR seguido de exatamente 10 dígitos (ex: BR1029304899).",
      ),
    brandKey: z.enum(BRAND_KEYS),
    otherBrand: z.string().trim(),
    model: z.string().trim().min(1, "Modelo é obrigatório."),
    year: z
      .string()
      .trim()
      .refine((value) => {
        if (!value) return true;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= maxYear();
      }, `O ano deve ser entre ${MIN_YEAR} e ${maxYear()}.`),
    usagePurpose: z.string().trim().min(1, "Finalidade de uso é obrigatória."),
    initialHorimeter: z
      .string()
      .trim()
      .refine((value) => {
        if (!value) return true;
        const parsed = Number(value);
        return !Number.isNaN(parsed) && parsed >= 0;
      }, "O horímetro inicial deve ser um valor positivo."),
    technicalSpecifications: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.brandKey === OTHER_BRAND && values.otherBrand.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Marca é obrigatória.",
        path: ["otherBrand"],
      });
    }
  });

export type MachineFormValues = z.infer<typeof machineFormSchema>;

/** Corpo aceito por `POST /api/machines/`. Só `owner` é exigido pelo servidor. */
export interface CreateMachinePayload {
  owner: string;
  renagro_number?: string;
  brand?: string;
  model?: string;
  year?: number;
  technical_specifications?: string;
  usage_purpose?: string;
}

/**
 * Edição de equipamento pelo modal do dashboard.
 *
 * O modal tem contrato de props próprio (`EquipamentoData`, em português), mas
 * as REGRAS moram aqui — era a nona implementação independente de
 * `validateField` no projeto.
 */
export const machineEditFormSchema = z
  .object({
    registroRenagro: z
      .string()
      .trim()
      .min(1, "Registro Renagro é obrigatório.")
      .regex(
        RENAGRO_PATTERN,
        "O registro Renagro deve conter BR seguido de exatamente 10 dígitos (ex: BR1029304899).",
      ),
    marca: z.string().trim().min(1, "Marca é obrigatória."),
    modelo: z.string().trim().min(1, "Modelo é obrigatório."),
    anoFabricacao: z.string().trim().refine((value) => {
      if (!value) return true;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= maxYear();
    }, `O ano deve ser entre ${MIN_YEAR} e ${maxYear()}.`),
    horimetroInicial: z.string().trim().refine((value) => {
      if (!value) return true;
      const parsed = Number(value);
      return !Number.isNaN(parsed) && parsed >= 0;
    }, "O horímetro inicial deve ser positivo."),
    horimetroFinal: z.string().trim().refine((value) => {
      if (!value) return true;
      const parsed = Number(value);
      return !Number.isNaN(parsed) && parsed >= 0;
    }, "O horímetro final deve ser positivo."),
  })
  .superRefine((values, ctx) => {
    if (
      values.horimetroFinal &&
      values.horimetroInicial &&
      Number(values.horimetroFinal) <= Number(values.horimetroInicial)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "O horímetro final deve ser maior que o horímetro inicial.",
        path: ["horimetroFinal"],
      });
    }
  });

/** Valida e devolve os erros por campo, no formato que o modal já usa. */
export function validateMachineEdit(values: unknown): Record<string, string> {
  const result = machineEditFormSchema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
