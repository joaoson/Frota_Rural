import MaterialIcon from "@/components/MaterialIcon";
import type { PricingSuggestion } from "@/features/pricing/types/pricing";

const brl = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CONFIDENCE_LABEL: Record<PricingSuggestion["confianca"], string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

const CONFIDENCE_STYLE: Record<PricingSuggestion["confianca"], string> = {
  alta: "bg-primary/10 text-primary dark:text-primary-bright",
  media: "bg-secondary-container/60 text-on-surface",
  baixa: "bg-error/10 text-error",
};

interface SugestaoPrecoPanelProps {
  suggestion: PricingSuggestion;
  onApply: (value: string) => void;
  onDismiss: () => void;
}

/**
 * Mostra a sugestão de valor/hora com a composição do custo.
 *
 * A decomposição não é enfeite: é o que sustenta o número perante o locador e
 * o que permite discordar dele com base em algo. Por isso o painel nunca
 * preenche o campo sozinho — quem decide o preço é o locador, inclusive
 * juridicamente.
 */
const SugestaoPrecoPanel = ({ suggestion, onApply, onDismiss }: SugestaoPrecoPanelProps) => {
  const { premissas: p } = suggestion;
  const total = Number(suggestion.sugerido_brl_hora);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MaterialIcon icon="auto_awesome" size={16} className="text-primary dark:text-primary-bright" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary dark:text-primary-bright">
              Valor sugerido
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${CONFIDENCE_STYLE[suggestion.confianca]}`}>
              {CONFIDENCE_LABEL[suggestion.confianca]}
            </span>
          </div>
          <p className="font-headline text-2xl font-bold text-on-surface">
            {brl(suggestion.sugerido_brl_hora)}
            <span className="text-sm font-medium text-on-surface-variant"> / hora faturada</span>
          </p>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Faixa {brl(suggestion.faixa_brl_hora[0])} a {brl(suggestion.faixa_brl_hora[1])} ·
            equivale a {brl(suggestion.equivalente_diaria_brl)} por dia de reserva
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar sugestão"
          className="w-7 h-7 rounded-full text-on-surface-variant hover:bg-surface-container flex items-center justify-center shrink-0"
        >
          <MaterialIcon icon="close" size={16} />
        </button>
      </div>

      {/* A plataforma cobra 8 h por dia e soma a taxa por fora: sem dizer isso,
          o locador compara o número com uma tarifa de horímetro e se assusta. */}
      <p className="text-[11px] text-on-surface-variant leading-relaxed bg-surface-container-lowest/70 rounded-lg p-3">
        A plataforma fatura <strong>8 horas por dia de reserva</strong>, não pelo horímetro.
        Você recebe {brl(suggestion.sugerido_brl_hora)} por hora; o locatário paga{" "}
        {brl(suggestion.locatario_paga_brl_hora)}, já com a taxa da plataforma.
      </p>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Como chegamos nesse valor</p>
        {suggestion.composicao.map((item) => {
          const share = total > 0 ? Number(item.brl_hora) / total : 0;
          return (
            <div key={item.chave} className="flex items-center gap-3 text-xs">
              <span className="flex-1 text-on-surface-variant">{item.item}</span>
              <span
                className="h-1.5 bg-primary/40 rounded-full shrink-0"
                style={{ width: `${Math.max(2, Math.round(share * 100))}px` }}
                aria-hidden
              />
              <span className="w-20 text-right font-semibold text-on-surface tabular-nums">
                {brl(item.brl_hora)}
              </span>
            </div>
          );
        })}
      </div>

      <details className="text-[11px] text-on-surface-variant">
        <summary className="cursor-pointer font-semibold text-on-surface">Premissas usadas</summary>
        <ul className="mt-2 space-y-1 pl-1">
          <li>Valor de mercado do usado: {brl(p.valor_mercado_usado_brl)}</li>
          <li>Equivalente novo: {brl(p.valor_novo_equivalente_brl)}</li>
          <li>
            Horímetro: {p.horimetro.toLocaleString("pt-BR")} h{" "}
            {p.horimetro_declarado
              ? "(informado por você)"
              : "(estimado pela idade — informe o horímetro real da máquina para melhorar a sugestão)"}
          </li>
          <li>Categoria: {p.categoria} · {p.horas_faturaveis_ano} h faturáveis por ano</li>
          {p.comparaveis_internos > 0 ? (
            <li>Ajustado por {p.comparaveis_internos} anúncio(s) semelhante(s) na plataforma</li>
          ) : null}
        </ul>
        {suggestion.fontes.length > 0 ? (
          <div className="mt-2">
            <p className="font-semibold text-on-surface">Fontes</p>
            <ul className="space-y-0.5 mt-1">
              {suggestion.fontes.map((fonte) => (
                <li key={fonte.url} className="truncate">
                  <a
                    href={fonte.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary dark:text-primary-bright hover:underline"
                  >
                    {fonte.title || fonte.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>

      {suggestion.search_suggestions_html && (
        <iframe title="Sugestões de pesquisa do Google"
          srcDoc={suggestion.search_suggestions_html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="w-full h-40 border-0 rounded-lg" />
      )}

      <button
        type="button"
        onClick={() => onApply(suggestion.sugerido_brl_hora)}
        className="w-full bg-primary text-on-primary font-bold py-2.5 rounded-lg text-sm hover:shadow transition-all flex items-center justify-center gap-2"
      >
        <MaterialIcon icon="check" size={16} /> Usar {brl(suggestion.sugerido_brl_hora)}
      </button>
    </div>
  );
};

export default SugestaoPrecoPanel;
