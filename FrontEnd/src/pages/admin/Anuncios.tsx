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
import { useModeratePosting } from "@/features/administration/hooks/useModeration";
import type { PostingModerationAction } from "@/features/administration/types/moderation";
import { usePostings } from "@/features/postings/hooks/usePostings";
import type { PostingListItem } from "@/features/postings/types/posting";
import { postingStatusBadge } from "@/features/postings/types/postingBadges";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { HttpError } from "@/shared/http/errors";

type ModerationAction = PostingModerationAction;


const formatPrice = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const machineName = (p: PostingListItem) => {
  const name = [p.machineBrand, p.machineModel].filter(Boolean).join(" ");
  return name || "Máquina sem identificação";
};

const actionConfig: Record<
  ModerationAction,
  { label: string; icon: string; description: string; severity: "low" | "high" }
> = {
  approve: {
    label: "Aprovar",
    icon: "check_circle",
    description:
      "Confirma a conformidade do anúncio. O anúncio é mantido ativo e a análise é registrada no histórico de moderação.",
    severity: "low",
  },
  reject: {
    label: "Reprovar",
    icon: "block",
    description:
      "Reprova o anúncio por violar as regras da plataforma. O anúncio é desativado e o motivo informado fica registrado.",
    severity: "high",
  },
};

const AdminAnuncios = () => {
  const postingsQuery = usePostings({});
  const moderatePosting = useModeratePosting();
  const postings = postingsQuery.data;
  const loading = postingsQuery.isLoading;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    posting: PostingListItem;
    action: ModerationAction;
  } | null>(null);
  const [reason, setReason] = useState("");
  const submitting = moderatePosting.isPending;

  useEffect(() => {
    if (postingsQuery.isError) toast.error("Não foi possível carregar os anúncios.");
  }, [postingsQuery.isError]);

  const filteredPostings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (postings ?? []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!term) return true;
      return (
        machineName(p).toLowerCase().includes(term) ||
        (p.locationAddress ?? "").toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [postings, search, statusFilter]);

  const openConfirm = (posting: PostingListItem, action: ModerationAction) => {
    setPendingAction({ posting, action });
    setReason("");
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setPendingAction(null);
    setReason("");
  };

  const runAction = async () => {
    if (!pendingAction) return;
    const { posting, action } = pendingAction;
    if (action === "reject" && !reason.trim()) return;
    try {
      // O store invalida a lista de anúncios sozinho.
      const message = await moderatePosting.mutateAsync({
        postingId: posting.id,
        action,
        reason: reason.trim(),
      });
      toast.success(message);
      closeConfirm();
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Falha ao aplicar a ação.");
    }
  };

  const actionButton = (posting: PostingListItem, action: ModerationAction) => {
    const cfg = actionConfig[action];
    const disabled =
      (action === "approve" && posting.status === "active") ||
      (action === "reject" && posting.status === "rejected");

    const base =
      "px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
    const palette =
      cfg.severity === "high"
        ? "bg-error/10 text-error border border-error/20 hover:bg-error/20"
        : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20";

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => openConfirm(posting, action)}
        className={`${base} ${palette}`}
      >
        <MaterialIcon icon={cfg.icon} size={14} /> {cfg.label}
      </button>
    );
  };

  const pendingCfg = pendingAction ? actionConfig[pendingAction.action] : null;
  const confirmDisabled =
    submitting ||
    (pendingAction?.action === "reject" && !reason.trim());

  return (
    <>
      <AdminPage title="Moderação de Anúncios" onRefresh={() => void postingsQuery.refetch()}>
        <AdminFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Buscar por máquina, local ou descrição"
        >
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={ADMIN_SELECT}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="rejected">Reprovados</option>
            <option value="pending_review">Em análise</option>
            <option value="suspended">Suspensos</option>
            <option value="inactive">Inativos</option>
          </select>
        </AdminFilterBar>

        <AdminTable
          columns={[
            { label: "Anúncio" },
            { label: "Local" },
            { label: "Preço/h" },
            { label: "Status" },
            { label: "Ações", align: "right" },
          ]}
        >
          {loading ? (
            <AdminTableMessage colSpan={5} icon="hourglass_bottom">
              Carregando anúncios…
            </AdminTableMessage>
          ) : filteredPostings.length === 0 ? (
            <AdminTableMessage colSpan={5}>
              Nenhum anúncio encontrado com os filtros atuais.
            </AdminTableMessage>
          ) : (
            filteredPostings.map((p) => {
              const badge = postingStatusBadge(p.status);
              return (
                <TableRow
                  key={p.id}
                  className="hover:bg-surface-container-low/70"
                >
                  <TableCell className="px-5 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center">
                        {p.primaryPhotoUrl ? (
                          <img
                            src={p.primaryPhotoUrl}
                            alt={machineName(p)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <MaterialIcon
                            icon="agriculture"
                            size={22}
                            className="text-outline"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-on-surface">
                          {machineName(p)}
                          {p.machineYear ? (
                            <span className="text-on-surface-variant font-medium">
                              {" "}
                              · {p.machineYear}
                            </span>
                          ) : null}
                        </div>
                        {p.machineUsagePurpose ? (
                          <div className="text-xs text-on-surface-variant">
                            {p.machineUsagePurpose}
                          </div>
                        ) : null}
                        {p.description ? (
                          <div className="text-[11px] text-outline mt-0.5 line-clamp-1 max-w-[320px]">
                            {p.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm text-on-surface-variant max-w-[200px]">
                    {p.locationAddress ?? "—"}
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm font-bold text-on-surface whitespace-nowrap">
                    {formatPrice(p.hourlyRate)}
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <StatusBadge config={badge} dense />
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <div className="flex gap-2 justify-end flex-wrap">
                      {actionButton(p, "approve")}
                      {actionButton(p, "reject")}
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
                      : "text-primary"
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
                Anúncio alvo
              </div>
              <div className="font-bold text-on-surface">
                {machineName(pendingAction.posting)}
              </div>
              <div className="text-xs text-on-surface-variant">
                {formatPrice(pendingAction.posting.hourlyRate)} ·{" "}
                {pendingAction.posting.locationAddress ?? "sem local"}
              </div>
            </div>
          ) : null}
          {pendingAction?.action === "reject" ? (
            <div className="pt-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                Motivo da reprovação
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Descreva o motivo (ex.: informações falsas, fotos inadequadas, preço abusivo)…"
                className="mt-1.5 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline outline-none focus:border-primary resize-none"
              />
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
              disabled={confirmDisabled}
              onClick={runAction}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 ${
                pendingCfg?.severity === "high"
                  ? "bg-error text-on-error hover:opacity-90"
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

export default AdminAnuncios;
