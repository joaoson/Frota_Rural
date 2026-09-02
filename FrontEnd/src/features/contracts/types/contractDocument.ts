export type TipoDocumento = "CPF" | "CNPJ";

export interface ParteContrato {
  razao_social: string;
  tipo_documento: TipoDocumento;
  documento: string;
  endereco_completo: string;
  representante_nome: string;
  representante_cpf: string;
  representante_estado_civil: string;
}

export interface ContratoData {
  contrato: {
    numero: string;
    data_geracao: string;
    data_inicio: string;
    data_fim: string;
    prazo_dias: number;
    valor_unitario: string;
    estimativa_horas: number;
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
    ano: number;
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
}
