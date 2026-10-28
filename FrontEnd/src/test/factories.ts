import { rentalToDomain } from "@/features/contracts/api/contractMapper";
import type { ContratoData } from "@/features/contracts/types/contractDocument";
import type { RentalApi } from "@/features/contracts/types/rentalSchemas";
import { toDomain as machineToDomain } from "@/features/machines/api/machineMapper";
import type { MachineApi } from "@/features/machines/types/machineSchemas";
import { detailToDomain, listItemToDomain } from "@/features/postings/api/postingMapper";
import type { PostingDetailApi, PostingListItemApi } from "@/features/postings/types/postingSchemas";
import { toDomain as userToDomain } from "@/features/users/api/userMapper";
import type { UserApi } from "@/features/users/types/userSchemas";

/**
 * Builders de dados de teste: partem de um DTO válido da API e passam pelos
 * mappers reais, para que cada teste declare só o que importa para ele.
 */
export const rentalDto = (overrides: Partial<RentalApi> = {}): RentalApi => ({
  id: "rental-a", postings: "posting-a", lessee: "tenant-a", lessor_id: "owner-a",
  lessee_name: "Maria Silva", lessor_name: "João Souza", machine_brand: "John Deere", machine_model: "S790",
  start_date: "2026-09-01T08:00:00Z", end_date: "2026-09-02T18:00:00Z", total_price: "2000", status: "pending",
  ...overrides,
});
export const buildRental = (overrides: Partial<RentalApi> = {}) => rentalToDomain(rentalDto(overrides));

export const postingListDto = (overrides: Partial<PostingListItemApi> = {}): PostingListItemApi => ({
  id: "posting-a", machinery: "machine-a", machine_brand: "John Deere", machine_model: "S790",
  machine_usage_purpose: "Colheita", machine_year: 2022, hourly_rate: "350.00", location_address: "Rio Verde, GO",
  availability_start: "2026-09-01", availability_end: "2026-12-31", description: "Colheitadeira revisada.",
  status: "active", primary_photo_url: null, ...overrides,
});
export const buildPostingListItem = (overrides: Partial<PostingListItemApi> = {}) => listItemToDomain(postingListDto(overrides));

export const postingDetailDto = (overrides: Partial<PostingDetailApi> = {}): PostingDetailApi => ({
  id: "posting-a", location_cep: "75900000", hourly_rate: "350.00", location_address: "Rio Verde, GO",
  location_lat: "-17.79", location_lng: "-50.92", availability_start: "2026-09-01", availability_end: "2026-12-31",
  max_reservation_days: 30, description: "Colheitadeira revisada.", status: "active", machine_brand: "John Deere",
  machine_model: "S790", machine_year: 2022, machine_usage_purpose: "Colheita", machine_technical_specifications: "Plataforma 35 pés",
  machine_renagro_number: "BR1029304899", photos: [], ...overrides,
});
export const buildPostingDetail = (overrides: Partial<PostingDetailApi> = {}) => detailToDomain(postingDetailDto(overrides));

export const machineDto = (overrides: Partial<MachineApi> = {}): MachineApi => ({
  id: "machine-a", owner: "owner-a", renagro_number: "BR1029304899", brand: "John Deere", model: "S790", year: 2022,
  power_cv: 400, hour_meter: 1200, technical_specifications: "Plataforma 35 pés", usage_purpose: "Colheita", status: "active",
  ...overrides,
});
export const buildMachine = (overrides: Partial<MachineApi> = {}) => machineToDomain(machineDto(overrides));

export const userDto = (overrides: Partial<UserApi> = {}): UserApi => ({
  id: "user-a", name: "Maria Silva", document: "52998224725", email: "maria@example.com", phone: "64999990000",
  profile_photo_url: null, role: "locatario", address: "Rua das Palmeiras, 100", city: "Rio Verde", state: "GO",
  cep: "75900000", birth_date: "1990-05-10", status: "active", ...overrides,
});
export const buildUser = (overrides: Partial<UserApi> = {}) => userToDomain(userDto(overrides));

/** Documento de contrato como `GET contracts/:id` devolve, já pago e com revisão congelada. */
export const contractDocument = (overrides: Partial<ContratoData> = {}): ContratoData => ({
  contrato: { numero: "FR-2026-0001", versao_documento: "2.0.0", data_geracao: "2026-10-01", data_inicio: "2026-10-10", data_fim: "2026-10-11",
    prazo_dias: 2, valor_unitario: "100.00", valor_locacao: "1600.00", valor_taxa_plataforma: "80.00", percentual_taxa_plataforma: "5", valor_total: "1680.00" },
  operacao: { codigo: "OP-1" },
  locador: { razao_social: "João Souza", tipo_documento: "CPF", documento: "111.222.333-44", endereco_completo: "Fazenda Boa Vista", representante_nome: "",
    representante_cpf: "", representante_estado_civil: "", endereco_equipamento: "Rio Verde, GO" },
  locatario: { razao_social: "Maria Silva", tipo_documento: "", documento: "52998224725", endereco_completo: "Rua A", representante_nome: "",
    representante_cpf: "", representante_estado_civil: "", municipio: "Rio Verde", uf: "GO", local_servico: "Fazenda Santa Rita" },
  equipamento: { tipo: "Colheitadeira", marca: "John Deere", modelo: "S790", ano: 2022, renagro: "BR1029304899", valor_estimado: "1500000" },
  anuncio: { tipo_servico: "Colheita", finalidade_uso: "Colheita" },
  revisao: { id: "rev-1", numero: 1, hash: "abc", criada_em_utc: "2026-10-01T10:00:00Z" },
  legado: false, previa: false,
  assinatura: { data_locador: "", data_locatario: "" },
  evidencia: { hash_documento_atual: "f".repeat(64), algoritmo_hash: "sha256", assinaturas: [] },
  ...overrides,
} as ContratoData);

/** Resposta de `POST pricing/suggest` com uma pesquisa de mercado bem-sucedida. */
export const pricingSuggestionDto = (overrides: Record<string, unknown> = {}) => ({
  suggestion_id: "suggestion-a", sugerido_brl_hora: "192.15", faixa_brl_hora: ["172.94", "211.37"], custo_brl_hora: "160.13",
  locatario_paga_brl_hora: "211.37", equivalente_diaria_brl: "1537.20",
  composicao: [{ chave: "capital", item: "Capital", brl_hora: "40.00" }],
  premissas: { categoria: "trator", idade_anos: 7, horimetro: 4900, horimetro_declarado: true, potencia_cv: 110, valor_mercado_usado_brl: 380000,
    valor_novo_equivalente_brl: 620000, horas_faturaveis_ano: 528, horas_motor_ano: 343, comparaveis_internos: 0, tarifas_mercado_encontradas: 0,
    inclui_combustivel: false, inclui_operador: false, custo_antes_da_ancoragem: "192.15" },
  fontes: [{ url: "https://example.com/tractor", title: "Trator" }], confianca: "alta", origem: "pesquisa", versao_parametros: "v1",
  ...overrides,
});
