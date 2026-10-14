import { InformationArticle } from "@/features/information/components/InformationArticle";
import { InformationLayout } from "@/features/information/components/InformationLayout";
import { termsSections } from "@/features/information/data/legalContent";

export default function Terms() {
  return (
    <InformationLayout eyebrow="Combinados claros" title="Termos de uso" description="Entenda como usar a plataforma e o que conferir em cada etapa da sua locação." pose="wink" mascotMessage="Um bom combinado é o começo de uma boa parceria.">
      <InformationArticle sections={termsSections} />
    </InformationLayout>
  );
}
