import type { HttpClient } from "@/shared/http/HttpClient";

import type { PostingDetail, PostingListItem } from "../types/posting";
import {
  postingDetailApiSchema,
  postingListApiSchema,
  postingWriteApiSchema,
  type PostingWritePayload,
} from "../types/postingSchemas";
import { detailToDomain, listItemToDomain } from "./postingMapper";

/** Coleção e fotos levam barra final; detalhe não leva. */
const COLLECTION_PATH = "postings/";

export interface PostingFilter {
  machineryId?: string;
  status?: string;
  availableFrom?: string;
  availableUntil?: string;
}

export interface PostingRepository {
  list(filter?: PostingFilter): Promise<PostingListItem[]>;
  findById(id: string): Promise<PostingDetail>;
  create(payload: PostingWritePayload): Promise<string>;
  update(id: string, payload: PostingWritePayload): Promise<void>;
  remove(id: string): Promise<void>;
}

export class HttpPostingRepository implements PostingRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(filter: PostingFilter = {}): Promise<PostingListItem[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: COLLECTION_PATH,
      query: {
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

  /** Devolve só o id: a resposta de escrita tem formato diferente do detalhe. */
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

}
