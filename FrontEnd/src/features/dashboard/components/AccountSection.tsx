import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router";

import { useChangePassword, useUpdateProfile } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user";
import { FormField } from "@/shared/components/FormField";
import { PageHeader } from "@/shared/components/PageHeader";
import { PasswordField } from "@/shared/components/PasswordField";
import { useCepLookup } from "@/shared/hooks/useCepLookup";
import { formatAddress } from "@/shared/http/ViaCepClient";
import { BRAZILIAN_STATES } from "@/shared/utils/brazilianStates";
import { BadRequestError } from "@/shared/http/errors";
import { clearSpecialChars } from "@/shared/utils/clearSpecialChars";
import { getInitials } from "@/shared/utils/getInitials";
import { maskCEP } from "@/shared/utils/masks/maskCEP";
import { maskDocument } from "@/shared/utils/masks/maskDocument";
import { maskPhone } from "@/shared/utils/masks/maskPhone";
import { passwordPattern } from "@/shared/utils/regexPatterns";
import { validateDocument } from "@/shared/utils/validation/validateDocument";

const ACCOUNT_INPUT =
  "w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm";
const ACCOUNT_PASSWORD_INPUT =
  "w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm";
const ACCOUNT_LABEL = "text-xs font-bold uppercase tracking-wider text-outline";


interface AccountSectionProps {
  userId: string | null;
  user: User | null | undefined;
  roleLabel: React.ReactNode;
  avatarClassName?: string;
}

export function AccountSection({
  userId,
  user,
  roleLabel,
  avatarClassName = "bg-primary-container text-on-primary",
}: AccountSectionProps) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { lookup } = useCepLookup();

  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formCep, setFormCep] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const documentRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const cepRequest = useRef(0);
  const profileSubmitting = useRef(false);
  const passwordSubmitting = useRef(false);

  useEffect(() => () => { cepRequest.current += 1; }, [userId]);

  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setFormName(user.name);
    setFormDocument(validateDocument(user.document) ? maskDocument(user.document) : user.document);
    setFormEmail(user.email);
    setFormPhone(maskPhone(user.phone?.replace(/^\+55/, "") ?? ""));
    setFormAddress(user.address);
    setFormCity(user.city ?? "");
    setFormState(user.state ?? "");
    setFormCep(maskCEP(user.cep ?? ""));
  }

  const savedDocument = user ? (validateDocument(user.document) ? maskDocument(user.document) : user.document) : "";
  const documentUnchanged = formDocument === savedDocument;

  const handleDocumentBlur = () => {
    const input = documentRef.current;
    if (!input) return;
    if (documentUnchanged) { input.setCustomValidity(""); return; }
    const digits = formDocument.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!documentUnchanged && !validateDocument(formDocument)) {
      input.setCustomValidity(
        digits.length === 14
          ? "CNPJ inválido. Verifique os dígitos informados."
          : "CPF inválido. Verifique os dígitos informados.",
      );
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    }
  };

  const handleCepChange = async (value: string) => {
    const request = ++cepRequest.current;
    const masked = maskCEP(value);
    setFormCep(masked);
    const digits = masked.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const address = await lookup(digits);
      if (request !== cepRequest.current) return;
      setFormAddress(formatAddress(address, "logradouro"));
      setFormCity(address.city);
      setFormState(address.state.toUpperCase());
    } catch {
      if (request !== cepRequest.current) return;
      toast.error("CEP não encontrado.");
    }
  };

  const handleUpdateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || !user || profileSubmitting.current) return;
    if (!documentUnchanged && !validateDocument(formDocument)) {
      documentRef.current?.setCustomValidity("CPF ou CNPJ inválido.");
      documentRef.current?.reportValidity();
      return;
    }
    profileSubmitting.current = true;
    cepRequest.current += 1;
    try {
      await updateProfile.mutateAsync({
        id: userId,
        input: {
          name: formName.trim(),
          document: documentUnchanged ? user.document : clearSpecialChars(formDocument),
          email: formEmail.toLowerCase().trim(),
          phone: `+55${clearSpecialChars(formPhone)}`,
          address: formAddress.trim(),
          city: formCity.trim(),
          state: formState.toUpperCase(),
          cep: clearSpecialChars(formCep),
        },
      });
      toast.success("Dados atualizados com sucesso.");
    } catch (error) {
      if (error instanceof BadRequestError) {
        return toast.error(Object.values(error.fieldErrors).flat()[0] ?? error.message);
      }
      toast.error("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      profileSubmitting.current = false;
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || !user || passwordSubmitting.current) return;
    if (newPassword !== confirmPassword) {
      confirmPasswordRef.current?.setCustomValidity("As senhas não coincidem.");
      confirmPasswordRef.current?.reportValidity();
      return;
    }
    confirmPasswordRef.current?.setCustomValidity("");
    passwordSubmitting.current = true;
    try {
      await changePassword.mutateAsync({ id: userId, currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof BadRequestError
          ? Object.values(error.fieldErrors).flat()[0] ?? error.message
          : "Não foi possível alterar a senha. Tente novamente.",
      );
    } finally {
      passwordSubmitting.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Minha Conta" subtitle="Edite suas informações de cadastro" compact />
      {user?.role === "operador" && (
        <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 space-y-3">
          <h2 className="font-headline text-xl font-bold">Meus documentos</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/document/cnh" className="font-bold text-primary hover:underline">Enviar ou atualizar CNH</Link>
            <Link to="/document/certification" className="font-bold text-primary hover:underline">Enviar certificação</Link>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form
          onSubmit={handleUpdateProfile}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 shadow-sm"
        >
          <h2 className="font-headline text-xl font-bold text-tertiary">Dados Pessoais</h2>

          <div className="flex items-center gap-6 pb-2">
            <div>
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center font-headline font-bold text-2xl ${avatarClassName}`}
              >
                {user ? getInitials(user.name) : "…"}
              </div>
            </div>
            <div>
              <div className="font-bold text-on-surface">{user?.name ?? "…"}</div>
              <div className="text-sm text-on-surface-variant mb-2">{roleLabel}</div>
            </div>
          </div>

          <fieldset disabled={!user || updateProfile.isPending} className="space-y-4">
            <FormField label="Nome Completo" labelClassName={ACCOUNT_LABEL}>
              <input
                type="text"
                required
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <FormField label="CPF / CNPJ" labelClassName={ACCOUNT_LABEL}>
              <input
                ref={documentRef}
                type="text"
                required
                value={formDocument}
                onChange={(event) => {
                  setFormDocument(maskDocument(event.target.value));
                  documentRef.current?.setCustomValidity("");
                }}
                onBlur={handleDocumentBlur}
                pattern={documentUnchanged ? undefined : "\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}|\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}"}
                title="Informe um CPF válido (000.000.000-00) ou CNPJ válido (00.000.000/0001-00)"
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <FormField label="E-mail" labelClassName={ACCOUNT_LABEL}>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <FormField label="Telefone" labelClassName={ACCOUNT_LABEL}>
              <input
                type="tel"
                required
                value={formPhone}
                onChange={(event) => setFormPhone(maskPhone(event.target.value))}
                pattern="\(\d{2}\) \d{4,5}-\d{4}"
                title="Informe um telefone válido no formato (00) 90000-0000"
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <FormField label="CEP" labelClassName={ACCOUNT_LABEL}>
              <input
                type="text"
                placeholder="00000-000"
                value={formCep}
                onChange={(event) => void handleCepChange(event.target.value)}
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <FormField label="Endereço" labelClassName={ACCOUNT_LABEL}>
              <input
                type="text"
                required
                value={formAddress}
                onChange={(event) => { cepRequest.current += 1; setFormAddress(event.target.value); }}
                className={ACCOUNT_INPUT}
              />
            </FormField>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="Cidade" labelClassName={ACCOUNT_LABEL} className="col-span-2">
                <input
                  type="text"
                  value={formCity}
                  onChange={(event) => { cepRequest.current += 1; setFormCity(event.target.value); }}
                  className={ACCOUNT_INPUT}
                />
              </FormField>

              <FormField label="Estado" labelClassName={ACCOUNT_LABEL}>
                <select
                  value={formState}
                  onChange={(event) => { cepRequest.current += 1; setFormState(event.target.value); }}
                  className={ACCOUNT_INPUT}
                >
                  <option value="">--</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={!user || updateProfile.isPending}
            className="w-full bg-primary text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all text-sm"
          >
            {updateProfile.isPending ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>

        <form
          onSubmit={handleUpdatePassword}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 h-fit shadow-sm"
        >
          <h2 className="font-headline text-xl font-bold text-tertiary">Alterar Senha</h2>

          <fieldset disabled={!user || changePassword.isPending} className="space-y-4">
            <PasswordField
              label="Senha Atual"
              labelClassName={ACCOUNT_LABEL}
              inputClassName={ACCOUNT_PASSWORD_INPUT}
              placeholder="••••••••"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />

            <PasswordField
              label="Nova Senha"
              labelClassName={ACCOUNT_LABEL}
              inputClassName={ACCOUNT_PASSWORD_INPUT}
              placeholder="••••••••"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                confirmPasswordRef.current?.setCustomValidity("");
              }}
              required
              pattern={passwordPattern.regex.source}
              title={passwordPattern.title}
            />

            <PasswordField
              ref={confirmPasswordRef}
              label="Confirmar Nova Senha"
              labelClassName={ACCOUNT_LABEL}
              inputClassName={ACCOUNT_PASSWORD_INPUT}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                confirmPasswordRef.current?.setCustomValidity("");
              }}
              required
            />
          </fieldset>

          <button
            type="submit"
            disabled={!user || changePassword.isPending}
            className="w-full bg-secondary-container text-on-secondary-container font-bold py-3.5 rounded-lg hover:brightness-95 transition-all text-sm"
          >
            {changePassword.isPending ? "Alterando..." : "Alterar Senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
