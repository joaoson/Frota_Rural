import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMachines } from "@/features/machines/hooks/useMachines";
import { machineDisplayName } from "@/features/machines/types/machine";
import { toWritePayload } from "@/features/postings/api/postingMapper";
import { useCreatePosting } from "@/features/postings/hooks/usePostings";
import { usePostingForm } from "@/features/postings/hooks/usePostingForm";
import { isCepComplete, useCepLookup } from "@/shared/hooks/useCepLookup";
import { HttpError } from "@/shared/http/errors";
import { masked } from "@/shared/lib/maskedRegister";
import { maskCEP } from "@/utils/masks/maskCEP";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT_TYPES = ["image/jpeg", "image/png"];

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean, extra = ""): string {
  return `${INPUT_BASE} ${extra} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

const NovoAnuncio = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fotos são estado de UI puro: hoje elas são validadas mas não enviadas.
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const machinesQuery = useMachines({ status: "active", ownerId: userId ?? undefined });
  const machines = machinesQuery.data ?? [];

  const form = usePostingForm();
  const createPosting = useCreatePosting();
  const { lookup } = useCepLookup();
  const { errors } = form.formState;

  const handleCepChange = async (value: string) => {
    if (!isCepComplete(value)) return;
    try {
      const address = await lookup(value);
      form.setValue("locationAddress", `${address.city}, ${address.state}`, {
        shouldValidate: true,
      });
    } catch {
      toast.error("CEP não encontrado.");
    }
  };

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

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createPosting.mutateAsync(toWritePayload(values));
      toast.success(
        "Anúncio publicado. O envio das fotos à API ainda não está disponível — as imagens foram apenas validadas neste formulário.",
      );
      form.reset();
      setPhotoFiles([]);
      navigate("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof HttpError
          ? error.message
          : "Erro ao publicar anúncio. Verifique os dados e tente novamente.",
      );
    }
  });

  const cepField = masked(form.register("cep"), maskCEP);
  const isBusy = createPosting.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 max-w-2xl mx-auto px-6 w-full">
        <Link
          to="/dashboard"
          className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1"
        >
          <MaterialIcon icon="arrow_back" size={16} /> Voltar ao Dashboard
        </Link>

        <div className="mb-10">
          <h1 className="font-headline text-3xl font-bold text-primary mb-1">Novo Anúncio</h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">Publique seu equipamento para locação</p>
        </div>

        <form
          className="space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-10 shadow-sm"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Equipamento da Frota *
            </label>
            <select
              className={inputClass(Boolean(errors.machinery), "disabled:opacity-60")}
              disabled={machinesQuery.isLoading}
              {...form.register("machinery")}
            >
              <option value="">
                {machinesQuery.isLoading ? "Carregando..." : "Selecione um equipamento"}
              </option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machineDisplayName(machine)} — {machine.renagroNumber ?? "sem registro"}
                </option>
              ))}
            </select>
            {errors.machinery && (
              <p className="text-[11px] text-error font-medium mt-1">{errors.machinery.message}</p>
            )}
            {!machinesQuery.isLoading && machines.length === 0 ? (
              <p className="text-[11px] text-outline font-medium">
                Nenhum equipamento ativo.{" "}
                <Link
                  to="/dashboard/novo-equipamento"
                  className="text-primary font-bold hover:underline"
                >
                  Cadastre um equipamento
                </Link>{" "}
                primeiro.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Valor por Hora (R$) *
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="480"
              className={inputClass(Boolean(errors.hourlyRate))}
              {...form.register("hourlyRate")}
            />
            {errors.hourlyRate && (
              <p className="text-[11px] text-error font-medium mt-1">{errors.hourlyRate.message}</p>
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
                className={inputClass(false)}
                {...cepField}
                onChange={(event) => {
                  void cepField.onChange(event);
                  void handleCepChange(event.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Localização *
              </label>
              <input
                type="text"
                placeholder="Sorriso, MT"
                className={inputClass(Boolean(errors.locationAddress))}
                {...form.register("locationAddress")}
              />
              {errors.locationAddress && (
                <p className="text-[11px] text-error font-medium mt-1">
                  {errors.locationAddress.message}
                </p>
              )}
            </div>
            <div className="bg-surface-container-high rounded-xl h-48 flex items-center justify-center text-on-surface-variant text-sm border border-outline-variant/20">
              <MaterialIcon icon="map" size={24} className="mr-2 text-outline" /> Mapa de seleção de
              localização
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Disponível a partir de
              </label>
              <input
                type="date"
                className={inputClass(Boolean(errors.availabilityStart))}
                {...form.register("availabilityStart")}
              />
              {errors.availabilityStart && (
                <p className="text-[11px] text-error font-medium mt-1">
                  {errors.availabilityStart.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Disponível até
              </label>
              <input
                type="date"
                className={inputClass(Boolean(errors.availabilityEnd))}
                {...form.register("availabilityEnd")}
              />
              {errors.availabilityEnd && (
                <p className="text-[11px] text-error font-medium mt-1">
                  {errors.availabilityEnd.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Descrição
            </label>
            <textarea
              placeholder="Detalhes sobre o equipamento e condições..."
              rows={3}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              {...form.register("description")}
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Fotos do Anúncio (Opcional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                addFiles(event.dataTransfer.files);
              }}
              className="w-full border-2 border-dashed border-outline-variant/60 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
            >
              <MaterialIcon
                icon="upload_file"
                className="text-outline group-hover:text-primary transition-colors mb-2"
                size={40}
              />
              <div className="font-bold text-tertiary text-sm">
                Arraste fotos ou clique para selecionar
              </div>
              <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                JPG, PNG — Max 5MB por foto
              </div>
            </button>
            {photoFiles.length > 0 ? (
              <ul className="text-xs text-on-surface-variant space-y-1">
                {photoFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{file.name}</span>
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
              O backend ainda não expõe endpoint para fotos; elas são validadas aqui e poderão ser
              enviadas quando a API estiver pronta.
            </p>
          </div>

          <button
            type="submit"
            disabled={isBusy || machinesQuery.isLoading || machines.length === 0}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
          >
            <MaterialIcon icon="publish" size={20} />{" "}
            {isBusy ? "Publicando..." : "Publicar Anúncio"}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoAnuncio;
