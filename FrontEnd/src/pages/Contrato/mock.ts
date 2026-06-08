import type { ContratoData } from "./types";

export const mockContrato: ContratoData = {
  contrato: {
    numero: "CT-2026-000123",
    data_geracao: "17/05/2026",
    data_inicio: "20/05/2026",
    data_fim: "25/05/2026",
    prazo_dias: 5,
    valor_unitario: "180,00",
    estimativa_horas: 40,
    valor_total_estimado: "7.200,00",
  },
  operacao: {
    codigo: "OP-78912",
  },
  locador: {
    razao_social: "Agropecuária Vale Verde Ltda",
    tipo_documento: "CNPJ",
    documento: "12.345.678/0001-90",
    endereco_completo: "Rod. PR-151, km 28 — Ponta Grossa/PR",
    representante_nome: "João Carlos da Silva",
    representante_cpf: "123.456.789-00",
    representante_estado_civil: "Casado",
    endereco_equipamento: "Sítio Boa Vista, Rod. PR-151, km 28 — Ponta Grossa/PR",
  },
  locatario: {
    razao_social: "Fazenda Santa Clara",
    tipo_documento: "CPF",
    documento: "987.654.321-00",
    endereco_completo: "Estrada Rural Linha São Pedro, s/n — Castro/PR",
    representante_nome: "Maria Aparecida Souza",
    representante_cpf: "987.654.321-00",
    representante_estado_civil: "Solteira",
    municipio: "Castro",
    uf: "PR",
    local_servico: "Estrada Rural Linha São Pedro, s/n — Castro/PR",
  },
  equipamento: {
    tipo: "Trator agrícola",
    marca: "John Deere",
    modelo: "6135J",
    ano: 2021,
    renagro: "RNG-456789",
    valor_estimado: "420.000,00",
  },
  anuncio: {
    tipo_servico: "Preparo de solo",
    finalidade_uso: "Plantio de soja",
  },
  assinatura: {
    data_locador: "17/05/2026 às 14:32",
    data_locatario: "17/05/2026 às 16:15",
  },
};
