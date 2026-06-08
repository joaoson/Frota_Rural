import { type FormEvent, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { operatorDocumentService } from "@/services/OperatorDocumentService/OperatorDocumentService";
import { OperatorDocumentServiceError } from "@/services/OperatorDocumentService/errors/OperatorDocumentError";
import type { CreateCertificationRequest } from "@/services/OperatorDocumentService/models/CreateCertificationRequest";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const CertificationUpload = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();

  const today = new Date().toISOString().split("T")[0];

  const [issuingOrganization, setIssuingOrganization] = useState("");
  const [title, setTitle] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [credentialCode, setCredentialCode] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (fieldName: string, value: any) => {
    let errorMsg = "";
    switch (fieldName) {
      case "title":
        if (!value.trim()) {
          errorMsg = "Título do curso é obrigatório.";
        } else if (value.trim().length < 3) {
          errorMsg = "O título deve ter pelo menos 3 caracteres.";
        }
        break;
      case "issuingOrganization":
        if (!value.trim()) {
          errorMsg = "Organização emissora é obrigatória.";
        } else if (value.trim().length < 2) {
          errorMsg = "A organização emissora deve ter pelo menos 2 caracteres.";
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
        if (value && issueDate && value <= issueDate) {
          errorMsg = "A data de validade deve ser posterior à data de emissão.";
        }
        break;
      case "description":
        if (!value.trim()) {
          errorMsg = "Descrição é obrigatória.";
        } else if (value.trim().length < 10) {
          errorMsg = "A descrição deve conter pelo menos 10 caracteres.";
        }
        break;
    }
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!id);

  const isEditing = !!id;

  useEffect(() => {
    if (!id) return;

    operatorDocumentService
      .getCertificationById(id)
      .then((cert) => {
        setIssuingOrganization(cert.issuing_organization);
        setTitle(cert.title);
        setIssueDate(cert.issue_date);
        setExpirationDate(cert.expiration_date ?? "");
        setCredentialCode(cert.credential_code ?? "");
        setDescription(cert.description);
        setExistingMediaUrl(cert.media_url ?? null);
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleFile = (selected: File) => {
    const allowed =
      selected.type.startsWith("image/") || selected.type === "application/pdf";
    if (allowed) setFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errorsList = {
      title: validateField("title", title),
      issuingOrganization: validateField("issuingOrganization", issuingOrganization),
      issueDate: validateField("issueDate", issueDate),
      expirationDate: validateField("expirationDate", expirationDate),
      description: validateField("description", description),
    };

    if (Object.values(errorsList).some((err) => err !== "")) {
      toast.error("Por favor, corrija os erros no formulário antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!userId) {
        toast.error(
          "Usuário não autenticado. Faça login para cadastrar a certificação.",
        );
        return;
      }

      let uploadedMediaUrl: string | undefined;
      if (file) {
        uploadedMediaUrl = await operatorDocumentService.uploadDocument(file);
      }

      const payload: CreateCertificationRequest = {
        user: userId,
        issuing_organization: issuingOrganization.trim(),
        title: title.trim(),
        issue_date: issueDate,
        expiration_date: expirationDate || undefined,
        credential_code: credentialCode.trim() || undefined,
        description: description.trim(),
        media_url:
          uploadedMediaUrl ||
          existingMediaUrl ||
          (isEditing ? null : undefined),
      };

      if (isEditing) {
        await operatorDocumentService.updateCertification(id, payload);
        toast.success("Certificação atualizada com sucesso.");
      } else {
        await operatorDocumentService.createCertification(payload);
        toast.success("Certificação cadastrada com sucesso.");
      }
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof OperatorDocumentServiceError) {
        toast.error(error.message);
      } else {
        toast.error(
          isEditing
            ? "Erro ao atualizar certificação. Verifique os dados e tente novamente."
            : "Erro ao cadastrar certificação. Verifique os dados e tente novamente.",
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
              onSubmit={handleSubmit}
              noValidate
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
                Dados da Certificação
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Título do Curso *
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Operação de Tratores Agrícolas"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) validateField("title", e.target.value);
                  }}
                  onBlur={(e) => validateField("title", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.title ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.title && <p className="text-[11px] text-error font-medium mt-1">{errors.title}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Organização Emissora *
                </label>
                <input
                  type="text"
                  placeholder="Ex.: SENAR"
                  value={issuingOrganization}
                  onChange={(e) => {
                    setIssuingOrganization(e.target.value);
                    if (errors.issuingOrganization) validateField("issuingOrganization", e.target.value);
                  }}
                  onBlur={(e) => validateField("issuingOrganization", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.issuingOrganization ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.issuingOrganization && <p className="text-[11px] text-error font-medium mt-1">{errors.issuingOrganization}</p>}
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
                      if (expirationDate) validateField("expirationDate", expirationDate);
                    }}
                    onBlur={(e) => validateField("issueDate", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.issueDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  {errors.issueDate && <p className="text-[11px] text-error font-medium mt-1">{errors.issueDate}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Data de Validade (Opcional)
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
                  />
                  {errors.expirationDate && <p className="text-[11px] text-error font-medium mt-1">{errors.expirationDate}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Código da Credencial
                </label>
                <input
                  type="text"
                  placeholder="Código fornecido pela instituição, se aplicável (opcional)"
                  value={credentialCode}
                  onChange={(e) => setCredentialCode(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Descrição *
                </label>
                <textarea
                  placeholder="Descreva o conteúdo do curso, competências adquiridas ou informações relevantes"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (errors.description) validateField("description", e.target.value);
                  }}
                  onBlur={(e) => validateField("description", e.target.value)}
                  rows={4}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.description ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.description && <p className="text-[11px] text-error font-medium mt-1">{errors.description}</p>}
              </div>

              <p className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
                Mídia (opcional)
              </p>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Arquivo do Certificado
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
                  ) : existingMediaUrl ? (
                    <>
                      <MaterialIcon
                        icon="insert_drive_file"
                        size={40}
                        className="text-primary mb-2"
                      />
                      <div className="font-bold text-primary text-sm">
                        Arquivo enviado anteriormente
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
                        Arraste o arquivo ou clique para selecionar
                      </div>
                      <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                        PNG, JPG, PDF — Máx. 5MB
                      </div>
                    </>
                  )}
                </label>

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
                        onClick={() => setExistingMediaUrl(null)}
                        className="flex items-center px-2 py-2 rounded-lg text-on-surface hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <MaterialIcon icon="delete" size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
      </div>
      <Footer />
    </div>
  );
};

export default CertificationUpload;
