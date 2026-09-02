import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { reviewService, type Review } from "@/services/ReviewService/ReviewService";
import { contractService } from "@/services/ContractService/ContractService";
import { userService } from "@/services/UserService/UserService";
import type { User } from "@/services/UserService/models/User";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskPhone } from "@/utils/masks/maskPhone";
import { maskCEP } from "@/utils/masks/maskCEP";
import { fetchAddressByCEP, formatAddressFromCEP } from "@/services/ViaCEPService";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { UFS } from "@/utils/ufs";
import { validateDocument } from "@/utils/validation/validateDocument";
import { mensagemErroCEP } from "@/utils/validation/validateCEP";
import ChatInboxPanel from "@/components/ChatInboxPanel";
import { useChatUnread } from "@/contexts/ChatUnreadContext";
import { passwordPattern } from "@/utils/regexPatterns";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardPagination from "@/components/DashboardPagination";
import DashboardSearchBar from "@/components/DashboardSearchBar";
import MaterialIcon from "@/components/MaterialIcon";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationPopover from "@/components/NotificationPopover";
import DashboardMachineSearch from "@/components/DashboardMachineSearch";
import OperadoresPanel from "@/components/OperadoresPanel";
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
  { icon: "engineering", label: "Operadores", tab: "operadores" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
];

type Tab = "dashboard" | "buscar" | "locacoes" | "contratos" | "operadores" | "avaliacoes" | "chat" | "notificacoes" | "conta" | "sair";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DashboardLocatario = () => {
  const { userId, logout } = useAuth();
  const { unread_total: unreadTotal } = useChatUnread();
  const [user, setUser] = useState<User | null>(null);

  // Formulário dados pessoais
  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formCep, setFormCep] = useState("");
  const documentRef = useRef<HTMLInputElement>(null);
  const cepRef = useRef<HTMLInputElement>(null);

  // Formulário alteração de senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showReagendar, setShowReagendar] = useState<number | null>(null);
  const [showDetalhes, setShowDetalhes] = useState<number | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<number | null>(null);

  const [receivedReviews, setReceivedReviews] = useState<Review[]>([]);
  const [givenReviews, setGivenReviews] = useState<Review[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    if (!userId) return;
    userService
      .getById(userId)
      .then(setUser)
      .catch(console.error);

    reviewService.getReviewsByReviewee(userId).then(setReceivedReviews).catch(console.error);
    reviewService.getReviewsByReviewer(userId).then(setGivenReviews).catch(console.error);

    contractService.listByLessee(userId).then(data => {
      const mapped = data.map(r => ({
        id: r.id,
        postingId: r.postingId,
        startDate: r.startDate,
        endDate: r.endDate,
        owner: r.lessorId === "lessor-joao" ? "João Silva" : r.lessorId === "lessor-pedro" ? "Pedro Souza" : r.lessorId === "lessor-carlos" ? "Carlos Lima" : "Locador",
        machine: r.machineName,
        period: r.period,
        status: r.status,
        total: r.total,
        contract: r.contractNumber,
        image: r.image || (r.id === "rental-3" ? machine1 : machine2)
      }));
      setRentals(mapped);
    }).catch(console.error);
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    setFormName(user.name);
    setFormDocument(maskDocument(user.document));
    setFormEmail(user.email);
    setFormPhone(maskPhone(user.phone?.replace(/^\+55/, "") ?? ""));
    setFormAddress(user.address);
    setFormCity(user.city ?? "");
    setFormState((user.state ?? "").toUpperCase());
    setFormCep(maskCEP(user.cep ?? ""));
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

  const handleCepBlur = () => {
    const input = cepRef.current;
    if (!input) return;
    const erro = mensagemErroCEP(formCep);
    input.setCustomValidity(erro);
    if (erro) input.reportValidity();
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateDocument(formDocument)) {
      documentRef.current?.setCustomValidity("CPF ou CNPJ inválido.");
      documentRef.current?.reportValidity();
      return;
    }
    // CEP é opcional aqui, mas pela metade a API recusa o cadastro inteiro.
    const erroCep = mensagemErroCEP(formCep);
    if (erroCep) {
      cepRef.current?.setCustomValidity(erroCep);
      cepRef.current?.reportValidity();
      return;
    }
    try {
      const updated = await userService.updateProfile(userId!, {
        name: formName.trim(),
        document: clearSpecialChars(formDocument),
        email: formEmail.toLowerCase().trim(),
        phone: `+55${clearSpecialChars(formPhone)}`,
        address: formAddress.trim(),
        city: formCity.trim(),
        state: formState.toUpperCase(),
        cep: clearSpecialChars(formCep),
      });
      setUser(updated);
      toast.success("Dados atualizados com sucesso.");
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data;
        if (data.email) {
          toast.error("Este e-mail já está em uso.");
          return;
        }
        if (data.document) {
          toast.error("Este documento já está cadastrado.");
          return;
        }
      }
      toast.error("Não foi possível salvar as alterações. Tente novamente.");
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      confirmPasswordRef.current?.setCustomValidity("As senhas não coincidem.");
      confirmPasswordRef.current?.reportValidity();
      return;
    }
    confirmPasswordRef.current?.setCustomValidity("");
    try {
      await userService.updatePassword({
        id: userId!,
        currentPassword: currentPassword,
        newPassword: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) {
        toast.error("Senha atual incorreta.");
      } else {
        toast.error("Não foi possível alterar a senha. Tente novamente.");
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return { icon: "description", classes: "bg-secondary-container/20 text-secondary border border-secondary-container/30", label: "Assinatura Pendente" };
      case "active": return { icon: "circle", classes: "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20", label: "Em Operação (Ativo)" };
      case "completed": return { icon: "check_circle", classes: "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20", label: "Concluída" };
      case "cancelled": return { icon: "warning", classes: "bg-error/10 text-error border border-error/20", label: "Locação Cancelada" };
      default: return { icon: "", classes: "", label: "" };
    }
  };

  const activeRentals = rentals.filter(r => r.status === "pending" || r.status === "active");
  const pastRentals = rentals.filter(r => r.status === "completed" || r.status === "cancelled");

  const renderRentalCard = (r: any) => {
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
              <div className="font-bold text-primary dark:text-primary-bright text-sm flex items-center gap-1">
                <MaterialIcon icon="person" size={14} /> {r.owner}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Maquinário</div>
              <div className="font-bold text-on-surface text-sm">{r.machine}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Período</div>
              <div className="font-bold text-primary dark:text-primary-bright text-sm">{r.period}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Valor</div>
              <div className="font-black text-primary dark:text-primary-bright text-lg">{r.total}</div>
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
              <button onClick={() => setShowAvaliar(showAvaliar === r.id ? null : r.id)} className="px-4 bg-secondary-container/30 text-secondary py-2 rounded-lg font-bold text-xs hover:bg-secondary-container/50 transition-colors flex items-center gap-1">
                <MaterialIcon icon="star" size={14} /> Avaliar
              </button>
            )}
            {(r.status === "pending" || r.status === "active") && (
              <Link to={`/dashboard-locatario/locacoes/${r.id}`} className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20">
                <MaterialIcon icon="analytics" size={14} /> Analisar
              </Link>
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
                <div><span className="text-outline text-xs font-bold uppercase">Valor Total:</span> <span className="text-primary dark:text-primary-bright font-black">{r.total}</span></div>
                <div><span className="text-outline text-xs font-bold uppercase">Status:</span> <span className="text-on-surface font-bold">{badge.label}</span></div>
              </div>
            </div>
          )}

          {showReagendar === r.id && (
            <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
                <MaterialIcon icon="event_repeat" size={16} className="text-secondary" /> Solicitar Reagendamento
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="nova-data-inicio" className="text-xs font-bold uppercase tracking-wider text-outline">Nova Data Início</label>
                  <input id="nova-data-inicio" type="date" className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nova-data-fim" className="text-xs font-bold uppercase tracking-wider text-outline">Nova Data Fim</label>
                  <input id="nova-data-fim" type="date" className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="motivo" className="text-xs font-bold uppercase tracking-wider text-outline">Motivo</label>
                <textarea id="motivo" placeholder="Ex: Chuvas atrasaram o preparo..." rows={2} className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm resize-none" />
              </div>
              <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm">
                <MaterialIcon icon="send" size={16} /> Enviar Solicitação
              </button>
            </div>
          )}

          {showAvaliar === r.id && (
            <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
              <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
                <MaterialIcon icon="star" size={16} className="text-secondary" /> Avaliar Serviço
              </h4>
              <p className="text-sm text-on-surface-variant">Como foi sua experiência com {r.owner}?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaterialIcon 
                    key={i} 
                    icon="star" 
                    filled={i <= reviewRating} 
                    onClick={() => setReviewRating(i)}
                    className={`text-3xl cursor-pointer hover:scale-110 transition-transform ${i <= reviewRating ? "text-secondary-container" : "text-outline/40"}`} 
                  />
                ))}
              </div>
              <textarea 
                placeholder="Conte como foi a experiência..." 
                rows={2} 
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm resize-none" 
              />
              <button 
                onClick={async () => {
                  if (!userId) return;
                  if (!reviewComment.trim()) {
                    toast.error("Por favor, escreva um comentário.");
                    return;
                  }
                  setIsSubmittingReview(true);
                  try {
                    await reviewService.createReview({
                      reviewer: userId,
                      reviewee: "047f6582-ebe6-47af-ba5f-061ac9819b80", // Valid Locador ID for testing
                      rating: reviewRating,
                      comment: reviewComment,
                      rental: "fe6c805a-d5be-4dfe-970f-d2c3fae1cf00" // Valid Rental ID for testing
                    });
                    toast.success("Avaliação enviada com sucesso!");
                    setShowAvaliar(null);
                    setReviewRating(5);
                    setReviewComment("");
                    const updatedGiven = await reviewService.getReviewsByReviewer(userId);
                    setGivenReviews(updatedGiven);
                  } catch (error) {
                    console.error("Erro ao enviar avaliação:", error);
                    if (error instanceof AxiosError && error.response?.data?.error) {
                      toast.error(error.response.data.error);
                    } else {
                      toast.error("Erro ao enviar avaliação.");
                    }
                  } finally {
                    setIsSubmittingReview(false);
                  }
                }}
                disabled={isSubmittingReview}
                className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all text-sm disabled:opacity-50"
              >
                {isSubmittingReview ? "Enviando..." : "Enviar Avaliação"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`w-64 shrink-0 border-r border-outline-variant/30 h-screen fixed md:sticky top-0 bg-surface-container-low flex flex-col z-50 transform transition-transform duration-300 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-6 pb-4">
          <Link to="/" className="font-headline font-black text-xl text-primary dark:text-primary-bright tracking-tighter">Frota Rural</Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => {
            const buttonEl = (
              <button
                key={item.tab}
                onClick={
                  item.tab !== "sair" ? () => {
                    setTab(item.tab as Tab);
                    setIsSidebarOpen(false);
                  } : undefined
                }
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === item.tab
                    ? "bg-primary/10 text-primary dark:text-primary-bright font-bold border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <MaterialIcon icon={item.icon} size={20} />
                <span>{item.label}</span>
                {item.tab === "chat" && unreadTotal > 0 ? (
                  <span className="ml-auto w-5 h-5 bg-error text-on-primary rounded-full text-[10px] font-bold flex items-center justify-center">
                    {unreadTotal > 9 ? "9+" : unreadTotal}
                  </span>
                ) : null}
              </button>
            );

            if (item.tab === "sair") {
              return (
                <AlertDialog key={item.tab}>
                  <AlertDialogTrigger asChild>{buttonEl}</AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sair da conta</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja sair?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel variant="outline">
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={logout}>
                        Sair
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            }

            return buttonEl;
          })}
        </nav>
        <div className="p-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-sm">
              {user ? getInitials(user.name) : "…"}
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">
                {user ? `${user.name.split(" ")[0]} ${user.name.split(" ").slice(-1)[0]}` : "…"}
              </div>
              <div className="text-[11px] text-on-surface-variant">Locatário</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg"
            >
              <MaterialIcon icon="menu" size={24} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationPopover
            notifications={[
              { id: 1, icon: "event_available", title: "Reserva confirmada", desc: "Trator Valtra BH194 · 02–10 Fev/2026", time: "Agora", unread: true },
              { id: 2, icon: "description", title: "Contrato pronto para assinatura", desc: "Colheitadeira JD S700 · Fazenda São João", time: "3h atrás", unread: true },
            ]}
            />
          </div>
        </header>

        <div className="p-8 max-w-[1200px]">
          {/* Dashboard */}
          {tab === "dashboard" && (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Bom dia, {user ? user.name.split(" ")[0] : "…"}</h1>
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
                      <MaterialIcon icon={stat.icon} size={16} className="text-primary dark:text-primary-bright" />
                      <div className="text-[10px] font-bold text-primary dark:text-primary-bright uppercase tracking-widest">{stat.label}</div>
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
                    <div className="text-2xl font-black text-primary dark:text-primary-bright">R$ 46.850</div>
                    <div className="text-[10px] font-bold text-primary dark:text-primary-bright uppercase tracking-wider">Total acumulado</div>
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
                      <Tooltip formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'Gasto']} contentStyle={{ borderRadius: 12, border: '1px solid var(--outline-variant)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 13 }} labelStyle={{ color: 'var(--popover-foreground)' }} itemStyle={{ color: 'var(--popover-foreground)' }} />
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
                      <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)} ★`, 'Nota média']} contentStyle={{ borderRadius: 12, border: '1px solid var(--outline-variant)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 13 }} labelStyle={{ color: 'var(--popover-foreground)' }} itemStyle={{ color: 'var(--popover-foreground)' }} />
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
                  <button onClick={() => setTab("locacoes")} className="text-sm font-bold text-primary dark:text-primary-bright hover:underline flex items-center gap-1">
                    Ver todas <MaterialIcon icon="arrow_forward" size={14} />
                  </button>
                </div>
                <div className="space-y-3">
                  {rentals.map((r) => {
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
            <DashboardMachineSearch />
          )}

          {/* Locações */}
          {tab === "locacoes" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Minhas Locações</h1>
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
                    <MaterialIcon icon="play_circle" size={20} className="text-primary dark:text-primary-bright" /> Locações em Andamento
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
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Contratos</h1>
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
                        <MaterialIcon icon="description" className="text-primary dark:text-primary-bright" size={24} />
                      </div>
                      <div>
                        <h3 className="font-headline font-bold text-on-surface">{c.contract} — {c.machine}</h3>
                        <p className="text-sm text-on-surface-variant">{c.owner} · Criado em 2026</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                      c.status === "pending" ? "bg-secondary-container/20 text-secondary border border-secondary-container/30"
                        : c.status === "active" || c.status === "signed" ? "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20"
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
                      <div className="font-bold text-primary dark:text-primary-bright text-sm">{c.period}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Valor Total</div>
                      <div className="font-black text-primary dark:text-primary-bright text-lg">{c.total}</div>
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

          {/* Operadores */}
          {tab === "operadores" && <OperadoresPanel />}

          {/* Avaliações Tab */}
          {tab === "avaliacoes" && (
            <div className="space-y-8">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Avaliações</h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">Veja as avaliações recebidas e fornecidas</p>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon icon="inbox" size={22} className="text-primary dark:text-primary-bright" /> Avaliações Recebidas
                </h2>
                <div className="space-y-4">
                  {receivedReviews.length > 0 ? receivedReviews.map((r) => (
                    <div key={r.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-secondary-container/30 flex items-center justify-center text-sm font-bold text-tertiary">{r.reviewer_name?.slice(0, 2).toUpperCase() || 'NA'}</div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">{r.reviewer_name}</div>
                            <div className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleDateString()}</div>
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
                  )) : (
                    <p className="text-sm text-on-surface-variant">Nenhuma avaliação recebida ainda.</p>
                  )}
                </div>
              </div>

              <div>
                <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
                  <MaterialIcon icon="outbox" size={22} className="text-primary dark:text-primary-bright" /> Avaliações Fornecidas
                </h2>
                <div className="space-y-4">
                  {givenReviews.length > 0 ? givenReviews.map((r) => (
                    <div key={r.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary dark:text-primary-bright">{r.reviewee_name?.slice(0, 2).toUpperCase() || 'NA'}</div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">{r.reviewee_name}</div>
                            <div className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <MaterialIcon key={j} icon="star" filled={j < r.rating} className={j < r.rating ? "text-secondary-container" : "text-outline/30"} size={16} />
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              reviewService.deleteReview(r.id).then(() => {
                                setGivenReviews(prev => prev.filter(review => review.id !== r.id));
                                toast.success("Avaliação excluída com sucesso.");
                              }).catch(() => toast.error("Erro ao excluir avaliação."));
                            }}
                            className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors" title="Excluir avaliação">
                            <MaterialIcon icon="close" size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-on-surface leading-relaxed">"{r.comment}"</p>
                    </div>
                  )) : (
                    <p className="text-sm text-on-surface-variant">Você ainda não forneceu nenhuma avaliação.</p>
                  )}
                </div>
              </div>
              {(receivedReviews.length > 0 || givenReviews.length > 0) && (
                <DashboardPagination currentPage={1} totalPages={Math.max(1, Math.ceil(Math.max(receivedReviews.length, givenReviews.length) / 5))} onPageChange={() => {}} />
              )}
            </div>
          )}

          {/* Chat */}
          {tab === "chat" && (
            <ChatInboxPanel subtitle="Converse com seus locadores" />
            <div className="space-y-6">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Mensagens</h1>
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
                          <button onClick={(e) => { e.stopPropagation(); }} className="p-1.5 rounded-lg text-outline hover:text-primary dark:hover:text-primary-bright hover:bg-surface-container transition-colors opacity-0 group-hover:opacity-100" title="Arquivar conversa">
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
                        <div className="text-[10px] font-bold text-primary dark:text-primary-bright uppercase tracking-wider flex items-center gap-1">
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
                    <button aria-label="Anexar arquivo" className="text-outline hover:text-primary dark:hover:text-primary-bright transition-colors p-2 rounded-lg hover:bg-surface-container">
                      <MaterialIcon icon="attach_file" size={20} />
                    </button>
                    <input type="text" placeholder="Digite sua mensagem..." className="flex-1 bg-surface-container border-none rounded-full px-5 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface" />
                    <button aria-label="Enviar mensagem" className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
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
                  <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Notificações</h1>
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
                  { icon: "event_repeat", title: "Reagendamento aprovado", desc: "Novo período: 15–20 Fev/2026 · Trator Valtra BH194", time: "2 dias atrás", unread: false },
                  { icon: "payments", title: "Pagamento processado", desc: "R$ 15.000,00 — Trator Valtra BH194", time: "3 dias atrás", unread: false },
                ].map((n, i) => (
                  <div key={i} className={`flex items-start gap-4 p-5 rounded-2xl border transition-all hover:shadow-md ${n.unread ? "bg-primary/5 border-primary/20" : "bg-surface-container-lowest border-outline-variant/30"}`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${n.unread ? "bg-primary/10" : "bg-surface-container-high"}`}>
                      <MaterialIcon icon={n.icon} className={n.unread ? "text-primary dark:text-primary-bright" : "text-on-surface-variant"} size={22} />
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
            <div className="space-y-6">
              <div>
                <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">Minha Conta</h1>
                <div className="h-1 w-16 bg-secondary-container mt-2" />
                <p className="text-on-surface-variant text-sm mt-3">Edite suas informações de cadastro</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <form
                  onSubmit={handleUpdateProfile}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 shadow-sm"
                >
                  <h2 className="font-headline text-xl font-bold text-tertiary">Dados Pessoais</h2>
                  <div className="flex items-center gap-6 pb-2">
                    <div className="relative group">
                      <div className="w-20 h-20 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-2xl">
                        {user ? getInitials(user.name) : "…"}
                      </div>
                      <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <MaterialIcon icon="photo_camera" className="text-white" size={24} />
                        <input type="file" accept="image/*" className="hidden" />
                      </label>
                    </div>
                    <div>
                      <div className="font-bold text-on-surface">{user?.name ?? "…"}</div>
                      <div className="text-sm text-on-surface-variant mb-2">Locatário</div>
                      <label className="text-xs font-bold text-primary dark:text-primary-bright cursor-pointer hover:underline flex items-center gap-1">
                        <MaterialIcon icon="upload" size={14} /> Alterar foto
                        <input type="file" accept="image/*" className="hidden" />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="nome-completo" className="text-xs font-bold uppercase tracking-wider text-outline">Nome Completo</label>
                      <input id="nome-completo"
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="cpf-cnpj" className="text-xs font-bold uppercase tracking-wider text-outline">CPF / CNPJ</label>
                      <input id="cpf-cnpj"
                        type="text"
                        required
                        pattern="\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}"
                        title="Informe um CPF válido (000.000.000-00) ou CNPJ válido (00.000.000/0001-00)"
                        ref={documentRef}
                        value={formDocument}
                        onChange={(e) => {
                          setFormDocument(maskDocument(e.target.value));
                          documentRef.current?.setCustomValidity("");
                        }}
                        onBlur={handleDocumentBlur}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="e-mail" className="text-xs font-bold uppercase tracking-wider text-outline">E-mail</label>
                      <input id="e-mail"
                        type="email"
                        required
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="telefone" className="text-xs font-bold uppercase tracking-wider text-outline">Telefone</label>
                      <input id="telefone"
                        type="tel"
                        required
                        pattern="\(\d{2}\) \d{4,5}-\d{4}"
                        title="Informe um telefone válido no formato (00) 90000-0000"
                        value={formPhone}
                        onChange={(e) => setFormPhone(maskPhone(e.target.value))}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="cep" className="text-xs font-bold uppercase tracking-wider text-outline">CEP</label>
                      <input id="cep"
                        ref={cepRef}
                        type="text"
                        placeholder="00000-000"
                        value={formCep}
                        onBlur={handleCepBlur}
                        onChange={async (e) => {
                          const masked = maskCEP(e.target.value);
                          setFormCep(masked);
                          cepRef.current?.setCustomValidity("");
                          const digits = masked.replace(/\D/g, "");
                          if (digits.length === 8) {
                            try {
                              const data = await fetchAddressByCEP(digits);
                              if (data) {
                                setFormAddress(formatAddressFromCEP(data, "logradouro"));
                                setFormCity(data.localidade);
                                setFormState(data.uf.toUpperCase());
                              } else {
                                toast.error("CEP não encontrado.");
                              }
                            } catch (error) {
                              console.error("Erro ao buscar CEP", error);
                            }
                          }
                        }}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="endereco" className="text-xs font-bold uppercase tracking-wider text-outline">Endereço</label>
                      <input id="endereco"
                        type="text"
                        required
                        value={formAddress}
                        onChange={(e) => setFormAddress(e.target.value)}
                        className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                      />
                    </div>
                    {/* Município e UF em campo próprio: é este par que o
                        contrato usa como foro, e deixá-lo só no texto do
                        endereço obrigava a adivinhá-lo por regex. */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2 col-span-2">
                        <label htmlFor="cidade" className="text-xs font-bold uppercase tracking-wider text-outline">Cidade</label>
                        <input id="cidade"
                          type="text"
                          value={formCity}
                          onChange={(e) => setFormCity(e.target.value)}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="estado" className="text-xs font-bold uppercase tracking-wider text-outline">Estado</label>
                        <select id="estado"
                          value={formState}
                          onChange={(e) => setFormState(e.target.value)}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        >
                          <option value="">—</option>
                          {UFS.map((uf) => (
                            <option key={uf} value={uf}>
                              {uf}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-primary text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all text-sm"
                  >
                    Salvar Alterações
                  </button>
                </form>

                <form
                  onSubmit={handleUpdatePassword}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 h-fit shadow-sm"
                >
                  <h2 className="font-headline text-xl font-bold text-tertiary">Alterar Senha</h2>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="senha-atual" className="text-xs font-bold uppercase tracking-wider text-outline">Senha Atual</label>
                      <div className="relative">
                        <input id="senha-atual"
                          type={showCurrentPassword ? "text" : "password"}
                          required
                          minLength={8}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showCurrentPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="nova-senha" className="text-xs font-bold uppercase tracking-wider text-outline">Nova Senha</label>
                      <div className="relative">
                        <input id="nova-senha"
                          type={showNewPassword ? "text" : "password"}
                          required
                          pattern={passwordPattern.regex.source}
                          title={passwordPattern.title}
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            confirmPasswordRef.current?.setCustomValidity("");
                          }}
                          placeholder="••••••••"
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showNewPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="confirmar-nova-senha" className="text-xs font-bold uppercase tracking-wider text-outline">Confirmar Nova Senha</label>
                      <div className="relative">
                        <input id="confirmar-nova-senha"
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          ref={confirmPasswordRef}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            confirmPasswordRef.current?.setCustomValidity("");
                          }}
                          placeholder="••••••••"
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showConfirmPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>
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
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardLocatario;
