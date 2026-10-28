import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, Search } from "lucide-react";

import { InformationLayout } from "@/features/information/components/InformationLayout";

export default function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = "Página não encontrada · Frota Rural"; }, [pathname]);

  return (
    <InformationLayout eyebrow="Erro 404 · Página não encontrada" title="Opa, saímos da trilha." breadcrumbLabel="Página não encontrada" description="Até nossa capivara procurou, mas não encontrou esta página. O endereço pode ter mudado ou ter sido digitado errado. Vamos encontrar um caminho?" pose="curious" mascotMessage="Me perdi um pouquinho. Mas sei o caminho de volta!">
      <section aria-label="Encontre seu caminho" className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-sm hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <ArrowLeft size={18} aria-hidden="true" /> Voltar ao início
          </Link>
          <Link to="/buscar-maquinario" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-3 text-sm font-bold text-primary hover:bg-surface-container dark:text-primary-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <Search size={18} aria-hidden="true" /> Buscar equipamentos
          </Link>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-on-surface-variant">Precisando de uma mão? A <Link to="/help" className="rounded font-semibold text-primary underline underline-offset-4 dark:text-primary-bright focus-visible:outline-2 focus-visible:outline-primary">Central de ajuda</Link> também está por aqui.</p>
      </section>
    </InformationLayout>
  );
}
