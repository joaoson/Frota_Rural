import { useDashboardPreference, searchMapPreference, yearMapPreference, contractPreference, overviewPreference } from "@/features/dashboard/hooks/useDashboardPreference";
import { browserTimeZone, useLessorDashboard } from "@/features/dashboard/hooks/useLessorDashboard";
import { ContractAmendmentsDialog } from "@/features/contracts/components/ContractAmendmentsPanel";
import { DashboardCollection, type DashboardView } from "@/features/dashboard/components/DashboardCollection";
import { isAwaitingPayment, isOpenRental } from "@/features/contracts/types/rentalLifecycle";
import { useUpdateMachine } from "@/features/machines/hooks/useUpdateMachine";
import { useTiposPneu } from "@/features/machines/hooks/useTiposPneu";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { NotificationsPanel } from "@/features/notifications/components/NotificationsPanel";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { useCancelRental, useCompleteRental, useRecordMeterReading, useRentalsAsLessor } from "@/features/contracts/hooks/useContracts";
import { MachineUsageLine } from "@/features/machines/components/MachineUsageLine";
import { rentalMachineName, rentalHasContract } from "@/features/contracts/types/rental";
import { situacaoAssinatura } from "@/features/contracts/types/rental";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";
import { AccountSection } from "@/features/dashboard/components/AccountSection";
import { DashboardShell } from "@/features/dashboard/components/DashboardShell";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { ReviewsSection } from "@/features/dashboard/components/ReviewsSection";
import OperadoresPanel from "@/components/OperadoresPanel";
import ChatInboxPanel from "@/features/chat/components/ChatInboxPanel";
import AssinaturaContratoModal, {
  type PapelAssinatura,
} from "@/components/AssinaturaContratoModal";
import { contractStore } from "@/app/container";
import { DocumentsSection } from "@/features/documents/components/DocumentsSection";
import { useMachines } from "@/features/machines/hooks/useMachines";
import { usePostings } from "@/features/postings/hooks/usePostings";
import { postingMachineName } from "@/features/postings/types/posting";
import {
  useCreateReview,
  useReceivedReviews,
  useWrittenReviews,
} from "@/features/reviews/hooks/useReviews";
import { hasReviewedRental, type Review } from "@/features/reviews/types/review";
import { formatCurrency, matchesSearch, yearOptions } from "@/features/dashboard/utils/ownerSummary";
import { postingStatusBadge } from "@/features/postings/types/postingBadges";
import { HttpError } from "@/shared/http/errors";
import { useUser } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { getInitials } from "@/shared/utils/getInitials";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";
import EditEquipamentoModal, {
  type EquipamentoData,
} from "@/components/EditEquipamentoModal";

const sidebarItems = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "agriculture", label: "Minha frota", tab: "frota" },
  { icon: "campaign", label: "Anúncios", tab: "anuncios" },
  { icon: "event_available", label: "Locações", tab: "reservas" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "engineering", label: "Operadores", tab: "operadores" },
  { icon: "badge", label: "Documentos", tab: "documentos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
] as const;

type Tab = (typeof sidebarItems)[number]["tab"];

const OVERVIEW_DEFAULT = { months: 6, machine: "" } as const satisfies { months: 3 | 6 | 12; machine: string };
const OVERVIEW_PERIODS = [3, 6, 12] as const;
const filterSelectClass = "bg-surface-container border-none rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary text-on-surface min-w-[180px]";

const DashboardLocador = () => {
  const { userId, logout } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const { hash } = useLocation();
  const focusedRentalId = hash.startsWith("#locacao-") ? hash.slice("#locacao-".length) : undefined;
  const requestedTab = searchParams.get("tab");
  const tab: Tab = sidebarItems.find((item) => item.tab === requestedTab)?.tab ?? "dashboard";
  const setTab = (next: Tab) => setSearchParams({ tab: next });
  const [amendmentRentalId, setAmendmentRentalId] = useState<string | null>(null);
  const [showDetalhes, setShowDetalhes] = useState<string | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const userQuery = useUser(userId);
  const user: User | null = userQuery.data ?? null;

  const machinesQuery = useMachines({ ownerId: userId ?? undefined }, Boolean(userId));
  const postingsQuery = usePostings({ ownerId: userId ?? undefined });
  const rentalsQuery = useRentalsAsLessor(userId);
  const receivedQuery = useReceivedReviews(userId);
  const givenQuery = useWrittenReviews(userId);

  const createReview = useCreateReview();
  const updateMachine = useUpdateMachine();
  const tiposPneuQuery = useTiposPneu();
  const cancelRental = useCancelRental();
  const recordReading = useRecordMeterReading();
  const completeRental = useCompleteRental();

  const receivedReviews: Review[] = receivedQuery.data ?? [];
  const givenReviews: Review[] = givenQuery.data ?? [];

  const machines = useMemo(
    () =>
      (machinesQuery.data ?? []).map((m) => ({
        id: m.id,
        renagro: m.renagroNumber,
        brand: m.brand,
        model: m.model,
        year: m.year,
        powerCv: m.powerCv,
        hourMeter: m.hourMeter,
        specifications: m.technicalSpecifications,
        status: m.status ?? "active",
        purpose: m.usagePurpose ?? "",
        tipoPneu: m.tipoPneuNome,
        tipoPneuId: m.tipoPneuId,
      })),
    [machinesQuery.data],
  );

  const postings = useMemo(() => {
    const machineIds = new Set((machinesQuery.data ?? []).map((m) => m.id));
    return (postingsQuery.data ?? [])
      .filter((p) => machineIds.has(p.machineryId))
      .map((p) => ({
        id: p.id,
        machine: postingMachineName(p),
        price: p.hourlyRate,
        location: p.locationAddress,
        status: p.status ?? "active",
        year: p.machineYear,
        photo: p.primaryPhotoUrl,
      }));
  }, [machinesQuery.data, postingsQuery.data]);

  const rentals = useMemo(
    () =>
      (rentalsQuery.data ?? []).map((r) => ({
        id: r.id,
        lesseeId: r.lesseeId,
        year: r.startDate?.getFullYear(),
        createdAt: r.createdAt,
        lessee: r.lesseeName ?? "Locatário",
        machine: rentalMachineName(r),
        period:
          r.startDate && r.endDate
            ? `${r.startDate.toLocaleDateString("pt-BR")} a ${r.endDate.toLocaleDateString("pt-BR")}`
            : "",
        status: r.status,
        phase: r.phase,
        allowedActions: r.allowedActions,
        notes: r.notes,
        tipoCultura: r.tipoCulturaNome,
        meter: r.meter,
        refunds: r.refunds,
        signatureDeadline: r.signatureDeadline,
        source: r,
        total: (r.totalPrice ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        contract: rentalHasContract(r) ? r.contractNumber : null,
        hasContract: rentalHasContract(r),
        acceptedByLessor: r.acceptedByLessor,
        acceptedByLessee: r.acceptedByLessee,
      })),
    [rentalsQuery.data],
  );
  const contracts = rentals.filter((rental) => rental.hasContract);
  const [assinando, setAssinando] = useState<{ id: string; papel: PapelAssinatura } | null>(null);
  const [isEditEquipamentoOpen, setIsEditEquipamentoOpen] = useState(false);
  const [selectedEquipamento, setSelectedEquipamento] =
    useState<EquipamentoData>({
      id: "",
      registroRenagro: "",
      marca: "",
      modelo: "",
      anoFabricacao: "",
      potenciaCv: "",
      horimetro: "",
      finalidade: "Plantio",
      especificacoes: "",
      tipoPneuId: "",
    });

  const openEditModalForMachine = (m: (typeof machines)[number]) => {
    setSelectedEquipamento({
      id: String(m.id),
      registroRenagro: m.renagro ?? "",
      marca: m.brand ?? "",
      modelo: m.model ?? "",
      anoFabricacao: m.year ? String(m.year) : "",
      potenciaCv: m.powerCv != null ? String(m.powerCv) : "",
      horimetro: m.hourMeter != null ? String(m.hourMeter) : "",
      finalidade: m.purpose ?? "",
      especificacoes: m.specifications ?? "",
      tipoPneuId: m.tipoPneuId ?? "",
    });
    setIsEditEquipamentoOpen(true);
  };

  const [overview, setOverview] = useDashboardPreference<{ months: 3 | 6 | 12; machine: string }>(userId, "owner:overview", overviewPreference, OVERVIEW_DEFAULT);
  // Uma máquina salva que saiu da frota volta para a frota toda, em vez de pedir um 404.
  const overviewMachine = machines.some((m) => m.id === overview.machine) ? overview.machine : "";
  const summaryQuery = useLessorDashboard(
    { months: overview.months, machineId: overviewMachine || undefined, timeZone: browserTimeZone() },
    Boolean(userId) && Boolean(machinesQuery.isSuccess),
  );
  const summary = summaryQuery.data;
  const machineByPosting = new Map((postingsQuery.data ?? []).map((p) => [p.id, p.machineryId]));
  const overviewContracts = overviewMachine
    ? contracts.filter((contract) => machineByPosting.get(contract.source.postingId) === overviewMachine)
    : contracts;
  const topRevenue = Math.max(0, ...(summary?.topMachines ?? []).map((m) => m.revenue));
  const [search, setSearch] = useDashboardPreference<Record<string, string>>(userId, "owner:search", searchMapPreference, {});
  const [years, setYears] = useDashboardPreference<Record<string, string>>(userId, "owner:years", yearMapPreference, {});
  const [contractFilter, setContractFilter] = useDashboardPreference<string>(userId, "owner:contracts", contractPreference, "Todos");
  const searchText = search[tab] ?? "";
  const year = years[tab] ?? "Todos";
  const matchesYear = (value?: number | null) => year === "Todos" || String(value) === year;
  const filteredMachines = machines.filter((m) => matchesYear(m.year) && matchesSearch(searchText, m.brand, m.model, m.renagro));
  const filteredPostings = postings.filter((p) => matchesYear(p.year) && matchesSearch(searchText, p.machine, p.location));
  const filteredRentals = rentals.filter((r) => r.id === focusedRentalId || matchesYear(r.year) && matchesSearch(searchText, r.machine, r.lessee, r.contract));
  const filteredContracts = contracts.filter((r) => r.id === focusedRentalId || matchesYear(r.year) && matchesSearch(searchText, r.machine, r.lessee, r.contract) && (contractFilter === "Todos" || situacaoAssinatura(r).grupo === contractFilter));

  const activeRentals = useMemo(() => rentals.filter(isOpenRental), [rentals]);
  const pastRentals = useMemo(() => rentals.filter((r) => !isOpenRental(r)), [rentals]);

  const visibleActiveRentals = filteredRentals.filter((rental) => activeRentals.some((active) => active.id === rental.id));
  const visiblePastRentals = filteredRentals.filter((rental) => pastRentals.some((past) => past.id === rental.id));

  const submitReview = async (rental: (typeof rentals)[number]) => {
    if (!userId || !rental.lesseeId || hasReviewedRental(givenReviews, rental.id)) return;
    if (!reviewComment.trim()) {
      toast.error("Por favor, escreva um comentário.");
      return;
    }
    setIsSubmittingReview(true);
    try {
      await createReview.mutateAsync({
        reviewer: userId,
        reviewee: rental.lesseeId,
        rating: reviewRating,
        comment: reviewComment.trim(),
        rental: rental.id,
      });
      toast.success("Avaliação enviada com sucesso!");
      setShowAvaliar(null);
      setReviewRating(5);
      setReviewComment("");
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Erro ao enviar avaliação.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const renderRentalCard = (r: (typeof rentals)[number], view: DashboardView) => (
    <RentalCard
      key={r.id}
      rental={r}
      view={view}
      counterparty={{
        label: "Locatário",
        name: r.lessee,
        icon: "storefront",
        className: "text-tertiary",
      }}
      analysisHref={r.hasContract ? `/contrato/${r.id}` : undefined}
      onPreviewCancellation={() => contractStore.previewCancellation(r.id)}
      onAmend={() => setAmendmentRentalId(r.id)}
      cancelLabel="Cancelar reserva"
      onCancel={async (reason) => {
        try { await cancelRental.mutateAsync({ id: r.id, reason }); toast.success("Reserva cancelada. As datas foram liberadas."); }
        catch (error) { toast.error(error instanceof HttpError ? error.message : "Não foi possível recusar a reserva."); }
      }}
      cancelling={cancelRental.isPending}
      meterBusy={recordReading.isPending || completeRental.isPending}
      onRecordReading={async (kind, value, note) => {
        try {
          const { warnings } = await recordReading.mutateAsync({ id: r.id, kind, value, note });
          toast.success("Leitura do horímetro registrada.");
          warnings.forEach((warning) => toast.warning(warning));
          return true;
        } catch (error) {
          toast.error(error instanceof HttpError ? error.message : "Não foi possível registrar a leitura.");
          return false;
        }
      }}
      onComplete={async (finalHourMeter) => {
        try {
          await completeRental.mutateAsync({ id: r.id, finalHourMeter });
          toast.success("Locação concluída.");
          return true;
        } catch (error) {
          toast.error(error instanceof HttpError ? error.message : "Não foi possível concluir a locação.");
          return false;
        }
      }}
      detailsOpen={showDetalhes === r.id}
      onToggleDetails={() => setShowDetalhes(showDetalhes === r.id ? null : r.id)}
      review={{
        buttonLabel: "Avaliar Locatário",
        title: "Avaliar Locatário",
        prompt: `Como foi a experiência com ${r.lessee}?`,
        open: showAvaliar === r.id,
        alreadyReviewed: hasReviewedRental(givenReviews, r.id),
        onToggle: () => { setShowAvaliar(showAvaliar === r.id ? null : r.id); setReviewRating(5); setReviewComment(""); },
        rating: reviewRating,
        onRatingChange: setReviewRating,
        comment: reviewComment.trim(),
        onCommentChange: setReviewComment,
        submitting: isSubmittingReview,
        onSubmit: () => void submitReview(r),
      }}
    />
  );

  return (
    <DashboardShell
      items={sidebarItems}
      tab={tab}
      onTabChange={setTab}
      onLogout={logout}
      logoutTab="sair"
      initials={user ? getInitials(user.name) : "…"}
      profilePhotoUrl={user?.profilePhotoUrl}
      accountName={user?.name ?? "…"}
      accountRole={<span className="capitalize">{user?.role ?? "…"}</span>}
    >
      {(() => {
        const relevant = tab === "dashboard" ? [rentalsQuery, machinesQuery, summaryQuery]
          : tab === "frota" ? [machinesQuery]
          : tab === "anuncios" ? [machinesQuery, postingsQuery]
          : ["reservas", "contratos"].includes(tab) ? [rentalsQuery, givenQuery]
          : tab === "avaliacoes" ? [receivedQuery, givenQuery] : [];
        return relevant.some((query) => query.isError)
          ? <div role="alert" className="mb-6 rounded-xl border border-error/30 p-4 text-error">Não foi possível carregar todos os dados desta seção. <button type="button" onClick={() => { for (const query of relevant) void query.refetch(); }} className="font-bold underline">Tentar novamente</button></div>
          : relevant.some((query) => query.isLoading) ? <p role="status">Carregando dados...</p> : null;
      })()}
      <EditEquipamentoModal
        open={isEditEquipamentoOpen}
        onOpenChange={setIsEditEquipamentoOpen}
        equipamento={selectedEquipamento}
        tiposPneu={tiposPneuQuery.data ?? []}
        onSave={async (data) => {
          await updateMachine.mutateAsync({ id: data.id, payload: {
            renagro_number: data.registroRenagro,
            brand: data.marca,
            model: data.modelo,
            year: data.anoFabricacao
              ? Number(data.anoFabricacao)
              : null,
            usage_purpose: data.finalidade,
            power_cv: data.potenciaCv ? Number(data.potenciaCv) : null,
            hour_meter: data.horimetro ? Number(data.horimetro) : null,
            technical_specifications: data.especificacoes.trim(),
            tipo_pneu: data.tipoPneuId || null,
          } });
          setSelectedEquipamento(data);
          toast.success("Equipamento atualizado com sucesso!");
        }}
      />

      {/* Dashboard */}
      {tab === "dashboard" && summary && !rentalsQuery.isLoading && !rentalsQuery.isError && !summaryQuery.isError && (
        <div className="space-y-8">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">
              Bom dia, {user ? user.name.split(" ")[0] : "…"}
            </h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">
              Veja o resumo das suas locações e frota
            </p>
          </div>

          <div role="group" aria-label="Filtros dos indicadores" className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="overview-months" className="text-xs font-bold text-on-surface-variant">Período</label>
              <select
                id="overview-months"
                value={overview.months}
                onChange={(e) => setOverview((current) => ({ ...current, months: Number(e.target.value) as 3 | 6 | 12 }))}
                className={filterSelectClass}
              >
                {OVERVIEW_PERIODS.map((months) => <option key={months} value={months}>Últimos {months} meses</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="overview-machine" className="text-xs font-bold text-on-surface-variant">Máquina</label>
              <select
                id="overview-machine"
                value={overviewMachine}
                onChange={(e) => setOverview((current) => ({ ...current, machine: e.target.value }))}
                className={filterSelectClass}
              >
                <option value="">Toda a frota</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {[m.brand, m.model].filter(Boolean).join(" ") || "Máquina"}{m.renagro ? ` · ${m.renagro}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {summaryQuery.isFetching ? <p role="status" className="text-xs text-on-surface-variant sm:pb-3">Atualizando indicadores...</p> : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {[
              {
                label: "LOCAÇÕES EM ABERTO",
                value: String(summary.totals.openRentals),
                sub: "pendentes e em andamento",
                icon: "event_available",
              },
              {
                label: "CONTRATOS",
                value: String(overviewContracts.length),
                sub: `${overviewContracts.filter((contract) => situacaoAssinatura(contract).completo).length} assinados`,
                icon: "description",
              },
              {
                label: "LOCAÇÕES TOTAIS",
                value: String(summary.totals.rentals),
                sub: "incluindo pendentes e canceladas",
                icon: "inventory_2",
              },
              {
                label: "LOCAÇÕES CONCLUÍDAS NO MÊS",
                value: formatCurrency(summary.totals.currentMonthRevenue),
                sub: new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
                icon: "payments",
              },
            ].map((stat, i) => (
              <div
                key={i}
                className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <MaterialIcon
                    icon={stat.icon}
                    size={16}
                    className="text-primary"
                  />
                  <div className="text-[10px] font-bold text-primary uppercase tracking-widest">
                    {stat.label}
                  </div>
                </div>
                <div className="font-headline text-3xl font-black text-on-surface mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-on-surface-variant">
                  {stat.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico de Receita */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">
                  Valores das Locações Concluídas
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Últimos {summary.months} meses · valor bruto por data de término, sem confirmação de repasse
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary">
                  {formatCurrency(summary.totals.revenue)}
                </div>
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Total no período
                </div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.monthly}>
                  <defs>
                    <linearGradient
                      id="colorRevenue"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--outline-variant)"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 12,
                      fill: "var(--on-surface-variant)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 12,
                      fill: "var(--on-surface-variant)",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `R$ ${Number(value).toLocaleString("pt-BR")}`,
                      "Valor bruto",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--outline-variant)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "var(--popover-foreground)" }}
                    itemStyle={{ color: "var(--popover-foreground)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de Avaliações */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">
                  Satisfação dos Clientes
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Média mensal de avaliações recebidas
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary-container/10 px-3 py-1.5 rounded-lg">
                <MaterialIcon
                  icon="star"
                  filled
                  className="text-secondary-container"
                  size={16}
                />
                <span className="font-black text-secondary text-sm">
                  {summary.totals.averageRating == null ? "Sem avaliações" : summary.totals.averageRating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  média no período
                </span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.monthly}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--outline-variant)"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 12,
                      fill: "var(--on-surface-variant)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{
                      fontSize: 12,
                      fill: "var(--on-surface-variant)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)} ★`,
                      "Nota média",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--outline-variant)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "var(--popover-foreground)" }}
                    itemStyle={{ color: "var(--popover-foreground)" }}
                  />
                  <Bar
                    dataKey="rating"
                    fill="var(--chart-2)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section aria-labelledby="status-breakdown-title" className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <h2 id="status-breakdown-title" className="font-headline text-lg font-bold text-on-surface">
                Situação das locações
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5 mb-4">
                Todas as datas · {summary.totals.rentals} {summary.totals.rentals === 1 ? "locação" : "locações"}
              </p>
              <div className="h-64" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.statusBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" opacity={0.3} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--on-surface-variant)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: "var(--on-surface-variant)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => [String(value), "Locações"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--outline-variant)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 13 }}
                      labelStyle={{ color: "var(--popover-foreground)" }}
                      itemStyle={{ color: "var(--popover-foreground)" }}
                    />
                    <Bar dataKey="total" fill="var(--chart-3)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="sr-only">
                {summary.statusBreakdown.map((row) => <li key={row.status}>{row.label}: {row.total}</li>)}
              </ul>
            </section>

            <section aria-labelledby="top-machines-title" className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <h2 id="top-machines-title" className="font-headline text-lg font-bold text-on-surface">
                Máquinas com maior valor concluído
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5 mb-4">Últimos {summary.months} meses</p>
              {summary.topMachines.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Nenhuma locação concluída no período.</p>
              ) : (
                <ol className="space-y-4">
                  {summary.topMachines.map((m, index) => (
                    <li key={m.machineId}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-bold text-on-surface">{index + 1}. {m.name || "Máquina"}</span>
                        <span className="font-bold text-primary">{formatCurrency(m.revenue)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-container mt-1.5" aria-hidden="true">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${topRevenue > 0 ? (m.revenue / topRevenue) * 100 : 0}%` }} />
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1">
                        {m.completedRentals} {m.completedRentals === 1 ? "locação concluída" : "locações concluídas"}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-headline text-xl font-bold text-on-surface">
                  Minhas locações
                </h2>
                <div className="h-0.5 w-12 bg-secondary-container mt-1" />
              </div>
              <button
                onClick={() => setTab("reservas")}
                className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
              >
                Ver todas <MaterialIcon icon="arrow_forward" size={14} />
              </button>
            </div>
            <DashboardCollection label="Minhas locações" items={rentals} defaultView="list"
              renderItem={(r, view) => {
                const badge = rentalStatusBadge(r.status);
                return (
                  <Link
                    to={`/dashboard?tab=reservas#locacao-${r.id}`}
                    key={r.id}
                    className={`bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 sm:p-5 flex flex-col gap-4 ${view === "list" ? "@xl/collection:flex-row @xl/collection:items-center" : ""} justify-between hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center">
                        <MaterialIcon
                          icon="agriculture"
                          className="text-primary"
                          size={24}
                        />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface text-sm">
                          {r.machine}
                        </div>
                        <div className="text-sm text-on-surface-variant">
                          {r.lessee} · {r.period} · {r.contract}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge config={badge} iconSize={12} />
                      <MaterialIcon
                        icon="chevron_right"
                        className="text-on-surface-variant"
                        size={20}
                      />
                    </div>
                  </Link>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* Minha Frota */}
      {tab === "frota" && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h1 className="font-headline text-3xl font-bold text-primary">
                Minha Frota
              </h1>
              <div className="h-1 w-16 bg-secondary-container mt-2" />
              <p className="text-on-surface-variant text-sm mt-3">
                Gerencie os equipamentos cadastrados
              </p>
            </div>
            <Link
              to="/dashboard/novo-equipamento"
              className="bg-secondary-container text-on-secondary-container px-6 py-3 rounded-lg font-bold text-sm hover:brightness-95 transition-all flex items-center gap-2 shadow-sm"
            >
              <MaterialIcon icon="add" size={18} /> Novo Equipamento
            </Link>
          </div>

          <DashboardSearchBar
            searchValue={searchText}
            onSearchChange={(value) => { setSearch((current) => ({ ...current, [tab]: value })); }}
            yearValue={year}
            onYearChange={(value) => { setYears((current) => ({ ...current, [tab]: value })); }}
            years={yearOptions(machines.map((machine) => machine.year))}
            searchPlaceholder="Buscar por marca, modelo ou registro..."
          />

          <DashboardCollection label="Minha frota" items={filteredMachines} resetKey={JSON.stringify([searchText, year])}
            renderItem={(m) => (
              <div
                key={m.id}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 sm:p-6 flex flex-wrap items-start justify-between gap-4 group hover:shadow-xl transition-all duration-300 shadow-sm"
              >
                <div className="flex min-w-0 max-w-full items-start gap-4">
                  <div className="w-14 h-14 shrink-0 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MaterialIcon
                      icon="agriculture"
                      className="text-primary"
                      size={28}
                    />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-on-surface text-lg">
                      {m.brand} {m.model}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      Ano: {m.year} · Registro: {m.renagro}
                    </p>
                    <p className="text-xs text-outline font-medium tracking-wide uppercase mt-1">
                      Finalidade: {m.purpose || "Não informada"}
                    </p>
                    <p className="text-xs text-outline font-medium tracking-wide uppercase mt-1">
                      Pneu: {m.tipoPneu ?? "Não informado"}
                    </p>
                    <MachineUsageLine machineId={m.id} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 self-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                    {m.status === "active" ? "Ativo" : m.status === "maintenance" ? "Em manutenção" : "Inativo"}
                  </span>
                  <button
                    onClick={() => openEditModalForMachine(m)}
                    className="text-sm font-bold text-primary hover:underline self-end flex items-center gap-1"
                  >
                    <MaterialIcon icon="edit" size={14} /> Editar
                  </button>
                </div>
              </div>
            )}
          />
          {filteredMachines.length === 0 && !machinesQuery.isLoading && !machinesQuery.isError && <p role="status">Nenhum equipamento encontrado.</p>}

        </div>
      )}

      {tab === "operadores" && <OperadoresPanel />}

      {/* Documentos */}
      {tab === "documentos" && <DocumentsSection userId={userId} />}

      {/* Anúncios */}
      {tab === "anuncios" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h1 className="font-headline text-3xl font-bold text-primary">
                Anúncios
              </h1>
              <div className="h-1 w-16 bg-secondary-container mt-2" />
              <p className="text-on-surface-variant text-sm mt-3">
                Gerencie seus anúncios publicados
              </p>
            </div>
            <Link
              to="/dashboard/novo-anuncio"
              className="bg-secondary-container text-on-secondary-container px-6 py-3 rounded-lg font-bold text-sm hover:brightness-95 transition-all flex items-center gap-2 shadow-sm"
            >
              <MaterialIcon icon="add" size={18} /> Novo Anúncio
            </Link>
          </div>
          <DashboardSearchBar
            searchValue={searchText}
            onSearchChange={(value) => { setSearch((current) => ({ ...current, [tab]: value })); }}
            yearValue={year}
            onYearChange={(value) => { setYears((current) => ({ ...current, [tab]: value })); }}
            years={yearOptions(postings.map((posting) => posting.year))}
            searchPlaceholder="Buscar por maquinário ou localização..."
          />
          <DashboardCollection label="Anúncios" items={filteredPostings} resetKey={JSON.stringify([searchText, year])}
            renderItem={(p, view) => (
              <div
                key={p.id}
                className={`bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden group hover:shadow-xl transition-all duration-300 shadow-sm ${view === "list" ? "@xl/collection:flex" : ""}`}
              >
                <div className={`h-40 shrink-0 bg-gradient-to-br from-primary/10 via-secondary-container/10 to-tertiary/10 overflow-hidden flex items-center justify-center ${view === "list" ? "@xl/collection:w-48 @xl/collection:h-auto" : ""}`}>
                  {p.photo ? <img src={p.photo} alt={p.machine} className="h-full w-full object-cover" /> : <div className="w-14 h-14 bg-surface-container-lowest/70 rounded-2xl flex items-center justify-center border border-outline-variant/20 backdrop-blur-sm">
                    <MaterialIcon
                      icon="precision_manufacturing"
                      className="text-primary"
                      size={28}
                    />
                  </div>}
                </div>
                <div className="min-w-0 flex-1 p-5">
                  <div className="flex flex-wrap gap-2 justify-between items-start mb-2">
                    <h4 className="font-headline font-bold text-on-surface">
                      {p.machine}
                    </h4>
                    <StatusBadge config={postingStatusBadge(p.status)} />
                  </div>
                  <p className="text-sm text-on-surface-variant mb-3 flex items-center gap-1">
                    <MaterialIcon icon="location_on" size={16} />{" "}
                    {p.location}
                  </p>
                  <div className="flex justify-between items-center">
                    <div className="text-xl font-black text-primary">
                      {formatCurrency(p.price)}
                      <span className="text-sm font-bold text-tertiary">
                        /h
                      </span>
                    </div>
                    <Link
                      to={`/dashboard/gerenciar-anuncio/${p.id}`}
                      className="text-sm font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      Gerenciar
                    </Link>
                  </div>
                </div>
              </div>
            )}
          />
          {filteredPostings.length === 0 && !postingsQuery.isLoading && !postingsQuery.isError && <p role="status">Nenhum anúncio encontrado.</p>}

        </div>
      ) : null}

      {/* Reservas/Locações */}
      {tab === "reservas" ? (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">
              Locações
            </h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">
              Gerencie suas locações
            </p>
          </div>

          <DashboardSearchBar
            searchValue={searchText}
            onSearchChange={(value) => { setSearch((current) => ({ ...current, [tab]: value })); }}
            yearValue={year}
            onYearChange={(value) => { setYears((current) => ({ ...current, [tab]: value })); }}
            years={yearOptions(rentals.map((rental) => rental.year))}
            searchPlaceholder="Buscar por locatário, maquinário ou contrato..."
          />

          <DashboardCollection
            label="Locações"
            items={[...visibleActiveRentals, ...visiblePastRentals]}
            resetKey={JSON.stringify([searchText, year])}
            focusItemId={focusedRentalId}
            getGroup={(rental) => isOpenRental(rental) ? "Locações em Andamento" : "Locações Passadas"}
            renderItem={renderRentalCard}
          />

          {filteredRentals.length === 0 && !rentalsQuery.isError && !rentalsQuery.isLoading && <p role="status">Nenhuma locação encontrada.</p>}
        </div>
      ) : null}

      {/* Contratos */}
      {tab === "contratos" ? (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">
              Contratos
            </h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">
              Gerencie seus contratos de locação
            </p>
          </div>
          <DashboardSearchBar
            searchValue={searchText}
            onSearchChange={(value) => { setSearch((current) => ({ ...current, [tab]: value })); }}
            yearValue={year}
            onYearChange={(value) => { setYears((current) => ({ ...current, [tab]: value })); }}
            years={yearOptions(contracts.map((rental) => rental.year))}
            searchPlaceholder="Buscar por contrato, locatário ou maquinário..."
          />
          <div className="flex flex-wrap gap-2">
            {["Todos", "Pendentes", "Assinados", "Encerrados"].map((f) => (
              <button
                key={f}
                onClick={() => setContractFilter(f)}
                aria-pressed={contractFilter === f}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  f === contractFilter
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {filteredContracts.length === 0 && !rentalsQuery.isError && !rentalsQuery.isLoading && <p role="status" className="text-sm text-on-surface-variant">Nenhum contrato disponível.</p>}
          <DashboardCollection label="Contratos" items={filteredContracts} defaultView="list" resetKey={JSON.stringify([searchText, year, contractFilter])}
            renderItem={(c, view) => (
            <div
              key={c.id}
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 sm:p-6 hover:shadow-xl transition-all duration-300 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 bg-surface-container-high rounded-xl flex items-center justify-center">
                    <MaterialIcon
                      icon="description"
                      className="text-primary"
                      size={24}
                    />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-on-surface">
                      {c.contract} — {c.machine}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {c.lessee}{c.createdAt ? ` · Criado em ${c.createdAt.toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                </div>
                <StatusBadge config={situacaoAssinatura(c).encerrado
                  ? { icon: "check_circle", variant: "neutral", label: "Encerrado" }
                  : situacaoAssinatura(c).completo
                    ? { icon: "verified", variant: "success", label: "Assinado" }
                    : isAwaitingPayment(c)
                      ? { icon: "payments", variant: "pending", label: "Aguardando Pagamento" }
                      : { icon: "description", variant: "pending", label: "Assinatura Pendente" }} />
              </div>
              <div className={`grid grid-cols-1 @sm/collection:grid-cols-2 ${view === "list" ? "@3xl/collection:grid-cols-4" : ""} gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 mb-4`}>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Locatário
                  </div>
                  <div className="font-bold text-tertiary text-sm">
                    {c.lessee}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Período
                  </div>
                  <div className="font-bold text-primary text-sm">
                    {c.period}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Valor Total
                  </div>
                  <div className="font-black text-primary text-lg">
                    {c.total}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Maquinário
                  </div>
                  <div className="font-bold text-on-surface text-sm">
                    {c.machine}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to={`/contrato/${c.id}`} className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 text-center decoration-transparent">
                  <MaterialIcon icon="visibility" size={16} /> Visualizar Contrato
                </Link>
                {situacaoAssinatura(c).podeAssinarComoLocador ? (
                  <button
                    onClick={() => setAssinando({ id: c.id, papel: "locador" })}
                    className="bg-secondary-container/30 text-secondary px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-secondary-container/50 transition-colors flex items-center gap-2"
                  >
                    <MaterialIcon icon="draw" size={16} /> Assinar Contrato
                  </button>
                ) : null}
              </div>
            </div>
          )}
          />

        </div>
      ) : null}

      {/* Chat */}
      {tab === "chat" ? (
        <ChatInboxPanel subtitle="Converse com seus locatários" />
      ) : null}

      {/* Notificações */}
      {tab === "notificacoes" && <NotificationsPanel />}

      {/* Avaliações */}
      {tab === "avaliacoes" ? (
        <ReviewsSection receivedReviews={receivedReviews} givenReviews={givenReviews} />
      ) : null}

      {/* Minha Conta */}
      {tab === "conta" ? (
        <AccountSection
          userId={userId}
          user={user}
          roleLabel={<span className="capitalize">{user?.role ?? "…"}</span>}
        />
      ) : null}
      <AssinaturaContratoModal
        open={assinando !== null}
        onOpenChange={(open) => !open && setAssinando(null)}
        contratoId={assinando?.id ?? ""}
        papel={assinando?.papel ?? "locador"}
        onAssinado={() => {
          setAssinando(null);
          void rentalsQuery.refetch();
        }}
      />
      {amendmentRentalId && <ContractAmendmentsDialog contractId={amendmentRentalId} actorId={userId} onClose={() => setAmendmentRentalId(null)} />}
    </DashboardShell>
  );
};

export default DashboardLocador;
