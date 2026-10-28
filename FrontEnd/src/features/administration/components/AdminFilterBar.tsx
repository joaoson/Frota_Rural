import MaterialIcon from "@/components/MaterialIcon";

export const ADMIN_SELECT =
  "bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface";

interface AdminFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}

export function AdminFilterBar({
  search,
  onSearchChange,
  placeholder,
  children,
}: AdminFilterBarProps) {
  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 mb-6 flex flex-wrap gap-3 items-center">
      <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30">
        <MaterialIcon icon="search" size={18} className="text-outline" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-outline"
        />
      </div>
      {children}
    </div>
  );
}
