import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";
import type { CreateOperatorLicenseRequest } from "./models/CreateOperatorLicenseRequest";
import type { OperatorLicense } from "./models/OperatorLicense";
import type { CreateCertificationRequest } from "./models/CreateCertificationRequest";
import type { Certification } from "./models/Certification";
import {
  OperatorDocumentError,
  OperatorDocumentServiceError,
} from "./errors/OperatorDocumentError";
import type { CNHValidationResult } from "./models/CNHValidationResult";
import type { ReviewDocumentRequest } from "./models/ReviewDocumentRequest";

class OperatorDocumentService {
  private LICENSES_ENDPOINT = "operator-licenses/";
  private CERTIFICATIONS_ENDPOINT = "certifications/";
  private UPLOAD_ENDPOINT = "documents/upload/";

  async uploadDocument(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await AxiosInstance.post<{ url: string }>(
        this.UPLOAD_ENDPOINT,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data.url;
    } catch (error) {
      if (error instanceof AxiosError) {
        const msg = error.response?.data?.error;
        if (msg) throw new OperatorDocumentServiceError(msg);
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async validateCNHDocument(file: File): Promise<CNHValidationResult> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await AxiosInstance.post<CNHValidationResult>(
        `${this.LICENSES_ENDPOINT}validate-document/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) {
          throw new OperatorDocumentServiceError(
            error.response?.data?.error || OperatorDocumentError.InvalidData,
          );
        }
        if (status === 503) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.ModelUnavailable,
          );
        }
      }
      throw new OperatorDocumentServiceError(
        OperatorDocumentError.ValidationFailed,
      );
    }
  }

  async listLicenses(params?: {
    user?: string;
    validation_status?: string;
  }): Promise<OperatorLicense[]> {
    const response = await AxiosInstance.get<OperatorLicense[]>(
      this.LICENSES_ENDPOINT,
      { params },
    );
    return response.data;
  }

  async getLicenseById(id: string): Promise<OperatorLicense> {
    const response = await AxiosInstance.get<OperatorLicense>(
      `${this.LICENSES_ENDPOINT}${id}`,
    );
    return response.data;
  }

  async createLicense(
    data: CreateOperatorLicenseRequest,
  ): Promise<OperatorLicense> {
    try {
      const response = await AxiosInstance.post<OperatorLicense>(
        this.LICENSES_ENDPOINT,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.InvalidData,
          );
        }
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async updateLicense(
    id: string,
    data: Partial<CreateOperatorLicenseRequest>,
  ): Promise<OperatorLicense> {
    try {
      const response = await AxiosInstance.patch<OperatorLicense>(
        `${this.LICENSES_ENDPOINT}${id}`,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.InvalidData,
          );
        }
        if (status === 404) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.NotFound,
          );
        }
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async removeLicense(id: string): Promise<void> {
    await AxiosInstance.delete(`${this.LICENSES_ENDPOINT}${id}`);
  }

  async reviewLicense(
    id: string,
    data: ReviewDocumentRequest,
  ): Promise<OperatorLicense> {
    try {
      const response = await AxiosInstance.patch<OperatorLicense>(
        `${this.LICENSES_ENDPOINT}${id}/review`,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const msg = error.response?.data?.error;
        if (msg) throw new OperatorDocumentServiceError(msg);
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async listCertifications(params?: {
    user?: string;
    validation_status?: string;
  }): Promise<Certification[]> {
    const response = await AxiosInstance.get<Certification[]>(
      this.CERTIFICATIONS_ENDPOINT,
      { params },
    );
    return response.data;
  }

  async getCertificationById(id: string): Promise<Certification> {
    const response = await AxiosInstance.get<Certification>(
      `${this.CERTIFICATIONS_ENDPOINT}${id}`,
    );
    return response.data;
  }

  async createCertification(
    data: CreateCertificationRequest,
  ): Promise<Certification> {
    try {
      const response = await AxiosInstance.post<Certification>(
        this.CERTIFICATIONS_ENDPOINT,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.InvalidData,
          );
        }
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async updateCertification(
    id: string,
    data: Partial<CreateCertificationRequest>,
  ): Promise<Certification> {
    try {
      const response = await AxiosInstance.patch<Certification>(
        `${this.CERTIFICATIONS_ENDPOINT}${id}`,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.InvalidData,
          );
        }
        if (status === 404) {
          throw new OperatorDocumentServiceError(
            OperatorDocumentError.NotFound,
          );
        }
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }

  async removeCertification(id: string): Promise<void> {
    await AxiosInstance.delete(`${this.CERTIFICATIONS_ENDPOINT}${id}`);
  }

  async reviewCertification(
    id: string,
    data: ReviewDocumentRequest,
  ): Promise<Certification> {
    try {
      const response = await AxiosInstance.patch<Certification>(
        `${this.CERTIFICATIONS_ENDPOINT}${id}/review`,
        data,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const msg = error.response?.data?.error;
        if (msg) throw new OperatorDocumentServiceError(msg);
      }
      throw new OperatorDocumentServiceError(OperatorDocumentError.ServerError);
    }
  }
}

export const operatorDocumentService = new OperatorDocumentService();
