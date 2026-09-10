import type { PricingSuggestion } from '../../src/features/pricing/types/pricing';

export const suggestion = {
  suggestion_id: '00000000-0000-4000-8000-000000000001',
  sugerido_brl_hora: '192.15', faixa_brl_hora: ['172.94', '211.37'],
  custo_brl_hora: '160.13', locatario_paga_brl_hora: '201.76', equivalente_diaria_brl: '1537.20',
  composicao: [{ chave: 'capital', item: 'Custo de capital', brl_hora: '40.00' }],
  premissas: {
    categoria: 'trator', idade_anos: 7, horimetro: 3000, horimetro_declarado: true,
    potencia_cv: 110, valor_mercado_usado_brl: 380000, valor_novo_equivalente_brl: 620000,
    horas_faturaveis_ano: 528, horas_motor_ano: 343, comparaveis_internos: 0,
    tarifas_mercado_encontradas: 0, inclui_combustivel: false, inclui_operador: false,
    custo_antes_da_ancoragem: '192.15',
  },
  fontes: [{ url: 'https://example.test/mercado-trator', title: 'Fonte de mercado de teste' }],
  confianca: 'media', origem: 'pesquisa', versao_parametros: 'e2e',
} satisfies PricingSuggestion;

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
