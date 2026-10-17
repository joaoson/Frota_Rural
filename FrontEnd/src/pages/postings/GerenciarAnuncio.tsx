import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/contexts/useAuth";
import { useRentalsAsLessor } from "@/features/contracts/hooks/useContracts";
import { useReceivedReviews } from "@/features/reviews/hooks/useReviews";
import { averageRating } from "@/features/reviews/types/review";
import { formatCurrency } from "@/features/dashboard/utils/ownerSummary";
import MaterialIcon from "@/components/MaterialIcon";
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
import { toDateInput, toEditPayload } from "@/features/postings/api/postingMapper";
import { usePostingEditForm } from "@/features/postings/hooks/usePostingForm";
import {
  useDeletePosting,
  usePosting,
  useUpdatePosting,
} from "@/features/postings/hooks/usePostings";
import { postingStatusBadge } from "@/features/postings/types/postingBadges";
import { postingMachineName } from "@/features/postings/types/posting";
import { isCepComplete, useCepLookup } from "@/shared/hooks/useCepLookup";
import MapaLocalizacao from "@/components/MapaLocalizacao";
import type { Coordenadas } from "@/shared/http/GeocodingClient";
import { HttpError } from "@/shared/http/errors";
import { BackLink } from "@/shared/components/BackLink";
import { PageShell } from "@/shared/components/PageShell";
import { FormField } from "@/shared/components/FormField";
import { FullPageLoading } from "@/shared/components/LoadingState";
import { inputClass } from "@/shared/components/inputStyles";
import { masked } from "@/shared/lib/maskedRegister";
import { maskCEP } from "@/shared/utils/masks/maskCEP";

const GerenciarAnuncio = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const rentalsQuery = useRentalsAsLessor(userId);
  const reviewsQuery = useReceivedReviews(userId);
  const rentals = (rentalsQuery.data ?? []).filter((rental) => rental.postingId === id);
  const rentalIds = new Set(rentals.map((rental) => rental.id));
  const reviews = (reviewsQuery.data ?? []).filter((review) => rentalIds.has(review.rentalId));
  const rating = averageRating(reviews);
  const totalCompleted = rentals.filter((rental) => ["completed", "closed"].includes(rental.status ?? "")).reduce((sum, rental) => sum + (rental.totalPrice ?? 0), 0);

  const postingQuery = usePosting(id ?? null);
  const updatePosting = useUpdatePosting();
  const deletePosting = useDeletePosting();
  const { lookup } = useCepLookup();

  const form = usePostingEditForm();
  const [locatedCoordinates, setCoordenadas] = useState<Coordenadas | null>(null);
  const { errors } = form.formState;
  const posting = postingQuery.data;
  const moderationLocked = ["rejected", "suspended", "pending_review"].includes(posting?.status ?? "");
  const locationUnchanged = form.watch("locationAddress") === posting?.locationAddress
    && form.watch("cep").replace(/\D/g, "") === (posting?.locationCep ?? "").replace(/\D/g, "");
  const coordenadas = locatedCoordinates ?? (locationUnchanged && posting?.latitude != null && posting.longitude != null
    ? { lat: posting.latitude, lon: posting.longitude, nomeExibicao: posting.locationAddress ?? "" } : null);

  const hoje = new Date().toISOString().split("T")[0];
  const inicioGravado = toDateInput(posting?.availabilityStart ?? null);
  const fimGravado = toDateInput(posting?.availabilityEnd ?? null);

  /**
   * Data mínima aceita num campo de disponibilidade. Em regra é hoje, como no
   * Novo Anúncio; a exceção é a data já gravada — a maioria dos anúncios tem
   * período vencido, e exigir data futura trancaria a edição deles.
   */
  const piso = (gravada: string) => (gravada && gravada < hoje ? gravada : hoje);

  useEffect(() => {
    if (!posting) return;
    form.reset({
      status: posting.status ?? "active",
      hourlyRate: String(posting.hourlyRate),
      cep: maskCEP(posting.locationCep ?? ""),
      locationAddress: posting.locationAddress ?? "",
      availabilityStart: toDateInput(posting.availabilityStart),
      availabilityEnd: toDateInput(posting.availabilityEnd),
      description: posting.description ?? "",
    });
  }, [posting, form]);

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

  const onSubmit = form.handleSubmit(async (values) => {
    if (!id) return;
    try {
      await updatePosting.mutateAsync({ id, payload: toEditPayload(values, coordenadas) });
      toast.success("Anúncio atualizado com sucesso.");
      navigate("/dashboard?tab=anuncios");
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Erro ao atualizar o anúncio.");
    }
  });

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deletePosting.mutateAsync(id);
      toast.success("Anúncio removido.");
      navigate("/dashboard?tab=anuncios");
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Erro ao remover anúncio.");
    }
  };

  const cepField = masked(form.register("cep"), maskCEP);

  if (postingQuery.isError) {
    return <PageShell width="medium"><BackLink to="/dashboard?tab=anuncios">Voltar aos Anúncios</BackLink><div role="alert">Não foi possível carregar o anúncio. <button type="button" className="font-bold underline" onClick={() => void postingQuery.refetch()}>Tentar novamente</button></div></PageShell>;
  }
  if (postingQuery.isLoading || !posting) {
    return <FullPageLoading label="Carregando anúncio..." />;
  }

  return (
    <PageShell width="medium">
      <BackLink to="/dashboard?tab=anuncios">Voltar aos Anúncios</BackLink>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-2/3">
          <div className="mb-8">
            <h1 className="font-headline text-3xl font-bold text-primary mb-1">
              Gerenciar Anúncio
            </h1>
            <div className="h-1 w-16 bg-secondary-container mb-3" />
            <p className="text-on-surface-variant text-sm">
              Atualize as informações de locação para{" "}
              <strong className="text-on-surface">{postingMachineName(posting)}</strong>
            </p>
          </div>

          <form
            className="space-y-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-8 shadow-sm"
            onSubmit={onSubmit}
            noValidate
          >
            <FormField label="Status do Anúncio" error={errors.status?.message} hint={moderationLocked ? `Este anúncio está ${postingStatusBadge(posting.status).label.toLocaleLowerCase("pt-BR")}. Você pode corrigir os dados; a publicação depende da moderação da plataforma.` : undefined}>
              <select className={inputClass(false)} disabled={moderationLocked} {...form.register("status")}>
                <option value="active">Ativo (Visível para busca)</option>
                <option value="inactive">Pausado (Oculto)</option>
                <option value="draft">Rascunho (Oculto)</option>
                {posting.status && !["active", "inactive", "draft"].includes(posting.status) && <option value={posting.status}>{postingStatusBadge(posting.status).label}</option>}
              </select>
            </FormField>

            <FormField label="Valor por Hora (R$) *" error={errors.hourlyRate?.message}>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass(Boolean(errors.hourlyRate))}
                {...form.register("hourlyRate")}
              />
            </FormField>

            <div className="space-y-4">
              <FormField label="CEP">
                <input
                  type="text"
                  placeholder="00000-000"
                  className={inputClass(false)}
                  {...cepField}
                  onChange={(event) => {
                    setCoordenadas(null);
                    void cepField.onChange(event);
                    void handleCepChange(event.target.value);
                  }}
                />
              </FormField>

              <FormField label="Localização *" error={errors.locationAddress?.message}>
                <input
                  type="text"
                  className={inputClass(Boolean(errors.locationAddress))}
                  {...form.register("locationAddress", { onChange: () => { setCoordenadas(null); form.setValue("cep", ""); } })}
                />
              </FormField>

              <MapaLocalizacao
                endereco={form.watch("locationAddress")}
                cep={form.watch("cep")}
                coordenadas={coordenadas}
                onCoordenadas={setCoordenadas}
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <FormField label="Disponível a partir de" error={errors.availabilityStart?.message}>
                <input
                  type="date"
                  min={piso(inicioGravado)}
                  className={inputClass(Boolean(errors.availabilityStart))}
                  {...form.register("availabilityStart")}
                />
              </FormField>
              <FormField label="Disponível até" error={errors.availabilityEnd?.message}>
                <input
                  type="date"
                  min={
                    form.watch("availabilityStart") > piso(fimGravado)
                      ? form.watch("availabilityStart")
                      : piso(fimGravado)
                  }
                  className={inputClass(Boolean(errors.availabilityEnd))}
                  {...form.register("availabilityEnd")}
                />
              </FormField>
            </div>

            <FormField label="Descrição" error={errors.description?.message}>
              <textarea
                rows={4}
                className={inputClass(Boolean(errors.description))}
                {...form.register("description")}
              />
            </FormField>

            <div className="pt-4 border-t border-outline-variant/30 flex justify-end gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={deletePosting.isPending || updatePosting.isPending}
                    className="px-6 py-3.5 text-sm font-bold rounded-lg border-2 border-error/50 text-error hover:bg-error/10 transition-colors"
                  >
                    Excluir Anúncio
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir anúncio?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. O anúncio será removido e não aparecerá
                      mais nos resultados de busca. Anúncios com histórico de locações devem ser pausados para preservar os contratos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deletePosting.isPending || updatePosting.isPending}
                      className="bg-error hover:bg-error/90 text-on-error"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <button
                type="submit"
                disabled={updatePosting.isPending || deletePosting.isPending}
                className="px-8 py-3.5 text-sm font-bold rounded-lg bg-primary text-on-primary hover:shadow-lg transition-all disabled:opacity-60 flex items-center gap-2"
              >
                <MaterialIcon icon="save" size={18} />
                {updatePosting.isPending ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:w-1/3">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-sm sticky top-32">
            <h3 className="font-headline font-bold text-lg text-on-surface mb-6">Histórico do Anúncio</h3>
            {rentalsQuery.isError || reviewsQuery.isError ? <p role="alert">Não foi possível carregar o histórico. <button type="button" onClick={() => { void rentalsQuery.refetch(); void reviewsQuery.refetch(); }} className="underline">Tentar novamente</button></p>
              : rentalsQuery.isLoading || reviewsQuery.isLoading ? <p role="status">Carregando histórico...</p>
              : <dl className="space-y-5">
                <div><dt className="text-sm text-on-surface-variant">Locações registradas</dt><dd className="font-black text-lg">{rentals.length}</dd></div>
                <div><dt className="text-sm text-on-surface-variant">Avaliação média recebida</dt><dd className="font-black text-lg">{rating == null ? "Sem avaliações" : rating.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</dd></div>
                <div><dt className="text-sm text-on-surface-variant">Valor das locações concluídas</dt><dd className="font-black text-xl text-primary">{formatCurrency(totalCompleted)}</dd></div>
              </dl>}
            <p className="mt-4 text-xs text-on-surface-variant">Valores brutos dos contratos, sem confirmação de repasse. Visualizações não são contabilizadas.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default GerenciarAnuncio;
