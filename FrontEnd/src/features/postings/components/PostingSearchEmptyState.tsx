import { Button } from "@/components/ui/button";
import MaterialIcon from "@/components/MaterialIcon";

export function PostingSearchEmptyState({ onClear, compact = false }: { onClear: () => void; compact?: boolean }) {
  return <div role="status" className={`${compact ? "py-6 px-4 rounded-[20px]" : "py-20 rounded-[24px]"} text-center bg-surface-container-lowest border border-outline-variant/30`}>
    <div className="bg-surface-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
      <MaterialIcon icon="search_off" size={32} className="text-primary dark:text-primary-bright" />
    </div>
    <h3 className={`${compact ? "text-base" : "text-xl"} font-bold text-on-surface mb-2`}>Nenhum equipamento encontrado</h3>
    <p className="text-on-surface-variant text-sm max-w-sm mx-auto">
      Não encontramos anúncios para os filtros selecionados. Tente ajustar a localização, o período ou o tipo de atividade.
    </p>
    <Button variant="outline" onClick={onClear} className="mt-6 gap-2">
      <MaterialIcon icon="close" size={16} /> Limpar filtros
    </Button>
  </div>;
}
