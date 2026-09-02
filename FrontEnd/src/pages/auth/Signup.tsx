import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { toCreatePayload } from "@/features/users/api/userMapper";
import { useSignupForm } from "@/features/users/hooks/useSignupForm";
import { useCreateUser } from "@/features/users/hooks/useUsers";
import { maxBirthDate, UserRole } from "@/features/users/types/userSchemas";
import type { SignupFormValues } from "@/features/users/types/userSchemas";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";
import { GradientButton } from "@/shared/components/GradientButton";
import { PageHeader } from "@/shared/components/PageHeader";
import { PageShell } from "@/shared/components/PageShell";
import { PasswordField } from "@/shared/components/PasswordField";
import { isCepComplete, useCepLookup } from "@/shared/hooks/useCepLookup";
import { BadRequestError, HttpError } from "@/shared/http/errors";
import { masked } from "@/shared/lib/maskedRegister";
import { BRAZILIAN_STATES } from "@/shared/utils/brazilianStates";
import { maskCEP } from "@/shared/utils/masks/maskCEP";
import { maskDocument } from "@/shared/utils/masks/maskDocument";
import { maskPhone } from "@/shared/utils/masks/maskPhone";

const API_FIELD_TO_FORM: Partial<Record<string, keyof SignupFormValues>> = {
  document: "document",
  email: "email",
  name: "name",
  phone: "phone",
  address: "address",
  cep: "cep",
  birth_date: "birthDate",
  password: "password",
  role: "role",
};

const ROLE_TABS = [
  { value: UserRole.Locatario, label: "Sou Locatário" },
  { value: UserRole.Locador, label: "Sou Locador" },
  { value: UserRole.Operador, label: "Sou Operador" },
] as const;

const Signup = () => {
  const navigate = useNavigate();

  const form = useSignupForm();
  const createUser = useCreateUser();
  const { lookup } = useCepLookup();
  const { errors } = form.formState;
  const role = form.watch("role");

  /** Preenche endereço, cidade e UF quando o CEP fica completo. */
  const handleCepChange = async (value: string) => {
    if (!isCepComplete(value)) return;
    try {
      const address = await lookup(value);
      form.setValue("address", [address.street, address.neighborhood].filter(Boolean).join(", "), {
        shouldValidate: true,
      });
      form.setValue("city", address.city, { shouldValidate: true });
      form.setValue("state", address.state.toUpperCase(), { shouldValidate: true });
    } catch {
      toast.error("CEP não encontrado.");
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createUser.mutateAsync(toCreatePayload(values));
      toast.success(
        "Cadastro realizado com sucesso! Prossiga para o login e aproveite a plataforma.",
      );
      navigate("/login");
    } catch (error) {
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
        error instanceof HttpError
          ? error.message
          : "Ocorreu um problema com o cadastro. Tente novamente mais tarde.",
      );
    }
  });

  const cepField = masked(form.register("cep"), maskCEP);

  return (
    <PageShell width="centered">
      <div className="w-full max-w-lg">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
          <PageHeader
            icon="person_add"
            align="center"
            title="Criar Conta"
            subtitle="Preencha seus dados para começar"
            className="mb-10"
          />

          <div className="flex rounded-xl border border-outline-variant/50 overflow-hidden mb-8">
            {ROLE_TABS.map((tab, index) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => form.setValue("role", tab.value)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all ${
                  index > 0 ? "border-l border-outline-variant/30" : ""
                } ${
                  role === tab.value
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <FormField label="Nome Completo*" error={errors.name?.message}>
              <input
                type="text"
                placeholder="João da Silva"
                className={inputClass(Boolean(errors.name))}
                {...form.register("name")}
              />
            </FormField>

            <FormField
              label="Data de Nascimento*"
              error={errors.birthDate?.message}
              hint="É necessário ter 18 anos ou mais para se cadastrar."
            >
              <input
                type="date"
                min="1900-01-01"
                max={maxBirthDate()}
                className={inputClass(Boolean(errors.birthDate))}
                {...form.register("birthDate")}
              />
            </FormField>

            <FormField
              label={`CPF / CNPJ ${role}*`}
              error={errors.document?.message}
              hint="Requisito para formalização do contrato na plataforma."
            >
              <input
                type="text"
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                className={inputClass(Boolean(errors.document))}
                {...masked(form.register("document"), maskDocument)}
              />
            </FormField>

            <FormField label="E-mail*" error={errors.email?.message}>
              <input
                type="email"
                placeholder="contato@email.com"
                className={inputClass(Boolean(errors.email))}
                {...form.register("email")}
              />
            </FormField>

            <FormField label="Telefone *" error={errors.phone?.message}>
              <input
                type="tel"
                placeholder="(00) 90000-0000"
                className={inputClass(Boolean(errors.phone))}
                {...masked(form.register("phone"), maskPhone)}
              />
            </FormField>

            <FormField label="CEP*" error={errors.cep?.message}>
              <input
                type="text"
                placeholder="00000-000"
                className={inputClass(Boolean(errors.cep))}
                {...cepField}
                onChange={(event) => {
                  void cepField.onChange(event);
                  void handleCepChange(event.target.value);
                }}
              />
            </FormField>

            <FormField label="Endereço*" error={errors.address?.message}>
              <input
                type="text"
                placeholder="Rua, número, complemento"
                className={inputClass(Boolean(errors.address))}
                {...form.register("address")}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Cidade*" error={errors.city?.message}>
                <input
                  type="text"
                  placeholder="Sorriso"
                  className={inputClass(Boolean(errors.city))}
                  {...form.register("city")}
                />
              </FormField>

              <FormField label="Estado*" error={errors.state?.message}>
                <select className={inputClass(Boolean(errors.state))} {...form.register("state")}>
                  <option value="">Selecione</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <PasswordField
              label="Senha*"
              placeholder="Mínimo 8 caracteres"
              error={errors.password?.message}
              {...form.register("password")}
            />

            <GradientButton
              type="submit"
              icon="person_add"
              pending={createUser.isPending}
              pendingLabel="Criando conta..."
              className="mt-2"
            >
              Criar Conta
            </GradientButton>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-8">
            Já tem conta?{" "}
            <Link to="/login" className="font-bold text-primary hover:underline">
              Faça login
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
};

export default Signup;
