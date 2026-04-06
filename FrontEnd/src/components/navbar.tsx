import { Link } from "react-router";

const Navbar = () => {
  return (
    <nav className="fixed top-0 w-full z-50 bg-white/50 backdrop-blur-md border-b border-white/20 shadow-sm">
      <div className="flex justify-between items-center max-w-[1200px] mx-auto px-6 h-20">
        <Link to="/" className="text-xl font-bold text-[#2D3F1E] tracking-tight">
          Frota Rural
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold">
          <Link to="/buscar" className="text-[#2D3F1E] border-b-2 border-[#F59E0B] pb-0.5 hover:text-[#F59E0B] transition-colors">
            Explorar Máquinas
          </Link>
          <Link to="/signup" className="text-gray-500 hover:text-[#2D3F1E] transition-colors">
            Anuncie seu Equipamento
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="px-4 py-2 text-sm font-semibold text-[#2D3F1E] hover:text-[#F59E0B] transition-colors">
            Entrar
          </Link>
          <Link to="/signup" className="bg-[#2D3F1E] text-white px-5 py-2 rounded-xl font-semibold text-sm hover:bg-[#1A2414] transition-colors shadow-sm">
            Criar Conta
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
