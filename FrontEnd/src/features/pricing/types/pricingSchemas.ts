import { z } from "zod";
import type { PricingSuggestion } from "./pricing";

const money = z.string().refine((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);
const breakdownItem = z.object({
  chave: z.string(),
  item: z.string(),
  brl_hora: z.string().refine((value) => value.trim() !== "" && Number.isFinite(Number(value))),
}).refine((value) => value.chave === "ajuste_mercado" || Number(value.brl_hora) >= 0, {
  message: "Somente o ajuste de mercado pode reduzir o preço.",
  path: ["brl_hora"],
});
export const pricingSuggestionSchema: z.ZodType<PricingSuggestion> = z.object({
  suggestion_id: z.string(),
  sugerido_brl_hora: money,
  faixa_brl_hora: z.tuple([money, money]),
  custo_brl_hora: money,
  locatario_paga_brl_hora: money,
  equivalente_diaria_brl: money,
  composicao: z.array(breakdownItem),
  premissas: z.object({
    categoria: z.string(), idade_anos: z.number(), horimetro: z.number(),
    horimetro_declarado: z.boolean(), potencia_cv: z.number().nullable(),
    valor_mercado_usado_brl: z.number(), valor_novo_equivalente_brl: z.number(),
    horas_faturaveis_ano: z.number(), horas_motor_ano: z.number(),
    comparaveis_internos: z.number(), tarifas_mercado_encontradas: z.number(),
    inclui_combustivel: z.boolean(), inclui_operador: z.boolean(),
    custo_antes_da_ancoragem: money,
  }),
  fontes: z.array(z.object({ url: z.string(), title: z.string().nullish() })),
  search_suggestions_html: z.string().nullish(),
  confianca: z.enum(["alta", "media", "baixa"]),
  origem: z.enum(["pesquisa", "cache", "comparaveis"]),
  versao_parametros: z.string(),
});
