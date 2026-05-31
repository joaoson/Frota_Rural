import { type FormEvent, useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { operatorDocumentService } from "@/services/OperatorDocumentService/OperatorDocumentService";
import { OperatorDocumentServiceError } from "@/services/OperatorDocumentService/errors/OperatorDocumentError";
import type { CreateOperatorLicenseRequest } from "@/services/OperatorDocumentService/models/CreateOperatorLicenseRequest";
import { maskDocument } from "@/utils/masks/maskDocument";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { validateCPF } from "@/utils/validation/validateCPF";
import { maskRG } from "@/utils/masks/maskRG";
import { validateRG } from "@/utils/validation/validateRG";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import cnhExample from "@/assets/cnh_example.jpg";

const CNH_CATEGORIES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "AB",
  "AC",
  "AD",
  "AE",
] as const;

const CNH_SITUATIONS = [
  { value: "active", label: "Ativa" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspensa" },
  { value: "revoked", label: "Cassada" },
  { value: "blocked", label: "Bloqueada" },
  { value: "ppd", label: "PPD" },
] as const;

const UF_OPTIONS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const UPLOAD_INSTRUCTIONS = [
  "Abra sua CNH e posicione conforme o exemplo ao lado",
  'A anotação "Exerce Atividade Remunerada (EAR)" deve estar presente no documento',
  "Não envie fotos de telas ou cópias",
  "Não recorte nem cubra partes do documento na foto",
];

const CNHUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const cpfRef = useRef<HTMLInputElement>(null);
  const rgRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [motherName, setMotherName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [nationality, setNationality] = useState("Brasileiro(a)");
  const [birthCity, setBirthCity] = useState("");
  const [birthState, setBirthState] = useState("");

  const [cnhNumber, setCnhNumber] = useState("");
  const [category, setCategory] = useState("");
  const [firstLicenseDate, setFirstLicenseDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");

  const [situation, setSituation] = useState("");
  const [acc, setAcc] = useState(false);
  const [ear, setEar] = useState(false);

  const [medicalRestrictions, setMedicalRestrictions] = useState("");
  const [observations, setObservations] = useState("");
  const [points, setPoints] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingLicenseId, setExistingLicenseId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const isEditing = existingLicenseId !== null;

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    operatorDocumentService
      .listLicenses({ user: userId })
      .then((licenses) => {
        if (licenses.length === 0) return;
        const license = licenses[0];
        setExistingLicenseId(license.id);

        setName(license.name);
        setBirthDate(license.birth_date);
        setCpf(maskDocument(license.cpf));
        setRg(maskRG(license.rg));
        setMotherName(license.mother_name);
        setFatherName(license.father_name ?? "");
        setNationality(license.nationality);

        const parts = license.birth_place.split(" – ");
        if (parts.length === 2) {
          setBirthCity(parts[0]);
          setBirthState(parts[1]);
        } else {
          setBirthCity(license.birth_place);
        }

        setCnhNumber(license.cnh_number);
        setCategory(license.category);
        setFirstLicenseDate(license.first_license_date);
        setIssueDate(license.issue_date);
        setExpirationDate(license.expiration_date);
        setIssuingState(license.issuing_state);
        setIssuingAuthority(license.issuing_authority);

        setSituation(license.situation);
        setAcc(license.acc);
        setEar(license.ear);

        setMedicalRestrictions(license.medical_restrictions ?? "");
        setObservations(license.observations ?? "");
        setPoints(license.points);
      })
      .finally(() => setIsLoading(false));
  }, [userId]);

  const handleFile = (selected: File) => {
    if (selected.type.startsWith("image/")) setFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleCpfBlur = () => {
    const input = cpfRef.current;
    if (!input) return;
    const digits = cpf.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!validateCPF(digits)) {
      input.setCustomValidity("CPF inválido. Verifique os dígitos informados.");
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    }
  };

  const handleRgBlur = () => {
    const input = rgRef.current;
    if (!input) return;
    const digits = rg.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!validateRG(digits)) {
      input.setCustomValidity("RG inválido. Verifique os dígitos informados.");
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const cpfDigits = cpf.replace(/\D/g, "");
    if (!validateCPF(cpfDigits)) {
      cpfRef.current?.setCustomValidity("CPF inválido.");
      cpfRef.current?.reportValidity();
      return;
    }

    const rgDigits = rg.replace(/\D/g, "");
    if (!validateRG(rgDigits)) {
      rgRef.current?.setCustomValidity("RG inválido.");
      rgRef.current?.reportValidity();
      return;
    }

    setIsSubmitting(true);
    try {
      if (!userId) {
        toast.error(
          "Usuário não autenticado. Faça login para cadastrar a CNH.",
        );
        return;
      }

      const payload: CreateOperatorLicenseRequest = {
        user: userId,
        name: name.trim(),
        birth_date: birthDate,
        cpf: clearSpecialChars(cpf),
        rg: clearSpecialChars(rg),
        mother_name: motherName.trim(),
        father_name: fatherName.trim() || undefined,
        nationality: nationality.trim(),
        birth_place: `${birthCity.trim()} – ${birthState}`,
        cnh_number: cnhNumber.trim(),
        category,
        first_license_date: firstLicenseDate,
        issue_date: issueDate,
        expiration_date: expirationDate,
        issuing_state: issuingState,
        issuing_authority: issuingAuthority.trim(),
        situation,
        acc,
        ear,
        medical_restrictions: medicalRestrictions.trim() || undefined,
        observations: observations.trim() || undefined,
        points,
      };

      if (isEditing) {
        await operatorDocumentService.updateLicense(
          existingLicenseId,
          payload,
        );
        toast.success("CNH atualizada com sucesso.");
      } else {
        await operatorDocumentService.createLicense(payload);
        toast.success("CNH cadastrada com sucesso.");
      }
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof OperatorDocumentServiceError) {
        toast.error(error.message);
      } else {
        toast.error(
          isEditing
            ? "Erro ao atualizar CNH. Verifique os dados e tente novamente."
            : "Erro ao cadastrar CNH. Verifique os dados e tente novamente.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-24 sm:pt-32 pb-16 sm:pb-20 max-w-4xl mx-auto px-4 sm:px-6 w-full">
        <Link
          to="/dashboard"
          className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1"
        >
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
        <>
        <div className="mb-8 sm:mb-10">
          <h1 className="font-headline text-2xl sm:text-3xl font-bold text-primary mb-1">
            {isEditing ? "Editar CNH" : "Cadastro de CNH"}
          </h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">
            {isEditing
              ? "Atualize os dados da sua Carteira Nacional de Habilitação"
              : "Informe os dados da sua Carteira Nacional de Habilitação conforme constam no documento"}
          </p>
        </div>

        {/* ── Upload de Foto (separado do formulário) ──────────────── */}
        <div className="mb-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm space-y-6 sm:space-y-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
              Foto do Documento (opcional)
            </p>
            <p className="text-[11px] text-outline font-medium mt-2">
              Envie uma foto da sua CNH para agilizar a validação. Você pode
              enviar depois.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col">
              <div className="flex-1 flex justify-center items-center bg-surface-container-high px-6 py-6">
                <img
                  src={cnhExample}
                  alt="Exemplo de posicionamento da CNH"
                  className="h-44 sm:h-52 w-full object-contain"
                />
              </div>
              <div className="px-5 py-3 bg-surface-container border-t border-outline-variant/30">
                <p className="text-[11px] text-outline font-medium text-center">
                  Exemplo de posicionamento correto da CNH
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant/40 bg-surface-container overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-outline-variant/30 bg-surface-container-high">
                <MaterialIcon icon="info" size={18} className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  O que fazer
                </span>
              </div>
              <ul className="px-5 py-4 space-y-4 flex-1">
                {UPLOAD_INSTRUCTIONS.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-on-surface"
                  >
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Foto da CNH
            </label>
            <label
              className={`block border-2 border-dashed rounded-xl px-6 py-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragging
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-primary/50 bg-primary/5"
                    : "border-outline-variant/60 hover:border-primary/50 hover:bg-primary/5"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              {file ? (
                <>
                  <MaterialIcon
                    icon="check_circle"
                    size={40}
                    className="text-primary mb-2"
                  />
                  <div className="font-bold text-primary text-sm">
                    {file.name}
                  </div>
                  <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                    Clique para substituir
                  </div>
                </>
              ) : (
                <>
                  <MaterialIcon
                    icon="upload_file"
                    className="text-outline mb-2"
                    size={40}
                  />
                  <div className="font-bold text-tertiary text-sm">
                    Arraste a foto ou clique para selecionar
                  </div>
                  <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                    JPG, PNG — Máx. 5MB
                  </div>
                </>
              )}
            </label>
          </div>
        </div>

        <form
          className="space-y-6 sm:space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm"
          onSubmit={handleSubmit}
        >
          {/* ── Identificação ────────────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
            Dados de Identificação
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Nome Completo *
            </label>
            <input
              type="text"
              placeholder="Conforme consta na CNH"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Data de Nascimento *
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                CPF *
              </label>
              <input
                type="text"
                placeholder="000.000.000-00"
                value={cpf}
                ref={cpfRef}
                onChange={(e) => {
                  setCpf(maskDocument(e.target.value));
                  cpfRef.current?.setCustomValidity("");
                }}
                onBlur={handleCpfBlur}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
                pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
                title="Informe um CPF válido no formato 000.000.000-00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                RG *
              </label>
              <input
                type="text"
                placeholder="00.000.000-0"
                value={rg}
                ref={rgRef}
                onChange={(e) => {
                  setRg(maskRG(e.target.value));
                  rgRef.current?.setCustomValidity("");
                }}
                onBlur={handleRgBlur}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Nacionalidade *
              </label>
              <select
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              >
                <option value="Brasileiro(a)">Brasileiro(a)</option>
                <option value="Estrangeiro(a)">Estrangeiro(a)</option>
                <option value="Naturalizado(a)">Naturalizado(a)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Cidade de Nascimento *
              </label>
              <input
                type="text"
                placeholder="São Paulo"
                value={birthCity}
                onChange={(e) => setBirthCity(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Estado de Nascimento *
              </label>
              <select
                value={birthState}
                onChange={(e) => setBirthState(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              >
                <option value="">Selecione</option>
                {UF_OPTIONS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Nome da Mãe *
              </label>
              <input
                type="text"
                placeholder="Nome completo"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Nome do Pai (opcional)
              </label>
              <input
                type="text"
                placeholder="Nome completo"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
          </div>

          {/* ── Dados da Habilitação ─────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
            Dados da Habilitação
          </p>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Nº CNH *
              </label>
              <input
                type="text"
                placeholder="11 dígitos"
                value={cnhNumber}
                onChange={(e) =>
                  setCnhNumber(e.target.value.replace(/\D/g, "").slice(0, 11))
                }
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
                pattern="\d{11}"
                title="O número da CNH deve conter exatamente 11 dígitos"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Categoria *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              >
                <option value="">Selecione</option>
                {CNH_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Primeira Habilitação *
              </label>
              <input
                type="date"
                value={firstLicenseDate}
                onChange={(e) => setFirstLicenseDate(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Data de Emissão *
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Data de Validade *
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                UF de Emissão *
              </label>
              <select
                value={issuingState}
                onChange={(e) => setIssuingState(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              >
                <option value="">Selecione</option>
                {UF_OPTIONS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Órgão Emissor *
              </label>
              <input
                type="text"
                placeholder="DETRAN-SP"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
          </div>

          {/* ── Situação ─────────────────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
            Situação do Documento
          </p>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Situação *
              </label>
              <select
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              >
                <option value="">Selecione</option>
                {CNH_SITUATIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Pontuação
              </label>
              <input
                type="number"
                placeholder="0"
                value={points}
                onChange={(e) =>
                  setPoints(Math.max(0, Math.min(40, Number(e.target.value))))
                }
                min={0}
                max={40}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
              <p className="text-[11px] text-outline font-medium">
                Pontos acumulados por infrações (0 a 40).
              </p>
            </div>
          </div>

          <div className="flex gap-8">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ear}
                onChange={(e) => setEar(e.target.checked)}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <span className="text-sm text-on-surface">
                EAR — Exerce Atividade Remunerada
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acc}
                onChange={(e) => setAcc(e.target.checked)}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <span className="text-sm text-on-surface">
                ACC — Autorização p/ Ciclomotor
              </span>
            </label>
          </div>

          {/* ── Restrições / Observações ──────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
            Restrições e Observações
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Restrições Médicas
            </label>
            <textarea
              placeholder="Ex.: Obrigatório uso de lentes corretivas"
              value={medicalRestrictions}
              onChange={(e) => setMedicalRestrictions(e.target.value)}
              rows={2}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Observações
            </label>
            <textarea
              placeholder="Informações adicionais do documento"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={2}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 sm:py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <MaterialIcon icon="id_card" size={20} />{" "}
            {isSubmitting
              ? isEditing
                ? "Atualizando..."
                : "Cadastrando..."
              : isEditing
                ? "Atualizar CNH"
                : "Cadastrar CNH"}
          </button>
        </form>
        </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default CNHUpload;
