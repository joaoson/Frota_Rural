import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ArrowUpRight, ChevronRight, Sprout } from "lucide-react";

import Capybara, { type CapybaraPose } from "@/shared/components/Capybara";
import { PageShell } from "@/shared/components/PageShell";

interface InformationLayoutProps {
  eyebrow: string;
  title: string;
  breadcrumbLabel?: string;
  description: string;
  pose?: CapybaraPose;
  mascotMessage: string;
  children: ReactNode;
}

export function InformationLayout({ eyebrow, title, breadcrumbLabel = title, description, pose = "welcome", mascotMessage, children }: InformationLayoutProps) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const section = hash ? document.getElementById(hash.slice(1)) : null;
    if (section) section.scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return (
    <PageShell width="extraWide">
      <main id="conteudo" className="space-y-10 sm:space-y-14">
        <nav aria-label="Navegação estrutural" className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Link to="/" className="rounded hover:text-primary dark:hover:text-primary-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Início</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{breadcrumbLabel}</span>
        </nav>

        <header className="relative overflow-hidden rounded-[2rem] border border-outline-variant/40 bg-surface-container-low">
          <div className="grid items-center gap-3 md:grid-cols-[1.25fr_1fr]">
            <div className="px-6 pt-8 sm:px-10 sm:pt-12 md:py-12 lg:pl-12">
              <p className="mb-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary dark:text-primary-bright">
                <Sprout size={16} aria-hidden="true" /> {eyebrow}
              </p>
              <h1 className="max-w-xl font-headline text-4xl font-black leading-[1.08] tracking-tight text-primary dark:text-primary-bright sm:text-5xl">{title}</h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-on-surface-variant sm:text-lg">{description}</p>
            </div>
            <div className="relative mx-auto flex w-full max-w-[330px] flex-col items-center px-6 pb-6 pt-3 md:pt-7">
              <div aria-hidden="true" className="absolute left-1/2 top-14 h-52 w-52 -translate-x-1/2 rounded-full bg-secondary-container/20" />
              <Capybara pose={pose} className="relative w-full max-w-[260px]" />
              <p className="relative -mt-1 rounded-2xl rounded-tl-sm border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-center text-xs font-semibold leading-relaxed text-on-surface-variant">{mascotMessage}</p>
            </div>
          </div>
        </header>

        {children}

        <nav aria-label="Informações da plataforma" className="flex flex-wrap gap-x-6 gap-y-4 border-t border-outline-variant/40 pt-6 text-sm font-semibold text-primary dark:text-primary-bright">
          {[{ to: "/help", label: "Central de ajuda" }, { to: "/termos-de-uso", label: "Termos de uso" }, { to: "/privacidade", label: "Privacidade" }].map(({ to, label }) => (
            <Link key={to} to={to} aria-current={pathname === to ? "page" : undefined} className="inline-flex min-h-10 items-center gap-2 rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              {label}<ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </main>
    </PageShell>
  );
}
