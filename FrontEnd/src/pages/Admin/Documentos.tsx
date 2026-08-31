import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { operatorDocumentService } from "@/services/OperatorDocumentService/OperatorDocumentService";
import { userService } from "@/services/UserService/UserService";
import type { OperatorLicense } from "@/services/OperatorDocumentService/models/OperatorLicense";
import type { Certification } from "@/services/OperatorDocumentService/models/Certification";
import type { User } from "@/services/UserService/models/User";
import type { ReviewDocumentRequest } from "@/services/OperatorDocumentService/models/ReviewDocumentRequest";

type DocType = "license" | "certification";

type ReviewItem = {
  id: string;
  type: DocType;
  label: string;
  detail: string;
  user_id: string;
  validation_status: string;
  review_note?: string | null;
  created_at?: string | null;
  raw: OperatorLicense | Certification;
};

type ReviewAction = "approved" | "rejected";

const statusBadge = (status: string) => {
  switch (status) {
    case "approved":
      return {
        icon: "check_circle",
        classes: "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20",
        label: "Aprovado",
      };
    case "rejected":
      return {
        icon: "block",
        classes: "bg-error/10 text-error border border-error/20",
        label: "Recusado",
      };
    default:
      return {
        icon: "hourglass_bottom",
        classes:
          "bg-secondary-container/20 text-secondary border border-secondary-container/30",
        label: "Pendente",
      };
  }
};

const toReviewItem = (
  doc: OperatorLicense | Certification,
  type: DocType,
): ReviewItem => {
  if (type === "license") {
    const lic = doc as OperatorLicense;
    return {
      id: lic.id,
      type: "license",
      label: lic.name,
      detail: `CNH · Categoria ${lic.category}`,
      user_id: lic.user,
      validation_status: lic.validation_status,
      review_note: lic.review_note,
      created_at: lic.created_at,
      raw: lic,
    };
  }
  const cert = doc as Certification;
  return {
    id: cert.id,
    type: "certification",
    label: cert.title,
    detail: `Certificação · ${cert.issuing_organization}`,
    user_id: cert.user,
    validation_status: cert.validation_status,
    review_note: cert.review_note,
    created_at: cert.created_at,
    raw: cert,
  };
};

const Documentos = () => {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [licenses, certifications] = await Promise.all([
        operatorDocumentService.listLicenses(),
        operatorDocumentService.listCertifications(),
      ]);
      const mapped = [
        ...licenses.map((l) => toReviewItem(l, "license")),
        ...certifications.map((c) => toReviewItem(c, "certification")),
      ].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime(),
      );
      setItems(mapped);
    } catch {
      toast.error("Não foi possível carregar os documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = items.filter((item) => {
      if (statusFilter !== "all" && item.validation_status !== statusFilter)
        return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!term) return true;
      return (
        item.label.toLowerCase().includes(term) ||
        item.detail.toLowerCase().includes(term)
      );
    });
    return result;
  }, [items, search, statusFilter, typeFilter]);

  const openDetail = async (item: ReviewItem) => {
    setSelectedItem(item);
    setReviewNote(item.review_note ?? "");
    setSelectedUser(null);
    setDetailOpen(true);

    try {
      const user = await userService.getById(item.user_id);
      setSelectedUser(user);
    } catch {
      setSelectedUser(null);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedItem(null);
    setSelectedUser(null);
    setReviewNote("");
  };

  const runReview = async (action: ReviewAction) => {
    if (!selectedItem) return;
    if (action === "rejected" && !reviewNote.trim()) return;

    setSubmitting(true);
    try {
      const payload: ReviewDocumentRequest = {
        validation_status: action,
        review_note: reviewNote.trim() || null,
      };

      if (selectedItem.type === "license") {
        await operatorDocumentService.reviewLicense(selectedItem.id, payload);
      } else {
        await operatorDocumentService.reviewCertification(
          selectedItem.id,
          payload,
        );
      }

      toast.success(
        action === "approved"
          ? "Documento aprovado com sucesso."
          : "Documento recusado.",
      );
      await loadItems();
      closeDetail();
    } catch {
      toast.error("Falha ao aplicar a ação.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderLicenseDetail = (lic: OperatorLicense) => (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Nome
          </span>
          <p className="text-on-surface">{lic.name}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            CPF
          </span>
          <p className="text-on-surface">{lic.cpf}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            RG
          </span>
          <p className="text-on-surface">{lic.rg}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Data de Nascimento
          </span>
          <p className="text-on-surface">
            {new Date(lic.birth_date).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Nº CNH
          </span>
          <p className="text-on-surface">{lic.cnh_number}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Categoria
          </span>
          <p className="text-on-surface">{lic.category}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Validade
          </span>
          <p className="text-on-surface">
            {new Date(lic.expiration_date).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Situação
          </span>
          <p className="text-on-surface capitalize">{lic.situation}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            UF Emissão
          </span>
          <p className="text-on-surface">{lic.issuing_state}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Órgão Emissor
          </span>
          <p className="text-on-surface">{lic.issuing_authority}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Local de Nascimento
          </span>
          <p className="text-on-surface">{lic.birth_place}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Nacionalidade
          </span>
          <p className="text-on-surface">{lic.nationality}</p>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-on-surface-variant">
        {lic.ear && <span>EAR — Atividade Remunerada</span>}
        {lic.acc && <span>ACC — Ciclomotor</span>}
        {lic.points > 0 && <span>Pontos: {lic.points}</span>}
      </div>
    </div>
  );

  const renderCertificationDetail = (cert: Certification) => (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Título
          </span>
          <p className="text-on-surface">{cert.title}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Organização Emissora
          </span>
          <p className="text-on-surface">{cert.issuing_organization}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Data de Emissão
          </span>
          <p className="text-on-surface">
            {new Date(cert.issue_date).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Validade
          </span>
          <p className="text-on-surface">
            {cert.expiration_date
              ? new Date(cert.expiration_date).toLocaleDateString("pt-BR")
              : "Sem validade"}
          </p>
        </div>
        {cert.credential_code && (
          <div className="col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Código da Credencial
            </span>
            <p className="text-on-surface">{cert.credential_code}</p>
          </div>
        )}
      </div>
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
          Descrição
        </span>
        <p className="text-on-surface mt-0.5">{cert.description}</p>
      </div>
    </div>
  );

  const renderUserInfo = (user: User | null) => (
    <div className="space-y-2 text-sm">
      {!user ? (
        <p className="text-on-surface-variant text-xs">
          Carregando dados do usuário...
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-y-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Nome
            </span>
            <p className="text-on-surface">{user.name}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Email
            </span>
            <p className="text-on-surface">{user.email}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Telefone
            </span>
            <p className="text-on-surface">{user.phone ?? "—"}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Documento
            </span>
            <p className="text-on-surface">{user.document}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Endereço
            </span>
            <p className="text-on-surface">{user.address}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
        <h1 className="font-headline font-black text-lg text-on-surface tracking-tight">
          Revisão de Documentos de Operadores
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadItems}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <MaterialIcon icon="refresh" size={16} /> Atualizar
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="p-8 max-w-[1200px]">
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-5 mb-6 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30">
            <MaterialIcon icon="search" size={18} className="text-outline" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, título ou organização"
              className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-outline"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
          >
            <option value="all">Todos os tipos</option>
            <option value="license">CNH</option>
            <option value="certification">Certificação</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Recusados</option>
          </select>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-container-low">
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Tipo
                </TableHead>
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Documento
                </TableHead>
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Envio
                </TableHead>
                <TableHead className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-on-surface-variant"
                  >
                    <MaterialIcon
                      icon="hourglass_bottom"
                      size={20}
                      className="text-outline mr-2"
                    />
                    Carregando documentos…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-on-surface-variant"
                  >
                    Nenhum documento encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const badge = statusBadge(item.validation_status);
                  return (
                    <TableRow
                      key={`${item.type}-${item.id}`}
                      className="hover:bg-surface-container-low/70 cursor-pointer"
                      onClick={() => openDetail(item)}
                    >
                      <TableCell className="px-5 py-4 align-top">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                          <MaterialIcon
                            icon={
                              item.type === "license"
                                ? "id_card"
                                : "workspace_premium"
                            }
                            size={16}
                          />
                          {item.type === "license" ? "CNH" : "Certificação"}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top">
                        <div className="font-bold text-sm text-on-surface">
                          {item.label}
                        </div>
                        <div className="text-xs text-on-surface-variant">
                          {item.detail}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm text-on-surface-variant whitespace-nowrap">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString(
                              "pt-BR",
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top">
                        <span
                          className={`px-2.5 py-1 font-bold text-[10px] rounded uppercase tracking-wider inline-flex items-center gap-1.5 ${badge.classes}`}
                        >
                          <MaterialIcon icon={badge.icon} size={14} />{" "}
                          {badge.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => (open ? null : closeDetail())}
      >
        <DialogContent className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl max-w-3xl max-h-[90dvh] overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-track]:my-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-outline-variant/50">
          <DialogHeader>
            <DialogTitle className="font-headline font-bold text-on-surface flex items-center gap-2">
              <MaterialIcon
                icon={
                  selectedItem?.type === "license"
                    ? "id_card"
                    : "workspace_premium"
                }
                size={20}
                className="text-primary dark:text-primary-bright"
              />
              Revisar{" "}
              {selectedItem?.type === "license" ? "CNH" : "Certificação"}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mt-2">
                <div className="md:col-span-3 bg-surface-container-low rounded-xl p-4 border border-outline-variant/30">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-3">
                    Dados do Documento
                  </div>
                  {selectedItem.type === "license"
                    ? renderLicenseDetail(selectedItem.raw as OperatorLicense)
                    : renderCertificationDetail(
                        selectedItem.raw as Certification,
                      )}
                </div>

                <div className="md:col-span-2 bg-surface-container-low rounded-xl p-4 border border-outline-variant/30">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-3">
                    Dados do Usuário
                  </div>
                  {renderUserInfo(selectedUser)}
                </div>
              </div>

              {(() => {
                const fileUrl =
                  selectedItem.type === "license"
                    ? (selectedItem.raw as OperatorLicense).file_url
                    : (selectedItem.raw as Certification).media_url;

                if (!fileUrl) return null;

                const fullUrl = `${import.meta.env.VITE_API_BASE_URL?.replace("/api/", "") || "http://localhost:8000"}${fileUrl}`;
                const isImage = /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);

                return (
                  <div className="mt-4 bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden">
                    <div className="px-4 py-3 border-b border-outline-variant/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MaterialIcon
                          icon={isImage ? "image" : "picture_as_pdf"}
                          size={16}
                          className="text-primary dark:text-primary-bright"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          Documento Anexado
                        </span>
                      </div>
                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary dark:text-primary-bright hover:underline"
                      >
                        <MaterialIcon icon="open_in_new" size={14} />
                        Abrir
                      </a>
                    </div>
                    {isImage ? (
                      <div className="p-4 bg-surface-container flex items-center justify-center">
                        <img
                          src={fullUrl}
                          alt="Documento anexado"
                          className="max-h-80 w-full rounded-lg object-contain"
                        />
                      </div>
                    ) : (
                      <div className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center flex-shrink-0">
                          <MaterialIcon
                            icon="picture_as_pdf"
                            size={22}
                            className="text-error"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">
                            Arquivo PDF
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            Clique em &quot;Abrir&quot; para visualizar
                          </p>
                        </div>
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-primary dark:text-primary-bright bg-primary/10 hover:bg-primary/20 transition-colors"
                        >
                          <MaterialIcon icon="download" size={14} />
                          Baixar
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="pt-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                  Observação / Motivo
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder="Obrigatório ao rejeitar. Opcional ao aprovar."
                  className="mt-1.5 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline outline-none focus:border-primary resize-none"
                />
              </div>
            </>
          )}

          <DialogFooter className="gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={closeDetail}
              className="px-4 py-2 rounded-lg font-bold text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={submitting || !reviewNote.trim()}
              onClick={() => runReview("rejected")}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-error text-on-error hover:opacity-90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Recusar
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => runReview("approved")}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-primary text-on-primary hover:opacity-90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Aprovar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Documentos;
