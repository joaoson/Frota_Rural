import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { AdminFilterBar, ADMIN_SELECT } from "@/features/administration/components/AdminFilterBar";
import { AdminPage } from "@/features/administration/components/AdminPage";
import {
  AdminTable,
  AdminTableMessage,
} from "@/features/administration/components/AdminTable";
import {
  useCertifications,
  useOperatorLicenses,
  useReviewDocument,
} from "@/features/documents/hooks/useDocuments";
import { documentStatusBadge } from "@/features/documents/types/documentBadges";
import type { Certification, OperatorLicense } from "@/features/documents/types/document";
import type { ReviewDocumentPayload } from "@/features/documents/types/documentSchemas";
import { userStore } from "@/app/container";
import type { User } from "@/features/users/types/user";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { HttpError } from "@/shared/http/errors";

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
      user_id: lic.userId,
      validation_status: lic.validationStatus,
      review_note: lic.reviewNote,
      created_at: lic.createdAt,
      raw: lic,
    };
  }
  const cert = doc as Certification;
  return {
    id: cert.id,
    type: "certification",
    label: cert.title,
    detail: `Certificação · ${cert.issuingOrganization}`,
    user_id: cert.userId,
    validation_status: cert.validationStatus,
    review_note: cert.reviewNote,
    created_at: cert.createdAt,
    raw: cert,
  };
};

const Documentos = () => {
  const licensesQuery = useOperatorLicenses();
  const certificationsQuery = useCertifications();
  const reviewDocument = useReviewDocument();
  const loading = licensesQuery.isLoading || certificationsQuery.isLoading;

  const items = useMemo<ReviewItem[]>(() => {
    const licenses = licensesQuery.data ?? [];
    const certifications = certificationsQuery.data ?? [];
    return [
      ...licenses.map((l) => toReviewItem(l, "license")),
      ...certifications.map((c) => toReviewItem(c, "certification")),
    ].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  }, [licensesQuery.data, certificationsQuery.data]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [reviewNote, setReviewNote] = useState("");
  const submitting = reviewDocument.isPending;

  useEffect(() => {
    if (licensesQuery.isError || certificationsQuery.isError) {
      toast.error("Não foi possível carregar os documentos.");
    }
  }, [licensesQuery.isError, certificationsQuery.isError]);

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
      const user = await userStore.fetchById(item.user_id);
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

    const payload: ReviewDocumentPayload = {
      validation_status: action,
      review_note: reviewNote.trim() || null,
    };

    try {
      await reviewDocument.mutateAsync({ id: selectedItem.id, kind: selectedItem.type, payload });
      toast.success(
        action === "approved" ? "Documento aprovado com sucesso." : "Documento recusado.",
      );
      closeDetail();
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Falha ao aplicar a ação.");
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
            {new Date(lic.birthDate).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Nº CNH
          </span>
          <p className="text-on-surface">{lic.cnhNumber}</p>
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
            {new Date(lic.expirationDate).toLocaleDateString("pt-BR")}
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
          <p className="text-on-surface">{lic.issuingState}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Órgão Emissor
          </span>
          <p className="text-on-surface">{lic.issuingAuthority}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Local de Nascimento
          </span>
          <p className="text-on-surface">{lic.birthPlace.toString()}</p>
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
          <p className="text-on-surface">{cert.issuingOrganization}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Data de Emissão
          </span>
          <p className="text-on-surface">
            {new Date(cert.issueDate).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Validade
          </span>
          <p className="text-on-surface">
            {cert.expirationDate
              ? new Date(cert.expirationDate).toLocaleDateString("pt-BR")
              : "Sem validade"}
          </p>
        </div>
        {cert.credentialCode && (
          <div className="col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
              Código da Credencial
            </span>
            <p className="text-on-surface">{cert.credentialCode}</p>
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
      <AdminPage
        title="Revisão de Documentos de Operadores"
        onRefresh={() => {
          void licensesQuery.refetch();
          void certificationsQuery.refetch();
        }}
      >
        <AdminFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Buscar por nome, título ou organização"
        >
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={ADMIN_SELECT}
          >
            <option value="all">Todos os tipos</option>
            <option value="license">CNH</option>
            <option value="certification">Certificação</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={ADMIN_SELECT}
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Recusados</option>
          </select>
        </AdminFilterBar>

        <AdminTable
          columns={[
            { label: "Tipo" },
            { label: "Documento" },
            { label: "Envio" },
            { label: "Status" },
          ]}
        >
          {loading ? (
            <AdminTableMessage colSpan={4} icon="hourglass_bottom">
              Carregando documentos…
            </AdminTableMessage>
          ) : filtered.length === 0 ? (
            <AdminTableMessage colSpan={4}>
              Nenhum documento encontrado com os filtros atuais.
            </AdminTableMessage>
          ) : (
            filtered.map((item) => {
              const badge = documentStatusBadge(item.validation_status);
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
                    <StatusBadge config={badge} dense />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </AdminTable>
      </AdminPage>

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
                className="text-primary"
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
                    ? (selectedItem.raw as OperatorLicense).fileUrl
                    : (selectedItem.raw as Certification).mediaUrl;

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
                          className="text-primary"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          Documento Anexado
                        </span>
                      </div>
                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
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
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
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
