import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";

const Footer = () => {
  return (
    <footer className="bg-inverse-surface w-full py-16 border-t border-outline-variant/15">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-12">
          <div className="flex flex-col items-start gap-4 max-w-md">
            <span className="font-headline text-2xl font-black tracking-tighter text-secondary-container">
              Frota Rural
            </span>
            <p className="font-body text-sm text-inverse-on-surface/70 leading-relaxed">
              A plataforma que transforma maquinário parado em renda e garante que o campo nunca pare por falta de
              equipamento.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-9 h-9 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-inverse-on-surface/20 transition-colors cursor-pointer">
                <MaterialIcon icon="mail" className="text-inverse-on-surface/70" size={18} />
              </div>
              <div className="w-9 h-9 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-inverse-on-surface/20 transition-colors cursor-pointer">
                <MaterialIcon icon="phone" className="text-inverse-on-surface/70" size={18} />
              </div>
            </div>
          </div>
          <div className="flex gap-16">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-inverse-on-surface/50 uppercase tracking-widest mb-1">
                Plataforma
              </span>
              <Link
                to="/buscar-maquinario"
                className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors"
              >
                Buscar equipamentos
              </Link>
              <Link
                to="/dashboard/novo-equipamento"
                className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors"
              >
                Anunciar frota
              </Link>
              <Link
                to="/login"
                className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors"
              >
                Entrar na conta
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-inverse-on-surface/50 uppercase tracking-widest mb-1">
                Legal
              </span>
              <Link to="#" className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors">
                Termos de uso
              </Link>
              <Link to="#" className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors">
                Privacidade
              </Link>
              <Link to="/help" className="font-body text-sm text-inverse-on-surface/70 hover:text-inverse-primary transition-colors">
                Suporte
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-inverse-on-surface/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="font-body text-xs text-inverse-on-surface/40">© 2026 Frota Rural. Todos os direitos reservados.</p>
          <p className="font-body text-xs text-inverse-on-surface/40">
            Conectando o agronegócio brasileiro com tecnologia e confiança.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
