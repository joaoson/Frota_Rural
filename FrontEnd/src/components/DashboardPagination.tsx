import MaterialIcon from "@/components/MaterialIcon";

interface DashboardPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const DashboardPagination = ({ currentPage, totalPages, onPageChange }: DashboardPaginationProps) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <MaterialIcon icon="chevron_left" size={20} />
      </button>
      {Array.from({ length: totalPages }).map((_, i) => (
        <button
          key={i}
          onClick={() => onPageChange(i + 1)}
          className={`w-9 h-9 rounded-lg font-bold text-sm transition-colors ${
            currentPage === i + 1 ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          {i + 1}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <MaterialIcon icon="chevron_right" size={20} />
      </button>
    </div>
  );
};

export default DashboardPagination;

