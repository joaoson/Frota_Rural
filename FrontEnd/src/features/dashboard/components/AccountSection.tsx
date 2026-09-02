import { useRef, useState } from "react";
import { toast } from "sonner";

import MaterialIcon from "@/components/MaterialIcon";
import { useChangePassword, useUpdateProfile } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user";
import { FormField } from "@/shared/components/FormField";
import { PageHeader } from "@/shared/components/PageHeader";
import { PasswordField } from "@/shared/components/PasswordField";
import { useCepLookup } from "@/shared/hooks/useCepLookup";
import { BadRequestError } from "@/shared/http/errors";
import { clearSpecialChars } from "@/shared/utils/clearSpecialChars";
import { getInitials } from "@/shared/utils/getInitials";
import { maskCEP } from "@/shared/utils/masks/maskCEP";
import { maskDocument } from "@/shared/utils/masks/maskDocument";
import { maskPhone } from "@/shared/utils/masks/maskPhone";
import { passwordPattern } from "@/shared/utils/regexPatterns";
import { validateCNPJ } from "@/shared/utils/validation/validateCNPJ";
import { validateCPF } from "@/shared/utils/validation/validateCPF";

/**
 * Aba "Minha Conta" dos dois dashboards.
 *
 * Eram duas cópias de ~200 linhas de JSX mais ~15 `useState` cada. Além do
 * estilo, elas tinham divergido em comportamento; ao unificar ficou valendo o
 * lado mais completo (o do locador):
 *
 * - CPF/telefone validados por `pattern` + `title` no HTML — o locatário não tinha;
 * - falha de CEP vira `toast.error`, em vez de só um `console.error` silencioso;
 * - digitar no campo de documento limpa o `setCustomValidity` anterior.
 */
const ACCOUNT_INPUT =
  "w-full bg-surface-container border-none rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm";
const ACCOUNT_PASSWORD_INPUT =
  "w-full bg-surface-container border-none rounded-lg p-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm";
const ACCOUNT_LABEL = "text-xs font-bold uppercase tracking-wider text-outline";

function validateDocument(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return validateCPF(digits);
  if (digits.length === 14) return validateCNPJ(digits);
  return false;
}

interface AccountSectionProps {
  userId: string | null;
  user: User | null | undefined;
  /** Papel exibido sob o nome. Cada dashboard rotula o seu. */
  roleLabel: React.ReactNode;
  /** Cor do avatar: cada papel usa a sua. */
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
  const [formCep, setFormCep] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const documentRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Preenche o formulário quando o usuário chega do cache/rede. É o ajuste de
  // estado em render que a documentação do React recomenda no lugar de um
  // efeito que só chama setState — evita o render em cascata.
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setFormName(user.name);
    setFormDocument(maskDocument(user.document));
    setFormEmail(user.email);
    setFormPhone(maskPhone(user.phone?.replace(/^\+55/, "") ?? ""));
    setFormAddress(user.address);
    setFormCep(maskCEP(user.cep ?? ""));
  }

  const handleDocumentBlur = () => {
    const input = documentRef.current;
    if (!input) return;
    const digits = formDocument.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!validateDocument(formDocument)) {
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
    const masked = maskCEP(value);
    setFormCep(masked);
    const digits = masked.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const address = await lookup(digits);
      setFormAddress(
        [address.street, address.neighborhood, address.city, address.state]
          .filter(Boolean)
          .join(", "),
      );
    } catch {
      toast.error("CEP não encontrado.");
    }
  };

  const handleUpdateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    if (!validateDocument(formDocument)) {
      documentRef.current?.setCustomValidity("CPF ou CNPJ inválido.");
      documentRef.current?.reportValidity();
      return;
    }
    try {
      await updateProfile.mutateAsync({
        id: userId,
        input: {
          name: formName.trim(),
          document: clearSpecialChars(formDocument),
          email: formEmail.toLowerCase().trim(),
          phone: `+55${clearSpecialChars(formPhone)}`,
          address: formAddress.trim(),
          cep: clearSpecialChars(formCep),
        },
      });
      toast.success("Dados atualizados com sucesso.");
    } catch (error) {
      if (error instanceof BadRequestError) {
        if (error.firstErrorFor("email")) return toast.error("Este e-mail já está em uso.");
        if (error.firstErrorFor("document"))
          return toast.error("Este documento já está cadastrado.");
      }
      toast.error("Não foi possível salvar as alterações. Tente novamente.");
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    if (newPassword !== confirmPassword) {
      confirmPasswordRef.current?.setCustomValidity("As senhas não coincidem.");
      confirmPasswordRef.current?.reportValidity();
      return;
    }
    confirmPasswordRef.current?.setCustomValidity("");
    try {
      await changePassword.mutateAsync({ id: userId, currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof BadRequestError
          ? "Senha atual incorreta."
          : "Não foi possível alterar a senha. Tente novamente.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Minha Conta" subtitle="Edite suas informações de cadastro" compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form
          onSubmit={handleUpdateProfile}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 shadow-sm"
        >
          <h2 className="font-headline text-xl font-bold text-tertiary">Dados Pessoais</h2>

          <div className="flex items-center gap-6 pb-2">
            <div className="relative group">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center font-headline font-bold text-2xl ${avatarClassName}`}
              >
                {user ? getInitials(user.name) : "…"}
              </div>
              <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <MaterialIcon icon="photo_camera" className="text-white" size={24} />
                <input type="file" accept="image/*" className="hidden" />
              </label>
            </div>
            <div>
              <div className="font-bold text-on-surface">{user?.name ?? "…"}</div>
              <div className="text-sm text-on-surface-variant mb-2">{roleLabel}</div>
              <label className="text-xs font-bold text-primary cursor-pointer hover:underline flex items-center gap-1">
                <MaterialIcon icon="upload" size={14} /> Alterar foto
                <input type="file" accept="image/*" className="hidden" />
              </label>
            </div>
          </div>

          <div className="space-y-4">
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
                pattern="\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}"
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
                onChange={(event) => setFormAddress(event.target.value)}
                className={ACCOUNT_INPUT}
              />
            </FormField>
          </div>

          <button
            type="submit"
            className="w-full bg-primary text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all text-sm"
          >
            Salvar Alterações
          </button>
        </form>

        <form
          onSubmit={handleUpdatePassword}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 space-y-6 h-fit shadow-sm"
        >
          <h2 className="font-headline text-xl font-bold text-tertiary">Alterar Senha</h2>

          <div className="space-y-4">
            <PasswordField
              label="Senha Atual"
              labelClassName={ACCOUNT_LABEL}
              inputClassName={ACCOUNT_PASSWORD_INPUT}
              placeholder="••••••••"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              minLength={8}
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
          </div>

          <button
            type="submit"
            className="w-full bg-secondary-container text-on-secondary-container font-bold py-3.5 rounded-lg hover:brightness-95 transition-all text-sm"
          >
            Alterar Senha
          </button>
        </form>
      </div>
    </div>
  );
}
