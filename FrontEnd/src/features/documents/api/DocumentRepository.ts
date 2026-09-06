import type { HttpClient } from "@/shared/http/HttpClient";

import type { Certification, CnhValidationResult, OperatorLicense } from "../types/document";
import {
  certificationApiSchema,
  certificationListApiSchema,
  cnhValidationApiSchema,
  operatorLicenseApiSchema,
  operatorLicenseListApiSchema,
  type ReviewDocumentPayload,
  uploadResponseSchema,
} from "../types/documentSchemas";
import { certificationToDomain, licenseToDomain, validationToDomain } from "./documentMapper";

const LICENSES_PATH = "operator-licenses/";
const CERTIFICATIONS_PATH = "certifications/";
const UPLOAD_PATH = "documents/upload/";
const VALIDATE_PATH = "operator-licenses/validate-document/";

export interface DocumentFilter {
  userId?: string;
  validationStatus?: string;
}

export interface DocumentRepository {
  listLicenses(filter?: DocumentFilter): Promise<OperatorLicense[]>;
  createLicense(payload: Record<string, unknown>): Promise<OperatorLicense>;
  updateLicense(id: string, payload: Record<string, unknown>): Promise<OperatorLicense>;
  removeLicense(id: string): Promise<void>;
  reviewLicense(id: string, payload: ReviewDocumentPayload): Promise<OperatorLicense>;

  listCertifications(filter?: DocumentFilter): Promise<Certification[]>;
  findCertificationById(id: string): Promise<Certification>;
  createCertification(payload: Record<string, unknown>): Promise<Certification>;
  updateCertification(id: string, payload: Record<string, unknown>): Promise<Certification>;
  removeCertification(id: string): Promise<void>;
  reviewCertification(id: string, payload: ReviewDocumentPayload): Promise<Certification>;

  uploadFile(file: File): Promise<string>;
  validateCnhFile(file: File): Promise<CnhValidationResult>;
}

export class HttpDocumentRepository implements DocumentRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  private filterQuery(filter: DocumentFilter) {
    return { user: filter.userId, validation_status: filter.validationStatus };
  }

  async listLicenses(filter: DocumentFilter = {}): Promise<OperatorLicense[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: LICENSES_PATH,
      query: this.filterQuery(filter),
    });
    return operatorLicenseListApiSchema.parse(response.data).map(licenseToDomain);
  }

  async createLicense(payload: Record<string, unknown>): Promise<OperatorLicense> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: LICENSES_PATH,
      body: payload,
    });
    return licenseToDomain(operatorLicenseApiSchema.parse(response.data));
  }

  // Qualquer PATCH reseta `validation_status` para `pending` no backend
  async updateLicense(id: string, payload: Record<string, unknown>): Promise<OperatorLicense> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `operator-licenses/${id}`,
      body: payload,
    });
    return licenseToDomain(operatorLicenseApiSchema.parse(response.data));
  }

  async removeLicense(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `operator-licenses/${id}` });
  }

  async reviewLicense(id: string, payload: ReviewDocumentPayload): Promise<OperatorLicense> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `operator-licenses/${id}/review`,
      body: payload,
    });
    return licenseToDomain(operatorLicenseApiSchema.parse(response.data));
  }

  async listCertifications(filter: DocumentFilter = {}): Promise<Certification[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: CERTIFICATIONS_PATH,
      query: this.filterQuery(filter),
    });
    return certificationListApiSchema.parse(response.data).map(certificationToDomain);
  }

  async findCertificationById(id: string): Promise<Certification> {
    const response = await this.http.send<unknown>({ method: "GET", path: `certifications/${id}` });
    return certificationToDomain(certificationApiSchema.parse(response.data));
  }

  async createCertification(payload: Record<string, unknown>): Promise<Certification> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: CERTIFICATIONS_PATH,
      body: payload,
    });
    return certificationToDomain(certificationApiSchema.parse(response.data));
  }

  async updateCertification(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<Certification> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `certifications/${id}`,
      body: payload,
    });
    return certificationToDomain(certificationApiSchema.parse(response.data));
  }

  async removeCertification(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `certifications/${id}` });
  }

  async reviewCertification(
    id: string,
    payload: ReviewDocumentPayload,
  ): Promise<Certification> {
    const response = await this.http.send<unknown>({
      method: "PATCH",
      path: `certifications/${id}/review`,
      body: payload,
    });
    return certificationToDomain(certificationApiSchema.parse(response.data));
  }

  async uploadFile(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const response = await this.http.send<unknown>({
      method: "POST",
      path: UPLOAD_PATH,
      body: form,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return uploadResponseSchema.parse(response.data).url;
  }

  async validateCnhFile(file: File): Promise<CnhValidationResult> {
    const form = new FormData();
    form.append("file", file);
    const response = await this.http.send<unknown>({
      method: "POST",
      path: VALIDATE_PATH,
      body: form,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return validationToDomain(cnhValidationApiSchema.parse(response.data));
  }
}
