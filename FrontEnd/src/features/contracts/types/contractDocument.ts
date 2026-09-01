/**
 * Documento de contrato renderizado pela página `/contrato/:id`.
 *
 * Veio de `pages/Contrato/types.ts`. Estava lá por acidente: o `ContractService`
 * importava um tipo de dentro de uma pasta de página, invertendo a dependência —
 * infraestrutura passando a depender da camada de apresentação.
 *
 * O formato é ditado pelo backend, que monta o payload à mão em
 * `api/views.py:contract_detail`. Todos os valores monetários chegam como string
 * já formatada em pt-BR ("8.500,00"), nunca como número.
 */

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
