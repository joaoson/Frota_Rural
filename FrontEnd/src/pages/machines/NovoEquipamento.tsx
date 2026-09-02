import { toast } from "sonner";

import MaterialIcon from "@/components/MaterialIcon";
import { useAuth } from "@/contexts/useAuth";
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
import { BackLink } from "@/shared/components/BackLink";
import { PageShell } from "@/shared/components/PageShell";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";

/** Campo da API → campo do formulário, para posicionar erros vindos do backend. */
const API_FIELD_TO_FORM: Partial<Record<string, keyof MachineFormValues>> = {
  renagro_number: "renagroNumber",
  brand: "otherBrand",
  model: "model",
  year: "year",
  usage_purpose: "usagePurpose",
  technical_specifications: "technicalSpecifications",
};

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
    <PageShell>
      <BackLink to="/dashboard">Voltar ao Dashboard</BackLink>

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
        <FormField label="Nº Registro Renagro *" error={errors.renagroNumber?.message} hint="Requisito para formalização do contrato na plataforma.">
          <input
            type="text"
            placeholder="BR1029304899"
            className={inputClass(Boolean(errors.renagroNumber))}
            {...form.register("renagroNumber")}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-5">
          <FormField label="Marca *" error={errors.otherBrand?.message}>
            <BrandSelect
              value={brandKey}
              onChange={(value) => {
                form.setValue("brandKey", value, { shouldValidate: true });
                if (value !== OTHER_BRAND) form.clearErrors("otherBrand");
              }}
              hasError={Boolean(errors.otherBrand)}
            />

            {brandKey === OTHER_BRAND ? (
              <input
                type="text"
                placeholder="Digite a marca"
                className={`mt-2 ${inputClass(Boolean(errors.otherBrand))}`}
                {...form.register("otherBrand")}
              />
            ) : null}
          </FormField>

          <FormField label="Modelo *" error={errors.model?.message}>
            <input
              type="text"
              placeholder="S700"
              className={inputClass(Boolean(errors.model))}
              {...form.register("model")}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <FormField label="Ano de Fabricação" error={errors.year?.message}>
            <input
              type="number"
              placeholder="2022"
              className={inputClass(Boolean(errors.year))}
              {...form.register("year")}
            />
          </FormField>

          <FormField label="Finalidade de Uso">
            <select
              className={inputClass(false)}
              {...form.register("usagePurpose")}
            >
              <option>Plantio</option>
              <option>Pulverização</option>
              <option>Colheita</option>
              <option>Preparo de Solo</option>
            </select>
          </FormField>
        </div>

        <FormField
          label="Horím. Inicial"
          icon={<MaterialIcon icon="speed" size={14} />}
          error={errors.initialHorimeter?.message}
        >
          <input
            type="number"
            placeholder="1250 h"
            className={inputClass(Boolean(errors.initialHorimeter))}
            {...form.register("initialHorimeter")}
          />
        </FormField>

        <FormField label="Especificações Técnicas">
          <textarea
            placeholder="Motor, plataforma, recursos adicionais..."
            rows={3}
            className={inputClass(false)}
            {...form.register("technicalSpecifications")}
          />
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
        >
          <MaterialIcon icon="agriculture" size={20} />{" "}
          {isSubmitting ? "Cadastrando..." : "Cadastrar Equipamento"}
        </button>
      </form>
    </PageShell>
  );
};

export default NovoEquipamento;
