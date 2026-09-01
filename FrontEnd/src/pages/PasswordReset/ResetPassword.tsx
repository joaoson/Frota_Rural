import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useResetPasswordForm } from "@/features/auth/hooks/useAuthForms";
import { useConfirmPasswordReset } from "@/features/auth/hooks/usePasswordReset";
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

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
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

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10 text-center">
              <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="link_off" size={32} />
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
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="lock_open" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary">Nova Senha</h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">
                Escolha uma nova senha para sua conta
              </p>
            </div>

            <form className="space-y-6" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Nova Senha
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className={inputClass(Boolean(errors.newPassword))}
                  {...form.register("newPassword")}
                />
                {errors.newPassword && (
                  <p className="text-[11px] text-error font-medium mt-1">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className={inputClass(Boolean(errors.confirmPassword))}
                  {...form.register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-[11px] text-error font-medium mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={confirmReset.isPending}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {confirmReset.isPending ? (
                  "Salvando..."
                ) : (
                  <>
                    <MaterialIcon icon="check" size={20} /> Redefinir Senha
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              <Link to="/forgot-password" className="font-bold text-primary hover:underline">
                Solicitar novo link
              </Link>
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
