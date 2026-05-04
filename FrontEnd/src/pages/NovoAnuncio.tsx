import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { machineService, type MachineListItem } from "@/services/MachineService/MachineService";
import { postingService } from "@/services/PostingService/PostingService";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT_TYPES = ["image/jpeg", "image/png"];

const NovoAnuncio = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [machines, setMachines] = useState<MachineListItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const addFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setPhotoFiles((prev) => {
      const next = [...prev];
      for (const file of Array.from(files)) {
        if (!ACCEPT_TYPES.includes(file.type)) {
          toast.error("Use apenas JPG ou PNG.");
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`"${file.name}" excede 5MB.`);
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const machineryId = String(formData.get("machinery") ?? "").trim();
    const hourlyRaw = String(formData.get("hourly_rate") ?? "").trim();
    const location = String(formData.get("location_address") ?? "").trim();
    const availabilityStart = String(formData.get("availability_start") ?? "").trim();
    const availabilityEnd = String(formData.get("availability_end") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!machineryId) {
      toast.error("Selecione um equipamento da frota.");
      return;
    }
    const hourlyRate = Number(hourlyRaw.replace(",", "."));
    if (!hourlyRaw || Number.isNaN(hourlyRate) || hourlyRate <= 0) {
      toast.error("Informe um valor por hora válido.");
      return;
    }
    if (!location) {
      toast.error("Informe a localização.");
      return;
    }
    setIsSubmitting(true);
    try {
      await postingService.create({
        machinery: machineryId,
        hourly_rate: hourlyRate,
        location_address: location,
        availability_start: availabilityStart ? `${availabilityStart}T00:00:00` : undefined,
        availability_end: availabilityEnd ? `${availabilityEnd}T23:59:59` : undefined,
        description: description || undefined,
      });

      toast.success(
        "Anúncio publicado. O envio das fotos à API ainda não está disponível — as imagens foram apenas validadas neste formulário.",
      );
      form.reset();
      setPhotoFiles([]);
      navigate("/dashboard");
    } catch {
      toast.error("Erro ao publicar anúncio. Verifique os dados e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 max-w-2xl mx-auto px-6 w-full">
        <Link to="/dashboard" className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1">
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        <div className="mb-10">
          <h1 className="font-headline text-3xl font-bold text-primary mb-1">Novo Anúncio</h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">Publique seu equipamento para locação</p>
        </div>

        <form
          className="space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-10 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Equipamento da Frota *</label>
            <select
              name="machinery"
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow disabled:opacity-60"
              required
              disabled={loadingMachines}
              defaultValue=""
            >
              <option value="" disabled>
                {loadingMachines ? "Carregando..." : "Selecione um equipamento"}
              </option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.model} — {m.renagro_number}
                </option>
              ))}
            </select>
            {!loadingMachines && machines.length === 0 ? (
              <p className="text-[11px] text-outline font-medium">
                Nenhum equipamento ativo.{" "}
                <Link to="/dashboard/novo-equipamento" className="text-primary font-bold hover:underline">
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
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              required
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Localização *</label>
            <input
              name="location_address"
              type="text"
              placeholder="Sorriso, MT"
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              required
            />
            <div className="bg-surface-container-high rounded-xl h-48 flex items-center justify-center text-on-surface-variant text-sm border border-outline-variant/20">
              <MaterialIcon icon="map" size={24} className="mr-2 text-outline" /> Mapa de seleção de localização
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Disponível a partir de</label>
              <input
                name="availability_start"
                type="date"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Disponível até</label>
              <input
                name="availability_end"
                type="date"
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">Descrição</label>
            <textarea
              name="description"
              placeholder="Detalhes sobre o equipamento e condições..."
              rows={3}
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
              <MaterialIcon icon="upload_file" className="text-outline group-hover:text-primary transition-colors mb-2" size={40} />
              <div className="font-bold text-tertiary text-sm">Arraste fotos ou clique para selecionar</div>
              <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">JPG, PNG — Max 5MB por foto</div>
            </button>
            {photoFiles.length > 0 ? (
              <ul className="text-xs text-on-surface-variant space-y-1">
                {photoFiles.map((f, index) => (
                  <li key={`${f.name}-${f.size}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-primary font-bold shrink-0"
                      onClick={() => setPhotoFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[10px] text-outline leading-relaxed">
              O backend ainda não expõe endpoint para fotos; elas são validadas aqui e poderão ser enviadas quando a API estiver pronta.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loadingMachines || machines.length === 0}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
          >
            <MaterialIcon icon="publish" size={20} /> {isSubmitting ? "Publicando..." : "Publicar Anúncio"}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoAnuncio;
