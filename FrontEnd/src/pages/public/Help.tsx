import { Link } from "react-router";

import { EmptyState } from "@/shared/components/EmptyState";
import { PageHeader } from "@/shared/components/PageHeader";
import { PageShell } from "@/shared/components/PageShell";

function Help() {
  return (
    <PageShell>
      <PageHeader
        title="Central de Ajuda"
        subtitle="Dúvidas sobre locação, documentos e contratos."
      />

      <div className="mt-10">
        <EmptyState
          icon="support_agent"
          title="Conteúdo em construção"
          description="Ainda estamos redigindo os artigos de ajuda. Enquanto isso, fale com a equipe pelo e-mail de suporte."
          action={
            <Link
              to="/"
              className="px-6 py-3 rounded-lg text-sm font-bold bg-primary text-on-primary hover:shadow-lg transition-all"
            >
              Voltar ao início
            </Link>
          }
        />
      </div>
    </PageShell>
  );
}

export default Help;
