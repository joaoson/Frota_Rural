import { useEffect, useMemo, useState } from "react";
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
import { TableCell, TableRow } from "@/components/ui/table";
import { AdminFilterBar, ADMIN_SELECT } from "@/features/administration/components/AdminFilterBar";
import { AdminPage } from "@/features/administration/components/AdminPage";
import {
  AdminTable,
  AdminTableMessage,
} from "@/features/administration/components/AdminTable";
import { useModerateUser } from "@/features/administration/hooks/useModeration";
import type { UserModerationAction } from "@/features/administration/types/moderation";
import { useUsers } from "@/features/users/hooks/useUsers";
import { userStatusBadge } from "@/features/users/types/userBadges";
import type { User } from "@/features/users/types/user";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { HttpError } from "@/shared/http/errors";

type ModerationAction = UserModerationAction;

const actionConfig: Record<
  ModerationAction,
  {
    label: string;
    icon: string;
    description: string;
    severity: "low" | "mid" | "high";
  }
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

const AdminUsers = () => {
  const usersQuery = useUsers();
  const moderateUser = useModerateUser();
  const users = usersQuery.data;
  const loading = usersQuery.isLoading;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    user: User;
    action: ModerationAction;
  } | null>(null);
  const submitting = moderateUser.isPending;

  useEffect(() => {
    if (usersQuery.isError) toast.error("Não foi possível carregar os usuários.");
  }, [usersQuery.isError]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
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
    try {
      const message = await moderateUser.mutateAsync({ userId: user.id, action });
      toast.success(message);
      closeConfirm();
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Falha ao aplicar a ação.");
    }
  };

  const actionButton = (user: User, action: ModerationAction) => {
    const cfg = actionConfig[action];
    const disabled =
      (action === "warn" &&
        (user.status === "suspended" || user.status === "banned")) ||
      (action === "suspend" && user.status === "banned") ||
      user.status === "banned";

    const base =
      "px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
    const palette =
      cfg.severity === "high"
        ? "bg-error/10 text-error border border-error/20 hover:bg-error/20"
        : cfg.severity === "mid"
          ? "bg-surface-container-high text-on-surface-variant border border-outline-variant/40 hover:bg-outline-variant/30"
          : "bg-secondary-container/30 text-secondary hover:bg-secondary-container/50";

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
    <>
      <AdminPage title="Moderação de Usuários" onRefresh={() => void usersQuery.refetch()}>
        <AdminFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Buscar por nome, email ou documento"
        >
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={ADMIN_SELECT}
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
            className={ADMIN_SELECT}
          >
            <option value="all">Todos os papéis</option>
            <option value="locador">Locador</option>
            <option value="locatario">Locatário</option>
            <option value="operador">Operador</option>
            <option value="admin">Admin</option>
          </select>
        </AdminFilterBar>

        <AdminTable
          columns={[
            { label: "Usuário" },
            { label: "Papel" },
            { label: "Status" },
            { label: "Ações", align: "right" },
          ]}
        >
          {loading ? (
            <AdminTableMessage colSpan={4} icon="hourglass_bottom">
              Carregando usuários…
            </AdminTableMessage>
          ) : filteredUsers.length === 0 ? (
            <AdminTableMessage colSpan={4}>
              Nenhum usuário encontrado com os filtros atuais.
            </AdminTableMessage>
          ) : (
            filteredUsers.map((u) => {
              const badge = userStatusBadge(u.status);
              return (
                <TableRow
                  key={u.id}
                  className="hover:bg-surface-container-low/70"
                >
                  <TableCell className="px-5 py-4 align-top">
                    <div className="font-bold text-sm text-on-surface">
                      {u.name}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {u.email}
                    </div>
                    <div className="text-[11px] text-outline mt-0.5">
                      {u.document}
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm text-on-surface capitalize">
                    {u.role}
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <StatusBadge config={badge} dense />
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
        </AdminTable>
      </AdminPage>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => (open ? null : closeConfirm())}
      >
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
                        : "text-secondary"
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
              <div className="font-bold text-on-surface">
                {pendingAction.user.name}
              </div>
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
                  {pendingCfg ? (
                    <MaterialIcon icon={pendingCfg.icon} size={16} />
                  ) : null}
                  Confirmar
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminUsers;
