import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import cnhExample from "@/assets/cnh_example.jpg";
import MaterialIcon from "@/components/MaterialIcon";
import { useAuth } from "@/contexts/useAuth";
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
import { BRAZILIAN_STATES } from "@/shared/utils/brazilianStates";
import { masked } from "@/shared/lib/maskedRegister";
import { BadRequestError, HttpError } from "@/shared/http/errors";
import { maskDocument } from "@/shared/utils/masks/maskDocument";
import { maskRG } from "@/shared/utils/masks/maskRG";
import { BackLink } from "@/shared/components/BackLink";
import { PageShell } from "@/shared/components/PageShell";
import { FileDropzone } from "@/shared/components/FileDropzone";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";

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

const CNHUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];
  const maxBirthDate = maxDriverBirthDate();

  const [file, setFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<CnhValidationResult | null>(null);

  const licensesQuery = useOperatorLicenses({ userId: userId ?? undefined }, Boolean(userId));
  const saveLicense = useSaveLicense();
  const uploadDocument = useUploadDocument();
  const validateCnh = useValidateCnhFile();

  const form = useCnhForm();
  const { errors } = form.formState;

  const existingLicense = licensesQuery.data?.[0] ?? null;
  const existingLicenseId = existingLicense?.id ?? null;
  const existingFileUrl = existingLicense?.fileUrl ?? null;

  const isEditing = existingLicenseId !== null;
  const isLoading = Boolean(userId) && licensesQuery.isLoading;
  const isValidating = validateCnh.isPending;
  const isSubmitting = saveLicense.isPending || uploadDocument.isPending;

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
    <PageShell responsive>
      <BackLink to="/dashboard">Voltar ao Dashboard</BackLink>

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

            <FormField label="Foto da CNH" className="space-y-3">
              <FileDropzone
                accept="image/*,application/pdf"
                file={file}
                existingUrl={existingFileUrl}
                existingLabel="Documento enviado anteriormente"
                emptyLabel="Arraste a foto ou clique para selecionar"
                hint="PNG, JPG ou PDF — Máx. 20MB"
                onFiles={(files) => handleFile(files[0])}
              />

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
            </FormField>

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

              <FormField label="Nome Completo *" error={errors.name?.message}>
                <input
                  type="text"
                  placeholder="Conforme consta na CNH"
                  className={inputClass(Boolean(errors.name))}
                  {...form.register("name")}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Data de Nascimento *" error={errors.birthDate?.message}>
                  <input
                    type="date"
                    max={maxBirthDate}
                    className={inputClass(Boolean(errors.birthDate))}
                    {...form.register("birthDate")}
                  />
                </FormField>
                <FormField label="CPF *" error={errors.cpf?.message}>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    className={inputClass(Boolean(errors.cpf))}
                    {...masked(form.register("cpf"), maskDocument)}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="RG *" error={errors.rg?.message}>
                  <input
                    type="text"
                    placeholder="00.000.000-0"
                    className={inputClass(Boolean(errors.rg))}
                    {...masked(form.register("rg"), maskRG)}
                  />
                </FormField>
                <FormField label="Nacionalidade *" error={errors.nationality?.message}>
                  <select
                    className={inputClass(Boolean(errors.nationality))}
                    {...form.register("nationality")}
                  >
                    <option value="Brasileiro(a)">Brasileiro(a)</option>
                    <option value="Estrangeiro(a)">Estrangeiro(a)</option>
                    <option value="Naturalizado(a)">Naturalizado(a)</option>
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Cidade de Nascimento *" error={errors.birthCity?.message}>
                  <input
                    type="text"
                    placeholder="São Paulo"
                    className={inputClass(Boolean(errors.birthCity))}
                    {...form.register("birthCity")}
                  />
                </FormField>
                <FormField label="Estado de Nascimento *" error={errors.birthState?.message}>
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
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Nome da Mãe *" error={errors.motherName?.message}>
                  <input
                    type="text"
                    placeholder="Nome completo"
                    className={inputClass(Boolean(errors.motherName))}
                    {...form.register("motherName")}
                  />
                </FormField>
                <FormField label="Nome do Pai (opcional)">
                  <input
                    type="text"
                    placeholder="Nome completo"
                    className={inputClass(false)}
                    {...form.register("fatherName")}
                  />
                </FormField>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
                Dados da Habilitação
              </p>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Nº CNH *" error={errors.cnhNumber?.message}>
                  <input
                    type="text"
                    placeholder="11 dígitos"
                    className={inputClass(Boolean(errors.cnhNumber))}
                    {...form.register("cnhNumber")}
                  />
                </FormField>
                <FormField label="Categoria *" error={errors.category?.message}>
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
                </FormField>
                <FormField label="Primeira Habilitação *" error={errors.firstLicenseDate?.message}>
                  <input
                    type="date"
                    max={today}
                    className={inputClass(Boolean(errors.firstLicenseDate))}
                    {...form.register("firstLicenseDate")}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Data de Emissão *" error={errors.issueDate?.message}>
                  <input
                    type="date"
                    max={today}
                    className={inputClass(Boolean(errors.issueDate))}
                    {...form.register("issueDate")}
                  />
                </FormField>
                <FormField label="Data de Validade *" error={errors.expirationDate?.message}>
                  <input
                    type="date"
                    className={inputClass(Boolean(errors.expirationDate))}
                    {...form.register("expirationDate")}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="UF de Emissão *" error={errors.issuingState?.message}>
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
                </FormField>
                <FormField label="Órgão Emissor *" error={errors.issuingAuthority?.message}>
                  <input
                    type="text"
                    placeholder="DETRAN-SP"
                    className={inputClass(Boolean(errors.issuingAuthority))}
                    {...form.register("issuingAuthority")}
                  />
                </FormField>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
                Situação do Documento
              </p>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Situação *" error={errors.situation?.message}>
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
                </FormField>
                <FormField label="Pontuação" error={errors.points?.message}>
                  <input
                    type="number"
                    placeholder="0"
                    min={0}
                    max={40}
                    className={inputClass(Boolean(errors.points))}
                    {...form.register("points")}
                  />
                </FormField>
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

              <FormField label="Restrições Médicas">
                <textarea
                  placeholder="Ex.: Obrigatório uso de lentes corretivas"
                  rows={2}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  {...form.register("medicalRestrictions")}
                />
              </FormField>

              <FormField label="Observações">
                <textarea
                  placeholder="Informações adicionais do documento"
                  rows={2}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  {...form.register("observations")}
                />
              </FormField>

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
    </PageShell>
  );
};

export default CNHUpload;
