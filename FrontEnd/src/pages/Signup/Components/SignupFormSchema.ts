import { z } from "zod";

export const signupFormSchema = z.object({
    name: z.string()
        .min(3, "O nome deve ter no mínimo 3 caracteres")
        .max(255, "O nome excedeu o limite de caracteres"),

    document: z.string()
        .min(11, "Documento muito curto")
        .max(18, "Documento muito longo") // Account for masking like 00.000.000/0001-00
        .transform((val) => val.replace(/\D/g, "")), // Remove mask before sending to DB,

    email: z.string()
        .email("E-mail inválido")
        .max(255),

    phone: z.string()
        .or(z.literal(''))
        .transform((val) => {
            if (!val) return val;
            const onlyNumbers = val.replace(/\D/g, "");
            return onlyNumbers.startsWith("55")
                ? `+${onlyNumbers}`
                : `+55${onlyNumbers}`;
        }),

    role: z.enum(["selecione", "locatario", "locador", "operador"], "Necessário selecionar um tipo de conta"),
    address: z.string().min(5, "Endereço obrigatório"),
    city: z.string().min(2, "Cidade obrigatória"),
    state: z.string().length(2, "Selecione o estado (UF)"),

    cep: z.string()
        .min(8, "CEP inválido")
        .transform((val) => val.replace(/\D/g, "")),

    password: z.string()
        .min(8, "A senha deve ter no mínimo 8 caracteres")
        .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula")
        .regex(/[0-9]/, "A senha deve conter pelo menos um número"),
});

export type SignupFormSchema = z.infer<typeof signupFormSchema>;