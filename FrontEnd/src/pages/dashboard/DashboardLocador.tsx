import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { useRentalsAsLessor } from "@/features/contracts/hooks/useContracts";
import { rentalMachineName } from "@/features/contracts/types/rental";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";
import { AccountSection } from "@/features/dashboard/components/AccountSection";
import { DashboardShell } from "@/features/dashboard/components/DashboardShell";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { ReviewsSection } from "@/features/dashboard/components/ReviewsSection";
import { documentStore } from "@/app/container";
import { useCertifications, useOperatorLicenses } from "@/features/documents/hooks/useDocuments";
import type { Certification, OperatorLicense } from "@/features/documents/types/document";
import { useMachines } from "@/features/machines/hooks/useMachines";
import { machineStore } from "@/app/container";
import { usePostings } from "@/features/postings/hooks/usePostings";
import { postingMachineName } from "@/features/postings/types/posting";
import {
  useCreateReview,
  useReceivedReviews,
  useWrittenReviews,
} from "@/features/reviews/hooks/useReviews";
import type { Review } from "@/features/reviews/types/review";
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
import DashboardPagination from "@/components/DashboardPagination";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";
import EditEquipamentoModal, {
  type EquipamentoData,
} from "@/components/EditEquipamentoModal";
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

const revenueData = [
  { month: "Set", value: 8200 },
  { month: "Out", value: 12400 },
  { month: "Nov", value: 18600 },
  { month: "Dez", value: 6250 },
  { month: "Jan", value: 38400 },
  { month: "Fev", value: 4800 },
];

const ratingsData = [
  { month: "Set", rating: 4.2 },
  { month: "Out", rating: 4.5 },
  { month: "Nov", rating: 4.8 },
  { month: "Dez", rating: 5.0 },
  { month: "Jan", rating: 4.3 },
  { month: "Fev", rating: 4.9 },
];

const NOTIFICATIONS = [
  {
    id: 1,
    icon: "description",
    title: "Contrato aguardando assinatura",
    desc: "Fazenda Aurora · Trator Valtra BH194",
    time: "Agora",
    unread: true,
  },
  {
    id: 2,
    icon: "event_available",
    title: "Nova solicitação de reserva",
    desc: "Fazenda São João · Colheitadeira JD S700",
    time: "2h atrás",
    unread: true,
  },
  {
    id: 3,
    icon: "star",
    title: "Nova avaliação recebida",
    desc: "Fazenda Boa Vista avaliou com 5 estrelas",
    time: "Ontem",
    unread: false,
  },
];

const sidebarItems = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "agriculture", label: "Minha frota", tab: "frota" },
  { icon: "campaign", label: "Anúncios", tab: "anuncios" },
  { icon: "event_available", label: "Locações", tab: "reservas" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "badge", label: "Documentos", tab: "documentos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
] as const;

type Tab = (typeof sidebarItems)[number]["tab"];

const DashboardLocador = () => {
  const { userId, logout } = useAuth();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showDetalhes, setShowDetalhes] = useState<string | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const userQuery = useUser(userId);
  const user: User | null = userQuery.data ?? null;

  const machinesQuery = useMachines({ ownerId: userId ?? undefined }, Boolean(userId));
  const postingsQuery = usePostings({});
  const rentalsQuery = useRentalsAsLessor(userId);
  const receivedQuery = useReceivedReviews(userId);
  const givenQuery = useWrittenReviews(userId);
  const licensesQuery = useOperatorLicenses({ userId: userId ?? undefined }, Boolean(userId));
  const certificationsQuery = useCertifications({ userId: userId ?? undefined }, Boolean(userId));

  const createReview = useCreateReview();

  const receivedReviews: Review[] = receivedQuery.data ?? [];
  const givenReviews: Review[] = givenQuery.data ?? [];
  const licenses: OperatorLicense[] = licensesQuery.data ?? [];
  const certifications: Certification[] = certificationsQuery.data ?? [];

  const machines = useMemo(
    () =>
      (machinesQuery.data ?? []).map((m) => ({
        id: m.id,
        renagro: m.renagroNumber,
        brand: m.brand,
        model: m.model,
        year: m.year,
        status: m.status ?? "active",
        purpose: m.usagePurpose ?? "",
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
      }));
  }, [machinesQuery.data, postingsQuery.data]);

  const rentals = useMemo(
    () =>
      (rentalsQuery.data ?? []).map((r) => ({
        id: r.id,
        lessee: r.lesseeName ?? "Locatário",
        machine: rentalMachineName(r),
        period:
          r.startDate && r.endDate
            ? `${r.startDate.toLocaleDateString("pt-BR")} a ${r.endDate.toLocaleDateString("pt-BR")}`
            : "",
        status: r.status,
        total: (r.totalPrice ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        contract: r.contractNumber,
      })),
    [rentalsQuery.data],
  );
  const [isEditEquipamentoOpen, setIsEditEquipamentoOpen] = useState(false);
  const [selectedEquipamento, setSelectedEquipamento] =
    useState<EquipamentoData>({
      id: "",
      registroRenagro: "",
      marca: "",
      modelo: "",
      anoFabricacao: "",
      finalidade: "Plantio",
      horimetroInicial: "",
      horimetroFinal: "",
      especificacoes: "",
    });

  const openEditModalForMachine = (m: (typeof machines)[number]) => {
    setSelectedEquipamento({
      id: String(m.id),
      registroRenagro: m.renagro ?? "",
      marca: m.brand ?? "",
      modelo: m.model ?? "",
      anoFabricacao: m.year ? String(m.year) : "",
      finalidade: m.purpose ?? "",
      horimetroInicial: "",
      horimetroFinal: "",
      especificacoes: "",
    });
    setIsEditEquipamentoOpen(true);
  };

  const activeRentals = useMemo(
    () =>
      rentals.filter(
        (r) => r.status === "pending" || r.status === "active",
      ),
    [rentals],
  );
  const pastRentals = useMemo(
    () =>
      rentals.filter(
        (r) => r.status === "completed" || r.status === "cancelled",
      ),
    [rentals],
  );

  const [frotaPage, setFrotaPage] = useState(1);
  const [anunciosPage, setAnunciosPage] = useState(1);
  const frotaPerPage = 2;
  const anunciosPerPage = 2;
  const frotaTotalPages = Math.ceil(machines.length / frotaPerPage);
  const anunciosTotalPages = Math.ceil(postings.length / anunciosPerPage);
  const paginatedFrota = machines.slice(
    (frotaPage - 1) * frotaPerPage,
    frotaPage * frotaPerPage,
  );
  const paginatedAnuncios = postings.slice(
    (anunciosPage - 1) * anunciosPerPage,
    anunciosPage * anunciosPerPage,
  );

  const submitReview = async () => {
    if (!userId) return;
    if (!reviewComment.trim()) {
      toast.error("Por favor, escreva um comentário.");
      return;
    }
    setIsSubmittingReview(true);
    try {
      await createReview.mutateAsync({
        reviewer: userId,
        reviewee: "029d15f3-a577-4238-9c59-42011ddcb5be",
        rating: reviewRating,
        comment: reviewComment,
        rental: "08e8eaa6-467f-4c98-b5c0-93323829911d",
      });
      toast.success("Avaliação enviada com sucesso!");
      setShowAvaliar(null);
      setReviewRating(5);
      setReviewComment("");
    } catch {
      toast.error("Erro ao enviar avaliação.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const renderRentalCard = (r: (typeof rentals)[number]) => (
    <RentalCard
      key={r.id}
      rental={r}
      counterparty={{
        label: "Locatário",
        name: r.lessee,
        icon: "storefront",
        className: "text-tertiary",
      }}
      detailsOpen={showDetalhes === r.id}
      onToggleDetails={() => setShowDetalhes(showDetalhes === r.id ? null : r.id)}
      review={{
        buttonLabel: "Avaliar Locatário",
        title: "Avaliar Locatário",
        prompt: `Como foi a experiência com ${r.lessee}?`,
        open: showAvaliar === r.id,
        onToggle: () => setShowAvaliar(showAvaliar === r.id ? null : r.id),
        rating: reviewRating,
        onRatingChange: setReviewRating,
        comment: reviewComment,
        onCommentChange: setReviewComment,
        submitting: isSubmittingReview,
        onSubmit: () => void submitReview(),
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
      accountName={user?.name ?? "…"}
      accountRole={<span className="capitalize">{user?.role ?? "…"}</span>}
      notifications={NOTIFICATIONS}
    >
      <EditEquipamentoModal
        open={isEditEquipamentoOpen}
        onOpenChange={setIsEditEquipamentoOpen}
        equipamento={selectedEquipamento}
        onSave={async (data) => {
          try {
            await machineStore.update(data.id, {
              renagro_number: data.registroRenagro,
              brand: data.marca,
              model: data.modelo,
              year: data.anoFabricacao
                ? Number(data.anoFabricacao)
                : undefined,
              usage_purpose: data.finalidade,
            });
            setSelectedEquipamento(data);
            void machineStore.invalidateLists();
            toast.success("Equipamento atualizado com sucesso!");
            setIsEditEquipamentoOpen(false);
          } catch {
            toast.error("Não foi possível atualizar o equipamento.");
          }
        }}
      />

      {/* Dashboard */}
      {tab === "dashboard" && (
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                label: "LOCAÇÕES ATIVAS",
                value: String(activeRentals.length),
                sub: "em andamento",
                icon: "event_available",
              },
              {
                label: "CONTRATOS",
                value: String(rentals.length),
                sub: "assinados",
                icon: "description",
              },
              {
                label: "LOCAÇÕES TOTAIS",
                value: String(rentals.length),
                sub: "realizadas",
                icon: "inventory_2",
              },
              {
                label: "RECEITA NO MÊS",
                value: "R$ 38.400",
                sub: "fevereiro 2026",
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
                  Evolução da Receita
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Últimos 6 meses
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary">
                  R$ 86.650
                </div>
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Total acumulado
                </div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
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
                      "Receita",
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
                    dataKey="value"
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
                  4.7
                </span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  média
                </span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingsData}>
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
            <div className="space-y-3">
              {rentals.map((r) => {
                const badge = rentalStatusBadge(r.status);
                return (
                  <div
                    key={r.id}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center">
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Minha Frota */}
      {tab === "frota" && (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
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
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por marca, modelo ou registro..."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paginatedFrota.map((m) => (
              <div
                key={m.id}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 flex items-start justify-between group hover:shadow-xl transition-all duration-300 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
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
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 self-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                    Disponível
                  </span>
                  <button
                    onClick={() => openEditModalForMachine(m)}
                    className="text-sm font-bold text-primary hover:underline self-end flex items-center gap-1"
                  >
                    <MaterialIcon icon="edit" size={14} /> Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <DashboardPagination
            currentPage={frotaPage}
            totalPages={frotaTotalPages}
            onPageChange={setFrotaPage}
          />
        </div>
      )}

      {/* Documentos */}
      {tab === "documentos" ? (
        <div className="space-y-10">
          {/* ── Habilitação (CNH) ──────────────────────────────── */}
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  Habilitação (CNH)
                </h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">
                  Carteira Nacional de Habilitação vinculada à sua conta
                </p>
              </div>
              <Link
                to="/document/cnh"
                className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
              >
                <MaterialIcon
                  icon={licenses.length > 0 ? "edit" : "add"}
                  size={18}
                />{" "}
                {licenses.length > 0 ? "Editar CNH" : "Nova CNH"}
              </Link>
            </div>

            {licenses.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 text-center">
                <MaterialIcon
                  icon="id_card"
                  size={48}
                  className="text-outline/40 mb-3"
                />
                <p className="text-on-surface-variant text-sm">
                  Nenhuma CNH cadastrada
                </p>
              </div>
            ) : (
              licenses.map((lic) => (
                <div
                  key={lic.id}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 flex items-center justify-between hover:shadow-xl transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                      <MaterialIcon
                        icon="id_card"
                        className="text-primary"
                        size={28}
                      />
                    </div>
                    <div>
                      <h3 className="font-headline font-bold text-on-surface text-lg">
                        {lic.name}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        Categoria {lic.category} · Validade:{" "}
                        {new Date(lic.expirationDate).toLocaleDateString(
                          "pt-BR",
                        )}
                      </p>
                      {lic.validationStatus === "rejected" && lic.reviewNote && (
                        <p className="text-xs text-error mt-1">
                          Motivo: {lic.reviewNote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {lic.validationStatus === "approved" ? (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                        Aprovado
                      </span>
                    ) : lic.validationStatus === "rejected" ? (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 flex items-center gap-1.5">
                        <MaterialIcon icon="cancel" size={14} /> Recusado
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-tertiary/10 text-tertiary border border-tertiary/20 flex items-center gap-1.5">
                        <MaterialIcon icon="hourglass_bottom" size={14} />{" "}
                        Pendente
                      </span>
                    )}
                    <Link
                      to="/document/cnh"
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      Editar
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-sm font-bold text-error hover:underline cursor-pointer">
                          Remover
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover CNH</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover sua CNH? Esta
                            ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel variant="outline">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-error hover:bg-error/90 text-on-error"
                            onClick={async () => {
                              try {
                                await documentStore.removeLicense(
                                  lic.id,
                                );
                                void documentStore.invalidateLicenses();                                    toast.success("CNH removida com sucesso!");
                              } catch {
                                toast.error(
                                  "Não foi possível remover a CNH.",
                                );
                              }
                            }}
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Certificações ──────────────────────────────────── */}
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  Certificações
                </h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">
                  Cursos e certificações profissionalizantes
                </p>
              </div>
              <Link
                to="/document/certification"
                className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
              >
                <MaterialIcon icon="add" size={18} /> Nova Certificação
              </Link>
            </div>

            {certifications.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 text-center">
                <MaterialIcon
                  icon="workspace_premium"
                  size={48}
                  className="text-outline/40 mb-3"
                />
                <p className="text-on-surface-variant text-sm">
                  Nenhuma certificação cadastrada
                </p>
              </div>
            ) : (
              certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 flex items-center justify-between hover:shadow-xl transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                      <MaterialIcon
                        icon="workspace_premium"
                        className="text-primary"
                        size={28}
                      />
                    </div>
                    <div>
                      <h3 className="font-headline font-bold text-on-surface text-lg">
                        {cert.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        {cert.issuingOrganization} ·{" "}
                        {new Date(cert.issueDate).toLocaleDateString(
                          "pt-BR",
                        )}
                      </p>
                      {cert.validationStatus === "rejected" && cert.reviewNote && (
                        <p className="text-xs text-error mt-1">
                          Motivo: {cert.reviewNote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {cert.validationStatus === "approved" ? (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                        Aprovado
                      </span>
                    ) : cert.validationStatus === "rejected" ? (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 flex items-center gap-1.5">
                        <MaterialIcon icon="cancel" size={14} /> Recusado
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-tertiary/10 text-tertiary border border-tertiary/20 flex items-center gap-1.5">
                        <MaterialIcon icon="hourglass_bottom" size={14} />{" "}
                        Pendente
                      </span>
                    )}
                    <Link
                      to={`/document/certification/${cert.id}`}
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      Editar
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-sm font-bold text-error hover:underline cursor-pointer">
                          Remover
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remover Certificação
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover esta
                            certificação? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel variant="outline">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-error hover:bg-error/90 text-on-error"
                            onClick={async () => {
                              try {
                                await documentStore.removeCertification(
                                  cert.id,
                                );
                                void documentStore.invalidateCertifications();                                    toast.success(
                                  "Certificação removida com sucesso!",
                                );
                              } catch {
                                toast.error(
                                  "Não foi possível remover a certificação.",
                                );
                              }
                            }}
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Anúncios */}
      {tab === "anuncios" ? (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
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
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por maquinário ou localização..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paginatedAnuncios.map((p) => (
              <div
                key={p.id}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden group hover:shadow-xl transition-all duration-300 shadow-sm"
              >
                <div className="h-40 bg-gradient-to-br from-primary/10 via-secondary-container/10 to-tertiary/10 overflow-hidden flex items-center justify-center">
                  <div className="w-14 h-14 bg-surface-container-lowest/70 rounded-2xl flex items-center justify-center border border-outline-variant/20 backdrop-blur-sm">
                    <MaterialIcon
                      icon="precision_manufacturing"
                      className="text-primary"
                      size={28}
                    />
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-headline font-bold text-on-surface">
                      {p.machine}
                    </h4>
                    <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase tracking-wider border border-primary/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />{" "}
                      Ativo
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-3 flex items-center gap-1">
                    <MaterialIcon icon="location_on" size={16} />{" "}
                    {p.location}
                  </p>
                  <div className="flex justify-between items-center">
                    <div className="text-xl font-black text-primary">
                      R$ {p.price}
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
            ))}
          </div>
          <DashboardPagination
            currentPage={anunciosPage}
            totalPages={anunciosTotalPages}
            onPageChange={setAnunciosPage}
          />
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
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por locatário, maquinário ou contrato..."
          />

          {activeRentals.length > 0 ? (
            <div className="space-y-4">
              <h2 className="font-headline text-lg font-bold text-on-surface flex items-center gap-2">
                <MaterialIcon
                  icon="play_circle"
                  size={20}
                  className="text-primary"
                />{" "}
                Locações em Andamento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeRentals.map(renderRentalCard)}
              </div>
            </div>
          ) : null}

          {pastRentals.length > 0 ? (
            <div className="space-y-4 mt-8">
              <h2 className="font-headline text-lg font-bold text-on-surface flex items-center gap-2">
                <MaterialIcon
                  icon="history"
                  size={20}
                  className="text-on-surface-variant"
                />{" "}
                Locações Passadas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pastRentals.map(renderRentalCard)}
              </div>
            </div>
          ) : null}

          <DashboardPagination
            currentPage={1}
            totalPages={3}
            onPageChange={() => {}}
          />
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
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por contrato, locatário ou maquinário..."
          />
          <div className="flex gap-2">
            {["Todos", "Pendentes", "Assinados", "Encerrados"].map((f) => (
              <button
                key={f}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  f === "Todos"
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {rentals.map((c) => (
            <div
              key={c.id}
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center">
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
                      {c.lessee} · Criado em 2026
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                    c.status === "pending"
                      ? "bg-secondary-container/20 text-secondary border border-secondary-container/30"
                      : c.status === "active" || c.status === "signed"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                  }`}
                >
                  <MaterialIcon
                    icon={
                      c.status === "pending"
                        ? "description"
                        : (c.status === "active" || c.status === "signed")
                          ? "verified"
                          : "check_circle"
                    }
                    size={14}
                  />
                  {c.status === "pending"
                    ? "Assinatura Pendente"
                    : (c.status === "active" || c.status === "signed")
                      ? "Assinado"
                      : "Encerrado"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 mb-4">
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
              <div className="flex gap-3">
                <Link to={`/contrato/${c.id}`} className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 text-center decoration-transparent">
                  <MaterialIcon icon="visibility" size={16} /> Visualizar Contrato
                </Link>
                <button className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors flex items-center gap-2">
                  <MaterialIcon icon="download" size={16} /> Baixar PDF
                </button>
              </div>
            </div>
          ))}
          <DashboardPagination
            currentPage={1}
            totalPages={2}
            onPageChange={() => {}}
          />
        </div>
      ) : null}

      {/* Chat */}
      {tab === "chat" ? (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">
              Mensagens
            </h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">
              Converse com seus locatários
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="p-4 border-b border-outline-variant/30">
                <div className="relative">
                  <MaterialIcon
                    icon="search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Buscar conversa..."
                    className="w-full bg-surface-container border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {[
                  {
                    name: "Fazenda Aurora",
                    initials: "FA",
                    lastMsg: "Vou confirmar a reserva então!",
                    time: "10:32",
                    unread: 2,
                    online: true,
                  },
                  {
                    name: "Fazenda São João",
                    initials: "SJ",
                    lastMsg: "Quando posso retirar a colheitadeira?",
                    time: "Ontem",
                    unread: 0,
                    online: false,
                  },
                  {
                    name: "Fazenda Boa Vista",
                    initials: "BV",
                    lastMsg: "Obrigado pelo excelente serviço!",
                    time: "20/01",
                    unread: 0,
                    online: false,
                  },
                ].map((contact, i) => (
                  <div
                    key={contact.name}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-surface-container-high transition-colors border-b border-outline-variant/20 ${
                      i === 0 ? "bg-primary/5" : ""
                    } group cursor-pointer`}
                  >
                    <div className="relative">
                      <div className="w-11 h-11 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-sm">
                        {contact.initials}
                      </div>
                      {contact.online ? (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-on-surface text-sm">
                          {contact.name}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          {contact.time}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant truncate">
                        {contact.lastMsg}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {contact.unread > 0 ? (
                        <span className="w-5 h-5 bg-primary text-on-primary rounded-full text-[10px] font-bold flex items-center justify-center">
                          {contact.unread}
                        </span>
                      ) : null}
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors opacity-0 group-hover:opacity-100"
                        title="Arquivar conversa"
                      >
                        <MaterialIcon icon="archive" size={16} />
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Excluir conversa"
                      >
                        <MaterialIcon icon="close" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="p-4 border-b border-outline-variant/30 bg-surface-container flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-bold text-sm">
                      FA
                    </div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container" />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm">
                      Fazenda Aurora
                    </div>
                    <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full" />{" "}
                      Online
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-surface/50">
                <div className="text-center">
                  <span className="text-[11px] text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
                    Hoje, 10:20
                  </span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-outline">
                    10:20
                  </span>
                  <div className="bg-surface-container p-3.5 rounded-2xl rounded-tl-sm text-sm text-tertiary max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Bom dia! O Trator Valtra BH194 está disponível para o
                    período de 02 a 10 de fevereiro?
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold text-outline">
                    10:25
                  </span>
                  <div className="bg-primary text-on-primary p-3.5 rounded-2xl rounded-tr-sm text-sm max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Bom dia! Sim, está disponível. Já com operador
                    certificado NR-31.
                  </div>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-outline">
                    10:32
                  </span>
                  <div className="bg-surface-container p-3.5 rounded-2xl rounded-tl-sm text-sm text-tertiary max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Perfeito! Vou confirmar a reserva então. Obrigada!
                  </div>
                </div>
              </div>
              <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/30 flex items-center gap-3">
                <button className="text-outline hover:text-primary transition-colors p-2 rounded-lg hover:bg-surface-container">
                  <MaterialIcon icon="attach_file" size={20} />
                </button>
                <input
                  type="text"
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-surface-container border-none rounded-full px-5 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface"
                />
                <button className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                  <MaterialIcon icon="send" size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notificações */}
      {tab === "notificacoes" ? (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-headline text-3xl font-bold text-primary">
                Notificações
              </h1>
              <div className="h-1 w-16 bg-secondary-container mt-2" />
              <p className="text-on-surface-variant text-sm mt-3">
                Acompanhe todas as atualizações
              </p>
            </div>
            <button className="px-4 py-2 rounded-lg font-bold text-xs text-error border-2 border-error/30 hover:bg-error/10 transition-colors flex items-center gap-1.5">
              <MaterialIcon icon="delete_sweep" size={16} /> Apagar todas
            </button>
          </div>
          <div className="space-y-3">
            {[
              {
                icon: "description",
                title: "Contrato aguardando assinatura",
                desc: "Fazenda Aurora · Trator Valtra BH194 · 02–10 Fev/2026",
                time: "Agora",
                unread: true,
              },
              {
                icon: "event_available",
                title: "Nova solicitação de reserva",
                desc: "Fazenda São João · Colheitadeira JD S700",
                time: "2h atrás",
                unread: true,
              },
              {
                icon: "star",
                title: "Nova avaliação recebida",
                desc: "Fazenda Boa Vista avaliou com 5 estrelas",
                time: "Ontem",
                unread: false,
              },
              {
                icon: "event_repeat",
                title: "Solicitação de reagendamento",
                desc: "Fazenda Aurora deseja alterar período para 15–20 Fev/2026",
                time: "Ontem",
                unread: false,
              },
              {
                icon: "payments",
                title: "Pagamento recebido",
                desc: "R$ 15.000,00 — Fazenda São João · Colheitadeira JD S700",
                time: "3 dias atrás",
                unread: false,
              },
            ].map((n, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 p-5 rounded-2xl border transition-all hover:shadow-md ${
                  n.unread
                    ? "bg-primary/5 border-primary/20"
                    : "bg-surface-container-lowest border-outline-variant/30"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${n.unread ? "bg-primary/10" : "bg-surface-container-high"}`}
                >
                  <MaterialIcon
                    icon={n.icon}
                    className={
                      n.unread ? "text-primary" : "text-on-surface-variant"
                    }
                    size={22}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-on-surface text-sm">
                      {n.title}
                    </h4>
                    <span className="text-[11px] text-on-surface-variant shrink-0 ml-4">
                      {n.time}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant mt-0.5">
                    {n.desc}
                  </p>
                </div>
                {n.unread ? (
                  <span className="w-2.5 h-2.5 bg-primary rounded-full mt-1.5 shrink-0 animate-pulse" />
                ) : null}
                <button
                  className="shrink-0 p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                  title="Excluir notificação"
                >
                  <MaterialIcon icon="close" size={18} />
                </button>
              </div>
            ))}
          </div>
          <DashboardPagination
            currentPage={1}
            totalPages={3}
            onPageChange={() => {}}
          />
        </div>
      ) : null}

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
    </DashboardShell>
  );
};

export default DashboardLocador;
