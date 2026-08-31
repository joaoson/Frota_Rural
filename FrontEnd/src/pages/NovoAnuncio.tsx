import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import MapaLocalizacao from "@/components/MapaLocalizacao";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { machineService, type MachineListItem } from "@/services/MachineService/MachineService";
import { coordenadasDoAnuncio, postingService } from "@/services/PostingService/PostingService";
import type { Coordenadas } from "@/services/GeocodingService";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { maskCEP } from "@/utils/masks/maskCEP";
import { fetchAddressByCEP, formatAddressFromCEP } from "@/services/ViaCEPService";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT_TYPES = ["image/jpeg", "image/png"];

type SelectedPhoto = {
  id: string;
  file: File;
  /** Object URL usado só para o preview local; revogado ao remover/desmontar. */
  previewUrl: string;
};

const NovoAnuncio = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [machines, setMachines] = useState<MachineListItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [machinery, setMachinery] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [cep, setCep] = useState("");
  const [location, setLocation] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [maxReservationDays, setMaxReservationDays] = useState("");
  const [description, setDescription] = useState("");
  // Guardadas no anúncio para o mapa não ter de geocodificar a cada exibição.
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Mantém a lista atual acessível ao cleanup de desmontagem sem reexecutá-lo.
  const photosRef = useRef<SelectedPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMachines(true);
      try {
        const data = await machineService.list({ status: "active", owner: userId || undefined });
        if (!cancelled) setMachines(data);
      } catch {
        if (!cancelled) {
          toast.error("Não foi possível carregar os equipamentos.");
          setMachines([]);
        }
      } finally {
        if (!cancelled) setLoadingMachines(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hoje = new Date().toISOString().split("T")[0];

  const validateField = (fieldName: string, value: string) => {
    let errorMsg = "";
    switch (fieldName) {
      case "machinery":
        if (!value) errorMsg = "Selecione um equipamento da frota.";
        break;
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
        // O CEP é opcional no anúncio, mas pela metade a API recusa o anúncio
        // inteiro — melhor barrar aqui, ao lado do campo.
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
        if (value && value < hoje) {
          errorMsg = "A data de início não pode ser no passado.";
        }
        break;
      case "availabilityEnd":
        if (value) {
          if (value < hoje) {
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

  const addFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;

    // O FileList é vivo: o `input.value = ""` do onChange o esvazia. Por isso a
    // cópia é feita agora, de forma síncrona, e não dentro do updater do estado
    // (que só roda na renderização, quando a lista já estaria vazia).
    const incoming = Array.from(files);

    const accepted: SelectedPhoto[] = [];
    for (const file of incoming) {
      if (!ACCEPT_TYPES.includes(file.type)) {
        toast.error("Use apenas JPG ou PNG.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" excede 5MB.`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted]);
    }
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    const target = photosRef.current.find((photo) => photo.id === photoId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  }, []);

  // A capa é sempre a primeira da lista — promover é só reordenar.
  const makeCover = useCallback((photoId: string) => {
    setPhotos((prev) => {
      const index = prev.findIndex((photo) => photo.id === photoId);
      if (index <= 0) return prev;
      const next = [...prev];
      const [chosen] = next.splice(index, 1);
      next.unshift(chosen);
      return next;
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errorsList = {
      machinery: validateField("machinery", machinery),
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

    const rate = Number(hourlyRate.replace(",", "."));

    setIsSubmitting(true);
    try {
      const posting = await postingService.create({
        machinery: machinery,
        hourly_rate: rate,
        location_cep: cep || undefined,
        location_address: location,
        ...coordenadasDoAnuncio(coordenadas),
        availability_start: availabilityStart ? `${availabilityStart}T00:00:00Z` : undefined,
        availability_end: availabilityEnd ? `${availabilityEnd}T23:59:59Z` : undefined,
        max_reservation_days: maxReservationDays ? Number(maxReservationDays) : null,
        description: description || undefined,
      });


      if (photos.length > 0 && posting?.id) {
        setUploadingPhotos(true);
        const { failed } = await postingService.uploadPhotos(
          posting.id,
          photos.map((photo) => photo.file),
        );
        if (failed === 0) {
          toast.success("Anúncio publicado com as fotos.");
        } else if (failed < photos.length) {
          toast.warning(
            `Anúncio publicado, mas ${failed} de ${photos.length} fotos não foram enviadas.`,
          );
        } else {
          toast.warning("Anúncio publicado, mas as fotos não puderam ser enviadas.");
        }
      } else {
        toast.success("Anúncio publicado.");
      }

      setMachinery("");
      setHourlyRate("");
      setCep("");
      setLocation("");
      setCoordenadas(null);
      setAvailabilityStart("");
      setAvailabilityEnd("");
      setMaxReservationDays("");
      setDescription("");
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPhotos([]);
      navigate("/dashboard");
    } catch {
      toast.error("Erro ao publicar anúncio. Verifique os dados e tente novamente.");
    } finally {
      setUploadingPhotos(false);
      setIsSubmitting(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 max-w-2xl mx-auto px-6 w-full">
        <Link to="/dashboard" className="text-sm font-bold text-primary dark:text-primary-bright hover:underline mb-8 inline-flex items-center gap-1">
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        <div className="mb-10">
          <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright mb-1">Novo Anúncio</h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">Publique seu equipamento para locação</p>
        </div>

        <form
          className="space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-10 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Equipamento da Frota *</label>
            <select
              name="machinery"
              value={machinery}
              onChange={(e) => {
                setMachinery(e.target.value);
                if (errors.machinery) validateField("machinery", e.target.value);
              }}
              onBlur={(e) => validateField("machinery", e.target.value)}
              className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow disabled:opacity-60 ${errors.machinery ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              required
              disabled={loadingMachines}
            >
              <option value="">
                {loadingMachines ? "Carregando..." : "Selecione um equipamento"}
              </option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.model} — {m.renagro_number}
                </option>
              ))}
            </select>
            {errors.machinery && <p className="text-[11px] text-error font-medium mt-1">{errors.machinery}</p>}
            {!loadingMachines && machines.length === 0 ? (
              <p className="text-[11px] text-outline font-medium">
                Nenhum equipamento ativo.{" "}
                <Link to="/dashboard/novo-equipamento" className="text-primary dark:text-primary-bright font-bold hover:underline">
                  Cadastre um equipamento
                </Link>{" "}
                primeiro.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Valor por Hora (R$) *</label>
            <input
              name="hourly_rate"
              type="number"
              min={0}
              step="0.01"
              placeholder="480"
              value={hourlyRate}
              onChange={(e) => {
                setHourlyRate(e.target.value);
                if (errors.hourlyRate) validateField("hourlyRate", e.target.value);
              }}
              onBlur={(e) => validateField("hourlyRate", e.target.value)}
              className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.hourlyRate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              required
            />
            {errors.hourlyRate && <p className="text-[11px] text-error font-medium mt-1">{errors.hourlyRate}</p>}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">CEP</label>
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
                        const newLoc = formatAddressFromCEP(data, "municipio");
                        setLocation(newLoc);
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
              {errors.cep && <p className="text-[11px] text-error font-medium mt-1">{errors.cep}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Localização *</label>
              <input
                name="location_address"
                type="text"
                placeholder="Sorriso, MT"
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
              {errors.location && <p className="text-[11px] text-error font-medium mt-1">{errors.location}</p>}
            </div>
            <MapaLocalizacao
              endereco={location}
              cep={cep}
              coordenadas={coordenadas}
              onCoordenadas={setCoordenadas}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Disponível a partir de</label>
              <input
                name="availability_start"
                type="date"
                min={hoje}
                value={availabilityStart}
                onChange={(e) => {
                  setAvailabilityStart(e.target.value);
                  if (errors.availabilityStart) validateField("availabilityStart", e.target.value);
                }}
                onBlur={(e) => validateField("availabilityStart", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.availabilityStart ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              />
              {errors.availabilityStart && <p className="text-[11px] text-error font-medium mt-1">{errors.availabilityStart}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Disponível até</label>
              <input
                name="availability_end"
                type="date"
                min={availabilityStart || hoje}
                value={availabilityEnd}
                onChange={(e) => {
                  setAvailabilityEnd(e.target.value);
                  if (errors.availabilityEnd) validateField("availabilityEnd", e.target.value);
                }}
                onBlur={(e) => validateField("availabilityEnd", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.availabilityEnd ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              />
              {errors.availabilityEnd && <p className="text-[11px] text-error font-medium mt-1">{errors.availabilityEnd}</p>}
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
            <p className="text-[11px] text-outline">Opcional. Ex.: informe 7 para permitir reservas de até 7 dias. Deixe vazio para não limitar.</p>
            {errors.maxReservationDays && <p className="text-[11px] text-error font-medium mt-1">{errors.maxReservationDays}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Descrição</label>
            <textarea
              name="description"
              placeholder="Detalhes sobre o equipamento e condições..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Fotos do Anúncio (Opcional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={openFilePicker}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addFiles(e.dataTransfer.files);
              }}
              className="w-full border-2 border-dashed border-outline-variant/60 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
            >
              <MaterialIcon icon="upload_file" className="text-outline group-hover:text-primary dark:group-hover:text-primary-bright transition-colors mb-2" size={40} />
              <div className="font-bold text-tertiary text-sm">Arraste fotos ou clique para selecionar</div>
              <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">JPG, PNG — Max 5MB por foto</div>
            </button>
            {photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3">
                {photos.map((photo, index) => (
                  <li
                    key={photo.id}
                    className="relative group rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container"
                  >
                    <img
                      src={photo.previewUrl}
                      alt={photo.file.name}
                      className="w-full h-24 object-cover"
                    />
                    {index === 0 ? (
                      <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-primary text-on-primary text-[9px] font-bold uppercase tracking-widest rounded">
                        Capa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeCover(photo.id)}
                        className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-surface-container-lowest/90 text-primary text-[9px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        Tornar capa
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remover ${photo.file.name}`}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest/90 text-error flex items-center justify-center shadow hover:bg-surface-container-lowest transition"
                    >
                      <MaterialIcon icon="close" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[10px] text-outline leading-relaxed">
              A primeira foto é a capa exibida na busca — passe o mouse sobre outra para promovê-la.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loadingMachines || machines.length === 0}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
          >
            <MaterialIcon icon="publish" size={20} />{" "}
            {uploadingPhotos
              ? "Enviando fotos..."
              : isSubmitting
                ? "Publicando..."
                : "Publicar Anúncio"}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoAnuncio;
