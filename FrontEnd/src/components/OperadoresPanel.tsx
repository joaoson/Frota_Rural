import { useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { toast } from "sonner";
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
import { operatorService } from "@/services/OperatorService/OperatorService";
import type { Operator } from "@/services/OperatorService/models/Operator";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskPhone } from "@/utils/masks/maskPhone";
import { maskCEP } from "@/utils/masks/maskCEP";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { UFS } from "@/utils/ufs";
import {
  fetchAddressByCEP,
  formatAddressFromCEP,
} from "@/services/ViaCEPService";
import {
  maxBirthDate,
  validatePersonField,
  type PersonField,
} from "@/utils/validation/personFields";

type FormState = {
  name: string;
  birthDate: string;
  document: string;
  email: string;
  phone: string;
  cep: string;
  address: string;
  city: string;
  uf: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  birthDate: "",
  document: "",
  email: "",
  phone: "",
  cep: "",
  address: "",
  city: "",
  uf: "",
  password: "",
};

/** Campos validados no cadastro. Na edição a senha sai da lista. */
const FORM_FIELDS: PersonField[] = [
  "name",
  "birthDate",
  "document",
  "email",
  "phone",
  "cep",
  "address",
  "city",
  "uf",
  "password",
];

const FIELD_TO_FORM_KEY: Record<PersonField, keyof FormState> = {
  name: "name",
  birthDate: "birthDate",
  document: "document",
  email: "email",
  phone: "phone",
  cep: "cep",
  address: "address",
  city: "city",
  uf: "uf",
  password: "password",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function operatorToForm(operator: Operator): FormState {
  return {
    name: operator.name,
    birthDate: operator.birth_date,
    document: maskDocument(operator.document),
    email: operator.email,
    phone: maskPhone(operator.phone?.replace(/^\+55/, "") ?? ""),
    cep: maskCEP(operator.cep ?? ""),
    address: operator.address,
    city: operator.city ?? "",
    uf: (operator.state ?? "").toUpperCase(),
    password: "",
  };
}

const inputClass = (hasError: boolean) =>
  `w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;

/**
 * Aba "Operadores" do painel: cadastro e gestão da equipe de operadores.
 *
 * O formulário pede os mesmos dados do cadastro público porque o que é criado
 * aqui é uma conta de verdade — o operador faz login com ela. A diferença é o
 * vínculo: o servidor amarra a conta a quem a cadastrou, e é esse vínculo que
 * define "os seus" operadores.
 */
const OperadoresPanel = () => {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<PersonField, string>>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = editingId !== null;

  useEffect(() => {
    operatorService
      .list()
      .then(setOperators)
      .catch((error) => {
        console.error("Erro ao carregar operadores", error);
        toast.error("Não foi possível carregar seus operadores.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return operators;
    return operators.filter((o) =>
      [o.name, o.email, o.document, o.city ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [operators, search]);

  const setField = (field: PersonField, value: string) => {
    setForm((prev) => ({ ...prev, [FIELD_TO_FORM_KEY[field]]: value }));
    // Só revalida em tempo real o campo que já está marcado como inválido, para
    // não acusar erro enquanto a pessoa ainda está digitando pela primeira vez.
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: validatePersonField(field, value) }));
    }
  };

  const blurField = (field: PersonField, value: string) => {
    setErrors((prev) => ({ ...prev, [field]: validatePersonField(field, value) }));
  };

  const handleCEPLookup = async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const data = await fetchAddressByCEP(digits);
      if (!data) {
        toast.error("CEP não encontrado.");
        return;
      }
      setForm((prev) => ({
        ...prev,
        address: formatAddressFromCEP(data, "logradouro"),
        city: data.localidade,
        uf: data.uf.toUpperCase(),
      }));
      setErrors((prev) => ({ ...prev, address: "", city: "", uf: "" }));
    } catch (error) {
      console.error("Erro ao buscar CEP", error);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (operator: Operator) => {
    setEditingId(operator.id);
    setForm(operatorToForm(operator));
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const fields = isEditing
      ? FORM_FIELDS.filter((field) => field !== "password")
      : FORM_FIELDS;

    const nextErrors: Partial<Record<PersonField, string>> = {};
    for (const field of fields) {
      nextErrors[field] = validatePersonField(field, form[FIELD_TO_FORM_KEY[field]]);
    }
    setErrors(nextErrors);

    if (Object.values(nextErrors).some((msg) => msg !== "")) {
      toast.error("Corrija os erros do formulário antes de salvar.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      birth_date: form.birthDate,
      document: clearSpecialChars(form.document),
      email: form.email.toLowerCase().trim(),
      phone: `+55${clearSpecialChars(form.phone)}`,
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.uf,
      cep: clearSpecialChars(form.cep),
    };

    setSaving(true);
    try {
      if (isEditing) {
        const updated = await operatorService.update(editingId, payload);
        setOperators((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o)),
        );
        toast.success("Operador atualizado.");
      } else {
        const created = await operatorService.create({
          ...payload,
          password: form.password,
        });
        setOperators((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        toast.success(
          "Operador cadastrado. Repasse a senha inicial para que ele acesse a conta.",
        );
      }
      closeForm();
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data;
        if (data.document) {
          setErrors((prev) => ({ ...prev, document: "Este documento já está cadastrado." }));
          toast.error("Este documento já está cadastrado.");
          return;
        }
        if (data.email) {
          setErrors((prev) => ({ ...prev, email: "Este e-mail já está em uso." }));
          toast.error("Este e-mail já está em uso.");
          return;
        }
        if (data.error) {
          toast.error(data.error);
          return;
        }
      }
      console.error("Erro ao salvar operador", error);
      toast.error("Não foi possível salvar o operador. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (operator: Operator) => {
    try {
      await operatorService.unlink(operator.id);
      setOperators((prev) => prev.filter((o) => o.id !== operator.id));
      if (editingId === operator.id) closeForm();
      toast.success(`${operator.name} foi desvinculado da sua equipe.`);
    } catch (error) {
      console.error("Erro ao desvincular operador", error);
      toast.error("Não foi possível desvincular o operador.");
    }
  };

  const renderField = (
    field: PersonField,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    mask?: (value: string) => string,
    onAfterChange?: (value: string) => void,
  ) => {
    const value = form[FIELD_TO_FORM_KEY[field]];
    return (
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
          {label}
        </label>
        <input
          {...props}
          value={value}
          onChange={(e) => {
            const next = mask ? mask(e.target.value) : e.target.value;
            setField(field, next);
            onAfterChange?.(next);
          }}
          onBlur={(e) => {
            blurField(field, e.target.value);
            if (field === "cep") handleCEPLookup(e.target.value);
          }}
          className={inputClass(Boolean(errors[field]))}
        />
        {errors[field] && (
          <p className="text-[11px] text-error font-medium">{errors[field]}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">
            Operadores
          </h1>
          <div className="h-1 w-16 bg-secondary-container mt-2" />
          <p className="text-on-surface-variant text-sm mt-3">
            Cadastre e gerencie os operadores da sua equipe
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 self-start"
          >
            <MaterialIcon icon="person_add" size={18} /> Cadastrar Operador
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="font-headline text-xl font-bold text-tertiary">
                {isEditing ? "Editar Operador" : "Novo Operador"}
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {isEditing
                  ? "Atualize os dados de cadastro do operador."
                  : "O operador acessa a plataforma com o e-mail e a senha definidos aqui."}
              </p>
            </div>
            <button
              onClick={closeForm}
              className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
              aria-label="Fechar formulário"
            >
              <MaterialIcon icon="close" size={20} />
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {renderField("name", "Nome Completo*", {
              type: "text",
              placeholder: "João da Silva",
            })}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField("birthDate", "Data de Nascimento*", {
                type: "date",
                min: "1900-01-01",
                max: maxBirthDate(),
              })}
              {renderField(
                "document",
                "CPF / CNPJ*",
                { type: "text", placeholder: "000.000.000-00" },
                maskDocument,
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField("email", "E-mail*", {
                type: "email",
                placeholder: "operador@email.com",
              })}
              {renderField(
                "phone",
                "Telefone*",
                { type: "tel", placeholder: "(00) 90000-0000" },
                maskPhone,
              )}
            </div>

            {renderField(
              "cep",
              "CEP*",
              { type: "text", placeholder: "00000-000" },
              maskCEP,
              handleCEPLookup,
            )}

            {renderField("address", "Endereço*", {
              type: "text",
              placeholder: "Rua, número, complemento",
            })}

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                {renderField("city", "Cidade*", {
                  type: "text",
                  placeholder: "Sorriso",
                })}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Estado*
                </label>
                <select
                  value={form.uf}
                  onChange={(e) => setField("uf", e.target.value)}
                  onBlur={(e) => blurField("uf", e.target.value)}
                  className={inputClass(Boolean(errors.uf))}
                >
                  <option value="">Selecione</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                {errors.uf && (
                  <p className="text-[11px] text-error font-medium">{errors.uf}</p>
                )}
              </div>
            </div>

            {!isEditing && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha Inicial*
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    onBlur={(e) => blurField("password", e.target.value)}
                    className={`${inputClass(Boolean(errors.password))} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <MaterialIcon
                      icon={showPassword ? "visibility_off" : "visibility"}
                      size={20}
                    />
                  </button>
                </div>
                {errors.password ? (
                  <p className="text-[11px] text-error font-medium">{errors.password}</p>
                ) : (
                  <p className="text-[11px] text-outline font-medium">
                    Repasse a senha ao operador. Ele poderá trocá-la depois em
                    "Minha Conta".
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="bg-surface-container-high text-on-surface-variant px-5 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  "Salvando..."
                ) : (
                  <>
                    <MaterialIcon icon={isEditing ? "save" : "person_add"} size={18} />
                    {isEditing ? "Salvar Alterações" : "Cadastrar Operador"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="relative">
        <MaterialIcon
          icon="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          size={18}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail, documento ou cidade..."
          className="w-full bg-surface-container border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary text-on-surface"
        />
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Carregando operadores...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-low border border-dashed border-outline-variant/50 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 bg-primary/10 text-primary dark:text-primary-bright rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MaterialIcon icon="engineering" size={28} />
          </div>
          <h3 className="font-headline font-bold text-on-surface">
            {operators.length === 0
              ? "Nenhum operador cadastrado"
              : "Nenhum operador encontrado"}
          </h3>
          <p className="text-sm text-on-surface-variant mt-2">
            {operators.length === 0
              ? "Cadastre os operadores que conduzirão os maquinários locados."
              : "Ajuste a busca para encontrar o operador."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((operator) => (
            <div
              key={operator.id}
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 shrink-0 bg-tertiary-container text-on-tertiary rounded-full flex items-center justify-center font-headline font-bold text-sm">
                    {getInitials(operator.name)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-headline font-bold text-on-surface truncate">
                      {operator.name}
                    </h3>
                    <p className="text-sm text-on-surface-variant truncate">
                      {operator.email}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 px-3 py-1.5 font-bold text-[10px] rounded uppercase tracking-wider flex items-center gap-1.5 ${
                    operator.status === "active"
                      ? "bg-primary/10 text-primary dark:text-primary-bright border border-primary/20"
                      : "bg-secondary-container/20 text-secondary border border-secondary-container/30"
                  }`}
                >
                  <MaterialIcon
                    icon={operator.status === "active" ? "verified" : "info"}
                    size={14}
                  />
                  {operator.status === "active" ? "Ativo" : operator.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 mb-4">
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Documento
                  </div>
                  <div className="font-bold text-on-surface text-sm">
                    {maskDocument(operator.document)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Telefone
                  </div>
                  <div className="font-bold text-on-surface text-sm">
                    {maskPhone(operator.phone?.replace(/^\+55/, "") ?? "") || "—"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                    Localidade
                  </div>
                  <div className="font-bold text-on-surface text-sm">
                    {operator.city
                      ? `${operator.city}${operator.state ? ` / ${operator.state}` : ""}`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => openEdit(operator)}
                  className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-outline-variant/30 transition-colors flex items-center gap-2"
                >
                  <MaterialIcon icon="edit" size={16} /> Editar
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="text-error px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-error/10 transition-colors flex items-center gap-2">
                      <MaterialIcon icon="person_remove" size={16} /> Desvincular
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desvincular operador</AlertDialogTitle>
                      <AlertDialogDescription>
                        {operator.name} deixará de constar na sua equipe. A conta
                        dele continua existindo e o histórico de locações não é
                        alterado.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel variant="outline">Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleUnlink(operator)}>
                        Desvincular
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OperadoresPanel;
