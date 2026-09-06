import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { useForgotPasswordForm } from "@/features/auth/hooks/useAuthForms";
import { useRequestPasswordReset } from "@/features/auth/hooks/usePasswordReset";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";
import { GradientButton } from "@/shared/components/GradientButton";
import { PageHeader } from "@/shared/components/PageHeader";
import { PageShell } from "@/shared/components/PageShell";
import { HttpError } from "@/shared/http/errors";

const ForgotPassword = () => {
  const [sent, setSent] = useState(false);
  const form = useForgotPasswordForm();
  const requestReset = useRequestPasswordReset();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await requestReset.mutateAsync(values.email.toLowerCase());
      setSent(true);
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Não foi possível enviar o link.");
    }
  });

  return (
    <PageShell width="centered">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
          {sent ? (
            <>
              <PageHeader
                icon="mail"
                align="center"
                title="E-mail Enviado"
                subtitle="Se esse e-mail estiver cadastrado, você receberá um link de redefinição em instantes."
              />
              <p className="text-center">
                <Link
                  to="/login"
                  className="inline-block mt-8 text-sm font-bold text-primary hover:underline"
                >
                  Voltar ao login
                </Link>
              </p>
            </>
          ) : (
            <>
              <PageHeader
                icon="lock_reset"
                align="center"
                title="Esqueceu a Senha?"
                subtitle="Informe seu e-mail e enviaremos um link para redefinir sua senha"
                className="mb-10"
              />

              <form className="space-y-6" onSubmit={onSubmit} noValidate>
                <FormField label="E-mail" error={errors.email?.message}>
                  <input
                    type="email"
                    placeholder="contato@email.com"
                    className={inputClass(Boolean(errors.email))}
                    {...form.register("email")}
                  />
                </FormField>

                <GradientButton
                  type="submit"
                  icon="send"
                  pending={requestReset.isPending}
                  pendingLabel="Enviando..."
                >
                  Enviar Link
                </GradientButton>
              </form>

              <p className="text-center text-sm text-on-surface-variant mt-8">
                Lembrou a senha?{" "}
                <Link to="/login" className="font-bold text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default ForgotPassword;
