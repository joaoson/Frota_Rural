import { AxiosError } from "axios";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { machineService } from "@/services/MachineService/MachineService";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { userId } = useAuth();
  const [isBrandSelectOpen, setIsBrandSelectOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<(typeof BRANDS)[number]["value"]>("john-deere");
  const [otherBrand, setOtherBrand] = useState("");
  const [renagroNumber, setRenagroNumber] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [usagePurpose, setUsagePurpose] = useState("Plantio");
  const [initialHorimeter, setInitialHorimeter] = useState("");
  const [technicalSpecifications, setTechnicalSpecifications] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedBrandData = BRANDS.find((brand) => brand.value === selectedBrand) ?? BRANDS[0];

  const validateField = (fieldName: string, value: string) => {
    let errorMsg = "";
    switch (fieldName) {
      case "renagroNumber": {
        const cleaned = value.trim();
        if (!cleaned) {
          errorMsg = "Registro Renagro é obrigatório.";
        } else {
          const regex = /^BR\d{10}$/i;
          if (!regex.test(cleaned)) {
            errorMsg = "O registro Renagro deve conter BR seguido de exatamente 10 dígitos (ex: BR1029304899).";
          }
        }
        break;
      }
      case "brand":
        if (selectedBrand === "outra" && !value.trim()) {
          errorMsg = "Marca é obrigatória.";
        }
        break;
      case "model":
        if (!value.trim()) errorMsg = "Modelo é obrigatório.";
        break;
      case "year": {
        if (value) {
          const y = Number(value);
          const currentYear = new Date().getFullYear();
          if (Number.isNaN(y) || y < 1980 || y > currentYear + 1) {
            errorMsg = `O ano deve ser entre 1980 e ${currentYear + 1}.`;
          }
        }
        break;
      }
      case "initialHorimeter": {
        if (value) {
          const h = Number(value);
          if (Number.isNaN(h) || h < 0) {
            errorMsg = "O horímetro inicial deve ser um valor positivo.";
          }
        }
        break;
      }
    }
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const brandToSend = selectedBrand === "outra" ? otherBrand.trim() : selectedBrandData.label;

    const errorsList = {
      renagroNumber: validateField("renagroNumber", renagroNumber),
      brand: validateField("brand", otherBrand),
      model: validateField("model", model),
      year: validateField("year", year),
      initialHorimeter: validateField("initialHorimeter", initialHorimeter),
    };

    if (Object.values(errorsList).some((err) => err !== "")) {
      toast.error("Por favor, corrija os erros no formulário antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!userId) {
        toast.error("Usuário não autenticado. Faça login para cadastrar o equipamento.");
        return;
      }

      await machineService.create({
        owner: userId,
        renagro_number: renagroNumber.trim().toUpperCase(),
        brand: brandToSend,
        model: model.trim(),
        year: year ? Number(year) : undefined,
        technical_specifications: technicalSpecifications.trim(),
        usage_purpose: usagePurpose.trim(),
      });

      toast.success("Equipamento cadastrado com sucesso.");
      setRenagroNumber("");
      setSelectedBrand("john-deere");
      setOtherBrand("");
      setModel("");
      setYear("");
      setUsagePurpose("Plantio");
      setInitialHorimeter("");
      setTechnicalSpecifications("");
      setErrors({});
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data;
        if (data.renagro_number) {
          const message = "Este número Renagro já está cadastrado.";
          toast.error(message);
          setErrors((prev) => ({ ...prev, renagroNumber: message }));
          return;
        }
      }
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
          noValidate
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Nº Registro Renagro *</label>
            <input
              name="renagro_number"
              type="text"
              placeholder="BR1029304899"
              value={renagroNumber}
              onChange={(e) => {
                setRenagroNumber(e.target.value);
                if (errors.renagroNumber) validateField("renagroNumber", e.target.value);
              }}
              onBlur={(e) => validateField("renagroNumber", e.target.value)}
              className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.renagroNumber ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              required
            />
            {errors.renagroNumber ? (
              <p className="text-[11px] text-error font-medium mt-1">{errors.renagroNumber}</p>
            ) : (
              <p className="text-[11px] text-outline font-medium">Requisito para formalização do contrato na plataforma.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Marca *</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsBrandSelectOpen((prev) => !prev)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm text-on-surface transition-shadow focus:ring-2 focus:outline-none flex items-center justify-between gap-2 ${errors.brand ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
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
                          if (brand.value !== "outra") {
                            setErrors((prev) => ({ ...prev, brand: "" }));
                          }
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
                <>
                  <input
                    name="other_brand"
                    type="text"
                    placeholder="Digite a marca"
                    className={`w-full mt-2 bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.brand ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    value={otherBrand}
                    onChange={(e) => {
                      setOtherBrand(e.target.value);
                      if (errors.brand) validateField("brand", e.target.value);
                    }}
                    onBlur={(e) => validateField("brand", e.target.value)}
                    required
                  />
                  {errors.brand && <p className="text-[11px] text-error font-medium mt-1">{errors.brand}</p>}
                </>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Modelo *</label>
              <input
                name="model"
                type="text"
                placeholder="S700"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (errors.model) validateField("model", e.target.value);
                }}
                onBlur={(e) => validateField("model", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.model ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                required
              />
              {errors.model && <p className="text-[11px] text-error font-medium mt-1">{errors.model}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Ano de Fabricação</label>
              <input
                name="year"
                type="number"
                placeholder="2022"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  if (errors.year) validateField("year", e.target.value);
                }}
                onBlur={(e) => validateField("year", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.year ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              />
              {errors.year && <p className="text-[11px] text-error font-medium mt-1">{errors.year}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Finalidade de Uso</label>
              <select
                name="usage_purpose"
                value={usagePurpose}
                onChange={(e) => setUsagePurpose(e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              >
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
              value={initialHorimeter}
              onChange={(e) => {
                setInitialHorimeter(e.target.value);
                if (errors.initialHorimeter) validateField("initialHorimeter", e.target.value);
              }}
              onBlur={(e) => validateField("initialHorimeter", e.target.value)}
              className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.initialHorimeter ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
            />
            {errors.initialHorimeter && <p className="text-[11px] text-error font-medium mt-1">{errors.initialHorimeter}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Especificações Técnicas</label>
            <textarea
              name="technical_specifications"
              placeholder="Motor, plataforma, recursos adicionais..."
              rows={3}
              value={technicalSpecifications}
              onChange={(e) => setTechnicalSpecifications(e.target.value)}
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
