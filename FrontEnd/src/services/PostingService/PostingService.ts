import { AxiosInstance } from "@/services/AxiosInstance";

type MachineApi = {
  id: string;
};

export type PostingPhoto = {
  id: string;
  /** Caminho do objeto no bucket, ex.: "postings/<id>/<uuid>.jpg". */
  path: string;
  /** URL pública de download, montada pelo backend a partir do caminho. */
  url: string;
  is_primary: boolean;
};

/** Resposta de POST /postings/ — só o id é consumido hoje. */
export type CreatedPosting = {
  id: string;
};

export type UploadPhotosResult = {
  uploaded: PostingPhoto[];
  failed: number;
};

export type CreatePostingPayload = {
  machinery: string;
  hourly_rate: number;
  location_lat?: number;
  location_lng?: number;
  location_address?: string;
  availability_start?: string;
  availability_end?: string;
  description?: string;
  status?: string;
};

class PostingService {
  private POSTINGS_ENDPOINT = "postings/";
  private MACHINES_ENDPOINT = "machines/";

  async getRandomMachineryId(): Promise<string | null> {
    const response = await AxiosInstance.get<MachineApi[]>(this.MACHINES_ENDPOINT);
    const machines = response.data;
    if (!machines.length) return null;

    const randomIndex = Math.floor(Math.random() * machines.length);
    return machines[randomIndex].id;
  }

  async create(data: CreatePostingPayload): Promise<CreatedPosting> {
    const response = await AxiosInstance.post<CreatedPosting>(this.POSTINGS_ENDPOINT, data);
    return response.data;
  }

  async list(filters?: { machinery?: string; status?: string; available_from?: string; available_until?: string }) {
    const response = await AxiosInstance.get(this.POSTINGS_ENDPOINT, {
      params: filters,
    });
    return response.data;
  }

  async getById(id: string) {
    const response = await AxiosInstance.get(`${this.POSTINGS_ENDPOINT}${id}`);
    return response.data;
  }

  async update(id: string, data: Partial<CreatePostingPayload>) {
    const response = await AxiosInstance.patch(`${this.POSTINGS_ENDPOINT}${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await AxiosInstance.delete(`${this.POSTINGS_ENDPOINT}${id}`);
    return response.data;
  }

  /**
   * Envia uma foto para o anúncio. O arquivo vai para o Firebase Storage pelo
   * backend; a API devolve o caminho salvo e a URL pública já montada.
   *
   * O Content-Type precisa ser anulado nesta requisição: a AxiosInstance define
   * "application/json" como padrão e esse padrão vence sobre o FormData, fazendo
   * o Django receber um corpo que não consegue parsear (request.FILES vazio →
   * 400 "Nenhum arquivo enviado."). Com o header removido, o próprio navegador
   * monta "multipart/form-data" com o boundary correto.
   */
  async uploadPhoto(
    postingId: string,
    file: File,
    isPrimary: boolean,
  ): Promise<PostingPhoto> {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("is_primary", String(isPrimary));
    const response = await AxiosInstance.post<PostingPhoto>(
      `${this.POSTINGS_ENDPOINT}${postingId}/photos/`,
      formData,
      { headers: { "Content-Type": undefined } },
    );
    return response.data;
  }

  /** Envia várias fotos em sequência. A primeira da lista vira a capa. */
  async uploadPhotos(postingId: string, files: File[]): Promise<UploadPhotosResult> {
    const uploaded: PostingPhoto[] = [];
    let failed = 0;

    for (const [index, file] of files.entries()) {
      try {
        uploaded.push(await this.uploadPhoto(postingId, file, index === 0));
      } catch (error) {
        console.error(`Falha ao enviar a foto "${file.name}"`, error);
        failed += 1;
      }
    }

    return { uploaded, failed };
  }
}

export const postingService = new PostingService();
