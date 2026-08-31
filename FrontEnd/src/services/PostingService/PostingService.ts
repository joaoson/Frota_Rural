import { AxiosInstance } from "@/services/AxiosInstance";

type MachineApi = {
  id: string;
};

export type PostingPhoto = {
  id: string;
  path: string;
  url: string;
  is_primary: boolean;
};

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
  location_lat?: number | null;
  location_lng?: number | null;
  /** CEP do local do maquinário. Pode ir com máscara: a API grava só os dígitos. */
  location_cep?: string;
  location_address?: string;
  availability_start?: string;
  availability_end?: string;
  /** Optional reservation duration limit; undefined means no limit. */
  max_reservation_days?: number | null;
  description?: string;
  status?: string;
};

/**
 * Coordenadas do anúncio no formato que a API aceita.
 *
 * Seis casas decimais (~10 cm) porque a coluna é `numeric(10,8)` e o DRF recusa
 * a gravação inteira quando o Nominatim devolve mais casas do que isso.
 * Sem coordenadas o valor vai como `null`: numa edição, omitir o campo deixaria
 * o ponto antigo apontando para o endereço novo.
 */
export function coordenadasDoAnuncio(
  coordenadas: { lat: number; lon: number } | null | undefined,
): Pick<CreatePostingPayload, "location_lat" | "location_lng"> {
  if (!coordenadas) return { location_lat: null, location_lng: null };
  return {
    location_lat: Number(coordenadas.lat.toFixed(6)),
    location_lng: Number(coordenadas.lon.toFixed(6)),
  };
}

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
