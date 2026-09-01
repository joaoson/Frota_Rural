import { Link } from "react-router";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { BrandSelect } from "@/features/machines/components/BrandSelect";
import { useCreateMachine } from "@/features/machines/hooks/useCreateMachine";
import {
  MACHINE_FORM_DEFAULTS,
  useMachineForm,
} from "@/features/machines/hooks/useMachineForm";
import { toCreatePayload } from "@/features/machines/api/machineMapper";
import { OTHER_BRAND } from "@/features/machines/types/brands";
import type { MachineFormValues } from "@/features/machines/types/machineSchemas";
import { BadRequestError } from "@/shared/http/errors";

/** Campo da API → campo do formulário, para posicionar erros vindos do backend. */
const API_FIELD_TO_FORM: Partial<Record<string, keyof MachineFormValues>> = {
  renagro_number: "renagroNumber",
  brand: "otherBrand",
  model: "model",
  year: "year",
  usage_purpose: "usagePurpose",
  technical_specifications: "technicalSpecifications",
};

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

const NovoEquipamento = () => {
  const { userId } = useAuth();
  const form = useMachineForm();
  const createMachine = useCreateMachine();

  const { errors } = form.formState;
  const brandKey = form.watch("brandKey");
  const isSubmitting = createMachine.isPending || form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!userId) {
      toast.error("Usuário não autenticado. Faça login para cadastrar o equipamento.");
      return;
    }

    try {
      await createMachine.mutateAsync(toCreatePayload(values, userId));
      toast.success("Equipamento cadastrado com sucesso.");
      form.reset(MACHINE_FORM_DEFAULTS);
    } catch (error) {
      // Erros de campo do backend (ex.: renagro duplicado) vão para o campo,
      // não para um toast genérico.
      if (error instanceof BadRequestError && error.hasFieldErrors) {
        let placed = false;
        for (const [apiField, messages] of Object.entries(error.fieldErrors)) {
          const formField = API_FIELD_TO_FORM[apiField];
          const message = messages[0];
          if (formField && message) {
            form.setError(formField, { type: "server", message });
            placed = true;
          }
        }
        if (placed) return;
      }

      toast.error(
        error instanceof BadRequestError
          ? error.message
          : "Erro ao cadastrar equipamento. Verifique os dados e tente novamente.",
      );
    }
  });

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
          <h1 className="font-headline text-3xl font-bold text-primary mb-1">Novo Equipamento</h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">Cadastre uma nova máquina na sua frota</p>
        </div>

        <form
          className="space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-10 shadow-sm"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Nº Registro Renagro *
            </label>
            <input
              type="text"
              placeholder="BR1029304899"
              className={inputClass(Boolean(errors.renagroNumber))}
              {...form.register("renagroNumber")}
            />
            {errors.renagroNumber ? (
              <p className="text-[11px] text-error font-medium mt-1">
                {errors.renagroNumber.message}
              </p>
            ) : (
              <p className="text-[11px] text-outline font-medium">
                Requisito para formalização do contrato na plataforma.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Marca *
              </label>
              <BrandSelect
                value={brandKey}
                onChange={(value) => {
                  form.setValue("brandKey", value, { shouldValidate: true });
                  if (value !== OTHER_BRAND) form.clearErrors("otherBrand");
                }}
                hasError={Boolean(errors.otherBrand)}
              />

              {brandKey === OTHER_BRAND ? (
                <>
                  <input
                    type="text"
                    placeholder="Digite a marca"
                    className={`mt-2 ${inputClass(Boolean(errors.otherBrand))}`}
                    {...form.register("otherBrand")}
                  />
                  {errors.otherBrand && (
                    <p className="text-[11px] text-error font-medium mt-1">
                      {errors.otherBrand.message}
                    </p>
                  )}
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Modelo *
              </label>
              <input
                type="text"
                placeholder="S700"
                className={inputClass(Boolean(errors.model))}
                {...form.register("model")}
              />
              {errors.model && (
                <p className="text-[11px] text-error font-medium mt-1">{errors.model.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Ano de Fabricação
              </label>
              <input
                type="number"
                placeholder="2022"
                className={inputClass(Boolean(errors.year))}
                {...form.register("year")}
              />
              {errors.year && (
                <p className="text-[11px] text-error font-medium mt-1">{errors.year.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Finalidade de Uso
              </label>
              <select
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                {...form.register("usagePurpose")}
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
              className={inputClass(Boolean(errors.initialHorimeter))}
              {...form.register("initialHorimeter")}
            />
            {errors.initialHorimeter && (
              <p className="text-[11px] text-error font-medium mt-1">
                {errors.initialHorimeter.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Especificações Técnicas
            </label>
            <textarea
              placeholder="Motor, plataforma, recursos adicionais..."
              rows={3}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              {...form.register("technicalSpecifications")}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
          >
            <MaterialIcon icon="agriculture" size={20} />{" "}
            {isSubmitting ? "Cadastrando..." : "Cadastrar Equipamento"}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default NovoEquipamento;
