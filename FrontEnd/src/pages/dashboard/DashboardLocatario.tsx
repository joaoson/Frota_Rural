import { DashboardCollection, type DashboardView } from "@/features/dashboard/components/DashboardCollection";
import { canDo, isConfirmedRental, isOpenRental } from "@/features/contracts/types/rentalLifecycle";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { NotificationsPanel } from "@/features/notifications/components/NotificationsPanel";
import { useAuth } from "@/contexts/useAuth";
import { AccountSection } from "@/features/dashboard/components/AccountSection";
import {
  DashboardShell,
  type SidebarItem,
} from "@/features/dashboard/components/DashboardShell";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { ReviewsSection } from "@/features/dashboard/components/ReviewsSection";
import ChatInboxPanel from "@/features/chat/components/ChatInboxPanel";
import DashboardMachineSearch from "@/components/DashboardMachineSearch";
import OperadoresPanel from "@/components/OperadoresPanel";
import { useCancelRental, useRentalsAsLessee } from "@/features/contracts/hooks/useContracts";
import { RentalRecurrenceDialog } from "@/features/contracts/components/RentalRecurrenceDialog";
import { RentalPaymentButton } from "@/features/payments/components/RentalPaymentButton";
import { rentalMachineName, rentalHasContract, situacaoAssinatura, type Rental } from "@/features/contracts/types/rental";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";
import {
  useCreateReview,
  useReceivedReviews,
  useWrittenReviews,
} from "@/features/reviews/hooks/useReviews";
import { averageRating, hasReviewedRental, type Review } from "@/features/reviews/types/review";
import AssinaturaContratoModal from "@/components/AssinaturaContratoModal";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { getInitials } from "@/shared/utils/getInitials";
import { useUser } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user";
import { HttpError } from "@/shared/http/errors";
import { toast } from "sonner";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";


const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const sidebarItems: readonly SidebarItem<Tab>[] = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "search", label: "Buscar Máquinas", tab: "buscar" },
  { icon: "event_available", label: "Minhas Locações", tab: "locacoes" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "engineering", label: "Operadores", tab: "operadores" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
];

type Tab =
  | "dashboard"
  | "buscar"
  | "locacoes"
  | "contratos"
  | "operadores"
  | "avaliacoes"
  | "chat"
  | "notificacoes"
  | "conta"
  | "sair";

const DashboardLocatario = () => {
  const { userId, userRole, logout } = useAuth();
  const isOperator = userRole === "operador";
  const visibleItems = isOperator ? sidebarItems.filter(item => ["chat", "notificacoes", "conta", "sair"].includes(item.tab)) : sidebarItems;

  const [searchParams, setSearchParams] = useSearchParams();
  const { hash } = useLocation();
  const focusedRentalId = hash.startsWith("#locacao-") ? hash.slice("#locacao-".length) : undefined;
  const requestedTab = searchParams.get("tab");
  const tab: Tab = visibleItems.find((item) => item.tab === requestedTab)?.tab ?? (isOperator ? "conta" : "dashboard");
  const setTab = (next: Tab) => setSearchParams({ tab: next });
  const [rentalSearch, setRentalSearch] = useState("");
  const [rentalYear, setRentalYear] = useState("Todos");
  const [contractSearch, setContractSearch] = useState("");
  const [contractYear, setContractYear] = useState("Todos");
  const [contractFilter, setContractFilter] = useState("Todos");
  const [signingRental, setSigningRental] = useState<string | null>(null);
  const [showDetalhes, setShowDetalhes] = useState<string | null>(null);
  const [recurrenceSource, setRecurrenceSource] = useState<Rental | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [showAvaliar, setShowAvaliar] = useState<string | null>(null);

  const userQuery = useUser(userId);
  const user: User | null = userQuery.data ?? null;
  const receivedQuery = useReceivedReviews(isOperator ? null : userId);
  const givenQuery = useWrittenReviews(isOperator ? null : userId);
  const rentalsQuery = useRentalsAsLessee(isOperator ? null : userId);
  const createReview = useCreateReview();
  const cancelRental = useCancelRental();

  const receivedReviews: Review[] = receivedQuery.data ?? [];
  const givenReviews: Review[] = givenQuery.data ?? [];

  const rentals = useMemo(
    () =>
      (rentalsQuery.data ?? []).map((rental) => ({
        id: rental.id,
        source: rental,
        recurrenceIndex: rental.recurrenceIndex,
        owner: rental.lessorName ?? "Locador",
        machine: rentalMachineName(rental),
        period:
          rental.startDate && rental.endDate
            ? `${rental.startDate.toLocaleDateString("pt-BR")} a ${rental.endDate.toLocaleDateString("pt-BR")}`
            : "",
        status: rental.status,
        phase: rental.phase,
        allowedActions: rental.allowedActions,
        notes: rental.notes,
        meter: rental.meter,
        total: (rental.totalPrice ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        contract: rentalHasContract(rental) ? rental.contractNumber : null,
        hasContract: rentalHasContract(rental),
        acceptedByLessor: rental.acceptedByLessor,
        acceptedByLessee: rental.acceptedByLessee,

      })),
    [rentalsQuery.data],
  );
  
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const matches = (r: (typeof rentals)[number], search: string, year: string) =>
    normalizeSearch(`${r.owner} ${r.machine} ${r.contract ?? ""}`).includes(normalizeSearch(search.trim())) &&
    (year === "Todos" || String(r.source.startDate?.getFullYear()) === year);
  const years = ["Todos", ...Array.from(new Set(rentals.flatMap(r => r.source.startDate ? [String(r.source.startDate.getFullYear())] : []))).sort().reverse()];
  const allContracts = rentals.filter(r => r.hasContract);
  const contracts = allContracts.filter(r => matches(r, contractSearch, contractYear) && (contractFilter === "Todos" || situacaoAssinatura(r).grupo === contractFilter));
  const filteredRentals = rentals.filter(r => matches(r, rentalSearch, rentalYear));
  const activeRentals = filteredRentals.filter(isOpenRental);
  const pastRentals = filteredRentals.filter(r => !isOpenRental(r));
  const today = new Date();
  const spendData = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const monthRentals = rentals.filter(r => r.source.startDate?.getFullYear() === month.getFullYear() && r.source.startDate?.getMonth() === month.getMonth() && ["active", "signed", "completed", "closed"].includes(r.status ?? ""));
    return { month: month.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), value: monthRentals.reduce((sum, r) => sum + (r.source.totalPrice ?? 0), 0) };
  });
  const ratingsData = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    return { month: month.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), rating: averageRating(receivedReviews.filter(r => r.createdAt?.getFullYear() === month.getFullYear() && r.createdAt?.getMonth() === month.getMonth())) };
  });
  const ratingAverage = averageRating(receivedReviews);
  const cancel = async (id: string) => {
    try {
      await cancelRental.mutateAsync(id);
      toast.success("Reserva cancelada. As datas foram liberadas.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cancelar a reserva."); }
  };

  const submitReview = async (rental: Rental) => {
    if (!userId || isSubmittingReview) return;
    if (!rental.lessorId || hasReviewedRental(givenReviews, rental.id)) {
      toast.error("Não foi possível avaliar esta locação. Atualize a página e tente novamente.");
      return;
    }
    if (!reviewComment.trim()) {
      toast.error("Por favor, escreva um comentário.");
      return;
    }
    setIsSubmittingReview(true);
    try {
      await createReview.mutateAsync({
        reviewer: userId,
        reviewee: rental.lessorId,
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
      recurrenceIndex={r.recurrenceIndex}
      onScheduleRecurrence={() => { setRecurrenceSource(r.source); setRecurrenceOpen(true); }}
      paymentAction={canDo(r, "pay") ? <RentalPaymentButton rentalId={r.id} /> : undefined}
      counterparty={{
        label: "Locador",
        name: r.owner,
        icon: "person",
        className: "text-primary",
      }}
      detailsOpen={showDetalhes === r.id}
      onToggleDetails={() => setShowDetalhes(showDetalhes === r.id ? null : r.id)}
      onCancel={() => void cancel(r.id)}
      cancelling={cancelRental.isPending && cancelRental.variables === r.id}
      cancelLabel="Cancelar reserva"
      analysisHref={`/dashboard-locatario/locacoes/${r.id}`}
      review={{
        alreadyReviewed: hasReviewedRental(givenReviews, r.id),
        buttonLabel: "Avaliar",
        title: "Avaliar Serviço",
        prompt: `Como foi sua experiência com ${r.owner}?`,
        open: showAvaliar === r.id,
        onToggle: () => { setShowAvaliar(showAvaliar === r.id ? null : r.id); setReviewComment(""); setReviewRating(5); },
        rating: reviewRating,
        onRatingChange: setReviewRating,
        comment: reviewComment,
        onCommentChange: setReviewComment,
        submitting: isSubmittingReview,
        onSubmit: () => void submitReview(r.source),
      }}
    />
  );

  return (
    <DashboardShell
      items={visibleItems}
      tab={tab}
      onTabChange={setTab}
      onLogout={logout}
      logoutTab="sair"
      initials={user ? getInitials(user.name) : "…"}
      profilePhotoUrl={user?.profilePhotoUrl}
      accountName={user ? `${user.name.split(" ")[0]} ${user.name.split(" ").slice(-1)[0]}` : "…"}
      accountRole={isOperator ? "Operador" : "Locatário"}
      avatarClassName="bg-tertiary-container text-on-tertiary"
    >
      {rentalsQuery.isLoading && <p role="status">Carregando locações...</p>}
      {rentalsQuery.isError && <div role="alert" className="rounded-xl bg-error/10 p-4 text-error">Não foi possível carregar suas locações. <button type="button" onClick={() => void rentalsQuery.refetch()} className="underline font-bold">Tentar novamente</button></div>}
      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="space-y-8">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Bom dia, {user ? user.name.split(" ")[0] : "…"}</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Veja o resumo das suas locações</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {[
              { label: "LOCAÇÕES ATIVAS", value: String(rentals.filter(isConfirmedRental).length), sub: "pagas e em andamento", icon: "event_available" },
              { label: "CONTRATOS", value: String(allContracts.filter(r => r.acceptedByLessor && r.acceptedByLessee).length), sub: "assinados por ambas as partes", icon: "description" },
              { label: "LOCAÇÕES TOTAIS", value: String(rentals.length), sub: "reservas registradas", icon: "inventory_2" },
              { label: "VALOR CONTRATADO NO MÊS", value: formatCurrency(spendData[5].value), sub: today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), icon: "payments" },
            ].map((stat, i) => (
              <div key={i} className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-all group">
                <div className="flex items-center gap-2 mb-3">
                  <MaterialIcon icon={stat.icon} size={16} className="text-primary" />
                  <div className="text-[10px] font-bold text-primary uppercase tracking-widest">{stat.label}</div>
                </div>
                <div className="font-headline text-3xl font-black text-on-surface mb-1">{stat.value}</div>
                <div className="text-sm text-on-surface-variant">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Gráfico de Gastos */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">Valores das Locações</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Últimos 6 meses · valores contratados por mês de início, sem reservas pendentes ou canceladas</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary">{formatCurrency(spendData.reduce((sum, month) => sum + month.value, 0))}</div>
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Total acumulado</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendData}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'Valor contratado']} contentStyle={{ borderRadius: 12, border: '1px solid var(--outline-variant)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 13 }} labelStyle={{ color: 'var(--popover-foreground)' }} itemStyle={{ color: 'var(--popover-foreground)' }} />
                  <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#colorSpend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de Avaliações */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">Notas das Avaliações</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Média mensal de satisfação</p>
              </div>
              <div className="flex items-center gap-1.5 bg-secondary-container/10 px-3 py-1.5 rounded-lg">
                <MaterialIcon icon="star" filled className="text-secondary-container" size={16} />
                <span className="font-black text-secondary text-sm">{ratingAverage === null ? "Sem avaliações" : ratingAverage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">média</span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} ★`, 'Nota média']} contentStyle={{ borderRadius: 12, border: '1px solid var(--outline-variant)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 13 }} labelStyle={{ color: 'var(--popover-foreground)' }} itemStyle={{ color: 'var(--popover-foreground)' }} />
                  <Bar dataKey="rating" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-headline text-xl font-bold text-on-surface">Minhas locações</h2>
                <div className="h-0.5 w-12 bg-secondary-container mt-1" />
              </div>
              <button onClick={() => setTab("locacoes")} className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
                Ver todas <MaterialIcon icon="arrow_forward" size={14} />
              </button>
            </div>
            <DashboardCollection label="Minhas locações" items={rentals} defaultView="list"
              renderItem={(r, view) => {
                const badge = rentalStatusBadge(r.status);
                return (
                  <Link key={r.id} to={`/dashboard-locatario?tab=locacoes#locacao-${r.id}`} className={`bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 sm:p-5 flex flex-col gap-4 ${view === "list" ? "@xl/collection:flex-row @xl/collection:items-center" : ""} justify-between hover:shadow-md transition-shadow`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-surface-container-high">
                        <MaterialIcon icon="agriculture" className="text-primary p-2" size={32} />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface text-sm">{r.machine}</div>
                        <div className="text-sm text-on-surface-variant">{r.owner} · {r.period} · {r.contract}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge config={badge} iconSize={12} />
                      <MaterialIcon icon="chevron_right" className="text-on-surface-variant" size={20} />
                    </div>
                  </Link>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* Buscar */}
      {tab === "buscar" && <DashboardMachineSearch />}

      {/* Locações */}
      {tab === "locacoes" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Minhas Locações</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Gerencie suas locações</p>
          </div>

          <DashboardSearchBar
            searchValue={rentalSearch}
            onSearchChange={setRentalSearch}
            yearValue={rentalYear}
            onYearChange={setRentalYear}
            years={years}
            searchPlaceholder="Buscar por locador, maquinário ou contrato..."
          />

          {!rentalsQuery.isLoading && !rentalsQuery.isError && filteredRentals.length === 0 && <p role="status">Nenhuma locação encontrada.</p>}
          <DashboardCollection
            label="Locações"
            items={[...activeRentals, ...pastRentals]}
            resetKey={JSON.stringify([rentalSearch, rentalYear])}
            focusItemId={focusedRentalId}
            getGroup={(rental) => isOpenRental(rental) ? "Locações em Andamento" : "Locações Passadas"}
            renderItem={renderRentalCard}
          />
        </div>
      )}

      {/* Contratos */}
      {tab === "contratos" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Contratos</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Seus contratos assinados e pendentes</p>
          </div>
          <DashboardSearchBar
            searchValue={contractSearch}
            onSearchChange={setContractSearch}
            yearValue={contractYear}
            onYearChange={setContractYear}
            years={years}
            searchPlaceholder="Buscar por contrato, locador ou maquinário..."
          />
          <div className="flex flex-wrap gap-2">
            {["Todos", "Pendentes", "Assinados", "Encerrados"].map((f) => (
              <button key={f} type="button" onClick={() => setContractFilter(f)} aria-pressed={contractFilter === f} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${f === contractFilter ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
                {f}
              </button>
            ))}
          </div>
          {contracts.length === 0 && <p role="status" className="text-sm text-on-surface-variant">Nenhum contrato disponível.</p>}
          <DashboardCollection label="Contratos" items={contracts} defaultView="list" resetKey={JSON.stringify([contractSearch, contractYear, contractFilter])}
            renderItem={(c, view) => (
            <div key={c.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 sm:p-6 hover:shadow-xl transition-all duration-300 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 bg-surface-container-high rounded-xl flex items-center justify-center">
                    <MaterialIcon icon="description" className="text-primary" size={24} />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-on-surface">{c.contract} — {c.machine}</h3>
                    <p className="text-sm text-on-surface-variant">{c.owner} · {c.source.createdAt ? `Criado em ${c.source.createdAt.toLocaleDateString("pt-BR")}` : c.period}</p>
                  </div>
                </div>
                <span className="px-3 py-1.5 font-bold text-xs rounded bg-primary/10 text-primary">
                  {situacaoAssinatura(c).encerrado ? "Encerrado" : situacaoAssinatura(c).completo ? "Assinado" : "Assinatura Pendente"}
                </span>
              </div>
              <div className={`grid grid-cols-1 @sm/collection:grid-cols-2 ${view === "list" ? "@3xl/collection:grid-cols-4" : ""} gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 mb-4`}>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Locador</div>
                  <div className="font-bold text-tertiary text-sm">{c.owner}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Período</div>
                  <div className="font-bold text-primary text-sm">{c.period}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Valor Total</div>
                  <div className="font-black text-primary text-lg">{c.total}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Maquinário</div>
                  <div className="font-bold text-on-surface text-sm">{c.machine}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to={`/contrato/${c.id}`} className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 text-center decoration-transparent">
                  <MaterialIcon icon="visibility" size={16} /> Visualizar Contrato
                </Link>
                {canDo(c, "pay") && <RentalPaymentButton rentalId={c.id} />}
                {situacaoAssinatura(c).podeAssinarComoLocatario && <button type="button" onClick={() => setSigningRental(c.id)} className="bg-primary/10 text-primary px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2"><MaterialIcon icon="draw" size={16} /> Assinar Contrato</button>}
                <Link to={`/contrato/${c.id}?print=1`} className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors flex items-center gap-2">
                  <MaterialIcon icon="download" size={16} /> Imprimir / Salvar PDF
                </Link>
              </div>
            </div>
          )}
          />
        </div>
      )}

      {/* Avaliações Tab */}
      {tab === "avaliacoes" && (
        <ReviewsSection receivedReviews={receivedReviews} givenReviews={givenReviews} />
      )}

      {/* Chat */}
      {tab === "operadores" && <OperadoresPanel />}

      {tab === "chat" && <ChatInboxPanel subtitle={isOperator ? "Converse sobre seus serviços" : "Converse com seus locadores"} />}

      {/* Notificações */}
      {tab === "notificacoes" && <NotificationsPanel />}

      {/* Minha Conta */}
      {tab === "conta" && (
        <AccountSection
          userId={userId}
          user={user}
          roleLabel={isOperator ? "Operador" : "Locatário"}
          avatarClassName="bg-tertiary-container text-on-tertiary"
        />
      )}
      <AssinaturaContratoModal open={signingRental !== null} onOpenChange={(open) => { if (!open) setSigningRental(null); }} contratoId={signingRental ?? ""} papel="locatario" onAssinado={() => { void rentalsQuery.refetch(); }} />
      {recurrenceSource && <RentalRecurrenceDialog key={recurrenceSource.id} source={recurrenceSource} open={recurrenceOpen} onOpenChange={(open) => { setRecurrenceOpen(open); if (!open) setTab("locacoes"); }} />}
    </DashboardShell>
  );
};

export default DashboardLocatario;
