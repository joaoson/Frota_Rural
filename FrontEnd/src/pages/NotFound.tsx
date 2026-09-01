import { Link } from "react-router";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";

/** Rota curinga. Antes, uma URL inexistente renderizava uma tela em branco. */
const NotFound = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <Navbar />
    <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
          <MaterialIcon icon="explore_off" size={32} />
        </div>
        <h1 className="font-headline text-3xl font-bold text-primary">Página não encontrada</h1>
        <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
        <p className="text-sm text-on-surface-variant mt-4">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <Link
          to="/"
          className="inline-block mt-8 text-sm font-bold text-primary hover:underline"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
    <Footer />
  </div>
);

export default NotFound;
