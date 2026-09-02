import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import ThemeToggle from "@/components/ThemeToggle";
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
import { postingService } from "@/services/PostingService/PostingService";
import {
  adminPostingService,
  AdminPostingServiceError,
} from "@/services/AdminService/AdminPostingService";

type ModerationAction = "approve" | "reject";

type PostingListItem = {
  id: string;
  machine_brand: string | null;
  machine_model: string | null;
  machine_usage_purpose: string | null;
  machine_year: number | null;
  hourly_rate: string | null;
  location_address: string | null;
  description: string | null;
  status: string | null;
  primary_photo_url: string | null;
};

const formatPrice = (value: string | null) => {
  if (value == null) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const machineName = (p: PostingListItem) => {
  const name = [p.machine_brand, p.machine_model].filter(Boolean).join(" ");
  return name || "Máquina sem identificação";
};

const statusBadge = (status: string | null) => {
  switch (status) {
    case "active":
      return {
        icon: "check_circle",
        classes: "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20",
        label: "Ativo",
      };
    case "rejected":
      return {
        icon: "block",
        classes: "bg-error/10 text-error border border-error/20",
        label: "Reprovado",
      };
    case "pending_review":
      return {
        icon: "hourglass_bottom",
        classes:
          "bg-secondary-container/20 text-secondary border border-secondary-container/30",
        label: "Em análise",
      };
    case "suspended":
      return {
        icon: "pause_circle",
        classes:
          "bg-surface-container-high text-on-surface-variant border border-outline-variant/40",
        label: "Suspenso",
      };
    case "inactive":
      return {
        icon: "visibility_off",
        classes:
          "bg-surface-container-high text-on-surface-variant border border-outline-variant/40",
        label: "Inativo",
      };
    default:
      return {
        icon: "circle",
        classes:
          "bg-muted text-muted-foreground border border-outline-variant/30",
        label: status || "—",
      };
  }
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
  const [postings, setPostings] = useState<PostingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    posting: PostingListItem;
    action: ModerationAction;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPostings = async () => {
    setLoading(true);
    try {
      const data = (await postingService.list({})) as PostingListItem[];
      setPostings(data);
    } catch {
      toast.error("Não foi possível carregar os anúncios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPostings();
  }, []);

  const filteredPostings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return postings.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!term) return true;
      return (
        machineName(p).toLowerCase().includes(term) ||
        (p.location_address ?? "").toLowerCase().includes(term) ||
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
    setSubmitting(true);
    try {
      const result =
        action === "approve"
          ? await adminPostingService.approve(posting.id)
          : await adminPostingService.reject(posting.id, reason.trim());
      toast.success(result?.message ?? "Ação aplicada com sucesso.");
      await loadPostings();
      closeConfirm();
    } catch (error) {
      const msg =
        error instanceof AdminPostingServiceError
          ? error.message
          : "Falha ao aplicar a ação.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
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
        : "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20 hover:bg-primary/20";

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
      <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
        <h1 className="font-headline font-black text-lg text-on-surface tracking-tight">
          Moderação de Anúncios
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPostings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <MaterialIcon icon="refresh" size={16} /> Atualizar
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="p-8 max-w-[1200px]">
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 mb-6 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30">
            <MaterialIcon icon="search" size={18} className="text-outline" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por máquina, local ou descrição"
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
            <option value="rejected">Reprovados</option>
            <option value="pending_review">Em análise</option>
            <option value="suspended">Suspensos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-container-low">
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Anúncio
                </TableHead>
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Local
                </TableHead>
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Preço/h
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
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-on-surface-variant"
                  >
                    <MaterialIcon
                      icon="hourglass_bottom"
                      size={20}
                      className="text-outline mr-2"
                    />
                    Carregando anúncios…
                  </TableCell>
                </TableRow>
              ) : filteredPostings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-on-surface-variant"
                  >
                    Nenhum anúncio encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPostings.map((p) => {
                  const badge = statusBadge(p.status);
                  return (
                    <TableRow
                      key={p.id}
                      className="hover:bg-surface-container-low/70"
                    >
                      <TableCell className="px-5 py-4 align-top">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center">
                            {p.primary_photo_url ? (
                              <img
                                src={p.primary_photo_url}
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
                              {p.machine_year ? (
                                <span className="text-on-surface-variant font-medium">
                                  {" "}
                                  · {p.machine_year}
                                </span>
                              ) : null}
                            </div>
                            {p.machine_usage_purpose ? (
                              <div className="text-xs text-on-surface-variant">
                                {p.machine_usage_purpose}
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
                        {p.location_address ?? "—"}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm font-bold text-on-surface whitespace-nowrap">
                        {formatPrice(p.hourly_rate)}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top">
                        <span
                          className={`px-2.5 py-1 font-bold text-[10px] rounded uppercase tracking-wider inline-flex items-center gap-1.5 ${badge.classes}`}
                        >
                          <MaterialIcon icon={badge.icon} size={14} />{" "}
                          {badge.label}
                        </span>
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
            </TableBody>
          </Table>
        </div>
      </div>

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
                      : "text-primary dark:text-primary-bright"
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
                {formatPrice(pendingAction.posting.hourly_rate)} ·{" "}
                {pendingAction.posting.location_address ?? "sem local"}
              </div>
            </div>
          ) : null}
          {pendingAction?.action === "reject" ? (
            <div className="pt-1">
              <label htmlFor="motivo-da-reprovacao" className="text-[10px] font-bold uppercase tracking-wider text-outline">
                Motivo da reprovação
              </label>
              <textarea id="motivo-da-reprovacao"
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
