import { Link } from "react-router";
import { toast } from "sonner";

import { documentStore } from "@/app/container";
import MaterialIcon from "@/components/MaterialIcon";
import { DashboardCollection } from "@/features/dashboard/components/DashboardCollection";
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

import { useCertifications, useOperatorLicenses } from "../hooks/useDocuments";

/**
 * Aba "Documentos" dos painéis: CNH e certificações da conta, com o resultado
 * da revisão. Compartilhada pelo locador e pelo operador, que precisam dos
 * mesmos documentos para conduzir o maquinário.
 */
export function DocumentsSection({ userId }: { userId: string | null }) {
  const licensesQuery = useOperatorLicenses({ userId: userId ?? undefined }, Boolean(userId));
  const certificationsQuery = useCertifications({ userId: userId ?? undefined }, Boolean(userId));
  const licenses = licensesQuery.data ?? [];
  const certifications = certificationsQuery.data ?? [];

  if (licensesQuery.isError || certificationsQuery.isError) {
    return (
      <div role="alert" className="mb-6 rounded-xl border border-error/30 p-4 text-error">
        Não foi possível carregar todos os dados desta seção.{" "}
        <button type="button" onClick={() => { void licensesQuery.refetch(); void certificationsQuery.refetch(); }} className="font-bold underline">
          Tentar novamente
        </button>
      </div>
    );
  }
  if (licensesQuery.isLoading || certificationsQuery.isLoading) return <p role="status">Carregando dados...</p>;

  return (
    <div className="space-y-10">
      {/* ── Habilitação (CNH) ──────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
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
          <DashboardCollection label="CNH" items={licenses} defaultView="list" showToolbar={false} renderItem={(lic) => (
            <div
              key={lic.id}
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 sm:p-6 flex flex-wrap gap-4 items-center justify-between hover:shadow-xl transition-all duration-300 shadow-sm"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 shrink-0 bg-primary/10 rounded-xl flex items-center justify-center">
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
                    {new Date(lic.expirationDate).toLocaleDateString(
                      "pt-BR",
                    )}
                  </p>
                  <p className="text-xs text-outline font-medium uppercase tracking-wide">
                    Vínculo: {lic.tipoVinculoNome ?? "Não informado"}
                  </p>
                  {lic.validationStatus === "rejected" && lic.reviewNote && (
                    <p className="text-xs text-error mt-1">
                      {lic.reviewNote}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {lic.validationStatus === "approved" ? (
                  <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                    Aprovado
                  </span>
                ) : lic.validationStatus === "rejected" ? (
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
                            await documentStore.removeLicense(
                              lic.id,
                            );
                            void documentStore.invalidateLicenses();                                    toast.success("CNH removida com sucesso!");
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
          )} />
        )}
      </div>

      {/* ── Certificações ──────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
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
          <DashboardCollection label="Certificações" items={certifications} defaultView="list" renderItem={(cert) => (
            <div
              key={cert.id}
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 sm:p-6 flex flex-wrap gap-4 items-center justify-between hover:shadow-xl transition-all duration-300 shadow-sm"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 shrink-0 bg-primary/10 rounded-xl flex items-center justify-center">
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
                    {cert.issuingOrganization} ·{" "}
                    {new Date(cert.issueDate).toLocaleDateString(
                      "pt-BR",
                    )}
                  </p>
                  <p className="text-xs text-outline font-medium uppercase tracking-wide">
                    Área: {cert.areaNome ?? "Não informada"}
                  </p>
                  {cert.validationStatus === "rejected" && cert.reviewNote && (
                    <p className="text-xs text-error mt-1">
                      {cert.reviewNote}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {cert.validationStatus === "approved" ? (
                  <span className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />{" "}
                    Aprovado
                  </span>
                ) : cert.validationStatus === "rejected" ? (
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
                            await documentStore.removeCertification(
                              cert.id,
                            );
                            void documentStore.invalidateCertifications();                                    toast.success(
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
          )} />
        )}
      </div>
    </div>
  );
}
