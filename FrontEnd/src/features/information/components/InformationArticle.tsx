import type { InformationSection } from "../data/legalContent";

export function InformationArticle({ sections }: { sections: InformationSection[] }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[230px_1fr] lg:gap-14">
      <nav aria-label="Nesta página" className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 lg:sticky lg:top-28">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Nesta página</h2>
        <ol className="space-y-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="flex min-h-11 gap-3 rounded-lg p-2 text-sm leading-relaxed text-on-surface-variant hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary">
                <span className="pt-0.5 text-xs font-semibold text-primary dark:text-primary-bright">{String(index + 1).padStart(2, "0")}</span>{section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 divide-y divide-outline-variant/40">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-28 py-8 first:pt-0 last:pb-0">
            <p className="mb-2 text-xs font-bold text-primary dark:text-primary-bright">{String(index + 1).padStart(2, "0")}</p>
            <h2 id={`${section.id}-title`} className="mb-4 font-headline text-xl font-bold tracking-tight text-on-surface sm:text-2xl">{section.title}</h2>
            <div className="space-y-4 text-sm leading-7 text-on-surface-variant sm:text-base">
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items && <ul className="list-disc space-y-3 pl-5 marker:text-primary dark:marker:text-primary-bright">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
