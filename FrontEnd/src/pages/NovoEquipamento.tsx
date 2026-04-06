import { useState } from "react";
import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const BRANDS = [
  { value: "john-deere", label: "John Deere", logo: "/brands/john-deere.png" },
  { value: "massey-ferguson", label: "Massey Ferguson", logo: "/brands/massey-ferguson.png" },
  { value: "new-holland", label: "New Holland", logo: "/brands/new-holland.png" },
  { value: "valtra", label: "Valtra", logo: "/brands/valtra.png" },
  { value: "outra", label: "Outra", logo: "" },
] as const;

const BrandLogo = ({ logo, label }: { logo: string; label: string }) => {
  const [hasError, setHasError] = useState(false);

  if (!logo || hasError) {
    return (
      <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-[10px] font-bold">
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }

  return <img src={logo} alt={label} className="w-5 h-5 rounded-full object-cover" onError={() => setHasError(true)} />;
};

const NovoEquipamento = () => {
  const [isBrandSelectOpen, setIsBrandSelectOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<(typeof BRANDS)[number]["value"]>("john-deere");
  const selectedBrandData = BRANDS.find((brand) => brand.value === selectedBrand) ?? BRANDS[0];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 max-w-2xl mx-auto px-6 w-full">
        <Link to="/dashboard" className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1">
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        <div className="mb-10">
          <h1 className="font-headline text-3xl font-bold text-primary mb-1">Novo Equipamento</h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">Cadastre uma nova máquina na sua frota</p>
        </div>

        <form
          className="space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-10 shadow-sm"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Nº Registro Renagro *</label>
            <input
              type="text"
              placeholder="BR1029304899"
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
            <p className="text-[11px] text-outline font-medium">Requisito para formalização do contrato na plataforma.</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Marca *</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsBrandSelectOpen((prev) => !prev)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm text-on-surface transition-shadow focus:ring-2 focus:ring-primary flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <BrandLogo logo={selectedBrandData.logo} label={selectedBrandData.label} />
                    {selectedBrandData.label}
                  </span>
                  <MaterialIcon icon={isBrandSelectOpen ? "expand_less" : "expand_more"} size={18} />
                </button>

                {isBrandSelectOpen ? (
                  <div className="absolute z-10 mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg shadow-lg p-1">
                    {BRANDS.map((brand) => (
                      <button
                        key={brand.value}
                        type="button"
                        onClick={() => {
                          setSelectedBrand(brand.value);
                          setIsBrandSelectOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left rounded-md hover:bg-surface-container transition-colors text-sm text-on-surface flex items-center gap-2"
                      >
                        <BrandLogo logo={brand.logo} label={brand.label} />
                        {brand.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {selectedBrand === "outra" ? (
                <input
                  type="text"
                  placeholder="Digite a marca"
                  className="w-full mt-2 bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Modelo *</label>
              <input
                type="text"
                placeholder="S700"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Ano de Fabricação</label>
              <input
                type="number"
                placeholder="2022"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Finalidade de Uso</label>
              <select className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow">
                <option>Plantio</option>
                <option>Pulverização</option>
                <option>Colheita</option>
                <option>Preparo de Solo</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline flex items-center gap-1">
              <MaterialIcon icon="speed" size={14} /> Horím. Inicial
            </label>
            <input
              type="number"
              placeholder="1250 h"
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Especificações Técnicas</label>
            <textarea
              placeholder="Motor, plataforma, recursos adicionais..."
              rows={3}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
          >
            <MaterialIcon icon="agriculture" size={20} /> Cadastrar Equipamento
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoEquipamento;
