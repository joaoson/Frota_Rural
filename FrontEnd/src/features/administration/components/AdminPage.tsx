import MaterialIcon from "@/components/MaterialIcon";
import ThemeToggle from "@/components/ThemeToggle";

interface AdminPageProps {
  title: string;
  onRefresh: () => void;
  children: React.ReactNode;
}

export function AdminPage({ title, onRefresh, children }: AdminPageProps) {
  return (
    <>
      <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
        <h1 className="font-headline font-black text-lg text-on-surface tracking-tight">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <MaterialIcon icon="refresh" size={16} /> Atualizar
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="p-8 max-w-[1200px]">{children}</div>
    </>
  );
}
