import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import {
  certificationFormSchema,
  type CertificationFormValues,
  cnhFormSchema,
  type CnhFormValues,
} from "../types/documentSchemas";

export const CNH_FORM_DEFAULTS: CnhFormValues = {
  name: "",
  birthDate: "",
  cpf: "",
  rg: "",
  motherName: "",
  fatherName: "",
  nationality: "Brasileiro(a)",
  birthCity: "",
  birthState: "",
  cnhNumber: "",
  category: "",
  firstLicenseDate: "",
  issueDate: "",
  expirationDate: "",
  issuingState: "",
  issuingAuthority: "",
  situation: "",
  acc: false,
  ear: false,
  medicalRestrictions: "",
  observations: "",
  points: "0",
};

export function useCnhForm(defaults?: Partial<CnhFormValues>): UseFormReturn<CnhFormValues> {
  return useForm<CnhFormValues>({
    resolver: zodResolver(cnhFormSchema),
    defaultValues: { ...CNH_FORM_DEFAULTS, ...defaults },
    mode: "onBlur",
  });
}

export const CERTIFICATION_FORM_DEFAULTS: CertificationFormValues = {
  issuingOrganization: "",
  title: "",
  issueDate: "",
  expirationDate: "",
  credentialCode: "",
  description: "",
};

export function useCertificationForm(
  defaults?: Partial<CertificationFormValues>,
): UseFormReturn<CertificationFormValues> {
  return useForm<CertificationFormValues>({
    resolver: zodResolver(certificationFormSchema),
    defaultValues: { ...CERTIFICATION_FORM_DEFAULTS, ...defaults },
    mode: "onBlur",
  });
}
