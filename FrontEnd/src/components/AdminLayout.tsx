import { Link, NavLink, Outlet } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";

const sidebarItems = [
  { icon: "groups", label: "Usuários", to: "/admin/users" },
  { icon: "campaign", label: "Anúncios", to: "/admin/anuncios" },
  { icon: "badge", label: "Credenciais", to: "/admin/credenciais" },
  { icon: "flag", label: "Denúncias", to: "/admin/denuncias" },
  { icon: "analytics", label: "Relatórios", to: "/admin/relatorios" },
] as const;

const AdminLayout = () => {
  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r border-outline-variant/30 h-screen sticky top-0 bg-surface-container-low flex flex-col">
        <div className="p-6 pb-4">
          <Link
            to="/"
            className="font-headline font-black text-xl text-primary tracking-tighter"
          >
            Frota Rural
          </Link>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
            Painel Admin
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-bold border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`
              }
            >
              <MaterialIcon icon={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-container text-on-primary rounded-full flex items-center justify-center font-headline font-bold text-sm">
              AD
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">Admin</div>
              <div className="text-[11px] text-on-surface-variant">Moderação</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
