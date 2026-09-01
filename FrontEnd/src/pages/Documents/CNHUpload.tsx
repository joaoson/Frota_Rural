import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import cnhExample from "@/assets/cnh_example.jpg";
import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { licenseToFormValues, licenseToPayload } from "@/features/documents/api/documentMapper";
import { useCnhForm } from "@/features/documents/hooks/useDocumentForms";
import {
  useOperatorLicenses,
  useSaveLicense,
  useUploadDocument,
  useValidateCnhFile,
} from "@/features/documents/hooks/useDocuments";
import type { CnhValidationResult } from "@/features/documents/types/document";
import {
  CNH_CATEGORIES,
  type CnhFormValues,
  maxDriverBirthDate,
} from "@/features/documents/types/documentSchemas";
import { BRAZILIAN_STATES } from "@/shared/lib/brazilianStates";
import { masked } from "@/shared/lib/maskedRegister";
import { BadRequestError, HttpError } from "@/shared/http/errors";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskRG } from "@/utils/masks/maskRG";

const CNH_SITUATIONS = [
  { value: "active", label: "Ativa" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspensa" },
  { value: "revoked", label: "Cassada" },
  { value: "blocked", label: "Bloqueada" },
  { value: "ppd", label: "PPD" },
] as const;

const UPLOAD_INSTRUCTIONS = [
  "Abra sua CNH e posicione conforme o exemplo ao lado",
  "Não envie fotos de telas ou cópias",
  "Não recorte nem cubra partes do documento na foto",
  "Salve o documento sob formato PNG, JPEG ou PDF",
];

const API_FIELD_TO_FORM: Partial<Record<string, keyof CnhFormValues>> = {
  name: "name",
  birth_date: "birthDate",
  cpf: "cpf",
  rg: "rg",
  mother_name: "motherName",
  father_name: "fatherName",
  nationality: "nationality",
  birth_place: "birthCity",
  cnh_number: "cnhNumber",
  category: "category",
  first_license_date: "firstLicenseDate",
  issue_date: "issueDate",
  expiration_date: "expirationDate",
  issuing_state: "issuingState",
  issuing_authority: "issuingAuthority",
  situation: "situation",
  points: "points",
};

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

const CNHUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];
  const maxBirthDate = maxDriverBirthDate();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<CnhValidationResult | null>(null);

  const licensesQuery = useOperatorLicenses({ userId: userId ?? undefined }, Boolean(userId));
  const saveLicense = useSaveLicense();
  const uploadDocument = useUploadDocument();
  const validateCnh = useValidateCnhFile();

  const form = useCnhForm();
  const { errors } = form.formState;

  // Derivado da query: uma fonte de verdade só, sem espelhar em estado local.
  const existingLicense = licensesQuery.data?.[0] ?? null;
  const existingLicenseId = existingLicense?.id ?? null;
  const existingFileUrl = existingLicense?.fileUrl ?? null;

  const isEditing = existingLicenseId !== null;
  const isLoading = Boolean(userId) && licensesQuery.isLoading;
  const isValidating = validateCnh.isPending;
  const isSubmitting = saveLicense.isPending || uploadDocument.isPending;

  // Carrega a CNH existente, se houver. Substitui os 20 setters sequenciais.
  useEffect(() => {
    if (!existingLicense) return;
    form.reset({
      ...licenseToFormValues(existingLicense),
      cpf: maskDocument(existingLicense.cpf),
      rg: maskRG(existingLicense.rg),
    });
  }, [existingLicense, form]);

  const handleFile = (selected: File) => {
    const allowed = selected.type.startsWith("image/") || selected.type === "application/pdf";
    if (!allowed) return;

    setFile(selected);
    setValidationResult(null);

    validateCnh
      .mutateAsync(selected)
      .then(setValidationResult)
      .catch((error: unknown) => {
        setValidationResult({
          isValid: false,
          confidence: "low",
          score: 0,
          error:
            error instanceof HttpError
              ? error.message
              : "Erro inesperado ao validar o documento.",
        });
      });
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!userId) {
      toast.error("Usuário não autenticado. Faça login para cadastrar a CNH.");
      return;
    }

    try {
      const uploadedUrl = file ? await uploadDocument.mutateAsync(file) : undefined;
      const fileUrl = uploadedUrl ?? existingFileUrl ?? undefined;

      await saveLicense.mutateAsync({
        id: existingLicenseId ?? undefined,
        payload: licenseToPayload(values, userId, fileUrl),
      });

      toast.success(isEditing ? "CNH atualizada com sucesso." : "CNH cadastrada com sucesso.");
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof BadRequestError && error.hasFieldErrors) {
        let placed = false;
        for (const [apiField, messages] of Object.entries(error.fieldErrors)) {
          const formField = API_FIELD_TO_FORM[apiField];
          const message = messages[0];
          if (formField && message) {
            form.setError(formField, { type: "server", message });
            placed = true;
          }
        }
        if (placed) return;
      }
      toast.error(
        error instanceof HttpError
          ? error.message
          : isEditing
            ? "Erro ao atualizar CNH. Verifique os dados e tente novamente."
            : "Erro ao cadastrar CNH. Verifique os dados e tente novamente.",
      );
    }
  });

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
                          validationResult.isValid ? "verified" : "warning"
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

            {((validationResult === null && isEditing) || validationResult?.isValid) && (
              <form
                className="space-y-6 sm:space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm"
                onSubmit={onSubmit}
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
                    className={inputClass(Boolean(errors.name))}
                    {...form.register("name")}
                  />
                  {errors.name && (
                    <p className="text-[11px] text-error font-medium mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Data de Nascimento *
                    </label>
                    <input
                      type="date"
                      max={maxBirthDate}
                      className={inputClass(Boolean(errors.birthDate))}
                      {...form.register("birthDate")}
                    />
                    {errors.birthDate && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.birthDate.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      CPF *
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      className={inputClass(Boolean(errors.cpf))}
                      {...masked(form.register("cpf"), maskDocument)}
                    />
                    {errors.cpf && (
                      <p className="text-[11px] text-error font-medium mt-1">{errors.cpf.message}</p>
                    )}
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
                      className={inputClass(Boolean(errors.rg))}
                      {...masked(form.register("rg"), maskRG)}
                    />
                    {errors.rg && (
                      <p className="text-[11px] text-error font-medium mt-1">{errors.rg.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Nacionalidade *
                    </label>
                    <select
                      className={inputClass(Boolean(errors.nationality))}
                      {...form.register("nationality")}
                    >
                      <option value="Brasileiro(a)">Brasileiro(a)</option>
                      <option value="Estrangeiro(a)">Estrangeiro(a)</option>
                      <option value="Naturalizado(a)">Naturalizado(a)</option>
                    </select>
                    {errors.nationality && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.nationality.message}
                      </p>
                    )}
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
                      className={inputClass(Boolean(errors.birthCity))}
                      {...form.register("birthCity")}
                    />
                    {errors.birthCity && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.birthCity.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Estado de Nascimento *
                    </label>
                    <select
                      className={inputClass(Boolean(errors.birthState))}
                      {...form.register("birthState")}
                    >
                      <option value="">Selecione</option>
                      {BRAZILIAN_STATES.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                    {errors.birthState && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.birthState.message}
                      </p>
                    )}
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
                      className={inputClass(Boolean(errors.motherName))}
                      {...form.register("motherName")}
                    />
                    {errors.motherName && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.motherName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Nome do Pai (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      className={inputClass(false)}
                      {...form.register("fatherName")}
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
                      className={inputClass(Boolean(errors.cnhNumber))}
                      {...form.register("cnhNumber")}
                    />
                    {errors.cnhNumber && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.cnhNumber.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Categoria *
                    </label>
                    <select
                      className={inputClass(Boolean(errors.category))}
                      {...form.register("category")}
                    >
                      <option value="">Selecione</option>
                      {CNH_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {errors.category && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.category.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Primeira Habilitação *
                    </label>
                    <input
                      type="date"
                      max={today}
                      className={inputClass(Boolean(errors.firstLicenseDate))}
                      {...form.register("firstLicenseDate")}
                    />
                    {errors.firstLicenseDate && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.firstLicenseDate.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Data de Emissão *
                    </label>
                    <input
                      type="date"
                      max={today}
                      className={inputClass(Boolean(errors.issueDate))}
                      {...form.register("issueDate")}
                    />
                    {errors.issueDate && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.issueDate.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Data de Validade *
                    </label>
                    <input
                      type="date"
                      className={inputClass(Boolean(errors.expirationDate))}
                      {...form.register("expirationDate")}
                    />
                    {errors.expirationDate && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.expirationDate.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      UF de Emissão *
                    </label>
                    <select
                      className={inputClass(Boolean(errors.issuingState))}
                      {...form.register("issuingState")}
                    >
                      <option value="">Selecione</option>
                      {BRAZILIAN_STATES.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                    {errors.issuingState && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.issuingState.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Órgão Emissor *
                    </label>
                    <input
                      type="text"
                      placeholder="DETRAN-SP"
                      className={inputClass(Boolean(errors.issuingAuthority))}
                      {...form.register("issuingAuthority")}
                    />
                    {errors.issuingAuthority && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.issuingAuthority.message}
                      </p>
                    )}
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
                      className={inputClass(Boolean(errors.situation))}
                      {...form.register("situation")}
                    >
                      <option value="">Selecione</option>
                      {CNH_SITUATIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {errors.situation && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.situation.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      Pontuação
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      max={40}
                      className={inputClass(Boolean(errors.points))}
                      {...form.register("points")}
                    />
                    {errors.points && (
                      <p className="text-[11px] text-error font-medium mt-1">
                        {errors.points.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      {...form.register("ear")}
                    />
                    EAR — Exerce Atividade Remunerada
                  </label>
                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      {...form.register("acc")}
                    />
                    ACC — Autorização p/ Ciclomotor
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
                    rows={2}
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                    {...form.register("medicalRestrictions")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Observações
                  </label>
                  <textarea
                    placeholder="Informações adicionais do documento"
                    rows={2}
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                    {...form.register("observations")}
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
