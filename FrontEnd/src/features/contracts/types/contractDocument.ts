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

export interface ContratoData {
  contrato: {
    numero: string;
    versao_documento: string;
    data_geracao: string;
    data_inicio: string;
    data_fim: string;
    prazo_dias: number;
    valor_unitario: string;
    estimativa_horas: number;
    valor_locacao: string;
    valor_taxa_plataforma: string;
    percentual_taxa_plataforma: string;
    valor_total_estimado: string;
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
