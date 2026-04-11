import MaterialIcon from "@/components/MaterialIcon";

interface DashboardSearchBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  yearValue: string;
  onYearChange: (value: string) => void;
  searchPlaceholder?: string;
  years?: string[];
}

const DashboardSearchBar = ({
  searchValue,
  onSearchChange,
  yearValue,
  onYearChange,
  searchPlaceholder = "Buscar...",
  years = ["Todos", "2026", "2025", "2024"],
}: DashboardSearchBarProps) => {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <div className="relative flex-1">
        <MaterialIcon icon="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-surface-container border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary text-on-surface"
        />
      </div>
      <select
        value={yearValue}
        onChange={(e) => onYearChange(e.target.value)}
        className="bg-surface-container border-none rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary text-on-surface min-w-[120px]"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y === "Todos" ? "Todos os anos" : y}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DashboardSearchBar;

