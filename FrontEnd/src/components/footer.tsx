import { Link } from "react-router";
import { Mail, Phone } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-[#1A2414] w-full py-16 border-t border-white/10">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-12">
          <div className="flex flex-col items-start gap-4 max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tracking-tight">Frota Rural</span>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              A plataforma que transforma maquinário parado em renda e garante que o campo nunca pare por falta de equipamento.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                <Mail className="w-4 h-4 text-white/60" />
              </div>
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                <Phone className="w-4 h-4 text-white/60" />
              </div>
            </div>
          </div>
          <div className="flex gap-16">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Plataforma</span>
              <Link to="/buscar" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Buscar equipamentos</Link>
              <Link to="/signup" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Anunciar frota</Link>
              <Link to="/login" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Entrar na conta</Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Legal</span>
              <Link to="#" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Termos de uso</Link>
              <Link to="#" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Privacidade</Link>
              <Link to="#" className="text-sm text-white/60 hover:text-[#F59E0B] transition-colors">Suporte</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/30">© 2026 Frota Rural. Todos os direitos reservados.</p>
          <p className="text-xs text-white/30">Conectando o agronegócio brasileiro com tecnologia e confiança.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
