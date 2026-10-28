import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import {
  postingEditFormSchema,
  type PostingEditFormValues,
  postingFormSchema,
  type PostingFormValues,
} from "../types/postingSchemas";

export const POSTING_FORM_DEFAULTS: PostingFormValues = {
  machinery: "",
  hourlyRate: "",
  cep: "",
  locationAddress: "",
  availabilityStart: "",
  availabilityEnd: "",
  description: "",
};

export function usePostingForm(
  defaults?: Partial<PostingFormValues>,
): UseFormReturn<PostingFormValues> {
  return useForm<PostingFormValues>({
    resolver: zodResolver(postingFormSchema),
    defaultValues: { ...POSTING_FORM_DEFAULTS, ...defaults },
    mode: "onBlur",
  });
}

export function usePostingEditForm(
  defaults?: Partial<PostingEditFormValues>,
): UseFormReturn<PostingEditFormValues> {
  return useForm<PostingEditFormValues>({
    resolver: zodResolver(postingEditFormSchema),
    defaultValues: {
      status: "active",
      hourlyRate: "",
      cep: "",
      locationAddress: "",
      availabilityStart: "",
      availabilityEnd: "",
      description: "",
      ...defaults,
    },
    mode: "onBlur",
  });
}
