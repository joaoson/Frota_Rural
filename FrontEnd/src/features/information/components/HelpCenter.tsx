import { useState } from "react";
import { ArrowUpRight, ChevronDown, KeyRound, Search, SearchX, Sprout, UserRound, X } from "lucide-react";
import { Link } from "react-router";

import { InformationLayout } from "@/features/information/components/InformationLayout";
import { helpCategories, helpTopics, type HelpCategory } from "@/features/information/data/helpTopics";

const shortcuts = [
  { to: "/buscar-maquinario", title: "Encontrar uma máquina", description: "Explore os anúncios para sua próxima atividade no campo.", icon: Sprout },
  { to: "/login", title: "Entrar na minha conta", description: "Acesse suas locações, documentos e notificações.", icon: UserRound },
  { to: "/forgot-password", title: "Recuperar meu acesso", description: "Inicie a recuperação de senha pelo e-mail cadastrado.", icon: KeyRound },
];

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function HelpCenter() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");
  const searchTerms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  const filteredTopics = helpTopics.filter((topic) => {
    const categoryLabel = helpCategories.find((item) => item.id === topic.category)?.label ?? "";
    const text = normalizeSearch(`${topic.question} ${topic.answer.join(" ")} ${categoryLabel}`);
    return (category === "all" || topic.category === category) && searchTerms.every((term) => text.includes(term));
  });
  const hasFilters = search.trim().length > 0 || category !== "all";

  function clearFilters() {
    setSearch("");
    setCategory("all");
  }

  return (
    <InformationLayout
      eyebrow="Central de ajuda"
      breadcrumbLabel="Central de ajuda"
      title="Uma mãozinha para seguir em frente."
      description="Da primeira busca à próxima safra: encontre orientações para usar a Frota Rural com tranquilidade."
      pose="curious"
      mascotMessage="Vamos por partes. Qual é a sua dúvida?"
    >
      <section aria-labelledby="help-shortcuts" className="mb-12">
        <h2 id="help-shortcuts" className="mb-5 font-headline text-xl font-bold text-on-surface">Por onde você quer começar?</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {shortcuts.map(({ to, title, description, icon: Icon }) => (
            <Link key={to} to={to} className="group flex items-start gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 transition-colors hover:border-primary/50 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-primary-bright"><Icon size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-on-surface">{title}</span>
                <span className="mt-2 block text-sm leading-relaxed text-on-surface-variant">{description}</span>
              </span>
              <ArrowUpRight size={18} className="shrink-0 text-on-surface-variant transition-colors group-hover:text-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="help-questions" className="rounded-3xl border border-outline-variant/40 bg-surface-container-lowest p-5 sm:p-8 lg:p-10">
        <div className="mb-7 max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-tertiary">Respostas para o dia a dia</p>
          <h2 id="help-questions" className="font-headline text-2xl font-bold text-primary dark:text-primary-bright sm:text-3xl">Perguntas frequentes</h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">Escolha um assunto ou busque por uma palavra, como “reserva”, “contrato” ou “senha”.</p>
        </div>

        <form role="search" onSubmit={(event) => event.preventDefault()} className="max-w-2xl">
          <label htmlFor="help-search" className="mb-2 block text-sm font-bold text-on-surface">Buscar na central de ajuda</label>
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
            <input id="help-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="O que você quer saber?" autoComplete="off" className="w-full rounded-xl border border-outline-variant/60 bg-background py-3.5 pl-12 pr-12 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary [&::-webkit-search-cancel-button]:appearance-none" />
            {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-primary"><X size={18} aria-hidden="true" /></button>}
          </div>
        </form>

        <div role="group" aria-label="Filtrar perguntas por assunto" className="mt-5 flex flex-wrap gap-2">
          {[{ id: "all" as const, label: "Todos os assuntos" }, ...helpCategories].map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${category === item.id ? "border-primary bg-primary text-on-primary" : "border-outline-variant/50 bg-transparent text-on-surface-variant hover:bg-surface-container-low"}`}>{item.label}</button>
          ))}
        </div>

        <div className="mb-2 mt-7 flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-sm text-on-surface-variant">{filteredTopics.length === 1 ? "1 pergunta encontrada" : `${filteredTopics.length} perguntas encontradas`}</p>
          {hasFilters && <button type="button" onClick={clearFilters} className="rounded-lg px-3 py-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary dark:text-primary-bright">Limpar filtros</button>}
        </div>

        {filteredTopics.length > 0 ? (
          <div className="divide-y divide-outline-variant/40">
            {filteredTopics.map((topic) => (
              <details key={topic.id} className="group py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 rounded-lg py-5 text-left font-bold text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                  {topic.question}
                  <ChevronDown size={20} className="shrink-0 text-primary transition-transform group-open:rotate-180 motion-reduce:transition-none dark:text-primary-bright" aria-hidden="true" />
                </summary>
                <div className="max-w-3xl space-y-3 pb-6 pr-3 text-sm leading-7 text-on-surface-variant sm:pr-10">
                  {topic.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="my-6 rounded-2xl bg-surface-container-low px-6 py-12 text-center">
            <SearchX size={32} className="mx-auto mb-4 text-tertiary" aria-hidden="true" />
            <h3 className="font-headline text-lg font-bold text-on-surface">Não encontramos essa trilha por aqui.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-on-surface-variant">Tente uma palavra mais curta ou remova o filtro de assunto para explorar outras respostas.</p>
            <button type="button" onClick={clearFilters} className="mt-5 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Ver todas as perguntas</button>
          </div>
        )}
      </section>

      <aside className="mt-8 flex items-start gap-4 rounded-2xl bg-secondary-container/15 p-6 sm:p-8" aria-labelledby="help-payment-tip">
        <Sprout size={24} className="mt-1 shrink-0 text-tertiary" aria-hidden="true" />
        <div>
          <h2 id="help-payment-tip" className="font-headline text-lg font-bold text-on-surface">Uma pausa evita trabalho em dobro.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant">Se o pagamento ficou em confirmação ou análise, confira a situação da mesma reserva em Minhas Locações antes de tentar novamente. Assim, você acompanha o andamento sem criar outra reserva para as mesmas datas.</p>
        </div>
      </aside>
    </InformationLayout>
  );
}
