import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { toCreatePayload } from "@/features/users/api/userMapper";
import { useCreateUser } from "@/features/users/hooks/useUsers";
import { useSignupForm } from "@/features/users/hooks/useSignupForm";
import { maxBirthDate, UserRole } from "@/features/users/types/userSchemas";
import type { SignupFormValues } from "@/features/users/types/userSchemas";
import { isCepComplete, useCepLookup } from "@/shared/hooks/useCepLookup";
import { BRAZILIAN_STATES } from "@/shared/lib/brazilianStates";
import { masked } from "@/shared/lib/maskedRegister";
import { BadRequestError, HttpError } from "@/shared/http/errors";
import { maskCEP } from "@/utils/masks/maskCEP";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskPhone } from "@/utils/masks/maskPhone";

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

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean, extra = ""): string {
  return `${INPUT_BASE} ${extra} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

const ROLE_TABS = [
  { value: UserRole.Locatario, label: "Sou Locatário" },
  { value: UserRole.Locador, label: "Sou Locador" },
  { value: UserRole.Operador, label: "Sou Operador" },
] as const;

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="person_add" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary">Criar Conta</h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">Preencha seus dados para começar</p>
            </div>

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
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Nome Completo*
                </label>
                <input
                  type="text"
                  placeholder="João da Silva"
                  className={inputClass(Boolean(errors.name))}
                  {...form.register("name")}
                />
                {errors.name && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Data de Nascimento*
                </label>
                <input
                  type="date"
                  min="1900-01-01"
                  max={maxBirthDate()}
                  className={inputClass(Boolean(errors.birthDate))}
                  {...form.register("birthDate")}
                />
                {errors.birthDate ? (
                  <p className="text-[11px] text-error font-medium mt-1">
                    {errors.birthDate.message}
                  </p>
                ) : (
                  <p className="text-[11px] text-outline font-medium">
                    É necessário ter 18 anos ou mais para se cadastrar.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CPF / CNPJ {role}*
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  className={inputClass(Boolean(errors.document))}
                  {...masked(form.register("document"), maskDocument)}
                />
                {errors.document ? (
                  <p className="text-[11px] text-error font-medium mt-1">
                    {errors.document.message}
                  </p>
                ) : (
                  <p className="text-[11px] text-outline font-medium">
                    Requisito para formalização do contrato na plataforma.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  E-mail*
                </label>
                <input
                  type="email"
                  placeholder="contato@email.com"
                  className={inputClass(Boolean(errors.email))}
                  {...form.register("email")}
                />
                {errors.email && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Telefone *
                </label>
                <input
                  type="tel"
                  placeholder="(00) 90000-0000"
                  className={inputClass(Boolean(errors.phone))}
                  {...masked(form.register("phone"), maskPhone)}
                />
                {errors.phone && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CEP*
                </label>
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
                {errors.cep && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.cep.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Endereço*
                </label>
                <input
                  type="text"
                  placeholder="Rua, número, complemento"
                  className={inputClass(Boolean(errors.address))}
                  {...form.register("address")}
                />
                {errors.address && (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.address.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Cidade*
                  </label>
                  <input
                    type="text"
                    placeholder="Sorriso"
                    className={inputClass(Boolean(errors.city))}
                    {...form.register("city")}
                  />
                  {errors.city && (
                    <p className="text-[11px] text-error font-medium mt-1">{errors.city.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Estado*
                  </label>
                  <select
                    className={inputClass(Boolean(errors.state))}
                    {...form.register("state")}
                  >
                    <option value="">Selecione</option>
                    {BRAZILIAN_STATES.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                  {errors.state && (
                    <p className="text-[11px] text-error font-medium mt-1">{errors.state.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha*
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    className={inputClass(Boolean(errors.password), "pr-12")}
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
                  >
                    <MaterialIcon icon={showPassword ? "visibility_off" : "visibility"} size={20} />
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-error font-medium mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={createUser.isPending}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {createUser.isPending ? (
                  "Criando conta..."
                ) : (
                  <>
                    <MaterialIcon icon="person_add" size={20} /> Criar Conta
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              Já tem conta?{" "}
              <Link to="/login" className="font-bold text-primary hover:underline">
                Faça login
              </Link>
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Signup;
