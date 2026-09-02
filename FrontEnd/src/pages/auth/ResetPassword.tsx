import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { useResetPasswordForm } from "@/features/auth/hooks/useAuthForms";
import { useConfirmPasswordReset } from "@/features/auth/hooks/usePasswordReset";
import { GradientButton } from "@/shared/components/GradientButton";
import { PageHeader } from "@/shared/components/PageHeader";
import { PageShell } from "@/shared/components/PageShell";
import { PasswordField } from "@/shared/components/PasswordField";
import { HttpError } from "@/shared/http/errors";

// cleanup temporário para lidar com o token vindo do e-mail fake que
// o django fornece em ambiente de dev (pode tirar quando tivermos o fluxo real com resend ou outra coisa)
// PASSAR NA REQUEST SE ESTIVER USANDO DJANGO EMAIL
function decodeQPToken(raw: string): string {
  const stripped = raw.replace(/=/g, "");
  if (stripped.length === 45 && stripped.startsWith("3D")) {
    return stripped.slice(2);
  }
  return stripped;
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const form = useResetPasswordForm();
  const confirmReset = useConfirmPasswordReset();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!token) return;
    try {
      await confirmReset.mutateAsync({
        token: decodeQPToken(token),
        newPassword: values.newPassword,
      });
      toast.success("Senha redefinida com sucesso!");
      navigate("/login");
    } catch (error) {
      toast.error(
        error instanceof HttpError ? error.message : "Não foi possível redefinir a senha.",
      );
    }
  });

  const card =
    "bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10";

  if (!token) {
    return (
      <PageShell width="centered">
        <div className="w-full max-w-md">
          <div className={`${card} text-center`}>
            <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-outlined">link_off</span>
            </div>
            <h1 className="font-headline text-3xl font-bold text-error">Link Inválido</h1>
            <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
            <p className="text-sm text-on-surface-variant mt-4">
              Este link de redefinição é inválido ou está incompleto.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block mt-8 text-sm font-bold text-primary hover:underline"
            >
              Solicitar novo link
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="centered">
      <div className="w-full max-w-md">
        <div className={card}>
          <PageHeader
            icon="lock_open"
            align="center"
            title="Nova Senha"
            subtitle="Escolha uma nova senha para sua conta"
            className="mb-10"
          />

          <form className="space-y-6" onSubmit={onSubmit} noValidate>
            <PasswordField
              label="Nova Senha"
              placeholder="••••••••"
              error={errors.newPassword?.message}
              {...form.register("newPassword")}
            />
            <PasswordField
              label="Confirmar Nova Senha"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...form.register("confirmPassword")}
            />

            <GradientButton
              type="submit"
              icon="check"
              pending={confirmReset.isPending}
              pendingLabel="Salvando..."
            >
              Redefinir Senha
            </GradientButton>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-8">
            <Link to="/forgot-password" className="font-bold text-primary hover:underline">
              Solicitar novo link
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
};

export default ResetPassword;
