import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { postingService } from "@/services/PostingService/PostingService";
import { toast } from "sonner";
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

  useEffect(() => {
    if (!id) return;
    postingService
      .getById(id)
      .then((data) => {
        setPosting(data);
      })
      .catch(() => {
        toast.error("Não foi possível carregar o anúncio.");
        navigate("/dashboard");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !id) return;
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const hourlyRaw = String(formData.get("hourly_rate") ?? "").trim();
    const location = String(formData.get("location_address") ?? "").trim();
    const availabilityStart = String(
      formData.get("availability_start") ?? ""
    ).trim();
    const availabilityEnd = String(
      formData.get("availability_end") ?? ""
    ).trim();
    const description = String(formData.get("description") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    const hourlyRate = Number(hourlyRaw.replace(",", "."));
    if (!hourlyRaw || Number.isNaN(hourlyRate) || hourlyRate <= 0) {
      toast.error("Informe um valor por hora válido.");
      setIsSubmitting(false);
      return;
    }

    try {
      await postingService.update(id, {
        hourly_rate: hourlyRate,
        location_address: location,
        availability_start: availabilityStart
          ? `${availabilityStart}T00:00:00`
          : undefined,
        availability_end: availabilityEnd
          ? `${availabilityEnd}T23:59:59`
          : undefined,
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
    if (posting.machinery_details) {
      return `${posting.machinery_details.brand} ${posting.machinery_details.model}`;
    }
    return posting.machinery;
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
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Status do Anúncio
                </label>
                <select
                  name="status"
                  defaultValue={posting.status || "active"}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
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
                  defaultValue={posting.hourly_rate}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Localização *
                </label>
                <input
                  name="location_address"
                  type="text"
                  defaultValue={posting.location_address}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Disponível a partir de
                  </label>
                  <input
                    name="availability_start"
                    type="date"
                    defaultValue={
                      posting.availability_start
                        ? posting.availability_start.split("T")[0]
                        : ""
                    }
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Disponível até
                  </label>
                  <input
                    name="availability_end"
                    type="date"
                    defaultValue={
                      posting.availability_end
                        ? posting.availability_end.split("T")[0]
                        : ""
                    }
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Descrição
                </label>
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={posting.description}
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
