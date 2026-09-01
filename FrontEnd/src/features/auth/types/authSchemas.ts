import { z } from "zod";

import { passwordPattern } from "@/utils/regexPatterns";

/** Política de senha do produto. Hoje vive em utils e é aplicada de forma inconsistente. */
export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres.")
  .regex(passwordPattern.regex, passwordPattern.title);

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "E-mail é obrigatório.").email("Informe um e-mail válido."),
  password: z.string().min(1, "Senha é obrigatória."),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, "E-mail é obrigatório.").email("Informe um e-mail válido."),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmPassword) {
      ctx.addIssue({ code: "custom", message: "As senhas não coincidem.", path: ["confirmPassword"] });
    }
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

/** Resposta do login e do refresh — o backend devolve exatamente uma chave. */
export const accessTokenSchema = z.object({ access: z.string() });
export type AccessToken = z.infer<typeof accessTokenSchema>;
