import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import { signupFormSchema, type SignupFormValues, UserRole } from "../types/userSchemas";

export const SIGNUP_FORM_DEFAULTS: SignupFormValues = {
  role: UserRole.Locatario,
  name: "",
  birthDate: "",
  document: "",
  email: "",
  phone: "",
  cep: "",
  address: "",
  city: "",
  state: "",
  password: "",
};

export function useSignupForm(): UseFormReturn<SignupFormValues> {
  return useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: SIGNUP_FORM_DEFAULTS,
    mode: "onBlur",
  });
}
