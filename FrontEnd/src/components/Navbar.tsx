import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import MaterialIcon from "@/components/MaterialIcon";

const Navbar = () => {
  const { isAuthenticated, userRole, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDashboardLink = () => {
    if (userRole === "locatario") return "/dashboard-locatario";
    if (userRole === "admin") return "/admin";
    return "/dashboard";
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-md shadow-sm">
      <div className="flex justify-between items-center max-w-[1200px] mx-auto px-6 h-20">
        <Link to="/" className="text-2xl font-black text-primary tracking-tighter font-headline">
          Frota Rural
        </Link>
        <div className="hidden md:flex items-center gap-8 font-headline font-bold text-sm tracking-tight">
          <Link
            to="/buscar-maquinario"
            className="text-primary border-b-2 border-primary pb-1 hover:text-primary-container transition-colors duration-200"
          >
            Explorar Máquinas
          </Link>
          <Link
            to="/dashboard/novo-equipamento"
            className="text-tertiary font-medium hover:text-primary-container transition-colors duration-200"
          >
            Anuncie seu Equipamento
          </Link>
        </div>
        
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
              >
                <MaterialIcon icon="person" size={24} />
              </button>
              
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-lg overflow-hidden py-2 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2 border-b border-outline-variant/30 mb-2">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider">Sua Conta</p>
                  </div>
                  <Link
                    to={getDashboardLink()}
                    onClick={() => setDropdownOpen(false)}
                    className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container flex items-center gap-2 transition-colors"
                  >
                    <MaterialIcon icon="dashboard" size={18} /> Dashboard
                  </Link>
                  {userRole !== "admin" && (
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        window.location.href = `${getDashboardLink()}?tab=conta`;
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container flex items-center gap-2 transition-colors"
                    >
                      <MaterialIcon icon="settings" size={18} /> Configurações
                    </button>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10 flex items-center gap-2 transition-colors mt-1"
                  >
                    <MaterialIcon icon="logout" size={18} /> Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="px-5 py-2.5 text-sm font-bold text-primary hover:text-primary-container transition-colors">
                Entrar
              </Link>
              <Link
                to="/signup"
                className="bg-primary-container text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-sm"
              >
                Criar Conta
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
