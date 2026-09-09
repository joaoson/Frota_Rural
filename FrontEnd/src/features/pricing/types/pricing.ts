export type BreakdownItem = {
  chave: string;
  item: string;
  brl_hora: string;
};

export type PricingAssumptions = {
  categoria: string;
  idade_anos: number;
  horimetro: number;
  /** false = o horímetro foi estimado pela idade, não declarado pelo locador. */
  horimetro_declarado: boolean;
  potencia_cv: number | null;
  valor_mercado_usado_brl: number;
  valor_novo_equivalente_brl: number;
  horas_faturaveis_ano: number;
  horas_motor_ano: number;
  comparaveis_internos: number;
  tarifas_mercado_encontradas: number;
  inclui_combustivel: boolean;
  inclui_operador: boolean;
  custo_antes_da_ancoragem: string;
};

export type PricingSuggestion = {
  suggestion_id: string;
  /** Bruto do locador — o que ele recebe, por hora faturada. */
  sugerido_brl_hora: string;
  faixa_brl_hora: [string, string];
  custo_brl_hora: string;
  /** Já com a taxa da plataforma, que é somada por fora. */
  locatario_paga_brl_hora: string;
  equivalente_diaria_brl: string;
  composicao: BreakdownItem[];
  premissas: PricingAssumptions;
  fontes: { url: string; title?: string | null }[];
  search_suggestions_html?: string | null;
  confianca: "alta" | "media" | "baixa";
  origem: "pesquisa" | "cache" | "comparaveis";
  versao_parametros: string;
};

export type SuggestPricePayload = {
  machinery: string;
  includes_fuel?: boolean;
  includes_operator?: boolean;
};
