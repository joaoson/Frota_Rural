import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { machineService } from "@/services/MachineService/MachineService";
import { toast } from "sonner";

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
  const [otherBrand, setOtherBrand] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedBrandData = BRANDS.find((brand) => brand.value === selectedBrand) ?? BRANDS[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const brandToSend = selectedBrand === "outra" ? otherBrand.trim() : selectedBrandData.label;
    if (!brandToSend) {
      toast.error("Informe a marca do equipamento.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ownerId = await machineService.getRandomOwnerId();
      if (!ownerId) {
        toast.error("Nenhum usuário encontrado para vincular o equipamento. Crie um usuário e tente novamente.");
        return;
      }

      await machineService.create({
        owner: ownerId,
        renagro_number: String(formData.get("renagro_number") ?? "").trim(),
        brand: brandToSend,
        model: String(formData.get("model") ?? "").trim(),
        year: formData.get("year") ? Number(formData.get("year")) : undefined,
        technical_specifications: String(formData.get("technical_specifications") ?? "").trim(),
        usage_purpose: String(formData.get("usage_purpose") ?? "").trim(),
      });

      toast.success("Equipamento cadastrado com sucesso.");
      form.reset();
      setSelectedBrand("john-deere");
      setOtherBrand("");
    } catch {
      toast.error("Erro ao cadastrar equipamento. Verifique os dados e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Nº Registro Renagro *</label>
            <input
              name="renagro_number"
              type="text"
              placeholder="BR1029304899"
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              required
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
                  name="other_brand"
                  type="text"
                  placeholder="Digite a marca"
                  className="w-full mt-2 bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  value={otherBrand}
                  onChange={(e) => setOtherBrand(e.target.value)}
                  required
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Modelo *</label>
              <input
                name="model"
                type="text"
                placeholder="S700"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Ano de Fabricação</label>
              <input
                name="year"
                type="number"
                placeholder="2022"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Finalidade de Uso</label>
              <select name="usage_purpose" className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow">
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
              name="technical_specifications"
              placeholder="Motor, plataforma, recursos adicionais..."
              rows={3}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
          >
            <MaterialIcon icon="agriculture" size={20} /> {isSubmitting ? "Cadastrando..." : "Cadastrar Equipamento"}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoEquipamento;
