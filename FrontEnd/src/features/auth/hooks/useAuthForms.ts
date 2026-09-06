import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
  loginFormSchema,
  type LoginFormValues,
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from "../types/authSchemas";

export function useLoginForm(): UseFormReturn<LoginFormValues> {
  return useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });
}

export function useForgotPasswordForm(): UseFormReturn<ForgotPasswordFormValues> {
  return useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });
}

export function useResetPasswordForm(): UseFormReturn<ResetPasswordFormValues> {
  return useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onBlur",
  });
}
