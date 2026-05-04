import { useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardPagination from "@/components/DashboardPagination";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";
import NotificationPopover from "@/components/NotificationPopover";
import machine1 from "@/assets/machine-1.jpg";
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

const sidebarItems = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "search", label: "Buscar Máquinas", tab: "buscar" },
  { icon: "event_available", label: "Minhas Locações", tab: "locacoes" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
];

const mockRentals = [
  { id: 1, owner: "João Silva", machine: "Trator Valtra BH194", period: "02 – 10 Fev/2026", status: "active", total: "R$ 15.000,00", contract: "#CTR-8821", image: machine2 },
  { id: 3, owner: "Pedro Souza", machine: "Pulverizador Jacto", period: "01 – 05 Dez/2025", status: "completed", total: "R$ 6.250,00", contract: "#CTR-8710", image: machine1 },
  { id: 4, owner: "Carlos Lima", machine: "Trator Massey 7700", period: "20 – 28 Nov/2025", status: "cancelled", total: "R$ 12.000,00", contract: "#CTR-8690", image: machine2 },
];

type Tab = "dashboard" | "buscar" | "locacoes" | "contratos" | "avaliacoes" | "chat" | "notificacoes" | "conta";

const DashboardLocatario = () => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [showReagendar, setShowReagendar] = useState<number | null>(null);
  const [showRecorrencia, setShowRecorrencia] = useState<number | null>(null);
  const [showDetalhes, setShowDetalhes] = useState<number | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<number | null>(null);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return { icon: "description", classes: "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30", label: "Assinatura Pendente" };
      case "active": return { icon: "circle", classes: "bg-primary/10 text-primary border border-primary/20", label: "Em Operação (Ativo)" };
      case "completed": return { icon: "check_circle", classes: "bg-primary/10 text-primary border border-primary/20", label: "Concluída" };
      case "cancelled": return { icon: "warning", classes: "bg-error/10 text-error border border-error/20", label: "Locação Cancelada" };
      default: return { icon: "", classes: "", label: "" };
    }
  };

  const activeRentals = mockRentals.filter(r => r.status === "pending" || r.status === "active");
  const pastRentals = mockRentals.filter(r => r.status === "completed" || r.status === "cancelled");

  const renderRentalCard = (r: typeof mockRentals[0]) => {
    const badge = getStatusBadge(r.status);
    return (
      <div key={r.id} className="bg-surface-container-low rounded-2xl border border-outline-variant/30 relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-secondary-container" />
        <div className="ml-4 p-6">
          <div className="flex justify-between items-start mb-4">
            <span className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${badge.classes}`}>
              <MaterialIcon icon={badge.icon} size={14} /> {badge.label}
            </span>
            <span className="text-sm font-bold text-outline">{r.contract}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 mb-4">
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Locador</div>
              <div className="font-bold text-primary text-sm flex items-center gap-1">
                <MaterialIcon icon="person" size={14} /> {r.owner}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Maquinário</div>
              <div className="font-bold text-on-surface text-sm">{r.machine}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Período</div>
              <div className="font-bold text-primary text-sm">{r.period}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Valor</div>
              <div className="font-black text-primary text-lg">{r.total}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status === "pending" && (
              <button className="px-4 border-2 border-error/50 text-error hover:bg-error-container/20 py-2 rounded-lg font-bold text-xs transition-colors">
                Recusar
              </button>
            )}
            {(r.status === "pending" || r.status === "active") && (
              <button onClick={() => setShowReagendar(showReagendar === r.id ? null : r.id)} className="px-4 bg-transparent text-tertiary py-2 rounded-lg font-bold text-xs hover:bg-tertiary/10 transition-colors flex items-center gap-1 border border-tertiary/50">
                <MaterialIcon icon="event_repeat" size={14} /> Reagendar
              </button>
            )}
            {r.status === "completed" && (
              <button onClick={() => setShowAvaliar(showAvaliar === r.id ? null : r.id)} className="px-4 bg-secondary-container/30 text-on-secondary-container py-2 rounded-lg font-bold text-xs hover:bg-secondary-container/50 transition-colors flex items-center gap-1">
                <MaterialIcon icon="star" size={14} /> Avaliar
              </button>
            )}
            {(r.status === "pending" || r.status === "active") && (
              <button className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20">
                <MaterialIcon icon="analytics" size={14} /> Analisar
              </button>
            )}
            {(r.status === "completed" || r.status === "cancelled") && (
              <button onClick={() => setShowDetalhes(showDetalhes === r.id ? null : r.id)} className="px-4 bg-surface-container-high text-on-surface-variant py-2 rounded-lg font-bold text-xs hover:bg-outline-variant/30 transition-colors flex items-center gap-1">
                <MaterialIcon icon="visibility" size={14} /> Ver Detalhes
              </button>
            )}
          </div>

          {showDetalhes === r.id && (
            <div className="mt-4 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 space-y-3 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm">Detalhes da Locação</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-outline text-xs font-bold uppercase">Contrato:</span> <span className="text-on-surface font-bold">{r.contract}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Locador:</span> <span className="text-on-surface font-bold">{r.owner}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Maquinário:</span> <span className="text-on-surface font-bold">{r.machine}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Período:</span> <span className="text-on-surface font-bold">{r.period}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Valor Total:</span> <span className="text-primary font-black">{r.total}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Status:</span> <span className="text-on-surface font-bold">{badge.label}</span></div>
              </div>
            </div>
          )}

          {showReagendar === r.id && (
            <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
                <MaterialIcon icon="event_repeat" size={16} className="text-on-secondary-container" /> Solicitar Reagendamento
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-outline">Nova Data Início</label>
                  <input type="date" className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-outline">Nova Data Fim</label>
                  <input type="date" className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-outline">Motivo</label>
                <textarea placeholder="Ex: Chuvas atrasaram o preparo..." rows={2} className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm resize-none" />
              </div>
              <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm">
                <MaterialIcon icon="send" size={16} /> Enviar Solicitação
              </button>
            </div>
          )}

          {showAvaliar === r.id && (
            <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
                <MaterialIcon icon="star" size={16} className="text-on-secondary-container" /> Avaliar Serviço
              </h4>
              <p className="text-sm text-on-surface-variant">Como foi sua experiência com {r.owner}?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaterialIcon key={i} icon="star" filled={i <= 4} className={`text-3xl cursor-pointer hover:scale-110 transition-transform ${i <= 4 ? "text-secondary-container" : "text-outline/40"}`} />
                ))}
              </div>
              <textarea placeholder="Conte como foi a experiência..." rows={2} className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm resize-none" />
              <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all text-sm">
                Enviar Avaliação
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r border-outline-variant/30 h-screen sticky top-0 bg-surface-container-low flex flex-col">
        <div className="p-6 pb-4">
          <Link to="/" className="font-headline font-black text-xl text-primary tracking-tighter">Frota Rural</Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.tab}
              onClick={() => setTab(item.tab as Tab)}
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
            <div className="w-10 h-10 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-sm">MC</div>
            <div>
              <div className="font-bold text-sm text-on-surface">Maria Costa</div>
              <div className="text-[11px] text-on-surface-variant">Locatário</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <div />
          <NotificationPopover
            notifications={[
              { id: 1, icon: "event_available", title: "Reserva confirmada", desc: "Trator Valtra BH194 · 02–10 Fev/2026", time: "Agora", unread: true },
              { id: 2, icon: "description", title: "Contrato pronto para assinatura", desc: "Colheitadeira JD S700 · Fazenda São João", time: "3h atrás", unread: true },
              { id: 3, icon: "chat_bubble", title: "Nova mensagem de João Silva", desc: "Sim, tudo certo. Operador com NR-31.", time: "Ontem", unread: false },
            ]}
          />
        </header>

        <div className="p-8 max-w-[1200px]">
          {/* Dashboard */}
          {tab === "dashboard" && (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">Bom dia, Maria</h1>
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
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--outline-variant))" opacity={0.3} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--on-surface-variant))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--on-surface-variant))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Gasto']} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--outline-variant))', fontSize: 13 }} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#colorSpend)" />
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
                    <span className="font-black text-on-secondary-container text-sm">4.3</span>
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">média</span>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ratingsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--outline-variant))" opacity={0.3} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--on-surface-variant))' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: 'hsl(var(--on-surface-variant))' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => [`${value.toFixed(1)} ★`, 'Nota média']} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--outline-variant))', fontSize: 13 }} />
                      <Bar dataKey="rating" fill="hsl(39, 99%, 60%)" radius={[6, 6, 0, 0]} />
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
                  {mockRentals.map((r) => {
                    const badge = getStatusBadge(r.status);
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
                          <span className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${badge.classes}`}>
                            <MaterialIcon icon={badge.icon} size={12} /> {badge.label}
                          </span>
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
                    <Link to="/buscar" className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-3.5 rounded-lg font-bold text-center hover:shadow-lg transition-all flex items-center justify-center gap-2">
                      <MaterialIcon icon="search" size={18} /> Buscar
                    </Link>
                  </div>
                </div>
              </div>
              <p className="text-on-surface-variant text-center py-12">Use os filtros acima ou <Link to="/buscar" className="text-primary font-bold hover:underline">acesse a busca completa</Link></p>
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

              <DashboardPagination currentPage={1} totalPages={3} onPageChange={() => {}} />
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
              {[
                { id: "#CTR-8821", owner: "João Silva", machine: "Trator Valtra BH194", period: "02 – 10 Fev/2026", total: "R$ 15.000,00", status: "pending", date: "28 Jan/2026" },
                { id: "#CTR-8835", owner: "Ricardo Mendes", machine: "Colheitadeira JD S700", period: "01 – 30 Mar/2026", total: "R$ 38.400,00", status: "signed", date: "20 Fev/2026" },
                { id: "#CTR-8710", owner: "Pedro Souza", machine: "Pulverizador Jacto", period: "01 – 05 Dez/2025", total: "R$ 6.250,00", status: "closed", date: "28 Nov/2025" },
              ].map((c) => (
                <div key={c.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center">
                        <MaterialIcon icon="description" className="text-primary" size={24} />
                      </div>
                      <div>
                        <h3 className="font-headline font-bold text-on-surface">{c.id} — {c.machine}</h3>
                        <p className="text-sm text-on-surface-variant">{c.owner} · Criado em {c.date}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                      c.status === "pending" ? "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30"
                        : c.status === "signed" ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                    }`}>
                      <MaterialIcon icon={c.status === "pending" ? "description" : c.status === "signed" ? "verified" : "check_circle"} size={14} />
                      {c.status === "pending" ? "Assinatura Pendente" : c.status === "signed" ? "Assinado" : "Encerrado"}
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
                    <button className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors flex items-center gap-2">
                      <MaterialIcon icon="download" size={16} /> Baixar PDF
                    </button>
                  </div>
                </div>
              ))}
              <DashboardPagination currentPage={1} totalPages={2} onPageChange={() => {}} />
            </div>
          )}

          {/* Avaliações Tab */}
          {tab === "avaliacoes" && (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">Avaliações</h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">Veja as avaliações recebidas e fornecidas</p>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon icon="inbox" size={22} className="text-primary" /> Avaliações Recebidas
                </h2>
                <div className="space-y-4">
                  {[
                    { from: "João Silva", initials: "JS", machine: "Trator Valtra BH194", date: "11/02/2026", rating: 5, comment: "Locatária exemplar! Devolveu o trator em perfeito estado e cumpriu todos os prazos." },
                    { from: "Pedro Souza", initials: "PS", machine: "Pulverizador Jacto", date: "06/12/2025", rating: 4, comment: "Boa locatária, apenas solicitou reagendamento mas tudo correu bem no final." },
                  ].map((r, i) => (
                    <div key={i} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-secondary-container/30 flex items-center justify-center text-sm font-bold text-tertiary">{r.initials}</div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">{r.from}</div>
                            <div className="text-xs text-on-surface-variant">{r.machine} · {r.date}</div>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <MaterialIcon key={j} icon="star" filled={j < r.rating} className={j < r.rating ? "text-secondary-container" : "text-outline/30"} size={16} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-on-surface leading-relaxed">"{r.comment}"</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon icon="outbox" size={22} className="text-primary" /> Avaliações Fornecidas
                </h2>
                <div className="space-y-4">
                  {[
                    { to: "João Silva", initials: "JS", machine: "Trator Valtra BH194", date: "11/02/2026", rating: 5, comment: "Equipamento impecável e operador com NR-31. Comunicação excelente durante toda a locação." },
                    { to: "Pedro Souza", initials: "PS", machine: "Pulverizador Jacto", date: "06/12/2025", rating: 5, comment: "Pulverizador funcionou perfeitamente. Pedro foi muito prestativo." },
                    { to: "Carlos Lima", initials: "CL", machine: "Trator Massey 7700", date: "29/11/2025", rating: 3, comment: "O trator apresentou problemas mecânicos durante a locação. Atendimento poderia ser melhor." },
                  ].map((r, i) => (
                    <div key={i} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{r.initials}</div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">{r.to}</div>
                            <div className="text-xs text-on-surface-variant">{r.machine} · {r.date}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <MaterialIcon key={j} icon="star" filled={j < r.rating} className={j < r.rating ? "text-secondary-container" : "text-outline/30"} size={16} />
                            ))}
                          </div>
                          <button className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors" title="Excluir avaliação">
                            <MaterialIcon icon="close" size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-on-surface leading-relaxed">"{r.comment}"</p>
                    </div>
                  ))}
                </div>
              </div>
              <DashboardPagination currentPage={1} totalPages={2} onPageChange={() => {}} />
            </div>
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
              <DashboardPagination currentPage={1} totalPages={3} onPageChange={() => {}} />
            </div>
          )}

          {/* Minha Conta */}
          {tab === "conta" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">Minha Conta</h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">Edite suas informações de cadastro</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 shadow-sm">
                  <h2 className="font-headline text-xl font-bold text-tertiary">Dados Pessoais</h2>
                  <div className="flex items-center gap-6 pb-2">
                    <div className="relative group">
                      <div className="w-20 h-20 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-2xl">MC</div>
                      <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <MaterialIcon icon="photo_camera" className="text-white" size={24} />
                        <input type="file" accept="image/*" className="hidden" />
                      </label>
                    </div>
                    <div>
                      <div className="font-bold text-on-surface">Maria Costa</div>
                      <div className="text-sm text-on-surface-variant mb-2">Locatário</div>
                      <label className="text-xs font-bold text-primary cursor-pointer hover:underline flex items-center gap-1">
                        <MaterialIcon icon="upload" size={14} /> Alterar foto
                        <input type="file" accept="image/*" className="hidden" />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "Nome Completo", value: "Maria Costa", type: "text" },
                      { label: "CPF / CNPJ", value: "111.111.111-11", type: "text" },
                      { label: "E-mail", value: "maria.costa@email.com", type: "email" },
                      { label: "Telefone", value: "(65) 98888-0000", type: "tel" },
                      { label: "Endereço", value: "Fazenda Aurora, Lucas do Rio Verde – MT", type: "text" },
                    ].map((field) => (
                      <div key={field.label} className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-outline">{field.label}</label>
                        <input type={field.type} defaultValue={field.value} className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                      </div>
                    ))}
                  </div>
                  <button className="w-full bg-primary text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all text-sm">
                    Salvar Alterações
                  </button>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 h-fit shadow-sm">
                  <h2 className="font-headline text-xl font-bold text-tertiary">Alterar Senha</h2>
                  <div className="space-y-4">
                    {["Senha Atual", "Nova Senha", "Confirmar Nova Senha"].map((label) => (
                      <div key={label} className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-outline">{label}</label>
                        <input type="password" placeholder="••••••••" className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                      </div>
                    ))}
                  </div>
                  <button className="w-full bg-secondary-container text-on-secondary-container font-bold py-3.5 rounded-lg hover:brightness-95 transition-all text-sm">
                    Alterar Senha
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardLocatario;
