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

class OperatorDocumentService {
  private LICENSES_ENDPOINT = "operator-licenses/";
  private CERTIFICATIONS_ENDPOINT = "certifications/";

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
      throw new OperatorDocumentServiceError(
        OperatorDocumentError.ServerError,
      );
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
      throw new OperatorDocumentServiceError(
        OperatorDocumentError.ServerError,
      );
    }
  }

  async removeLicense(id: string): Promise<void> {
    await AxiosInstance.delete(`${this.LICENSES_ENDPOINT}${id}`);
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
      throw new OperatorDocumentServiceError(
        OperatorDocumentError.ServerError,
      );
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
      throw new OperatorDocumentServiceError(
        OperatorDocumentError.ServerError,
      );
    }
  }

  async removeCertification(id: string): Promise<void> {
    await AxiosInstance.delete(`${this.CERTIFICATIONS_ENDPOINT}${id}`);
  }
}

export const operatorDocumentService = new OperatorDocumentService();
