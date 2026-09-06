import { useMutation, useQuery } from "@tanstack/react-query";

import { documentStore } from "@/app/container";

import type { DocumentFilter } from "../api/DocumentRepository";
import type { Certification, CnhValidationResult, OperatorLicense } from "../types/document";
import type { ReviewDocumentPayload } from "../types/documentSchemas";

export function useOperatorLicenses(filter: DocumentFilter = {}, enabled = true) {
  return useQuery({ ...documentStore.licenseListOptions(filter), enabled });
}

export function useCertifications(filter: DocumentFilter = {}, enabled = true) {
  return useQuery({ ...documentStore.certificationListOptions(filter), enabled });
}

export function useCertification(id: string | null) {
  return useQuery({
    ...documentStore.certificationDetailOptions(id ?? ""),
    enabled: Boolean(id),
  });
}

export interface SaveLicenseInput {
  id?: string;
  payload: Record<string, unknown>;
}

export function useSaveLicense() {
  return useMutation<OperatorLicense, Error, SaveLicenseInput>({
    mutationFn: ({ id, payload }) =>
      id ? documentStore.updateLicense(id, payload) : documentStore.createLicense(payload),
    onSuccess: () => {
      void documentStore.invalidateLicenses();
    },
  });
}

export interface SaveCertificationInput {
  id?: string;
  payload: Record<string, unknown>;
}

export function useSaveCertification() {
  return useMutation<Certification, Error, SaveCertificationInput>({
    mutationFn: ({ id, payload }) =>
      id
        ? documentStore.updateCertification(id, payload)
        : documentStore.createCertification(payload),
    onSuccess: () => {
      void documentStore.invalidateCertifications();
    },
  });
}

export interface ReviewInput {
  id: string;
  kind: "license" | "certification";
  payload: ReviewDocumentPayload;
}

export function useReviewDocument() {
  return useMutation<OperatorLicense | Certification, Error, ReviewInput>({
    mutationFn: ({ id, kind, payload }) =>
      kind === "license"
        ? documentStore.reviewLicense(id, payload)
        : documentStore.reviewCertification(id, payload),
    onSuccess: (_result, { kind }) => {
      if (kind === "license") void documentStore.invalidateLicenses();
      else void documentStore.invalidateCertifications();
    },
  });
}

export function useUploadDocument() {
  return useMutation<string, Error, File>({
    mutationFn: (file) => documentStore.uploadFile(file),
  });
}

export function useValidateCnhFile() {
  return useMutation<CnhValidationResult, Error, File>({
    mutationFn: (file) => documentStore.validateCnhFile(file),
  });
}
