import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { operatorDocumentService } from "@/services/OperatorDocumentService/OperatorDocumentService";
import { OperatorDocumentServiceError } from "@/services/OperatorDocumentService/errors/OperatorDocumentError";
import type { CreateOperatorLicenseRequest } from "@/services/OperatorDocumentService/models/CreateOperatorLicenseRequest";
import type { CNHValidationResult } from "@/services/OperatorDocumentService/models/CNHValidationResult";
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
  "Não envie fotos de telas ou cópias",
  "Não recorte nem cubra partes do documento na foto",
  "Salve o documento sob formato PNG, JPEG ou PDF",
];

const CNHUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const cpfRef = useRef<HTMLInputElement>(null);
  const rgRef = useRef<HTMLInputElement>(null);
  const birthDateRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const maxBirthDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  })();

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
  const [validationResult, setValidationResult] =
    useState<CNHValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [existingLicenseId, setExistingLicenseId] = useState<string | null>(
    null,
  );
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
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
        setExistingFileUrl(license.file_url ?? null);
      })
      .finally(() => setIsLoading(false));
  }, [userId]);

  const handleFile = (selected: File) => {
    const allowed =
      selected.type.startsWith("image/") || selected.type === "application/pdf";
    if (!allowed) return;

    setFile(selected);
    setValidationResult(null);
    setIsValidating(true);

    operatorDocumentService
      .validateCNHDocument(selected)
      .then(setValidationResult)
      .catch((error) => {
        setValidationResult({
          is_valid: false,
          confidence: "low",
          score: 0,
          error:
            error instanceof OperatorDocumentServiceError
              ? error.message
              : "Erro inesperado ao validar o documento.",
        });
      })
      .finally(() => setIsValidating(false));
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (fieldName: string, value: any) => {
    let errorMsg = "";
    switch (fieldName) {
      case "name":
        if (!value.trim()) errorMsg = "Nome completo é obrigatório.";
        break;
      case "birthDate":
        if (!value) {
          errorMsg = "Data de nascimento é obrigatória.";
        } else if (value > maxBirthDate) {
          errorMsg = "O condutor deve ter pelo menos 18 anos.";
        } else if (value < "1900-01-01") {
          errorMsg = "Data de nascimento inválida.";
        }
        break;
      case "cpf": {
        const digits = value.replace(/\D/g, "");
        if (!digits) {
          errorMsg = "CPF é obrigatório.";
        } else if (!validateCPF(digits)) {
          errorMsg = "CPF inválido. Verifique os dígitos informados.";
        }
        break;
      }
      case "rg": {
        const digits = value.replace(/\D/g, "");
        if (!digits) {
          errorMsg = "RG é obrigatório.";
        } else if (!validateRG(digits)) {
          errorMsg = "RG inválido. Verifique os dígitos informados.";
        } else if (!/^\d{2}\.\d{3}\.\d{3}-[\dXdx]$/.test(value)) {
          errorMsg = "O RG deve seguir o formato XX.XXX.XXX-X.";
        }
        break;
      }
      case "nationality":
        if (!value) errorMsg = "Nacionalidade é obrigatória.";
        break;
      case "birthCity":
        if (!value.trim()) errorMsg = "Cidade de nascimento é obrigatória.";
        break;
      case "birthState":
        if (!value) errorMsg = "Estado de nascimento é obrigatório.";
        break;
      case "motherName":
        if (!value.trim()) errorMsg = "Nome da mãe é obrigatório.";
        break;
      case "cnhNumber": {
        const cleaned = value.replace(/\D/g, "");
        if (!cleaned) {
          errorMsg = "Número da CNH é obrigatório.";
        } else if (cleaned.length !== 11) {
          errorMsg = "O número da CNH deve conter exatamente 11 dígitos.";
        }
        break;
      }
      case "category":
        if (!value) errorMsg = "Categoria é obrigatória.";
        break;
      case "firstLicenseDate":
        if (!value) {
          errorMsg = "Data da primeira habilitação é obrigatória.";
        } else if (value > today) {
          errorMsg = "A data da primeira habilitação não pode ser no futuro.";
        }
        break;
      case "issueDate":
        if (!value) {
          errorMsg = "Data de emissão é obrigatória.";
        } else if (value > today) {
          errorMsg = "A data de emissão não pode ser no futuro.";
        }
        break;
      case "expirationDate":
        if (!value) {
          errorMsg = "Data de validade é obrigatória.";
        } else if (situation === "active" && value < today) {
          errorMsg = "A data de validade de uma CNH ativa deve ser no futuro.";
        }
        break;
      case "issuingState":
        if (!value) errorMsg = "UF de emissão é obrigatório.";
        break;
      case "issuingAuthority":
        if (!value.trim()) errorMsg = "Órgão emissor é obrigatório.";
        break;
      case "situation":
        if (!value) errorMsg = "Situação é obrigatória.";
        break;
      case "points": {
        const p = Number(value);
        if (value !== "" && (Number.isNaN(p) || p < 0 || p > 40)) {
          errorMsg = "A pontuação deve ser entre 0 e 40.";
        }
        break;
      }
    }
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const handleCpfBlur = () => {
    validateField("cpf", cpf);
  };

  const handleBirthDateBlur = () => {
    validateField("birthDate", birthDate);
  };

  const handleRgBlur = () => {
    validateField("rg", rg);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errorsList = {
      name: validateField("name", name),
      birthDate: validateField("birthDate", birthDate),
      cpf: validateField("cpf", cpf),
      rg: validateField("rg", rg),
      nationality: validateField("nationality", nationality),
      birthCity: validateField("birthCity", birthCity),
      birthState: validateField("birthState", birthState),
      motherName: validateField("motherName", motherName),
      cnhNumber: validateField("cnhNumber", cnhNumber),
      category: validateField("category", category),
      firstLicenseDate: validateField("firstLicenseDate", firstLicenseDate),
      issueDate: validateField("issueDate", issueDate),
      expirationDate: validateField("expirationDate", expirationDate),
      issuingState: validateField("issuingState", issuingState),
      issuingAuthority: validateField("issuingAuthority", issuingAuthority),
      situation: validateField("situation", situation),
      points: validateField("points", points),
    };

    if (Object.values(errorsList).some((err) => err !== "")) {
      toast.error("Por favor, corrija os erros no formulário antes de enviar.");
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

      let uploadedFileUrl: string | undefined;
      if (file) {
        uploadedFileUrl = await operatorDocumentService.uploadDocument(file);
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
        file_url: uploadedFileUrl || existingFileUrl || undefined,
      };

      if (isEditing) {
        await operatorDocumentService.updateLicense(existingLicenseId, payload);
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

            {/* Upload de doc */}
            <div className="mb-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm space-y-6 sm:space-y-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
                  Foto do Documento
                </p>
                <p className="text-[11px] text-outline font-medium mt-2">
                  Envie uma foto da sua CNH para que possamos validar seu
                  documento e permitir o preenchimento de dados.
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
                    <MaterialIcon
                      icon="info"
                      size={18}
                      className="text-primary"
                    />
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
                    accept="image/*,application/pdf"
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
                  ) : existingFileUrl ? (
                    <>
                      <MaterialIcon
                        icon="insert_drive_file"
                        size={40}
                        className="text-primary mb-2"
                      />
                      <div className="font-bold text-primary text-sm">
                        Documento enviado anteriormente
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
                        PNG, JPG ou PDF — Máx. 20MB
                      </div>
                    </>
                  )}
                </label>

                {isValidating && (
                  <div className="flex items-center gap-2 mt-3 px-1">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-on-surface-variant">
                      Analisando documento...
                    </span>
                  </div>
                )}

                {validationResult &&
                  !isValidating &&
                  (validationResult.error ? (
                    <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm font-medium bg-error/10 text-error">
                      <MaterialIcon icon="error" size={18} />
                      {validationResult.error}
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm font-medium ${
                        validationResult.confidence === "high"
                          ? "bg-primary/10 text-primary"
                          : validationResult.confidence === "medium"
                            ? "bg-tertiary/10 text-tertiary"
                            : "bg-error/10 text-error"
                      }`}
                    >
                      <MaterialIcon
                        icon={
                          validationResult.is_valid ? "verified" : "warning"
                        }
                        size={18}
                      />
                      {validationResult.confidence === "high"
                        ? "Documento reconhecido como CNH. Prossiga com o preenchimento dos dados."
                        : validationResult.confidence === "medium"
                          ? "Documento possivelmente é uma CNH"
                          : "Documento não reconhecido como CNH, favor seguir as instruções de captura de imagem"}
                    </div>
                  ))}
              </div>

              {existingFileUrl && !file && (
                <div className="flex items-center gap-3 border-2 border-dashed border-outline-variant/60 rounded-xl p-3">
                  {existingFileUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                    <img
                      src={`${import.meta.env.VITE_API_BASE_URL?.replace("/api/", "") || "http://localhost:8000"}${existingFileUrl}`}
                      alt="Documento CNH"
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-outline-variant/15 flex items-center justify-center flex-shrink-0">
                      <MaterialIcon
                        icon="picture_as_pdf"
                        size={24}
                        className="text-outline"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">
                      Documento CNH
                    </p>
                    <p className="text-xs text-outline">
                      {existingFileUrl.match(/\.(pdf)$/i) ? "PDF" : "Imagem"} ·
                      Enviado anteriormente
                    </p>
                  </div>
                  <a
                    href={`${import.meta.env.VITE_API_BASE_URL?.replace("/api/", "") || "http://localhost:8000"}${existingFileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-on-surface hover:bg-primary/5 transition-colors flex-shrink-0"
                  >
                    <MaterialIcon icon="download" size={16} />
                  </a>
                </div>
              )}
            </div>

            {((validationResult === null && isEditing) ||
              validationResult?.is_valid) && (
              <form
                className="space-y-6 sm:space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm"
                onSubmit={handleSubmit}
                noValidate
              >
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
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) validateField("name", e.target.value);
                    }}
                    onBlur={(e) => validateField("name", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.name ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  {errors.name && <p className="text-[11px] text-error font-medium mt-1">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Data de Nascimento *
                    </label>
                    <input
                      type="date"
                      value={birthDate}
                      ref={birthDateRef}
                      max={maxBirthDate}
                      onChange={(e) => {
                        setBirthDate(e.target.value);
                        if (errors.birthDate) validateField("birthDate", e.target.value);
                      }}
                      onBlur={handleBirthDateBlur}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.birthDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.birthDate && <p className="text-[11px] text-error font-medium mt-1">{errors.birthDate}</p>}
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
                        const masked = maskDocument(e.target.value);
                        setCpf(masked);
                        if (errors.cpf) validateField("cpf", masked);
                      }}
                      onBlur={handleCpfBlur}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.cpf ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.cpf && <p className="text-[11px] text-error font-medium mt-1">{errors.cpf}</p>}
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
                        const masked = maskRG(e.target.value);
                        setRg(masked);
                        if (errors.rg) validateField("rg", masked);
                      }}
                      onBlur={handleRgBlur}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.rg ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.rg && <p className="text-[11px] text-error font-medium mt-1">{errors.rg}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Nacionalidade *
                    </label>
                    <select
                      value={nationality}
                      onChange={(e) => {
                        setNationality(e.target.value);
                        if (errors.nationality) validateField("nationality", e.target.value);
                      }}
                      onBlur={(e) => validateField("nationality", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.nationality ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    >
                      <option value="Brasileiro(a)">Brasileiro(a)</option>
                      <option value="Estrangeiro(a)">Estrangeiro(a)</option>
                      <option value="Naturalizado(a)">Naturalizado(a)</option>
                    </select>
                    {errors.nationality && <p className="text-[11px] text-error font-medium mt-1">{errors.nationality}</p>}
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
                      onChange={(e) => {
                        setBirthCity(e.target.value);
                        if (errors.birthCity) validateField("birthCity", e.target.value);
                      }}
                      onBlur={(e) => validateField("birthCity", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.birthCity ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.birthCity && <p className="text-[11px] text-error font-medium mt-1">{errors.birthCity}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Estado de Nascimento *
                    </label>
                    <select
                      value={birthState}
                      onChange={(e) => {
                        setBirthState(e.target.value);
                        if (errors.birthState) validateField("birthState", e.target.value);
                      }}
                      onBlur={(e) => validateField("birthState", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.birthState ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    >
                      <option value="">Selecione</option>
                      {UF_OPTIONS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                    {errors.birthState && <p className="text-[11px] text-error font-medium mt-1">{errors.birthState}</p>}
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
                      onChange={(e) => {
                        setMotherName(e.target.value);
                        if (errors.motherName) validateField("motherName", e.target.value);
                      }}
                      onBlur={(e) => validateField("motherName", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.motherName ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.motherName && <p className="text-[11px] text-error font-medium mt-1">{errors.motherName}</p>}
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
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                        setCnhNumber(val);
                        if (errors.cnhNumber) validateField("cnhNumber", val);
                      }}
                      onBlur={(e) => validateField("cnhNumber", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.cnhNumber ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.cnhNumber && <p className="text-[11px] text-error font-medium mt-1">{errors.cnhNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Categoria *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        if (errors.category) validateField("category", e.target.value);
                      }}
                      onBlur={(e) => validateField("category", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.category ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    >
                      <option value="">Selecione</option>
                      {CNH_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {errors.category && <p className="text-[11px] text-error font-medium mt-1">{errors.category}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Primeira Habilitação *
                    </label>
                    <input
                      type="date"
                      value={firstLicenseDate}
                      max={today}
                      onChange={(e) => {
                        setFirstLicenseDate(e.target.value);
                        if (errors.firstLicenseDate) validateField("firstLicenseDate", e.target.value);
                      }}
                      onBlur={(e) => validateField("firstLicenseDate", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.firstLicenseDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.firstLicenseDate && <p className="text-[11px] text-error font-medium mt-1">{errors.firstLicenseDate}</p>}
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
                      max={today}
                      onChange={(e) => {
                        setIssueDate(e.target.value);
                        if (errors.issueDate) validateField("issueDate", e.target.value);
                      }}
                      onBlur={(e) => validateField("issueDate", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.issueDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.issueDate && <p className="text-[11px] text-error font-medium mt-1">{errors.issueDate}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Data de Validade *
                    </label>
                    <input
                      type="date"
                      value={expirationDate}
                      onChange={(e) => {
                        setExpirationDate(e.target.value);
                        if (errors.expirationDate) validateField("expirationDate", e.target.value);
                      }}
                      onBlur={(e) => validateField("expirationDate", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.expirationDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.expirationDate && <p className="text-[11px] text-error font-medium mt-1">{errors.expirationDate}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      UF de Emissão *
                    </label>
                    <select
                      value={issuingState}
                      onChange={(e) => {
                        setIssuingState(e.target.value);
                        if (errors.issuingState) validateField("issuingState", e.target.value);
                      }}
                      onBlur={(e) => validateField("issuingState", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.issuingState ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    >
                      <option value="">Selecione</option>
                      {UF_OPTIONS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                    {errors.issuingState && <p className="text-[11px] text-error font-medium mt-1">{errors.issuingState}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Órgão Emissor *
                    </label>
                    <input
                      type="text"
                      placeholder="DETRAN-SP"
                      value={issuingAuthority}
                      onChange={(e) => {
                        setIssuingAuthority(e.target.value);
                        if (errors.issuingAuthority) validateField("issuingAuthority", e.target.value);
                      }}
                      onBlur={(e) => validateField("issuingAuthority", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.issuingAuthority ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    />
                    {errors.issuingAuthority && <p className="text-[11px] text-error font-medium mt-1">{errors.issuingAuthority}</p>}
                  </div>
                </div>

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
                      onChange={(e) => {
                        setSituation(e.target.value);
                        if (errors.situation) validateField("situation", e.target.value);
                      }}
                      onBlur={(e) => validateField("situation", e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.situation ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                      required
                    >
                      <option value="">Selecione</option>
                      {CNH_SITUATIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {errors.situation && <p className="text-[11px] text-error font-medium mt-1">{errors.situation}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Pontuação
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={points}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(40, Number(e.target.value)));
                        setPoints(val);
                        if (errors.points) validateField("points", val);
                      }}
                      onBlur={(e) => validateField("points", e.target.value)}
                      min={0}
                      max={40}
                      className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.points ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    />
                    {errors.points && <p className="text-[11px] text-error font-medium mt-1">{errors.points}</p>}
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
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 sm:py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default CNHUpload;
