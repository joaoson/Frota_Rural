import { Link } from "react-router";

const Navbar = () => {
  return (
    <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-md shadow-sm">
      <div className="flex justify-between items-center max-w-[1200px] mx-auto px-6 h-20">
        <Link to="/" className="text-2xl font-black text-primary tracking-tighter font-headline">
          Frota Rural
        </Link>
        <div className="hidden md:flex items-center gap-8 font-headline font-bold text-sm tracking-tight">
          <Link
            to="/buscar"
            className="text-primary border-b-2 border-primary pb-1 hover:text-primary-container transition-colors duration-200"
          >
            Explorar Máquinas
          </Link>
          <Link
            to="/novo-equipamento"
            className="text-tertiary font-medium hover:text-primary-container transition-colors duration-200"
          >
            Anuncie seu Equipamento
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="px-5 py-2.5 text-sm font-bold text-primary hover:text-primary-container transition-colors">
            Entrar
          </Link>
          <Link
            to="/signup"
            className="bg-primary-container text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-sm"
          >
            Criar Conta
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
