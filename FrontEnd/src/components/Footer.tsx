import { Link } from "react-router";
import { ArrowUpRight, LifeBuoy } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { homeRouteForRole } from "@/shared/utils/homeRoute";

const FOOTER_LINK = "w-fit rounded font-body text-sm text-inverse-on-surface/75 transition-colors hover:text-inverse-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-inverse-primary";

export default function Footer() {
  const { isAuthenticated, userRole } = useAuth();
  const canAdvertise = !isAuthenticated || userRole === "locador" || userRole === "admin";

  return (
    <footer className="w-full border-t border-outline-variant/15 bg-inverse-surface py-12 sm:py-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-12 flex flex-col justify-between gap-10 md:flex-row md:gap-12">
          <div className="flex max-w-md flex-col items-start gap-4">
            <Link to="/" className="rounded font-headline text-2xl font-black tracking-tighter text-inverse-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-inverse-primary">Frota Rural</Link>
            <p className="font-body text-sm leading-relaxed text-inverse-on-surface/75">A plataforma que transforma maquinário parado em renda e garante que o campo nunca pare por falta de equipamento.</p>
            <Link to="/help" className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border border-inverse-on-surface/20 px-4 py-2 text-sm font-semibold text-inverse-on-surface transition-colors hover:bg-inverse-on-surface/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-inverse-primary">
              <LifeBuoy size={17} aria-hidden="true" /> Precisa de uma mão? <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:gap-12 lg:gap-20">
            <nav aria-label="Plataforma" className="flex flex-col gap-4">
              <h2 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-inverse-on-surface/60">Plataforma</h2>
              <Link to="/buscar-maquinario" className={FOOTER_LINK}>Buscar equipamentos</Link>
              {canAdvertise && <Link to="/dashboard/novo-equipamento" className={FOOTER_LINK}>Anunciar frota</Link>}
              <Link to={isAuthenticated ? homeRouteForRole(userRole) : "/login"} className={FOOTER_LINK}>{isAuthenticated ? "Meu painel" : "Entrar na conta"}</Link>
            </nav>
            <nav aria-label="Informações e suporte" className="flex flex-col gap-4">
              <h2 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-inverse-on-surface/60">Informações</h2>
              <Link to="/termos-de-uso" className={FOOTER_LINK}>Termos de uso</Link>
              <Link to="/privacidade" className={FOOTER_LINK}>Privacidade</Link>
              <Link to="/help" className={FOOTER_LINK}>Suporte</Link>
            </nav>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-inverse-on-surface/15 pt-6 text-center md:flex-row md:text-left">
          <p className="font-body text-xs text-inverse-on-surface/60">© {new Date().getFullYear()} Frota Rural. Todos os direitos reservados.</p>
          <p className="font-body text-xs text-inverse-on-surface/60">Conectando o agronegócio brasileiro com tecnologia e confiança.</p>
        </div>
      </div>
    </footer>
  );
}
