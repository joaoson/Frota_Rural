/** "" quando o documento cadastrado não permite identificar CPF ou CNPJ. */
export type TipoDocumento = "CPF" | "CNPJ" | "";

export interface ParteContrato {
  razao_social: string;
  tipo_documento: TipoDocumento;
  documento: string;
  endereco_completo: string;
  representante_nome: string;
  representante_cpf: string;
  representante_estado_civil: string;
}

/** Evidência de um aceite, tal como gravada no registro imutável do servidor. */
export interface AssinaturaEvidencia {
  papel: "locador" | "locatario";
  nome: string;
  email: string;
  /** Timestamp UTC gerado pelo servidor no momento do aceite. */
  assinado_em_utc: string;
  /** SHA-256 do documento exato que foi aceito. */
  hash_documento: string;
  algoritmo_hash: string;
  versao_documento: string;
  ip: string;
  otp_verificado: boolean;
  /** Hash que encadeia este registro ao anterior, tornando adulteração detectável. */
  hash_registro: string;
}

/** Bloco de uma cláusula. `**trecho**` no texto vira negrito. */
export type BlocoClausula =
  | { tipo: "itens"; itens: { num: string; texto: string }[] }
  | { tipo: "tabela"; linhas: [string, string][] }
  | { tipo: "cartoes"; estilo: "prazo" | "valor"; itens: { rotulo: string; valor: string; destaque: boolean }[] }
  | { tipo: "responsabilidades"; linhas: { situacao: string; responsavel: string; parte: "locador" | "locatario" | "nenhuma" }[] }
  | { tipo: "aviso"; titulo: string; texto: string }
  | { tipo: "multas"; itens: { rotulo: string; texto: string; tom: "ok" | "aviso" }[] };

/** Cláusula do documento 2.0.0: o texto vem do servidor e entra no hash do aceite. */
export interface Clausula {
  numero: string;
  titulo: string;
  pagina: number;
  blocos: BlocoClausula[];
  /** "obrigacoes" e "lado_a_lado" agrupam cláusulas vizinhas em colunas. */
  layout?: "obrigacoes" | "lado_a_lado";
  parte?: "locador" | "locatario";
}

/** Versão congelada no pagamento: é ela que as duas partes assinam. */
export interface RevisaoContrato {
  id: string;
  numero: number;
  hash: string;
  criada_em_utc: string;
}

/** Valor total para exibir, nas duas versões do documento. */
export function valorTotalContrato(contrato: ContratoData["contrato"]): string {
  return contrato.valor_total ?? contrato.valor_total_estimado ?? "";
}

export interface ContratoData {
  prazo_assinatura?: string | null;
  gestao?: { allowed_actions: string[]; start_date: string; end_date: string };
  /** Documento 2.0.0; ausente nos contratos legados (1.0.0). */
  titulo?: string;
  contrato: {
    numero: string;
    versao_documento: string;
    data_geracao: string;
    data_inicio: string;
    data_fim: string;
    prazo_dias: number;
    valor_unitario: string;
    valor_locacao: string;
    valor_taxa_plataforma: string;
    percentual_taxa_plataforma: string;
    /** 2.0.0: preço por diária fixa (tarifa × 8 h). */
    horas_por_diaria?: number;
    valor_diaria?: string;
    diarias?: number;
    valor_total?: string;
    /** Legado 1.0.0. */
    estimativa_horas?: number;
    valor_total_estimado?: string;
  };
  operacao: {
    codigo: string;
  };
  locador: ParteContrato & {
    endereco_equipamento: string;
  };
  locatario: ParteContrato & {
    municipio: string;
    uf: string;
    local_servico: string;
  };
  equipamento: {
    tipo: string;
    marca: string;
    modelo: string;
    ano: number | null;
    renagro: string;
    valor_estimado: string;
  };
  anuncio: {
    tipo_servico: string;
    finalidade_uso: string;
  };
  preambulo?: string;
  clausulas?: Clausula[];
  declaracao_assinatura?: string;
  /** Nula enquanto o contrato não foi pago (prévia) e nos contratos legados. */
  revisao: RevisaoContrato | null;
  legado: boolean;
  previa: boolean;
  assinatura: {
    data_locador: string;
    data_locatario: string;
  };
  evidencia?: {
    /** Hash do documento como ele está agora — deve bater com o de cada assinatura. */
    hash_documento_atual: string;
    algoritmo_hash: string;
    assinaturas: AssinaturaEvidencia[];
  };
}
