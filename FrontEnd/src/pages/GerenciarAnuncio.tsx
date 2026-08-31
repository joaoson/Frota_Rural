import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import MapaLocalizacao from "@/components/MapaLocalizacao";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { coordenadasDoAnuncio, postingService } from "@/services/PostingService/PostingService";
import type { Coordenadas } from "@/services/GeocodingService";
import { toast } from "sonner";
import { maskCEP } from "@/utils/masks/maskCEP";
import { fetchAddressByCEP, formatAddressFromCEP } from "@/services/ViaCEPService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const GerenciarAnuncio = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [posting, setPosting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("active");
  const [hourlyRate, setHourlyRate] = useState("");
  const [cep, setCep] = useState("");
  const [location, setLocation] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [maxReservationDays, setMaxReservationDays] = useState("");
  const [description, setDescription] = useState("");
  // Coordenadas já gravadas: poupam o mapa de geocodificar o mesmo endereço.
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    postingService
      .getById(id)
      .then((data) => {
        setPosting(data);
        setStatus(data.status || "active");
        setHourlyRate(data.hourly_rate ?? "");
        setLocation(data.location_address || "");
        // A API guarda só os dígitos; a máscara é aplicada na exibição.
        setCep(maskCEP(data.location_cep || ""));
        // As datas chegam como ISO completo; o input só aceita a parte da data.
        setAvailabilityStart(data.availability_start?.split("T")[0] || "");
        setAvailabilityEnd(data.availability_end?.split("T")[0] || "");
        setMaxReservationDays(data.max_reservation_days?.toString() || "");
        setDescription(data.description || "");
        if (data.location_lat != null && data.location_lng != null) {
          setCoordenadas({
            lat: Number(data.location_lat),
            lon: Number(data.location_lng),
            nomeExibicao: data.location_address || "",
          });
        }
      })
      .catch(() => {
        toast.error("Não foi possível carregar o anúncio.");
        navigate("/dashboard");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, navigate]);

  const hoje = new Date().toISOString().split("T")[0];
  const inicioGravado: string = posting?.availability_start?.split("T")[0] ?? "";
  const fimGravado: string = posting?.availability_end?.split("T")[0] ?? "";

  /**
   * Data mínima aceita para um campo de disponibilidade.
   *
   * Em regra é hoje, como no Novo Anúncio. A exceção é a data que já estava
   * gravada: a maioria dos anúncios existentes tem período vencido, e exigir
   * data futura trancaria a edição deles — nem pausar o anúncio seria possível.
   */
  const piso = (gravada: string) => (gravada && gravada < hoje ? gravada : hoje);
  const minFim = availabilityStart > piso(fimGravado) ? availabilityStart : piso(fimGravado);

  const validateField = (fieldName: string, value: string) => {
    let errorMsg = "";
    switch (fieldName) {
      case "hourlyRate": {
        const rate = Number(value.replace(",", "."));
        if (!value) {
          errorMsg = "Valor por hora é obrigatório.";
        } else if (Number.isNaN(rate) || rate <= 0) {
          errorMsg = "Informe um valor por hora maior que zero.";
        }
        break;
      }
      case "cep": {
        // CEP é opcional, mas pela metade a API recusa a atualização inteira.
        const digits = value.replace(/\D/g, "");
        if (digits.length > 0 && digits.length !== 8) {
          errorMsg = "CEP deve ter exatamente 8 dígitos.";
        }
        break;
      }
      case "location":
        if (!value.trim()) errorMsg = "Informe a localização.";
        break;
      case "availabilityStart":
        if (value && value < piso(inicioGravado)) {
          errorMsg = "A data de início não pode ser no passado.";
        }
        break;
      case "availabilityEnd":
        if (value) {
          if (value < piso(fimGravado)) {
            errorMsg = "A data final não pode ser no passado.";
          } else if (availabilityStart && value < availabilityStart) {
            errorMsg = "A data final deve ser igual ou posterior à data de início.";
          }
        }
        break;
      case "maxReservationDays":
        if (value && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
          errorMsg = "Informe um número inteiro de pelo menos 1 dia.";
        }
        break;
    }
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !id) return;

    const errorsList = {
      hourlyRate: validateField("hourlyRate", hourlyRate),
      cep: validateField("cep", cep),
      location: validateField("location", location),
      availabilityStart: validateField("availabilityStart", availabilityStart),
      availabilityEnd: validateField("availabilityEnd", availabilityEnd),
      maxReservationDays: validateField("maxReservationDays", maxReservationDays),
    };

    if (Object.values(errorsList).some((err) => err !== "")) {
      toast.error("Por favor, corrija os erros no formulário antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    try {
      await postingService.update(id, {
        hourly_rate: Number(hourlyRate.replace(",", ".")),
        location_cep: cep || undefined,
        location_address: location,
        ...coordenadasDoAnuncio(coordenadas),
        availability_start: availabilityStart
          ? `${availabilityStart}T00:00:00Z`
          : undefined,
        availability_end: availabilityEnd
          ? `${availabilityEnd}T23:59:59Z`
          : undefined,
        max_reservation_days: maxReservationDays ? Number(maxReservationDays) : null,
        description: description || undefined,
        status: status || undefined,
      });
      toast.success("Anúncio atualizado com sucesso.");
      navigate("/dashboard");
    } catch {
      toast.error("Erro ao atualizar o anúncio.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await postingService.delete(id);
      toast.success("Anúncio removido.");
      navigate("/dashboard");
    } catch {
      toast.error("Erro ao remover anúncio.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <MaterialIcon
          icon="sync"
          className="animate-spin text-primary mb-4"
          size={32}
        />
        <p className="text-on-surface-variant font-medium">Carregando anúncio...</p>
      </div>
    );
  }

  const getMachineName = () => {
    if (!posting) return "";
    // A API devolve machine_brand/machine_model (PostingDetailSerializer);
    // não existe machinery_details, e o subtítulo saía vazio.
    return (
      [posting.machine_brand, posting.machine_model].filter(Boolean).join(" ") ||
      "Maquinário"
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 max-w-[1000px] mx-auto px-6 w-full">
        <Link
          to="/dashboard"
          className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1"
        >
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-2/3">
            <div className="mb-8">
              <h1 className="font-headline text-3xl font-bold text-primary mb-1">
                Gerenciar Anúncio
              </h1>
              <div className="h-1 w-16 bg-secondary-container mb-3" />
              <p className="text-on-surface-variant text-sm">
                Atualize as informações de locação para{" "}
                <strong className="text-on-surface">{getMachineName()}</strong>
              </p>
            </div>

            <form
              className="space-y-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-8 shadow-sm"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Status do Anúncio
                </label>
                <select
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-surface-container border border-transparent rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none text-on-surface transition-shadow"
                >
                  <option value="active">Ativo (Visível para busca)</option>
                  <option value="inactive">Pausado (Oculto)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Valor por Hora (R$) *
                </label>
                <input
                  name="hourly_rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={hourlyRate}
                  onChange={(e) => {
                    setHourlyRate(e.target.value);
                    if (errors.hourlyRate) validateField("hourlyRate", e.target.value);
                  }}
                  onBlur={(e) => validateField("hourlyRate", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.hourlyRate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.hourlyRate && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.hourlyRate}</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    CEP
                  </label>
                  <input
                    type="text"
                    placeholder="00000-000"
                    value={cep}
                    onChange={async (e) => {
                      const masked = maskCEP(e.target.value);
                      setCep(masked);
                      setCoordenadas(null);
                      if (errors.cep) validateField("cep", masked);
                      const digits = masked.replace(/\D/g, "");
                      if (digits.length === 8) {
                        try {
                          const data = await fetchAddressByCEP(digits);
                          if (data) {
                            setLocation(formatAddressFromCEP(data, "municipio"));
                            if (errors.location) setErrors((prev) => ({ ...prev, location: "" }));
                          } else {
                            toast.error("CEP não encontrado.");
                          }
                        } catch (error) {
                          console.error("Erro ao buscar CEP", error);
                        }
                      }
                    }}
                    onBlur={(e) => validateField("cep", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.cep ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  />
                  {errors.cep && (
                    <p className="text-[11px] text-error font-medium mt-1">{errors.cep}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Localização *
                  </label>
                  <input
                    name="location_address"
                    type="text"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setCoordenadas(null);
                      if (errors.location) validateField("location", e.target.value);
                    }}
                    onBlur={(e) => validateField("location", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.location ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  {errors.location && (
                    <p className="text-[11px] text-error font-medium mt-1">{errors.location}</p>
                  )}
                </div>
              </div>

              <MapaLocalizacao
                endereco={location}
                cep={cep}
                coordenadas={coordenadas}
                onCoordenadas={setCoordenadas}
              />

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Disponível a partir de
                  </label>
                  <input
                    name="availability_start"
                    type="date"
                    min={piso(inicioGravado)}
                    value={availabilityStart}
                    onChange={(e) => {
                      setAvailabilityStart(e.target.value);
                      if (errors.availabilityStart)
                        validateField("availabilityStart", e.target.value);
                    }}
                    onBlur={(e) => validateField("availabilityStart", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.availabilityStart ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  />
                  {errors.availabilityStart && (
                    <p className="text-[11px] text-error font-medium mt-1">
                      {errors.availabilityStart}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Disponível até
                  </label>
                  <input
                    name="availability_end"
                    type="date"
                    min={minFim}
                    value={availabilityEnd}
                    onChange={(e) => {
                      setAvailabilityEnd(e.target.value);
                      if (errors.availabilityEnd)
                        validateField("availabilityEnd", e.target.value);
                    }}
                    onBlur={(e) => validateField("availabilityEnd", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.availabilityEnd ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  />
                  {errors.availabilityEnd && (
                    <p className="text-[11px] text-error font-medium mt-1">
                      {errors.availabilityEnd}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Máximo de dias por reserva
                </label>
                <input
                  name="max_reservation_days"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Sem limite"
                  value={maxReservationDays}
                  onChange={(e) => {
                    setMaxReservationDays(e.target.value);
                    if (errors.maxReservationDays) validateField("maxReservationDays", e.target.value);
                  }}
                  onBlur={(e) => validateField("maxReservationDays", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.maxReservationDays ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                />
                <p className="text-[11px] text-outline">Opcional. Deixe vazio para não limitar a duração das reservas.</p>
                {errors.maxReservationDays && <p className="text-[11px] text-error font-medium mt-1">{errors.maxReservationDays}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Descrição
                </label>
                <textarea
                  name="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                />
              </div>

              <div className="pt-4 border-t border-outline-variant/30 flex justify-end gap-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="px-6 py-3.5 text-sm font-bold rounded-lg border-2 border-error/50 text-error hover:bg-error/10 transition-colors"
                    >
                      Excluir Anúncio
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir anúncio?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O anúncio será removido
                        e não aparecerá mais nos resultados de busca. As
                        locações em andamento não serão afetadas.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-error hover:bg-error/90 text-on-error"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-3.5 text-sm font-bold rounded-lg bg-primary text-on-primary hover:shadow-lg transition-all disabled:opacity-60 flex items-center gap-2"
                >
                  <MaterialIcon icon="save" size={18} />
                  {isSubmitting ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>

          <div className="lg:w-1/3">
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-sm sticky top-32">
              <h3 className="font-headline font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <MaterialIcon icon="analytics" className="text-primary" />
                Estatísticas (Últimos 30 dias)
              </h3>
              <div className="space-y-5">
                <div className="flex justify-between items-center pb-5 border-b border-outline-variant/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                      <MaterialIcon
                        icon="visibility"
                        className="text-outline"
                        size={20}
                      />
                    </div>
                    <span className="text-sm text-on-surface-variant font-bold">
                      Visualizações
                    </span>
                  </div>
                  <span className="font-black text-on-surface text-lg">
                    1.245
                  </span>
                </div>
                <div className="flex justify-between items-center pb-5 border-b border-outline-variant/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                      <MaterialIcon
                        icon="event_available"
                        className="text-outline"
                        size={20}
                      />
                    </div>
                    <span className="text-sm text-on-surface-variant font-bold">
                      Locações
                    </span>
                  </div>
                  <span className="font-black text-on-surface text-lg">14</span>
                </div>
                <div className="flex justify-between items-center pb-5 border-b border-outline-variant/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                      <MaterialIcon
                        icon="star"
                        className="text-secondary-container"
                        size={20}
                        filled
                      />
                    </div>
                    <span className="text-sm text-on-surface-variant font-bold">
                      Avaliação Média
                    </span>
                  </div>
                  <span className="font-black text-on-surface text-lg">4.8</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MaterialIcon
                        icon="payments"
                        className="text-primary"
                        size={20}
                      />
                    </div>
                    <span className="text-sm text-primary font-bold">
                      Receita Gerada
                    </span>
                  </div>
                  <span className="font-black text-primary text-xl">
                    R$ 18.400
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default GerenciarAnuncio;
