import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { userService } from "@/services/UserService/UserService";
import type { User } from "@/services/UserService/models/User";
import {
  adminService,
  AdminServiceError,
} from "@/services/AdminService/AdminService";

type ModerationAction = "warn" | "suspend" | "ban";

const sidebarItems = [
  { icon: "groups", label: "Usuários", tab: "usuarios" },
  { icon: "campaign", label: "Anúncios", tab: "anuncios" },
  { icon: "badge", label: "Credenciais", tab: "credenciais" },
  { icon: "flag", label: "Denúncias", tab: "denuncias" },
  { icon: "analytics", label: "Relatórios", tab: "relatorios" },
] as const;

type Tab = (typeof sidebarItems)[number]["tab"];

const statusBadge = (status: string) => {
  switch (status) {
    case "active":
      return {
        icon: "check_circle",
        classes: "bg-primary/10 text-primary border border-primary/20",
        label: "Ativo",
      };
    case "warned":
      return {
        icon: "warning",
        classes:
          "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30",
        label: "Advertido",
      };
    case "suspended":
      return {
        icon: "pause_circle",
        classes:
          "bg-surface-container-high text-on-surface-variant border border-outline-variant/40",
        label: "Suspenso",
      };
    case "banned":
      return {
        icon: "block",
        classes: "bg-error/10 text-error border border-error/20",
        label: "Banido",
      };
    default:
      return {
        icon: "circle",
        classes: "bg-muted text-muted-foreground border border-outline-variant/30",
        label: status || "—",
      };
  }
};

const actionConfig: Record<
  ModerationAction,
  { label: string; icon: string; description: string; severity: "low" | "mid" | "high" }
> = {
  warn: {
    label: "Advertir",
    icon: "warning",
    description:
      "Aplica uma advertência ao usuário. Não afeta anúncios ou locações em andamento.",
    severity: "low",
  },
  suspend: {
    label: "Suspender",
    icon: "pause_circle",
    description:
      "Suspende o usuário. Anúncios ativos são suspensos e locações pendentes do locatário são canceladas.",
    severity: "mid",
  },
  ban: {
    label: "Banir",
    icon: "block",
    description:
      "Banimento permanente. Inativa todos os anúncios, cancela locações e contratos pendentes. Novos cadastros com o mesmo documento serão bloqueados.",
    severity: "high",
  },
};

const DashboardAdmin = () => {
  const [tab, setTab] = useState<Tab>("usuarios");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    user: User;
    action: ModerationAction;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await userService.list();
      setUsers(data);
    } catch {
      toast.error("Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.document.toLowerCase().includes(term)
      );
    });
  }, [users, search, statusFilter, roleFilter]);

  const openConfirm = (user: User, action: ModerationAction) => {
    setPendingAction({ user, action });
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setPendingAction(null);
  };

  const runAction = async () => {
    if (!pendingAction) return;
    const { user, action } = pendingAction;
    setSubmitting(true);
    try {
      const result =
        action === "warn"
          ? await adminService.warn(user.id)
          : action === "suspend"
            ? await adminService.suspend(user.id)
            : await adminService.ban(user.id);
      toast.success(result?.message ?? "Ação aplicada com sucesso.");
      await loadUsers();
      closeConfirm();
    } catch (error) {
      const msg =
        error instanceof AdminServiceError
          ? error.message
          : "Falha ao aplicar a ação.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const actionButton = (user: User, action: ModerationAction) => {
    const cfg = actionConfig[action];
    const disabled =
      (action === "warn" && (user.status === "suspended" || user.status === "banned")) ||
      (action === "suspend" && user.status === "banned") ||
      user.status === "banned";

    const base =
      "px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
    const palette =
      cfg.severity === "high"
        ? "bg-error/10 text-error border border-error/20 hover:bg-error/20"
        : cfg.severity === "mid"
          ? "bg-surface-container-high text-on-surface-variant border border-outline-variant/40 hover:bg-outline-variant/30"
          : "bg-secondary-container/30 text-on-secondary-container hover:bg-secondary-container/50";

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => openConfirm(user, action)}
        className={`${base} ${palette}`}
      >
        <MaterialIcon icon={cfg.icon} size={14} /> {cfg.label}
      </button>
    );
  };

  const pendingCfg = pendingAction ? actionConfig[pendingAction.action] : null;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r border-outline-variant/30 h-screen sticky top-0 bg-surface-container-low flex flex-col">
        <div className="p-6 pb-4">
          <Link to="/" className="font-headline font-black text-xl text-primary tracking-tighter">
            Frota Rural
          </Link>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
            Painel Admin
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.tab}
              onClick={() => setTab(item.tab)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.tab
                  ? "bg-primary/10 text-primary font-bold border-l-2 border-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <MaterialIcon icon={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
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
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="font-headline font-black text-lg text-on-surface tracking-tight">
            Moderação de Usuários
          </h1>
          <button
            type="button"
            onClick={loadUsers}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <MaterialIcon icon="refresh" size={16} /> Atualizar
          </button>
        </header>

        <div className="p-8 max-w-[1200px]">
          {tab !== "usuarios" ? (
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-10 text-center">
              <MaterialIcon icon="construction" size={32} className="text-outline" />
              <h2 className="font-headline font-bold text-on-surface text-lg mt-3">
                Em breve
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Esta seção ainda não foi implementada.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 mb-6 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30">
                  <MaterialIcon icon="search" size={18} className="text-outline" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome, email ou documento"
                    className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-outline"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativos</option>
                  <option value="warned">Advertidos</option>
                  <option value="suspended">Suspensos</option>
                  <option value="banned">Banidos</option>
                </select>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
                >
                  <option value="all">Todos os papéis</option>
                  <option value="locador">Locador</option>
                  <option value="locatario">Locatário</option>
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-container-low">
                      <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                        Usuário
                      </TableHead>
                      <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                        Papel
                      </TableHead>
                      <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                        Status
                      </TableHead>
                      <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-on-surface-variant">
                          <MaterialIcon icon="hourglass_bottom" size={20} className="text-outline mr-2" />
                          Carregando usuários…
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-on-surface-variant">
                          Nenhum usuário encontrado com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((u) => {
                        const badge = statusBadge(u.status);
                        return (
                          <TableRow key={u.id} className="hover:bg-surface-container-low/70">
                            <TableCell className="px-5 py-4 align-top">
                              <div className="font-bold text-sm text-on-surface">{u.name}</div>
                              <div className="text-xs text-on-surface-variant">{u.email}</div>
                              <div className="text-[11px] text-outline mt-0.5">{u.document}</div>
                            </TableCell>
                            <TableCell className="px-5 py-4 align-top text-sm text-on-surface capitalize">
                              {u.role}
                            </TableCell>
                            <TableCell className="px-5 py-4 align-top">
                              <span
                                className={`px-2.5 py-1 font-bold text-[10px] rounded uppercase tracking-wider inline-flex items-center gap-1.5 ${badge.classes}`}
                              >
                                <MaterialIcon icon={badge.icon} size={14} /> {badge.label}
                              </span>
                            </TableCell>
                            <TableCell className="px-5 py-4 align-top">
                              <div className="flex gap-2 justify-end flex-wrap">
                                {actionButton(u, "warn")}
                                {actionButton(u, "suspend")}
                                {actionButton(u, "ban")}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </main>

      <Dialog open={confirmOpen} onOpenChange={(open) => (open ? null : closeConfirm())}>
        <DialogContent className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="font-headline font-bold text-on-surface flex items-center gap-2">
              {pendingCfg ? (
                <MaterialIcon
                  icon={pendingCfg.icon}
                  size={20}
                  className={
                    pendingCfg.severity === "high"
                      ? "text-error"
                      : pendingCfg.severity === "mid"
                        ? "text-on-surface-variant"
                        : "text-on-secondary-container"
                  }
                />
              ) : null}
              Confirmar {pendingCfg?.label.toLowerCase() ?? "ação"}
            </DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant pt-2">
              {pendingCfg?.description}
            </DialogDescription>
          </DialogHeader>
          {pendingAction ? (
            <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">
                Usuário alvo
              </div>
              <div className="font-bold text-on-surface">{pendingAction.user.name}</div>
              <div className="text-xs text-on-surface-variant">
                {pendingAction.user.email} · {pendingAction.user.role}
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={closeConfirm}
              className="px-4 py-2 rounded-lg font-bold text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={runAction}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 ${
                pendingCfg?.severity === "high"
                  ? "bg-error text-on-error hover:opacity-90"
                  : pendingCfg?.severity === "mid"
                    ? "bg-tertiary text-on-tertiary hover:opacity-90"
                    : "bg-primary text-on-primary hover:opacity-90"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {submitting ? (
                <>
                  <MaterialIcon icon="hourglass_bottom" size={16} />
                  Aplicando…
                </>
              ) : (
                <>
                  {pendingCfg ? <MaterialIcon icon={pendingCfg.icon} size={16} /> : null}
                  Confirmar
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DashboardAdmin;
