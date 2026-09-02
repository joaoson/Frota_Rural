import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/contexts/useAuth";
import { AccountSection } from "@/features/dashboard/components/AccountSection";
import {
  DashboardShell,
  type SidebarItem,
} from "@/features/dashboard/components/DashboardShell";
import { RentalCard } from "@/features/dashboard/components/RentalCard";
import { ReviewsSection } from "@/features/dashboard/components/ReviewsSection";
import { useRentalsAsLessee } from "@/features/contracts/hooks/useContracts";
import { rentalMachineName } from "@/features/contracts/types/rental";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";
import {
  useCreateReview,
  useReceivedReviews,
  useWrittenReviews,
} from "@/features/reviews/hooks/useReviews";
import type { Review } from "@/features/reviews/types/review";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { getInitials } from "@/shared/utils/getInitials";
import { useUser } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user";
import { HttpError } from "@/shared/http/errors";
import { toast } from "sonner";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";
import machine2 from "@/assets/machine-2.jpg";

const spendData = [
  { month: "Set", value: 5400 },
  { month: "Out", value: 8200 },
  { month: "Nov", value: 12000 },
  { month: "Dez", value: 6250 },
  { month: "Jan", value: 0 },
  { month: "Fev", value: 15000 },
];

const ratingsData = [
  { month: "Set", rating: 4.0 },
  { month: "Out", rating: 4.5 },
  { month: "Nov", rating: 3.0 },
  { month: "Dez", rating: 5.0 },
  { month: "Jan", rating: 0 },
  { month: "Fev", rating: 5.0 },
];

const NOTIFICATIONS = [
  { id: 1, icon: "event_available", title: "Reserva confirmada", desc: "Trator Valtra BH194 · 02–10 Fev/2026", time: "Agora", unread: true },
  { id: 2, icon: "description", title: "Contrato pronto para assinatura", desc: "Colheitadeira JD S700 · Fazenda São João", time: "3h atrás", unread: true },
  { id: 3, icon: "chat_bubble", title: "Nova mensagem de João Silva", desc: "Sim, tudo certo. Operador com NR-31.", time: "Ontem", unread: false },
];

const sidebarItems: readonly SidebarItem<Tab>[] = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "search", label: "Buscar Máquinas", tab: "buscar" },
  { icon: "event_available", label: "Minhas Locações", tab: "locacoes" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
];

type Tab = "dashboard" | "buscar" | "locacoes" | "contratos" | "avaliacoes" | "chat" | "notificacoes" | "conta" | "sair";

const DashboardLocatario = () => {
  const { userId, logout } = useAuth();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showReagendar, setShowReagendar] = useState<string | null>(null);
  const [showDetalhes, setShowDetalhes] = useState<string | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<string | null>(null);

  const userQuery = useUser(userId);
  const user: User | null = userQuery.data ?? null;
  const receivedQuery = useReceivedReviews(userId);
  const givenQuery = useWrittenReviews(userId);
  const rentalsQuery = useRentalsAsLessee(userId);
  const createReview = useCreateReview();

  const receivedReviews: Review[] = receivedQuery.data ?? [];
  const givenReviews: Review[] = givenQuery.data ?? [];

  const rentals = useMemo(
    () =>
      (rentalsQuery.data ?? []).map((rental) => ({
        id: rental.id,
        owner: rental.lessorName ?? "Locador",
        machine: rentalMachineName(rental),
        period:
          rental.startDate && rental.endDate
            ? `${rental.startDate.toLocaleDateString("pt-BR")} a ${rental.endDate.toLocaleDateString("pt-BR")}`
            : "",
        status: rental.status,
        total: (rental.totalPrice ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        contract: rental.contractNumber,
        image: machine2,
      })),
    [rentalsQuery.data],
  );
  
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const activeRentals = rentals.filter(r => r.status === "pending" || r.status === "active");
  const pastRentals = rentals.filter(r => r.status === "completed" || r.status === "cancelled");

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
        reviewee: "047f6582-ebe6-47af-ba5f-061ac9819b80",
        rating: reviewRating,
        comment: reviewComment,
        rental: "fe6c805a-d5be-4dfe-970f-d2c3fae1cf00",
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

  const renderRentalCard = (r: (typeof rentals)[number]) => (
    <RentalCard
      key={r.id}
      rental={r}
      counterparty={{
        label: "Locador",
        name: r.owner,
        icon: "person",
        className: "text-primary",
      }}
      detailsOpen={showDetalhes === r.id}
      onToggleDetails={() => setShowDetalhes(showDetalhes === r.id ? null : r.id)}
      reschedule={{
        open: showReagendar === r.id,
        onToggle: () => setShowReagendar(showReagendar === r.id ? null : r.id),
      }}
      review={{
        buttonLabel: "Avaliar",
        title: "Avaliar Serviço",
        prompt: `Como foi sua experiência com ${r.owner}?`,
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
      accountName={user ? `${user.name.split(" ")[0]} ${user.name.split(" ").slice(-1)[0]}` : "…"}
      accountRole="Locatário"
      avatarClassName="bg-tertiary-container text-on-tertiary"
      notifications={NOTIFICATIONS}
    >
      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="space-y-8">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Bom dia, {user ? user.name.split(" ")[0] : "…"}</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Veja o resumo das suas locações</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: "LOCAÇÕES ATIVAS", value: "1", sub: "em andamento", icon: "event_available" },
              { label: "CONTRATOS", value: "3", sub: "assinados", icon: "description" },
              { label: "LOCAÇÕES TOTAIS", value: "4", sub: "realizadas", icon: "inventory_2" },
              { label: "GASTO NO MÊS", value: "R$ 15.000", sub: "fevereiro 2026", icon: "payments" },
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
                <h2 className="font-headline text-lg font-bold text-on-surface">Evolução dos Gastos</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Últimos 6 meses</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary">R$ 46.850</div>
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
                  <Tooltip formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'Gasto']} contentStyle={{ borderRadius: 12, border: '1px solid var(--outline-variant)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 13 }} labelStyle={{ color: 'var(--popover-foreground)' }} itemStyle={{ color: 'var(--popover-foreground)' }} />
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
                <span className="font-black text-secondary text-sm">4.3</span>
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
            <div className="space-y-3">
              {rentals.map((r) => {
                const badge = rentalStatusBadge(r.status);
                return (
                  <div key={r.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-container-high">
                        <img src={r.image} alt={r.machine} className="w-full h-full object-cover" width={48} height={48} />
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Buscar */}
      {tab === "buscar" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Buscar Máquinas</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Encontre o equipamento ideal para sua safra</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Atividade</label>
                <select className="w-full bg-surface-container border-none rounded-lg p-3.5 text-on-surface focus:ring-2 focus:ring-primary transition-shadow">
                  <option>Todas</option><option>Plantio</option><option>Colheita</option><option>Pulverização</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Localização</label>
                <input type="text" placeholder="Ex: Sorriso, MT" className="w-full bg-surface-container border-none rounded-lg p-3.5 text-on-surface focus:ring-2 focus:ring-primary transition-shadow" />
              </div>
              <div className="flex items-end">
                <Link to="/buscar-maquinario" className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-3.5 rounded-lg font-bold text-center hover:shadow-lg transition-all flex items-center justify-center gap-2">
                  <MaterialIcon icon="search" size={18} /> Buscar
                </Link>
              </div>
            </div>
          </div>
          <p className="text-on-surface-variant text-center py-12">Use os filtros acima ou <Link to="/buscar-maquinario" className="text-primary font-bold hover:underline">acesse a busca completa</Link></p>
        </div>
      )}

      {/* Locações */}
      {tab === "locacoes" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Minhas Locações</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Gerencie suas locações</p>
          </div>

          <DashboardSearchBar
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por locador, maquinário ou contrato..."
          />

          {activeRentals.length > 0 && (
            <div className="space-y-4">
              <h2 className="font-headline text-lg font-bold text-on-surface flex items-center gap-2">
                <MaterialIcon icon="play_circle" size={20} className="text-primary" /> Locações em Andamento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeRentals.map(renderRentalCard)}
              </div>
            </div>
          )}

          {pastRentals.length > 0 && (
            <div className="space-y-4 mt-8">
              <h2 className="font-headline text-lg font-bold text-on-surface flex items-center gap-2">
                <MaterialIcon icon="history" size={20} className="text-on-surface-variant" /> Locações Passadas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pastRentals.map(renderRentalCard)}
              </div>
            </div>
          )}
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
            searchValue=""
            onSearchChange={() => {}}
            yearValue="Todos"
            onYearChange={() => {}}
            searchPlaceholder="Buscar por contrato, locador ou maquinário..."
          />
          <div className="flex gap-2">
            {["Todos", "Pendentes", "Assinados", "Encerrados"].map((f) => (
              <button key={f} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${f === "Todos" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
                {f}
              </button>
            ))}
          </div>
          {rentals.map((c) => (
            <div key={c.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center">
                    <MaterialIcon icon="description" className="text-primary" size={24} />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-on-surface">{c.contract} — {c.machine}</h3>
                    <p className="text-sm text-on-surface-variant">{c.owner} · Criado em 2026</p>
                  </div>
                </div>
                <span className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                  c.status === "pending" ? "bg-secondary-container/20 text-secondary border border-secondary-container/30"
                    : c.status === "active" || c.status === "signed" ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                }`}>
                  <MaterialIcon icon={c.status === "pending" ? "description" : (c.status === "active" || c.status === "signed") ? "verified" : "check_circle"} size={14} />
                  {c.status === "pending" ? "Assinatura Pendente" : (c.status === "active" || c.status === "signed") ? "Assinado" : "Encerrado"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 mb-4">
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
        </div>
      )}

      {/* Avaliações Tab */}
      {tab === "avaliacoes" && (
        <ReviewsSection receivedReviews={receivedReviews} givenReviews={givenReviews} />
      )}

      {/* Chat */}
      {tab === "chat" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">Mensagens</h1>
            <div className="h-1 w-16 bg-secondary-container mt-2" />
            <p className="text-on-surface-variant text-sm mt-3">Converse com seus locadores</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="p-4 border-b border-outline-variant/30">
                <div className="relative">
                  <MaterialIcon icon="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
                  <input type="text" placeholder="Buscar conversa..." className="w-full bg-surface-container border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {[
                  { name: "João Silva", initials: "JS", lastMsg: "Sim, tudo certo. Operador com NR-31.", time: "10:32", unread: 1, online: true },
                  { name: "Ricardo Mendes", initials: "RM", lastMsg: "A colheitadeira estará pronta segunda.", time: "Ontem", unread: 0, online: false },
                  { name: "Pedro Souza", initials: "PS", lastMsg: "Contrato assinado!", time: "20/01", unread: 0, online: false },
                ].map((contact, i) => (
                  <div key={i} className={`w-full p-4 flex items-center gap-3 hover:bg-surface-container-high transition-colors border-b border-outline-variant/20 ${i === 0 ? "bg-primary/5" : ""} group cursor-pointer`}>
                    <div className="relative">
                      <div className="w-11 h-11 bg-primary-container text-on-primary rounded-full flex items-center justify-center font-headline font-bold text-sm">{contact.initials}</div>
                      {contact.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest" />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-on-surface text-sm">{contact.name}</span>
                        <span className="text-[11px] text-on-surface-variant">{contact.time}</span>
                      </div>
                      <p className="text-sm text-on-surface-variant truncate">{contact.lastMsg}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {contact.unread > 0 && (
                        <span className="w-5 h-5 bg-primary text-on-primary rounded-full text-[10px] font-bold flex items-center justify-center">{contact.unread}</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); }} className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors opacity-0 group-hover:opacity-100" title="Arquivar conversa">
                        <MaterialIcon icon="archive" size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); }} className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100" title="Excluir conversa">
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
                    <div className="w-10 h-10 bg-primary-container text-on-primary rounded-full flex items-center justify-center font-bold text-sm">JS</div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container" />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm">João Silva</div>
                    <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full" /> Locador · Online
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-surface/50">
                <div className="text-center">
                  <span className="text-[11px] text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">Hoje, 10:20</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold text-outline">10:20</span>
                  <div className="bg-primary text-on-primary p-3.5 rounded-2xl rounded-tr-sm text-sm max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Bom dia, o trator está com a documentação do Renagro em dia?
                  </div>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-outline">10:25</span>
                  <div className="bg-surface-container p-3.5 rounded-2xl rounded-tl-sm text-sm text-tertiary max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Sim, tudo certo. Operador com NR-31 também.
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold text-outline">10:32</span>
                  <div className="bg-primary text-on-primary p-3.5 rounded-2xl rounded-tr-sm text-sm max-w-[75%] leading-relaxed font-medium shadow-sm">
                    Ótimo! Vou confirmar a reserva então. Obrigada!
                  </div>
                </div>
              </div>
              <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/30 flex items-center gap-3">
                <button className="text-outline hover:text-primary transition-colors p-2 rounded-lg hover:bg-surface-container">
                  <MaterialIcon icon="attach_file" size={20} />
                </button>
                <input type="text" placeholder="Digite sua mensagem..." className="flex-1 bg-surface-container border-none rounded-full px-5 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface" />
                <button className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                  <MaterialIcon icon="send" size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notificações */}
      {tab === "notificacoes" && (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-headline text-3xl font-bold text-primary">Notificações</h1>
              <div className="h-1 w-16 bg-secondary-container mt-2" />
              <p className="text-on-surface-variant text-sm mt-3">Acompanhe todas as atualizações</p>
            </div>
            <button className="px-4 py-2 rounded-lg font-bold text-xs text-error border-2 border-error/30 hover:bg-error/10 transition-colors flex items-center gap-1.5">
              <MaterialIcon icon="delete_sweep" size={16} /> Apagar todas
            </button>
          </div>
          <div className="space-y-3">
            {[
              { icon: "event_available", title: "Reserva confirmada", desc: "Trator Valtra BH194 · 02–10 Fev/2026", time: "Agora", unread: true },
              { icon: "chat_bubble", title: "Nova mensagem de João Silva", desc: "Sim, tudo certo. Operador com NR-31.", time: "Ontem", unread: false },
              { icon: "event_repeat", title: "Reagendamento aprovado", desc: "Novo período: 15–20 Fev/2026 · Trator Valtra BH194", time: "2 dias atrás", unread: false },
              { icon: "payments", title: "Pagamento processado", desc: "R$ 15.000,00 — Trator Valtra BH194", time: "3 dias atrás", unread: false },
            ].map((n, i) => (
              <div key={i} className={`flex items-start gap-4 p-5 rounded-2xl border transition-all hover:shadow-md ${n.unread ? "bg-primary/5 border-primary/20" : "bg-surface-container-lowest border-outline-variant/30"}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${n.unread ? "bg-primary/10" : "bg-surface-container-high"}`}>
                  <MaterialIcon icon={n.icon} className={n.unread ? "text-primary" : "text-on-surface-variant"} size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-on-surface text-sm">{n.title}</h4>
                    <span className="text-[11px] text-on-surface-variant shrink-0 ml-4">{n.time}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant mt-0.5">{n.desc}</p>
                </div>
                {n.unread && <span className="w-2.5 h-2.5 bg-primary rounded-full mt-1.5 shrink-0 animate-pulse" />}
                <button className="shrink-0 p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors" title="Excluir notificação">
                  <MaterialIcon icon="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Minha Conta */}
      {tab === "conta" && (
        <AccountSection
          userId={userId}
          user={user}
          roleLabel="Locatário"
          avatarClassName="bg-tertiary-container text-on-tertiary"
        />
      )}
    </DashboardShell>
  );
};

export default DashboardLocatario;
