import { ExternalLink } from "lucide-react";
import { InformationArticle } from "@/features/information/components/InformationArticle";
import { InformationLayout } from "@/features/information/components/InformationLayout";
import { privacySections } from "@/features/information/data/legalContent";

export default function Privacy() {
  return (
    <InformationLayout eyebrow="Informação com cuidado" title="Privacidade" description="Conheça as informações usadas na Frota Rural, para que elas servem e as escolhas disponíveis na sua conta." pose="welcome" mascotMessage="Por aqui, clareza também faz parte do cuidado.">
      <InformationArticle sections={privacySections} />
      <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-primary hover:underline dark:text-primary-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        Conheça seus direitos no site da ANPD <ExternalLink size={16} aria-hidden="true" /><span className="sr-only"> (abre em outra aba)</span>
      </a>
    </InformationLayout>
  );
}
