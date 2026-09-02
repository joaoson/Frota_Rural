import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import MaterialIcon from "@/components/MaterialIcon";
import { useAuth } from "@/contexts/useAuth";
import {
  certificationToFormValues,
  certificationToPayload,
} from "@/features/documents/api/documentMapper";
import { useCertificationForm } from "@/features/documents/hooks/useDocumentForms";
import {
  useCertification,
  useSaveCertification,
  useUploadDocument,
} from "@/features/documents/hooks/useDocuments";
import type { CertificationFormValues } from "@/features/documents/types/documentSchemas";
import { BadRequestError, HttpError } from "@/shared/http/errors";
import { BackLink } from "@/shared/components/BackLink";
import { PageShell } from "@/shared/components/PageShell";
import { FileDropzone } from "@/shared/components/FileDropzone";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";

const API_FIELD_TO_FORM: Partial<Record<string, keyof CertificationFormValues>> = {
  issuing_organization: "issuingOrganization",
  title: "title",
  issue_date: "issueDate",
  expiration_date: "expirationDate",
  credential_code: "credentialCode",
  description: "description",
};

const CertificationUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const today = new Date().toISOString().split("T")[0];

  const [file, setFile] = useState<File | null>(null);
  const [mediaCleared, setMediaCleared] = useState(false);

  const certificationQuery = useCertification(id ?? null);
  const saveCertification = useSaveCertification();
  const uploadDocument = useUploadDocument();

  const form = useCertificationForm();
  const { errors } = form.formState;

  const certification = certificationQuery.data ?? null;
  const existingMediaUrl = mediaCleared ? null : (certification?.mediaUrl ?? null);
  const isLoading = isEditing && certificationQuery.isLoading;
  const isSubmitting = saveCertification.isPending || uploadDocument.isPending;

  useEffect(() => {
    if (!certification) return;
    form.reset(certificationToFormValues(certification));
  }, [certification, form]);

  const handleFile = (selected: File) => {
    const allowed = selected.type.startsWith("image/") || selected.type === "application/pdf";
    if (allowed) setFile(selected);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!userId) {
      toast.error("Usuário não autenticado. Faça login para cadastrar a certificação.");
      return;
    }

    try {
      const uploadedUrl = file ? await uploadDocument.mutateAsync(file) : undefined;
      const mediaUrl = uploadedUrl ?? existingMediaUrl ?? undefined;

      await saveCertification.mutateAsync({
        id,
        payload: certificationToPayload(values, userId, mediaUrl),
      });

      toast.success(
        isEditing ? "Certificação atualizada com sucesso." : "Certificação cadastrada com sucesso.",
      );
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
            ? "Erro ao atualizar certificação. Verifique os dados e tente novamente."
            : "Erro ao cadastrar certificação. Verifique os dados e tente novamente.",
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
              {isEditing ? "Editar Certificação" : "Nova Certificação"}
            </h1>
            <div className="h-1 w-16 bg-secondary-container mb-3" />
            <p className="text-on-surface-variant text-sm">
              {isEditing
                ? "Atualize os dados da sua certificação profissionalizante"
                : "Informe os dados do seu curso ou certificação profissionalizante"}
            </p>
          </div>

          <form
            className="space-y-6 sm:space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm"
            onSubmit={onSubmit}
            noValidate
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
              Dados da Certificação
            </p>

            <FormField label="Título do Curso *" error={errors.title?.message}>
              <input
                type="text"
                placeholder="Ex.: Operação de Tratores Agrícolas"
                className={inputClass(Boolean(errors.title))}
                {...form.register("title")}
              />
            </FormField>

            <FormField label="Organização Emissora *" error={errors.issuingOrganization?.message}>
              <input
                type="text"
                placeholder="Ex.: SENAR"
                className={inputClass(Boolean(errors.issuingOrganization))}
                {...form.register("issuingOrganization")}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-5">
              <FormField label="Data de Emissão *" error={errors.issueDate?.message}>
                <input
                  type="date"
                  max={today}
                  className={inputClass(Boolean(errors.issueDate))}
                  {...form.register("issueDate")}
                />
              </FormField>
              <FormField label="Data de Validade (Opcional)" error={errors.expirationDate?.message}>
                <input
                  type="date"
                  className={inputClass(Boolean(errors.expirationDate))}
                  {...form.register("expirationDate")}
                />
              </FormField>
            </div>

            <FormField label="Código da Credencial">
              <input
                type="text"
                placeholder="Código fornecido pela instituição, se aplicável (opcional)"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                {...form.register("credentialCode")}
              />
            </FormField>

            <FormField label="Descrição *" error={errors.description?.message}>
              <textarea
                placeholder="Descreva o conteúdo do curso, competências adquiridas ou informações relevantes"
                rows={4}
                className={inputClass(Boolean(errors.description))}
                {...form.register("description")}
              />
            </FormField>

            <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
              Mídia (opcional)
            </p>

            <FormField label="Arquivo do Certificado" className="space-y-3">
              <FileDropzone
                accept="image/*,application/pdf"
                file={file}
                existingUrl={existingMediaUrl}
                existingLabel="Arquivo enviado anteriormente"
                emptyLabel="Arraste o arquivo ou clique para selecionar"
                hint="PNG, JPG, PDF — Máx. 5MB"
                onFiles={(files) => handleFile(files[0])}
              />

              {existingMediaUrl && !file && (
                <div className="mt-3 flex items-center gap-3 border-2 border-dashed border-outline-variant/60 rounded-xl p-3">
                  {existingMediaUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                    <img
                      src={`${import.meta.env.VITE_API_BASE_URL?.replace("/api/", "") || "http://localhost:8000"}${existingMediaUrl}`}
                      alt="Certificado"
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
                      Certificado
                    </p>
                    <p className="text-xs text-outline">
                      {existingMediaUrl.match(/\.(pdf)$/i) ? "PDF" : "Imagem"} ·
                      Enviado anteriormente
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`${import.meta.env.VITE_API_BASE_URL?.replace("/api/", "") || "http://localhost:8000"}${existingMediaUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-on-surface hover:bg-primary/5 transition-colors"
                    >
                      <MaterialIcon icon="download" size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setMediaCleared(true)}
                      className="flex items-center px-2 py-2 rounded-lg text-on-surface hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                      <MaterialIcon icon="delete" size={16} />
                    </button>
                  </div>
                </div>
              )}
            </FormField>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 sm:py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <MaterialIcon icon="workspace_premium" size={20} />{" "}
              {isSubmitting
                ? isEditing
                  ? "Atualizando..."
                  : "Cadastrando..."
                : isEditing
                  ? "Atualizar Certificação"
                  : "Cadastrar Certificação"}
            </button>
          </form>
        </>
      )}
    </PageShell>
  );
};

export default CertificationUpload;
