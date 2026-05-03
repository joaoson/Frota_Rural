import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { userService } from "@/services/UserService/UserService";
import type { User } from "@/services/UserService/models/User";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskPhone } from "@/utils/masks/maskPhone";
import { validateCPF } from "@/utils/validation/validateCPF";
import { validateCNPJ } from "@/utils/validation/validateCNPJ";
import { passwordPattern } from "@/utils/regexPatterns";
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
import NotificationPopover from "@/components/NotificationPopover";
import EditEquipamentoModal, {
  type EquipamentoData,
} from "@/components/EditEquipamentoModal";

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

const sidebarItems = [
  { icon: "dashboard", label: "Dashboard", tab: "dashboard" },
  { icon: "agriculture", label: "Minha frota", tab: "frota" },
  { icon: "campaign", label: "Anúncios", tab: "anuncios" },
  { icon: "event_available", label: "Locações", tab: "reservas" },
  { icon: "description", label: "Contratos", tab: "contratos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
] as const;

const mockMachines = [
  {
    id: 1,
    renagro: "BR1029304899",
    brand: "John Deere",
    model: "S700",
    year: 2022,
    status: "active",
    purpose: "Colheita",
  },
  {
    id: 2,
    renagro: "BR5048201734",
    brand: "Valtra",
    model: "BH194",
    year: 2021,
    status: "active",
    purpose: "Preparo de Solo",
  },
  {
    id: 3,
    renagro: "BR7012345678",
    brand: "Massey Ferguson",
    model: "7700",
    year: 2019,
    status: "removed",
    purpose: "Plantio",
  },
  {
    id: 4,
    renagro: "BR3098712345",
    brand: "New Holland",
    model: "CR7.90",
    year: 2023,
    status: "active",
    purpose: "Colheita",
  },
  {
    id: 5,
    renagro: "BR6054389012",
    brand: "Case IH",
    model: "Magnum 380",
    year: 2020,
    status: "active",
    purpose: "Preparo de Solo",
  },
  {
    id: 6,
    renagro: "BR4021567890",
    brand: "Jacto",
    model: "Uniport 4530",
    year: 2022,
    status: "active",
    purpose: "Pulverização",
  },
];

const mockPostings = [
  {
    id: 1,
    machine: "JD S700",
    price: 480,
    location: "Sorriso, MT",
    status: "active",
  },
  {
    id: 2,
    machine: "Valtra BH194",
    price: 320,
    location: "Lucas do Rio Verde, MT",
    status: "active",
  },
  {
    id: 3,
    machine: "New Holland CR7.90",
    price: 520,
    location: "Sinop, MT",
    status: "active",
  },
  {
    id: 4,
    machine: "Case IH Magnum",
    price: 380,
    location: "Rondonópolis, MT",
    status: "active",
  },
  {
    id: 5,
    machine: "Jacto Uniport",
    price: 290,
    location: "Primavera do Leste, MT",
    status: "active",
  },
];

const mockRentals = [
  {
    id: 1,
    lessee: "Fazenda Aurora",
    machine: "Trator Valtra BH194",
    period: "02 – 10 Fev/2026",
    status: "pending",
    total: "R$ 15.000,00",
    contract: "#CTR-8821",
  },
  {
    id: 2,
    lessee: "Fazenda São João",
    machine: "Colheitadeira JD S700",
    period: "15 – 20 Jan/2026",
    status: "active",
    total: "R$ 38.400,00",
    contract: "#CTR-8799",
  },
  {
    id: 3,
    lessee: "Fazenda Boa Vista",
    machine: "Pulverizador Jacto",
    period: "01 – 05 Dez/2025",
    status: "completed",
    total: "R$ 6.250,00",
    contract: "#CTR-8745",
  },
  {
    id: 4,
    lessee: "Fazenda Esperança",
    machine: "Trator Massey 7700",
    period: "20 – 28 Nov/2025",
    status: "cancelled",
    total: "R$ 12.000,00",
    contract: "#CTR-8710",
  },
];

type Tab = (typeof sidebarItems)[number]["tab"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function validateDocument(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return validateCPF(digits);
  if (digits.length === 14) return validateCNPJ(digits);
  return false;
}

const DashboardLocador = () => {
  const { userId } = useAuth();
  const [user, setUser] = useState<User | null>(null);

  // Formulário dados pessoais
  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const documentRef = useRef<HTMLInputElement>(null);

  // Formulário alteração de senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showDetalhes, setShowDetalhes] = useState<number | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<number | null>(null);

  const [machines, setMachines] = useState(mockMachines);
  const [isEditEquipamentoOpen, setIsEditEquipamentoOpen] = useState(false);
  const [selectedEquipamento, setSelectedEquipamento] =
    useState<EquipamentoData>({
      id: String(mockMachines[0]?.id ?? ""),
      registroRenagro: mockMachines[0]?.renagro ?? "",
      marca: mockMachines[0]?.brand ?? "",
      modelo: mockMachines[0]?.model ?? "",
      anoFabricacao: String(mockMachines[0]?.year ?? ""),
      finalidade: mockMachines[0]?.purpose ?? "Plantio",
      horimetroInicial: "",
      horimetroFinal: "",
      especificacoes: "",
    });

  const openEditModalForMachine = (m: (typeof mockMachines)[number]) => {
    setSelectedEquipamento({
      id: String(m.id),
      registroRenagro: m.renagro,
      marca: m.brand,
      modelo: m.model,
      anoFabricacao: String(m.year),
      finalidade: m.purpose,
      horimetroInicial: "",
      horimetroFinal: "",
      especificacoes: "",
    });
    setIsEditEquipamentoOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return {
          icon: "description",
          classes:
            "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30",
          label: "Assinatura Pendente",
        };
      case "active":
        return {
          icon: "circle",
          classes: "bg-primary/10 text-primary border border-primary/20",
          label: "Em Operação (Ativo)",
        };
      case "completed":
        return {
          icon: "check_circle",
          classes: "bg-primary/10 text-primary border border-primary/20",
          label: "Concluída",
        };
      case "cancelled":
        return {
          icon: "warning",
          classes: "bg-error/10 text-error border border-error/20",
          label: "Locação Cancelada",
        };
      case "validating":
        return {
          icon: "hourglass_bottom",
          classes:
            "bg-surface-container-high text-on-surface-variant border border-outline-variant/30",
          label: "Aguardando Validação",
        };
      default:
        return { icon: "", classes: "", label: "" };
    }
  };

  useEffect(() => {
    if (!userId) return;
    userService
      .getById(userId)
      .then(setUser)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    setFormName(user.name);
    setFormDocument(maskDocument(user.document));
    setFormEmail(user.email);
    setFormPhone(maskPhone(user.phone?.replace(/^\+55/, "") ?? ""));
    setFormAddress(user.address);
  }, [user]);

  const handleDocumentBlur = () => {
    const input = documentRef.current;
    if (!input) return;
    const digits = formDocument.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!validateDocument(formDocument)) {
      const msg =
        digits.length === 14
          ? "CNPJ inválido. Verifique os dígitos informados."
          : "CPF inválido. Verifique os dígitos informados.";
      input.setCustomValidity(msg);
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    }
  };

  const handleUpdateProfile = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateDocument(formDocument)) {
      documentRef.current?.setCustomValidity("CPF ou CNPJ inválido.");
      documentRef.current?.reportValidity();
      return;
    }
    // TODO: salvar alterações no backend
  };

  const handleUpdatePassword = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      confirmPasswordRef.current?.setCustomValidity("As senhas não coincidem.");
      confirmPasswordRef.current?.reportValidity();
      return;
    }
    confirmPasswordRef.current?.setCustomValidity("");
    // TODO: alterar senha no backend
  };

  const activeRentals = useMemo(
    () =>
      mockRentals.filter(
        (r) => r.status === "pending" || r.status === "active",
      ),
    [],
  );
  const pastRentals = useMemo(
    () =>
      mockRentals.filter(
        (r) => r.status === "completed" || r.status === "cancelled",
      ),
    [],
  );

  const [frotaPage, setFrotaPage] = useState(1);
  const [anunciosPage, setAnunciosPage] = useState(1);
  const frotaPerPage = 2;
  const anunciosPerPage = 2;
  const frotaTotalPages = Math.ceil(machines.length / frotaPerPage);
  const anunciosTotalPages = Math.ceil(mockPostings.length / anunciosPerPage);
  const paginatedFrota = machines.slice(
    (frotaPage - 1) * frotaPerPage,
    frotaPage * frotaPerPage,
  );
  const paginatedAnuncios = mockPostings.slice(
    (anunciosPage - 1) * anunciosPerPage,
    anunciosPage * anunciosPerPage,
  );

  const renderRentalCard = (r: (typeof mockRentals)[number]) => {
    const badge = getStatusBadge(r.status);
    return (
      <div
        key={r.id}
        className="bg-surface-container-low rounded-2xl border border-outline-variant/30 relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
      >
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-secondary-container" />
        <div className="ml-4 p-6">
          <div className="flex justify-between items-start mb-4">
            <span
              className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${badge.classes}`}
            >
              <MaterialIcon icon={badge.icon} size={14} /> {badge.label}
            </span>
            <span className="text-sm font-bold text-outline">{r.contract}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 mb-4">
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                Locatário
              </div>
              <div className="font-bold text-tertiary text-sm flex items-center gap-1">
                <MaterialIcon icon="storefront" size={14} /> {r.lessee}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                Maquinário
              </div>
              <div className="font-bold text-on-surface text-sm">
                {r.machine}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                Período
              </div>
              <div className="font-bold text-primary text-sm">{r.period}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                Valor
              </div>
              <div className="font-black text-primary text-lg">{r.total}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status === "pending" ? (
              <button className="px-4 border-2 border-error/50 text-error hover:bg-error-container/20 py-2 rounded-lg font-bold text-xs transition-colors">
                Recusar
              </button>
            ) : null}
            {r.status === "pending" || r.status === "active" ? (
              <button className="px-4 bg-transparent text-tertiary py-2 rounded-lg font-bold text-xs hover:bg-tertiary/10 transition-colors flex items-center gap-1 border border-tertiary/50">
                <MaterialIcon icon="event_repeat" size={14} /> Reagendar
              </button>
            ) : null}
            {r.status === "completed" ? (
              <button
                onClick={() =>
                  setShowAvaliar(showAvaliar === r.id ? null : r.id)
                }
                className="px-4 bg-secondary-container/30 text-on-secondary-container py-2 rounded-lg font-bold text-xs hover:bg-secondary-container/50 transition-colors flex items-center gap-1"
              >
                <MaterialIcon icon="star" size={14} /> Avaliar Locatário
              </button>
            ) : null}
            {r.status === "pending" || r.status === "active" ? (
              <button className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20">
                <MaterialIcon icon="analytics" size={14} /> Analisar
              </button>
            ) : null}
            {r.status === "completed" || r.status === "cancelled" ? (
              <button
                onClick={() =>
                  setShowDetalhes(showDetalhes === r.id ? null : r.id)
                }
                className="px-4 bg-surface-container-high text-on-surface-variant py-2 rounded-lg font-bold text-xs hover:bg-outline-variant/30 transition-colors flex items-center gap-1"
              >
                <MaterialIcon icon="visibility" size={14} /> Ver Detalhes
              </button>
            ) : null}
          </div>

          {showDetalhes === r.id ? (
            <div className="mt-4 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 space-y-3 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm">
                Detalhes da Locação
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Contrato:
                  </span>{" "}
                  <span className="text-on-surface font-bold">
                    {r.contract}
                  </span>
                </div>
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Locatário:
                  </span>{" "}
                  <span className="text-on-surface font-bold">{r.lessee}</span>
                </div>
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Maquinário:
                  </span>{" "}
                  <span className="text-on-surface font-bold">{r.machine}</span>
                </div>
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Período:
                  </span>{" "}
                  <span className="text-on-surface font-bold">{r.period}</span>
                </div>
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Valor Total:
                  </span>{" "}
                  <span className="text-primary font-black">{r.total}</span>
                </div>
                <div>
                  <span className="text-outline text-xs font-bold uppercase">
                    Status:
                  </span>{" "}
                  <span className="text-on-surface font-bold">
                    {badge.label}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {showAvaliar === r.id ? (
            <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
                <MaterialIcon
                  icon="star"
                  size={16}
                  className="text-on-secondary-container"
                />{" "}
                Avaliar Locatário
              </h4>
              <p className="text-sm text-on-surface-variant">
                Como foi a experiência com {r.lessee}?
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaterialIcon
                    key={i}
                    icon="star"
                    filled={i <= 4}
                    className={`text-3xl cursor-pointer hover:scale-110 transition-transform ${i <= 4 ? "text-secondary-container" : "text-outline/40"}`}
                  />
                ))}
              </div>
              <textarea
                placeholder="Conte como foi a experiência..."
                rows={2}
                className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm resize-none"
              />
              <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all text-sm">
                Enviar Avaliação
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

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
              {user ? getInitials(user.name) : "…"}
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">
                {user?.name ?? "…"}
              </div>
              <div className="text-[11px] text-on-surface-variant capitalize">
                {user?.role ?? "…"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <div />
          <NotificationPopover
            notifications={[
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
            ]}
          />
        </header>

        <div className="p-8 max-w-[1200px]">
          <EditEquipamentoModal
            open={isEditEquipamentoOpen}
            onOpenChange={setIsEditEquipamentoOpen}
            equipamento={selectedEquipamento}
            onSave={(data) => {
              setSelectedEquipamento(data);
              setMachines((prev) =>
                prev.map((m) =>
                  String(m.id) === data.id
                    ? {
                        ...m,
                        renagro: data.registroRenagro,
                        brand: data.marca,
                        model: data.modelo,
                        year: data.anoFabricacao
                          ? Number(data.anoFabricacao)
                          : m.year,
                        purpose: data.finalidade,
                      }
                    : m,
                ),
              );
            }}
          />

          {tab === "dashboard" ? (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  Bom dia, {user?.name.split(" ")[0] ?? "…"}
                </h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">
                  Veja o resumo das suas atividades
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  {
                    label: "EQUIPAMENTOS",
                    value: "3",
                    sub: "na frota ativa",
                    icon: "agriculture",
                  },
                  {
                    label: "ANÚNCIOS ATIVOS",
                    value: "2",
                    sub: "publicados",
                    icon: "campaign",
                    dotColor: "bg-primary",
                  },
                  {
                    label: "LOCAÇÕES ATIVAS",
                    value: "1",
                    sub: "em andamento",
                    icon: "event_available",
                  },
                  {
                    label: "RECEITA NO MÊS",
                    value: "R$ 4.800",
                    sub: "fevereiro 2026",
                    icon: "payments",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
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
                    <div className="text-sm text-on-surface-variant flex items-center gap-1.5">
                      {stat.dotColor ? (
                        <span
                          className={`w-2 h-2 rounded-full ${stat.dotColor} animate-pulse`}
                        />
                      ) : null}
                      {stat.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-headline text-lg font-bold text-on-surface">
                      Evolução do Faturamento
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Últimos 6 meses
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-primary">
                      R$ 88.650
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
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--outline-variant))"
                        opacity={0.3}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--on-surface-variant))",
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--on-surface-variant))",
                        }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value) => {
                          if (typeof value === "number")
                            return [
                              `R$ ${value.toLocaleString("pt-BR")}`,
                              "Faturamento",
                            ];
                          if (typeof value === "string")
                            return [`R$ ${value}`, "Faturamento"];
                          return ["—", "Faturamento"];
                        }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid hsl(var(--outline-variant))",
                          fontSize: 13,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-headline text-lg font-bold text-on-surface">
                      Notas das Avaliações
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Média mensal de satisfação
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-secondary-container/10 px-3 py-1.5 rounded-lg">
                    <MaterialIcon
                      icon="star"
                      filled
                      className="text-secondary-container"
                      size={16}
                    />
                    <span className="font-black text-on-secondary-container text-sm">
                      4.6
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
                        stroke="hsl(var(--outline-variant))"
                        opacity={0.3}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--on-surface-variant))",
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--on-surface-variant))",
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) => {
                          if (typeof value === "number")
                            return [`${value.toFixed(1)} ★`, "Nota média"];
                          if (typeof value === "string")
                            return [`${value} ★`, "Nota média"];
                          return ["—", "Nota média"];
                        }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid hsl(var(--outline-variant))",
                          fontSize: 13,
                        }}
                      />
                      <Bar
                        dataKey="rating"
                        fill="hsl(39, 99%, 60%)"
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
                      Reservas recentes
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
                  {mockRentals.map((r) => {
                    const badge = getStatusBadge(r.status);
                    return (
                      <div
                        key={r.id}
                        className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 flex items-center justify-between hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-surface-container-high rounded-xl flex items-center justify-center">
                            <MaterialIcon
                              icon="precision_manufacturing"
                              className="text-primary"
                              size={20}
                            />
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">
                              {r.lessee} · {r.machine}
                            </div>
                            <div className="text-sm text-on-surface-variant">
                              {r.period} · {r.contract}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${badge.classes}`}
                          >
                            <MaterialIcon icon={badge.icon} size={12} />{" "}
                            {badge.label}
                          </span>
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
          ) : null}

          {tab === "frota" ? (
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="font-headline text-3xl font-bold text-primary">
                    Minha Frota
                  </h1>
                  <div className="h-1 w-16 bg-secondary-container mt-2" />
                  <p className="text-on-surface-variant text-sm mt-3">
                    Gerencie seus equipamentos cadastrados
                  </p>
                </div>
                <Link
                  to="/dashboard/novo-equipamento"
                  className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <MaterialIcon icon="add" size={18} /> Novo Equipamento
                </Link>
              </div>
              <DashboardSearchBar
                searchValue=""
                onSearchChange={() => {}}
                yearValue="Todos"
                onYearChange={() => {}}
                searchPlaceholder="Buscar por marca, modelo ou Renagro..."
              />
              {paginatedFrota.map((m) => (
                <div
                  key={m.id}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 flex items-center justify-between hover:shadow-xl transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                      <MaterialIcon
                        icon="agriculture"
                        className="text-primary"
                        size={28}
                      />
                    </div>
                    <div>
                      <h3 className="font-headline font-bold text-on-surface text-lg">
                        {m.brand} {m.model} ({m.year})
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        Renagro: {m.renagro} · {m.purpose}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {m.status === "active" ? (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />{" "}
                        Ativo
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 flex items-center gap-1.5">
                        <MaterialIcon icon="cancel" size={14} /> Removido
                      </span>
                    )}
                    <button
                      onClick={() => openEditModalForMachine(m)}
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
              <DashboardPagination
                currentPage={frotaPage}
                totalPages={frotaTotalPages}
                onPageChange={setFrotaPage}
              />
            </div>
          ) : null}

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
                        <button className="text-sm font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors">
                          Gerenciar
                        </button>
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
              {[
                {
                  id: "#CTR-8821",
                  lessee: "Fazenda Aurora",
                  machine: "Trator Valtra BH194",
                  period: "02 – 10 Fev/2026",
                  total: "R$ 15.000,00",
                  status: "pending",
                  date: "28 Jan/2026",
                },
                {
                  id: "#CTR-8799",
                  lessee: "Fazenda São João",
                  machine: "Colheitadeira JD S700",
                  period: "15 – 20 Jan/2026",
                  total: "R$ 38.400,00",
                  status: "signed",
                  date: "12 Jan/2026",
                },
                {
                  id: "#CTR-8745",
                  lessee: "Fazenda Boa Vista",
                  machine: "Pulverizador Jacto",
                  period: "01 – 05 Dez/2025",
                  total: "R$ 6.250,00",
                  status: "closed",
                  date: "28 Nov/2025",
                },
              ].map((c) => (
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
                          {c.id} — {c.machine}
                        </h3>
                        <p className="text-sm text-on-surface-variant">
                          {c.lessee} · Criado em {c.date}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                        c.status === "pending"
                          ? "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30"
                          : c.status === "signed"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                      }`}
                    >
                      <MaterialIcon
                        icon={
                          c.status === "pending"
                            ? "description"
                            : c.status === "signed"
                              ? "verified"
                              : "check_circle"
                        }
                        size={14}
                      />
                      {c.status === "pending"
                        ? "Assinatura Pendente"
                        : c.status === "signed"
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
                    {c.status === "pending" ? (
                      <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2">
                        <MaterialIcon icon="draw" size={16} /> Assinar Contrato
                      </button>
                    ) : null}
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

          {tab === "avaliacoes" ? (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  Avaliações
                </h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">
                  Veja as avaliações recebidas e fornecidas
                </p>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon
                    icon="inbox"
                    size={22}
                    className="text-primary"
                  />{" "}
                  Avaliações Recebidas
                </h2>
                <div className="space-y-4">
                  {[
                    {
                      from: "Fazenda Boa Vista",
                      initials: "BV",
                      machine: "Pulverizador Jacto",
                      date: "06/12/2025",
                      rating: 5,
                      comment:
                        "Equipamento em ótimo estado, operador muito competente. Recomendo!",
                    },
                    {
                      from: "Fazenda São João",
                      initials: "SJ",
                      machine: "Colheitadeira JD S700",
                      date: "21/01/2026",
                      rating: 4,
                      comment:
                        "Colheitadeira funcionou perfeitamente. Apenas um pequeno atraso na entrega.",
                    },
                    {
                      from: "Fazenda Aurora",
                      initials: "FA",
                      machine: "Trator Valtra BH194",
                      date: "11/02/2026",
                      rating: 5,
                      comment:
                        "Excelente trator, muito bem cuidado. João foi muito atencioso com tudo.",
                    },
                  ].map((r) => (
                    <div
                      key={r.from + r.date}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-secondary-container/30 flex items-center justify-center text-sm font-bold text-tertiary">
                            {r.initials}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">
                              {r.from}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {r.machine} · {r.date}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <MaterialIcon
                              key={j}
                              icon="star"
                              filled={j < r.rating}
                              className={
                                j < r.rating
                                  ? "text-secondary-container"
                                  : "text-outline/30"
                              }
                              size={16}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-on-surface leading-relaxed">
                        "{r.comment}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon
                    icon="outbox"
                    size={22}
                    className="text-primary"
                  />{" "}
                  Avaliações Fornecidas
                </h2>
                <div className="space-y-4">
                  {[
                    {
                      to: "Fazenda Boa Vista",
                      initials: "BV",
                      machine: "Pulverizador Jacto",
                      date: "06/12/2025",
                      rating: 5,
                      comment:
                        "Locatário muito cuidadoso com o equipamento. Devolveu tudo em perfeito estado.",
                    },
                    {
                      to: "Fazenda São João",
                      initials: "SJ",
                      machine: "Colheitadeira JD S700",
                      date: "21/01/2026",
                      rating: 5,
                      comment:
                        "Excelente locatário, pagamento pontual e comunicação ótima.",
                    },
                  ].map((r) => (
                    <div
                      key={r.to + r.date}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {r.initials}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">
                              {r.to}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {r.machine} · {r.date}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <MaterialIcon
                                key={j}
                                icon="star"
                                filled={j < r.rating}
                                className={
                                  j < r.rating
                                    ? "text-secondary-container"
                                    : "text-outline/30"
                                }
                                size={16}
                              />
                            ))}
                          </div>
                          <button
                            className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors"
                            title="Excluir avaliação"
                          >
                            <MaterialIcon icon="close" size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-on-surface leading-relaxed">
                        "{r.comment}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <DashboardPagination
                currentPage={1}
                totalPages={2}
                onPageChange={() => {}}
              />
            </div>
          ) : null}

          {tab === "conta" ? (
            <div className="space-y-6">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  Minha Conta
                </h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">
                  Edite suas informações de cadastro
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 shadow-sm">
                  <h2 className="font-headline text-xl font-bold text-tertiary">
                    Dados Pessoais
                  </h2>
                  <div className="flex items-center gap-6 pb-2">
                    <div className="relative group">
                      <div className="w-20 h-20 bg-primary-container text-on-primary rounded-full flex items-center justify-center font-headline font-bold text-2xl">
                        {user ? getInitials(user.name) : "…"}
                      </div>
                      <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <MaterialIcon
                          icon="photo_camera"
                          className="text-white"
                          size={24}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div>
                      <div className="font-bold text-on-surface">
                        {user?.name ?? "…"}
                      </div>
                      <div className="text-sm text-on-surface-variant mb-2 capitalize">
                        {user?.role ?? "…"}
                      </div>
                      <label className="text-xs font-bold text-primary cursor-pointer hover:underline flex items-center gap-1">
                        <MaterialIcon icon="upload" size={14} /> Alterar foto
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  <form className="space-y-4" onSubmit={handleUpdateProfile}>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        CPF / CNPJ
                      </label>
                      <input
                        ref={documentRef}
                        type="text"
                        value={formDocument}
                        onChange={(e) => {
                          setFormDocument(maskDocument(e.target.value));
                          documentRef.current?.setCustomValidity("");
                        }}
                        onBlur={handleDocumentBlur}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                        pattern="\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}"
                        title="Informe um CPF válido (000.000.000-00) ou CNPJ válido (00.000.000/0001-00)"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        E-mail
                      </label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Telefone
                      </label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) =>
                          setFormPhone(maskPhone(e.target.value))
                        }
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                        pattern="\(\d{2}\) \d{4,5}-\d{4}"
                        title="Informe um telefone válido no formato (00) 90000-0000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Endereço
                      </label>
                      <input
                        type="text"
                        value={formAddress}
                        onChange={(e) => setFormAddress(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-primary text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all text-sm"
                    >
                      Salvar Alterações
                    </button>
                  </form>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 h-fit shadow-sm">
                  <h2 className="font-headline text-xl font-bold text-tertiary">
                    Alterar Senha
                  </h2>
                  <form className="space-y-4" onSubmit={handleUpdatePassword}>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Senha Atual
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                        minLength={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Nova Senha
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          confirmPasswordRef.current?.setCustomValidity("");
                        }}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                        pattern={passwordPattern.regex.source}
                        title={passwordPattern.title}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Confirmar Nova Senha
                      </label>
                      <input
                        ref={confirmPasswordRef}
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          confirmPasswordRef.current?.setCustomValidity("");
                        }}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-secondary-container text-on-secondary-container font-bold py-3.5 rounded-lg hover:brightness-95 transition-all text-sm"
                    >
                      Alterar Senha
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default DashboardLocador;
