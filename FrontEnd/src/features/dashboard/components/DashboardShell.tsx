import { useState } from "react";
import { Link } from "react-router";

import MaterialIcon from "@/components/MaterialIcon";
import NotificationPopover from "@/components/NotificationPopover";
import ThemeToggle from "@/components/ThemeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Sidebar + topbar dos dois dashboards.
 *
 * As duas páginas tinham ~100 linhas idênticas aqui, com apenas três
 * diferenças reais: a cor do avatar, o que aparece na linha de papel e a
 * tipagem de `Tab`. Ficaram como props; a tipagem virou parâmetro genérico,
 * então cada dashboard mantém sua própria união de abas sem `string` solto.
 */
export interface SidebarItem<Tab extends string> {
  icon: string;
  label: string;
  tab: Tab;
}

interface NotificationItem {
  id: number;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

interface DashboardShellProps<Tab extends string> {
  items: readonly SidebarItem<Tab>[];
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  /** A aba cuja seleção abre o diálogo de saída em vez de trocar de conteúdo. */
  logoutTab: Tab;
  initials: string;
  accountName: React.ReactNode;
  accountRole: React.ReactNode;
  /** Cor do avatar: cada papel usa a sua. */
  avatarClassName?: string;
  notifications: NotificationItem[];
  children: React.ReactNode;
}

export function DashboardShell<Tab extends string>({
  items,
  tab,
  onTabChange,
  onLogout,
  logoutTab,
  initials,
  accountName,
  accountRole,
  avatarClassName = "bg-primary-container text-on-primary",
  notifications,
  children,
}: DashboardShellProps<Tab>) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-64 shrink-0 border-r border-outline-variant/30 h-screen fixed md:sticky top-0 bg-surface-container-low flex flex-col z-50 transform transition-transform duration-300 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-6 pb-4">
          <Link
            to="/"
            className="font-headline font-black text-xl text-primary tracking-tighter"
          >
            Frota Rural
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {items.map((item) => {
            const buttonEl = (
              <button
                key={item.tab}
                onClick={
                  item.tab !== logoutTab
                    ? () => {
                        onTabChange(item.tab);
                        setIsSidebarOpen(false);
                      }
                    : undefined
                }
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === item.tab
                    ? "bg-primary/10 text-primary font-bold border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <MaterialIcon icon={item.icon} size={20} />
                <span>{item.label}</span>
              </button>
            );

            if (item.tab === logoutTab) {
              return (
                <AlertDialog key={item.tab}>
                  <AlertDialogTrigger asChild>{buttonEl}</AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sair da conta</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja sair?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel variant="outline">Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onLogout}>Sair</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            }

            return buttonEl;
          })}
        </nav>

        <div className="p-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-headline font-bold text-sm ${avatarClassName}`}
            >
              {initials}
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">{accountName}</div>
              <div className="text-[11px] text-on-surface-variant">{accountRole}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg"
            >
              <MaterialIcon icon="menu" size={24} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationPopover notifications={notifications} />
          </div>
        </header>

        <div className="p-8 max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
