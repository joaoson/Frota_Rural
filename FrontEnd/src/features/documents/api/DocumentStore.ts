import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { Certification, CnhValidationResult, OperatorLicense } from "../types/document";
import type { ReviewDocumentPayload } from "../types/documentSchemas";
import type { DocumentFilter, DocumentRepository } from "./DocumentRepository";

export const documentKeys = {
  all: ["documents"] as const,
  licenses: () => [...documentKeys.all, "licenses"] as const,
  licenseList: (filter: DocumentFilter) => [...documentKeys.licenses(), filter] as const,
  certifications: () => [...documentKeys.all, "certifications"] as const,
  certificationList: (filter: DocumentFilter) =>
    [...documentKeys.certifications(), filter] as const,
  certificationDetail: (id: string) => [...documentKeys.certifications(), "detail", id] as const,
};

export class DocumentStore {
  private readonly repository: DocumentRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: DocumentRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  licenseListOptions(
    filter: DocumentFilter = {},
  ): UseQueryOptions<
    OperatorLicense[],
    Error,
    OperatorLicense[],
    ReturnType<typeof documentKeys.licenseList>
  > {
    return {
      queryKey: documentKeys.licenseList(filter),
      queryFn: () => this.repository.listLicenses(filter),
    };
  }

  certificationListOptions(
    filter: DocumentFilter = {},
  ): UseQueryOptions<
    Certification[],
    Error,
    Certification[],
    ReturnType<typeof documentKeys.certificationList>
  > {
    return {
      queryKey: documentKeys.certificationList(filter),
      queryFn: () => this.repository.listCertifications(filter),
    };
  }

  certificationDetailOptions(
    id: string,
  ): UseQueryOptions<
    Certification,
    Error,
    Certification,
    ReturnType<typeof documentKeys.certificationDetail>
  > {
    return {
      queryKey: documentKeys.certificationDetail(id),
      queryFn: () => this.repository.findCertificationById(id),
    };
  }

  createLicense(payload: Record<string, unknown>): Promise<OperatorLicense> {
    return this.repository.createLicense(payload);
  }

  updateLicense(id: string, payload: Record<string, unknown>): Promise<OperatorLicense> {
    return this.repository.updateLicense(id, payload);
  }

  removeLicense(id: string): Promise<void> {
    return this.repository.removeLicense(id);
  }

  reviewLicense(id: string, payload: ReviewDocumentPayload): Promise<OperatorLicense> {
    return this.repository.reviewLicense(id, payload);
  }

  createCertification(payload: Record<string, unknown>): Promise<Certification> {
    return this.repository.createCertification(payload);
  }

  updateCertification(id: string, payload: Record<string, unknown>): Promise<Certification> {
    return this.repository.updateCertification(id, payload);
  }

  removeCertification(id: string): Promise<void> {
    return this.repository.removeCertification(id);
  }

  reviewCertification(id: string, payload: ReviewDocumentPayload): Promise<Certification> {
    return this.repository.reviewCertification(id, payload);
  }

  uploadFile(file: File): Promise<string> {
    return this.repository.uploadFile(file);
  }

  validateCnhFile(file: File): Promise<CnhValidationResult> {
    return this.repository.validateCnhFile(file);
  }

  async invalidateLicenses(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: documentKeys.licenses() });
  }

  async invalidateCertifications(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: documentKeys.certifications() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: documentKeys.all });
  }
}
