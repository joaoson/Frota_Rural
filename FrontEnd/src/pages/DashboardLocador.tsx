import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { userService } from "@/services/UserService/UserService";
import { machineService } from "@/services/MachineService/MachineService";
import { postingService } from "@/services/PostingService/PostingService";
import { operatorDocumentService } from "@/services/OperatorDocumentService/OperatorDocumentService";
import type { OperatorLicense } from "@/services/OperatorDocumentService/models/OperatorLicense";
import type { Certification } from "@/services/OperatorDocumentService/models/Certification";
import { reviewService, type Review } from "@/services/ReviewService/ReviewService";
import { contractService } from "@/services/ContractService/ContractService";
import type { User } from "@/services/UserService/models/User";
import { AxiosError } from "axios";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskPhone } from "@/utils/masks/maskPhone";
import { maskCEP } from "@/utils/masks/maskCEP";
import { fetchAddressByCEP, formatAddressFromCEP } from "@/services/ViaCEPService";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { UFS } from "@/utils/ufs";
import { validateDocument } from "@/utils/validation/validateDocument";
import { mensagemErroCEP } from "@/utils/validation/validateCEP";
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
import AssinaturaContratoModal from "@/components/AssinaturaContratoModal";
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

// Mesmo placeholder usado em BuscarMaquinario, para os cards ficarem coerentes.
const FALLBACK_IMG = "https://placehold.co/800x600/e8e0d0/2D3F1E?text=Sem+foto";

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
  { icon: "badge", label: "Documentos", tab: "documentos" },
  { icon: "star", label: "Avaliações", tab: "avaliacoes" },
  { icon: "chat_bubble", label: "Chat", tab: "chat" },
  { icon: "notifications", label: "Notificações", tab: "notificacoes" },
  { icon: "person", label: "Minha Conta", tab: "conta" },
  { icon: "logout", label: "Sair", tab: "sair" },
] as const;

type Tab = (typeof sidebarItems)[number]["tab"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ENCERRADOS = ["completed", "cancelled", "closed"];

/**
 * Situação do contrato do ponto de vista das assinaturas.
 *
 * `rentals.status` não basta: ele vira `active` assim que **qualquer** uma das
 * partes assina, então é o par accepted_by_* que diz de quem ainda se espera o
 * aceite — e é isso que decide se o locador vê o botão de assinar.
 */
function situacaoAssinatura(c: {
  status: string;
  acceptedByLessor?: boolean;
  acceptedByLessee?: boolean;
}) {
  const encerrado = ENCERRADOS.includes(c.status);
  const assinadoPeloLocador = Boolean(c.acceptedByLessor);
  const assinadoPeloLocatario = Boolean(c.acceptedByLessee);
  const completo = assinadoPeloLocador && assinadoPeloLocatario;

  return {
    encerrado,
    assinadoPeloLocador,
    assinadoPeloLocatario,
    completo,
    /** O locador pode assinar enquanto o contrato não estiver encerrado. */
    podeAssinar: !encerrado && !assinadoPeloLocador,
    grupo: encerrado ? "Encerrados" : completo ? "Assinados" : "Pendentes",
  };
}

const DashboardLocador = () => {
  const { userId, logout } = useAuth();
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
  const [showDetalhes, setShowDetalhes] = useState<number | null>(null);
  const [showAvaliar, setShowAvaliar] = useState<number | null>(null);

  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [machines, setMachines] = useState<any[]>([]);
  const [postings, setPostings] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<Review[]>([]);
  const [givenReviews, setGivenReviews] = useState<Review[]>([]);
  const [licenses, setLicenses] = useState<OperatorLicense[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isEditEquipamentoOpen, setIsEditEquipamentoOpen] = useState(false);
  // Contrato aberto para assinatura do locador (null = modal fechado).
  const [contratoParaAssinar, setContratoParaAssinar] = useState<string | null>(null);
  const [selectedEquipamento, setSelectedEquipamento] =
    useState<EquipamentoData>({
      id: "",
      registroRenagro: "",
      marca: "",
      modelo: "",
      anoFabricacao: "",
      finalidade: "Plantio",
      especificacoes: "",
    });

  const openEditModalForMachine = (m: any) => {
    setSelectedEquipamento({
      id: String(m.id),
      registroRenagro: m.renagro,
      marca: m.brand,
      modelo: m.model,
      anoFabricacao: String(m.year),
      finalidade: m.purpose,
      especificacoes: m.specifications ?? "",
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

  // Recarregável: depois de um aceite, a lista precisa refletir o novo estado
  // do contrato (quem já assinou) sem exigir um refresh da página.
  const carregarLocacoes = useCallback(() => {
    if (!userId) return;
    contractService
      .listByLessor(userId)
      .then((data) => {
        setRentals(
          data.map((r) => ({
            id: r.id,
            lessee: r.lesseeId === "locatario-default" ? "Fazenda Aurora" : "Fazenda Parceira",
            machine: r.machineName,
            period: r.period,
            startDate: r.startDate,
            endDate: r.endDate,
            year: r.startDate?.slice(0, 4) ?? "",
            status: r.status,
            total: r.total,
            contract: r.contractNumber,
            acceptedByLessor: r.acceptedByLessor,
            acceptedByLessee: r.acceptedByLessee,
            contractStatus: r.contractStatus,
          })),
        );
      })
      .catch(console.error);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    userService
      .getById(userId)
      .then(setUser)
      .catch(console.error);

    reviewService.getReviewsByReviewee(userId).then(setReceivedReviews).catch(console.error);
    reviewService.getReviewsByReviewer(userId).then(setGivenReviews).catch(console.error);

    carregarLocacoes();

    Promise.all([
      machineService.list({ owner: userId }),
      postingService.list({})
    ]).then(([machinesData, postingsData]) => {
      const machineById = new Map<string, { year?: unknown }>(
        machinesData.map((m: any) => [m.id, m]),
      );
      const userPostings = postingsData.filter((p: any) => machineById.has(p.machinery));
      
      setMachines(machinesData.map((m: any) => ({
        id: m.id,
        renagro: m.renagro_number,
        brand: m.brand,
        model: m.model,
        year: m.year,
        status: m.status || "active",
        purpose: m.usage_purpose || "",
        specifications: m.technical_specifications ?? ""
      })));

      setPostings(userPostings.map((p: any) => ({
        id: p.id,
        // A API devolve machine_brand/machine_model (não machinery_details);
        // sem isso o card caía no fallback e exibia o UUID do maquinário.
        machine: [p.machine_brand, p.machine_model].filter(Boolean).join(" ") || "Sem título",
        price: p.hourly_rate,
        location: p.location_address,
        photo: p.primary_photo_url ?? null,
        // O ano vem do maquinário do anúncio; é o que alimenta o filtro por ano.
        year: String(machineById.get(p.machinery)?.year ?? ""),
        status: p.status || "active"
      })));
    }).catch(console.error);

    operatorDocumentService
      .listLicenses({ user: userId })
      .then(setLicenses)
      .catch(console.error);
    operatorDocumentService
      .listCertifications({ user: userId })
      .then(setCertifications)
      .catch(console.error);
  }, [userId, carregarLocacoes]);

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

  const handleUpdatePassword = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
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

  // ── Busca / filtros por aba
  const [frotaSearch, setFrotaSearch] = useState("");
  const [frotaYear, setFrotaYear] = useState("Todos");
  const [anunciosSearch, setAnunciosSearch] = useState("");
  const [anunciosYear, setAnunciosYear] = useState("Todos");
  const [reservasSearch, setReservasSearch] = useState("");
  const [reservasYear, setReservasYear] = useState("Todos");
  const [contratosSearch, setContratosSearch] = useState("");
  const [contratosYear, setContratosYear] = useState("Todos");
  const [contratosStatus, setContratosStatus] = useState("Todos");

  // ── Paginação por aba
  const [frotaPage, setFrotaPage] = useState(1);
  const [anunciosPage, setAnunciosPage] = useState(1);
  const [reservasPage, setReservasPage] = useState(1);
  const [contratosPage, setContratosPage] = useState(1);
  const frotaPerPage = 6;
  const anunciosPerPage = 6;
  const reservasPerPage = 6;
  const contratosPerPage = 5;

  const matches = (value: unknown, term: string) =>
    String(value ?? "")
      .toLowerCase()
      .includes(term);

  const filteredMachines = useMemo(() => {
    const term = frotaSearch.trim().toLowerCase();
    return machines.filter(
      (m) =>
        (frotaYear === "Todos" || String(m.year) === frotaYear) &&
        (term === "" ||
          matches(m.brand, term) ||
          matches(m.model, term) ||
          matches(m.renagro, term)),
    );
  }, [machines, frotaSearch, frotaYear]);

  const filteredPostings = useMemo(() => {
    const term = anunciosSearch.trim().toLowerCase();
    return postings.filter(
      (p) =>
        (anunciosYear === "Todos" || p.year === anunciosYear) &&
        (term === "" || matches(p.machine, term) || matches(p.location, term)),
    );
  }, [postings, anunciosSearch, anunciosYear]);

  const filteredRentals = useMemo(() => {
    const term = reservasSearch.trim().toLowerCase();
    return rentals.filter(
      (r) =>
        (reservasYear === "Todos" || r.year === reservasYear) &&
        (term === "" ||
          matches(r.lessee, term) ||
          matches(r.machine, term) ||
          matches(r.contract, term)),
    );
  }, [rentals, reservasSearch, reservasYear]);

  const filteredContracts = useMemo(() => {
    const term = contratosSearch.trim().toLowerCase();
    return rentals.filter((c) => {
      if (contratosYear !== "Todos" && c.year !== contratosYear) return false;
      if (
        contratosStatus !== "Todos" &&
        situacaoAssinatura(c).grupo !== contratosStatus
      )
        return false;
      return (
        term === "" ||
        matches(c.contract, term) ||
        matches(c.lessee, term) ||
        matches(c.machine, term)
      );
    });
  }, [rentals, contratosSearch, contratosYear, contratosStatus]);

  const frotaTotalPages = Math.max(
    1,
    Math.ceil(filteredMachines.length / frotaPerPage),
  );
  const anunciosTotalPages = Math.max(
    1,
    Math.ceil(filteredPostings.length / anunciosPerPage),
  );
  const reservasTotalPages = Math.max(
    1,
    Math.ceil(filteredRentals.length / reservasPerPage),
  );
  const contratosTotalPages = Math.max(
    1,
    Math.ceil(filteredContracts.length / contratosPerPage),
  );

  // Se a lista encolhe (filtro/busca/exclusão), a página atual pode ficar fora
  // do intervalo e a aba renderizaria vazia. Fixamos no limite válido.
  const safeFrotaPage = Math.min(frotaPage, frotaTotalPages);
  const safeAnunciosPage = Math.min(anunciosPage, anunciosTotalPages);
  const safeReservasPage = Math.min(reservasPage, reservasTotalPages);
  const safeContratosPage = Math.min(contratosPage, contratosTotalPages);

  const paginatedFrota = filteredMachines.slice(
    (safeFrotaPage - 1) * frotaPerPage,
    safeFrotaPage * frotaPerPage,
  );
  const paginatedAnuncios = filteredPostings.slice(
    (safeAnunciosPage - 1) * anunciosPerPage,
    safeAnunciosPage * anunciosPerPage,
  );
  // As locações são paginadas sobre a lista completa (em andamento primeiro) e
  // depois reagrupadas, para que cada página some exatamente reservasPerPage
  // cartões entre as duas seções.
  const paginatedRentals = useMemo(() => {
    const ordered = [
      ...filteredRentals.filter(
        (r) => r.status === "pending" || r.status === "active",
      ),
      ...filteredRentals.filter(
        (r) => r.status !== "pending" && r.status !== "active",
      ),
    ];
    return ordered.slice(
      (safeReservasPage - 1) * reservasPerPage,
      safeReservasPage * reservasPerPage,
    );
  }, [filteredRentals, safeReservasPage]);
  const paginatedContracts = filteredContracts.slice(
    (safeContratosPage - 1) * contratosPerPage,
    safeContratosPage * contratosPerPage,
  );

  const activeRentals = useMemo(
    () =>
      paginatedRentals.filter(
        (r) => r.status === "pending" || r.status === "active",
      ),
    [paginatedRentals],
  );
  const pastRentals = useMemo(
    () =>
      paginatedRentals.filter(
        (r) => r.status !== "pending" && r.status !== "active",
      ),
    [paginatedRentals],
  );

  const rentalYears = useMemo(() => {
    const years = [...new Set(rentals.map((r) => r.year).filter(Boolean))].sort(
      (a, b) => Number(b) - Number(a),
    );
    return ["Todos", ...years];
  }, [rentals]);

  const postingYears = useMemo(() => {
    const years = [...new Set(postings.map((p) => p.year).filter(Boolean))].sort(
      (a, b) => Number(b) - Number(a),
    );
    return ["Todos", ...years];
  }, [postings]);

  const machineYears = useMemo(() => {
    const years = [
      ...new Set(machines.map((m) => String(m.year)).filter((y) => y && y !== "undefined")),
    ].sort((a, b) => Number(b) - Number(a));
    return ["Todos", ...years];
  }, [machines]);

  const renderRentalCard = (r: any) => {
    const situacao = situacaoAssinatura(r);
    // Enquanto falta o aceite do locador, o estado da assinatura é a informação
    // relevante: `active` já aparece assim que só o locatário assinou, e o
    // rótulo "Em Operação" esconderia que o contrato ainda depende dele.
    const badge = situacao.podeAssinar
      ? {
          icon: "edit_document",
          classes: "bg-error/10 text-error border border-error/20",
          label: "Aguardando sua assinatura",
        }
      : getStatusBadge(r.status);
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
            {/* Atalho para o aceite: é aqui que o locador vê a reserva chegar,
                então o contrato pode ser assinado sem passar pela aba Contratos. */}
            {situacao.podeAssinar ? (
              <button
                type="button"
                onClick={() => setContratoParaAssinar(r.id)}
                className="px-4 bg-gradient-to-r from-primary to-primary-container text-on-primary py-2 rounded-lg font-bold text-xs hover:shadow-lg transition-all flex items-center gap-1"
              >
                <MaterialIcon icon="draw" size={14} /> Assinar Contrato
              </button>
            ) : null}
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
                      reviewee: "029d15f3-a577-4238-9c59-42011ddcb5be", // Valid Locatario ID for testing
                      rating: reviewRating,
                      comment: reviewComment,
                      rental: "08e8eaa6-467f-4c98-b5c0-93323829911d" // Valid Rental ID for testing
                    });
                    toast.success("Avaliação enviada com sucesso!");
                    setShowAvaliar(null);
                    setReviewRating(5);
                    setReviewComment("");
                    const updatedGiven = await reviewService.getReviewsByReviewer(userId);
                    setGivenReviews(updatedGiven);
                  } catch (error) {
                    console.error("Erro ao enviar avaliação:", error);
                    toast.error("Erro ao enviar avaliação.");
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
          ) : null}
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
          <Link
            to="/"
            className="font-headline font-black text-xl text-primary tracking-tighter"
          >
            Frota Rural
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => {
            const buttonEl = (
              <button
                key={item.tab}
                onClick={
                  item.tab !== "sair" ? () => {
                    setTab(item.tab);
                    setIsSidebarOpen(false);
                  } : undefined
                }
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === item.tab
                  ? "bg-primary/10 text-primary font-bold border-l-2 border-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
              >
                <MaterialIcon icon={item.icon} size={20} />
                <span>{item.label}</span>
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
        <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg"
            >
              <MaterialIcon icon="menu" size={24} />
            </button>
          </div>
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
          {/* Aceite eletrônico do locador. O `key` remonta o modal a cada
              contrato, para o formulário nunca herdar o estado do anterior. */}
          {contratoParaAssinar ? (
            <AssinaturaContratoModal
              key={contratoParaAssinar}
              open
              onOpenChange={(aberto) => {
                if (!aberto) setContratoParaAssinar(null);
              }}
              contratoId={contratoParaAssinar}
              papel="locador"
              onAssinado={carregarLocacoes}
            />
          ) : null}

          <EditEquipamentoModal
            open={isEditEquipamentoOpen}
            onOpenChange={setIsEditEquipamentoOpen}
            equipamento={selectedEquipamento}
            onSave={async (data) => {
              try {
                await machineService.update(data.id, {
                  renagro_number: data.registroRenagro,
                  brand: data.marca,
                  model: data.modelo,
                  year: data.anoFabricacao
                    ? Number(data.anoFabricacao)
                    : undefined,
                  usage_purpose: data.finalidade,
                  technical_specifications: data.especificacoes.trim(),
                });
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
                          specifications: data.especificacoes,
                        }
                      : m,
                  ),
                );
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
                        formatter={(value: any) => [
                          `R$ ${Number(value).toLocaleString("pt-BR")}`,
                          "Receita",
                        ]}
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
                    <span className="font-black text-on-secondary-container text-sm">
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
                        formatter={(value: any) => [
                          `${Number(value).toFixed(1)} ★`,
                          "Nota média",
                        ]}
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
                    const badge = getStatusBadge(r.status);
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
                searchValue={frotaSearch}
                onSearchChange={(v) => {
                  setFrotaSearch(v);
                  setFrotaPage(1);
                }}
                yearValue={frotaYear}
                onYearChange={(v) => {
                  setFrotaYear(v);
                  setFrotaPage(1);
                }}
                years={machineYears}
                searchPlaceholder="Buscar por marca, modelo ou registro..."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                currentPage={safeFrotaPage}
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
                            {new Date(lic.expiration_date).toLocaleDateString(
                              "pt-BR",
                            )}
                          </p>
                          {lic.validation_status === "rejected" && lic.review_note && (
                            <p className="text-xs text-error mt-1">
                              Motivo: {lic.review_note}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {lic.validation_status === "approved" ? (
                          <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                            Aprovado
                          </span>
                        ) : lic.validation_status === "rejected" ? (
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
                                    await operatorDocumentService.removeLicense(
                                      lic.id,
                                    );
                                    setLicenses((prev) =>
                                      prev.filter((l) => l.id !== lic.id),
                                    );
                                    toast.success("CNH removida com sucesso!");
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
                            {cert.issuing_organization} ·{" "}
                            {new Date(cert.issue_date).toLocaleDateString(
                              "pt-BR",
                            )}
                          </p>
                          {cert.validation_status === "rejected" && cert.review_note && (
                            <p className="text-xs text-error mt-1">
                              Motivo: {cert.review_note}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {cert.validation_status === "approved" ? (
                          <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                            Aprovado
                          </span>
                        ) : cert.validation_status === "rejected" ? (
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
                                    await operatorDocumentService.removeCertification(
                                      cert.id,
                                    );
                                    setCertifications((prev) =>
                                      prev.filter((c) => c.id !== cert.id),
                                    );
                                    toast.success(
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
                searchValue={anunciosSearch}
                onSearchChange={(v) => {
                  setAnunciosSearch(v);
                  setAnunciosPage(1);
                }}
                yearValue={anunciosYear}
                onYearChange={(v) => {
                  setAnunciosYear(v);
                  setAnunciosPage(1);
                }}
                years={postingYears}
                searchPlaceholder="Buscar por maquinário ou localização..."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {paginatedAnuncios.map((p) => (
                  <div
                    key={p.id}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden group hover:shadow-xl transition-all duration-300 shadow-sm"
                  >
                    <div className="h-40 bg-gradient-to-br from-primary/10 via-secondary-container/10 to-tertiary/10 overflow-hidden flex items-center justify-center">
                      {p.photo ? (
                        <img
                          src={p.photo}
                          alt={p.machine}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(evento) => {
                            evento.currentTarget.src = FALLBACK_IMG;
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 bg-surface-container-lowest/70 rounded-2xl flex items-center justify-center border border-outline-variant/20 backdrop-blur-sm">
                          <MaterialIcon
                            icon="precision_manufacturing"
                            className="text-primary"
                            size={28}
                          />
                        </div>
                      )}
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
                currentPage={safeAnunciosPage}
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
                searchValue={reservasSearch}
                onSearchChange={(v) => {
                  setReservasSearch(v);
                  setReservasPage(1);
                }}
                yearValue={reservasYear}
                onYearChange={(v) => {
                  setReservasYear(v);
                  setReservasPage(1);
                }}
                years={rentalYears}
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

              {filteredRentals.length === 0 ? (
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 text-center text-on-surface-variant text-sm">
                  Nenhuma locação encontrada.
                </div>
              ) : null}

              <DashboardPagination
                currentPage={safeReservasPage}
                totalPages={reservasTotalPages}
                onPageChange={setReservasPage}
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
                searchValue={contratosSearch}
                onSearchChange={(v) => {
                  setContratosSearch(v);
                  setContratosPage(1);
                }}
                yearValue={contratosYear}
                onYearChange={(v) => {
                  setContratosYear(v);
                  setContratosPage(1);
                }}
                years={rentalYears}
                searchPlaceholder="Buscar por contrato, locatário ou maquinário..."
              />
              <div className="flex gap-2">
                {["Todos", "Pendentes", "Assinados", "Encerrados"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setContratosStatus(f);
                      setContratosPage(1);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                      f === contratosStatus
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {paginatedContracts.map((c) => {
                const situacao = situacaoAssinatura(c);
                return (
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
                          {c.lessee}
                          {c.year ? ` · Criado em ${c.year}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                        situacao.encerrado
                          ? "bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                          : situacao.completo
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : situacao.podeAssinar
                              ? "bg-error/10 text-error border border-error/20"
                              : "bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30"
                      }`}
                    >
                      <MaterialIcon
                        icon={
                          situacao.encerrado
                            ? "check_circle"
                            : situacao.completo
                              ? "verified"
                              : situacao.podeAssinar
                                ? "edit_document"
                                : "hourglass_bottom"
                        }
                        size={14}
                      />
                      {situacao.encerrado
                        ? "Encerrado"
                        : situacao.completo
                          ? "Assinado"
                          : situacao.podeAssinar
                            ? "Aguardando sua assinatura"
                            : "Aguardando o locatário"}
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
                  <div className="flex gap-3 flex-wrap">
                    {situacao.podeAssinar ? (
                      <button
                        type="button"
                        onClick={() => setContratoParaAssinar(c.id)}
                        className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <MaterialIcon icon="draw" size={16} /> Assinar Contrato
                      </button>
                    ) : null}
                    <Link
                      to={`/contrato/${c.id}`}
                      className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 text-center decoration-transparent ${
                        situacao.podeAssinar
                          ? "bg-surface-container-high text-on-surface-variant hover:bg-outline-variant/30"
                          : "bg-gradient-to-r from-primary to-primary-container text-on-primary hover:shadow-lg"
                      }`}
                    >
                      <MaterialIcon icon="visibility" size={16} /> Visualizar Contrato
                    </Link>
                    <button className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors flex items-center gap-2">
                      <MaterialIcon icon="download" size={16} /> Baixar PDF
                    </button>
                  </div>
                </div>
                );
              })}
              {filteredContracts.length === 0 ? (
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 text-center text-on-surface-variant text-sm">
                  Nenhum contrato encontrado.
                </div>
              ) : null}

              <DashboardPagination
                currentPage={safeContratosPage}
                totalPages={contratosTotalPages}
                onPageChange={setContratosPage}
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
              {filteredRentals.length === 0 ? (
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-10 text-center text-on-surface-variant text-sm">
                  Nenhuma locação encontrada.
                </div>
              ) : null}

              <DashboardPagination
                currentPage={safeReservasPage}
                totalPages={reservasTotalPages}
                onPageChange={setReservasPage}
              />
            </div>
          ) : null}

          {/* Avaliações */}
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
                  {receivedReviews.length > 0 ? receivedReviews.map((r) => (
                    <div
                      key={r.id}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-secondary-container/30 flex items-center justify-center text-sm font-bold text-tertiary">
                            {r.reviewer_name?.slice(0, 2).toUpperCase() || 'NA'}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">
                              {r.reviewer_name}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {new Date(r.created_at).toLocaleDateString()}
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
                  )) : (
                    <p className="text-sm text-on-surface-variant">Nenhuma avaliação recebida ainda.</p>
                  )}
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
                  {givenReviews.length > 0 ? givenReviews.map((r) => (
                    <div
                      key={r.id}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {r.reviewee_name?.slice(0, 2).toUpperCase() || 'NA'}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">
                              {r.reviewee_name}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {new Date(r.created_at).toLocaleDateString()}
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
                            onClick={() => {
                              reviewService.deleteReview(r.id).then(() => {
                                setGivenReviews(prev => prev.filter(review => review.id !== r.id));
                                toast.success("Avaliação excluída com sucesso.");
                              }).catch(() => toast.error("Erro ao excluir avaliação."));
                            }}
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
                  )) : (
                    <p className="text-sm text-on-surface-variant">Você ainda não forneceu nenhuma avaliação.</p>
                  )}
                </div>
              </div>
              {(receivedReviews.length > 0 || givenReviews.length > 0) && (
                <DashboardPagination
                  currentPage={1}
                  totalPages={Math.max(1, Math.ceil(Math.max(receivedReviews.length, givenReviews.length) / 5))}
                  onPageChange={() => { }}
                />
              )}
            </div>
          ) : null}

          {/* Minha Conta */}
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
                        CEP
                      </label>
                      <input
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
                    {/* Município e UF em campo próprio: é este par que o
                        contrato usa como foro, e deixá-lo só no texto do
                        endereço obrigava a adivinhá-lo por regex. */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2 col-span-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-outline">
                          Cidade
                        </label>
                        <input
                          type="text"
                          value={formCity}
                          onChange={(e) => setFormCity(e.target.value)}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-outline">
                          Estado
                        </label>
                        <select
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
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showCurrentPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            confirmPasswordRef.current?.setCustomValidity("");
                          }}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                          required
                          pattern={passwordPattern.regex.source}
                          title={passwordPattern.title}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showNewPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-outline">
                        Confirmar Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          ref={confirmPasswordRef}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            confirmPasswordRef.current?.setCustomValidity("");
                          }}
                          className="w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
                        >
                          <MaterialIcon icon={showConfirmPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
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
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default DashboardLocador;
