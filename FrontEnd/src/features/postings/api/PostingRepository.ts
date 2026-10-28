import type { HttpClient } from "@/shared/http/HttpClient";
import { machineRecommendationsApiSchema, type MachineNeeds, type MachineRecommendations } from "../types/recommendation";

import type {
  PostingDetail,
  PostingListItem,
  UploadedPhoto,
  UploadPhotosResult,
} from "../types/posting";
import {
  postingDetailApiSchema,
  postingListApiSchema,
  postingWriteApiSchema,
  type PostingWritePayload,
  uploadedPhotoApiSchema,
} from "../types/postingSchemas";
import { detailToDomain, listItemToDomain, uploadedPhotoToDomain } from "./postingMapper";

const COLLECTION_PATH = "postings";

export interface PostingFilter {
  ownerId?: string;
  machineryId?: string;
  status?: string;
  availableFrom?: string;
  availableUntil?: string;
}

export interface PostingRepository {
  recommend(needs: MachineNeeds): Promise<MachineRecommendations>;
  list(filter?: PostingFilter): Promise<PostingListItem[]>;
  findById(id: string): Promise<PostingDetail>;
  create(payload: PostingWritePayload): Promise<string>;
  update(id: string, payload: PostingWritePayload): Promise<void>;
  remove(id: string): Promise<void>;
  uploadPhotos(postingId: string, files: File[]): Promise<UploadPhotosResult>;
}

export class HttpPostingRepository implements PostingRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async recommend(needs: MachineNeeds): Promise<MachineRecommendations> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `${COLLECTION_PATH}/recommendations`,
      body: {
        application: needs.application,
        soil: needs.soil,
        state: needs.state,
        start_date: needs.startDate,
        end_date: needs.endDate,
      },
    });
    const dto = machineRecommendationsApiSchema.parse(response.data);
    return {
      results: dto.results.map((item) => ({ posting: listItemToDomain(item.posting), reasons: item.reasons, soilMentioned: item.soil_mentioned })),
      total: dto.total,
      datesChecked: dto.dates_checked,
      matchType: dto.match_type,
      aiUnavailable: dto.ai_unavailable,
    };
  }

  async list(filter: PostingFilter = {}): Promise<PostingListItem[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: COLLECTION_PATH,
      query: {
        owner: filter.ownerId,
        machinery: filter.machineryId,
        status: filter.status,
        available_from: filter.availableFrom,
        available_until: filter.availableUntil,
      },
    });
    return postingListApiSchema.parse(response.data).map(listItemToDomain);
  }

  async findById(id: string): Promise<PostingDetail> {
    const response = await this.http.send<unknown>({ method: "GET", path: `postings/${id}` });
    return detailToDomain(postingDetailApiSchema.parse(response.data));
  }

  async create(payload: PostingWritePayload): Promise<string> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: COLLECTION_PATH,
      body: payload,
    });
    return postingWriteApiSchema.parse(response.data).id;
  }

  async update(id: string, payload: PostingWritePayload): Promise<void> {
    await this.http.send<unknown>({ method: "PATCH", path: `postings/${id}`, body: payload });
  }

  async remove(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `postings/${id}` });
  }

  /**
   * Envia uma foto. `Content-Type: undefined` remove o header JSON da instância
   * para o axios calcular o boundary do multipart.
   */
  private async uploadPhoto(
    postingId: string,
    file: File,
    isPrimary: boolean,
  ): Promise<UploadedPhoto> {
    const form = new FormData();
    form.append("image", file);
    form.append("is_primary", String(isPrimary));

    const response = await this.http.send<unknown>({
      method: "POST",
      path: `${COLLECTION_PATH}/${postingId}/photos`,
      body: form,
      headers: { "Content-Type": undefined },
    });
    return uploadedPhotoToDomain(uploadedPhotoApiSchema.parse(response.data));
  }

  /**
   * A primeira foto vira a capa. Uma falha individual não aborta o resto: o
   * anúncio já foi criado, e perder uma foto não pode desfazê-lo.
   */
  async uploadPhotos(postingId: string, files: File[]): Promise<UploadPhotosResult> {
    const uploaded: UploadedPhoto[] = [];
    let failed = 0;

    for (const [index, file] of files.entries()) {
      try {
        uploaded.push(await this.uploadPhoto(postingId, file, index === 0));
      } catch {
        failed += 1;
      }
    }

    return { uploaded, failed };
  }

}
