import MaterialIcon from "@/components/MaterialIcon";

interface DashboardPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Monta a lista de páginas exibidas: sempre a primeira, a última e uma janela
 * ao redor da atual. O resto vira reticências, para a barra não estourar a
 * largura quando houver muitas páginas.
 */
function buildPageItems(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | "...")[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("...");
  for (let page = start; page <= end; page++) items.push(page);
  if (end < totalPages - 1) items.push("...");
  items.push(totalPages);

  return items;
}

const DashboardPagination = ({ currentPage, totalPages, onPageChange }: DashboardPaginationProps) => {
  if (totalPages <= 1) return null;

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const goTo = (target: number) => {
    const next = Math.min(Math.max(target, 1), totalPages);
    if (next !== page) onPageChange(next);
  };

  return (
    <nav aria-label="Paginação" className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        onClick={() => goTo(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <MaterialIcon icon="chevron_left" size={20} />
      </button>
      {buildPageItems(page, totalPages).map((item, i) =>
        item === "..." ? (
          <span
            key={`ellipsis-${i}`}
            aria-hidden="true"
            className="w-9 h-9 flex items-center justify-center text-on-surface-variant text-sm select-none"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => goTo(item)}
            aria-label={`Página ${item}`}
            aria-current={page === item ? "page" : undefined}
            className={`w-9 h-9 rounded-lg font-bold text-sm transition-colors ${
              page === item ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => goTo(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
        className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <MaterialIcon icon="chevron_right" size={20} />
      </button>
    </nav>
  );
};

export default DashboardPagination;
