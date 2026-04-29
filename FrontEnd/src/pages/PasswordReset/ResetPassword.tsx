import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { passwordPattern } from "@/utils/regexPatterns";
import type { PasswordResetConfirmRequest } from "@/services/PasswordResetService/models/PasswordResetConfirmRequest";
import { toast } from "sonner";
import { passwordResetService } from "@/services/PasswordResetService/PasswordResetService";
import { PasswordResetServiceError } from "@/services/PasswordResetService/errors/PasswordResetError";

// cleanup temporário para lidar com o token vindo do e-mail fake que
// o django fornece em ambiente de dev (pode tirar quando tivermos o fluxo real com resend ou outra coisa)
function decodeQPToken(raw: string): string {
  const stripped = raw.replace(/=/g, "");
  if (stripped.length === 45 && stripped.startsWith("3D")) {
    return stripped.slice(2);
  }
  return stripped;
}

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    const request: PasswordResetConfirmRequest = {
      token: decodeQPToken(token!),
      new_password: newPassword,
    };

    try {
      await passwordResetService.confirmPasswordReset(request);
      toast.success("Senha redefinida com sucesso!");
      navigate("/login");
    } catch (error) {
      if (error instanceof PasswordResetServiceError) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="font-headline text-3xl font-bold text-error">
                Link Inválido
              </h1>
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
              <h1 className="font-headline text-3xl font-bold text-primary">
                Nova Senha
              </h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">
                Escolha uma nova senha para sua conta
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Nova Senha
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  pattern={passwordPattern.regex.source}
                  title={passwordPattern.title}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  "Salvando..."
                ) : (
                  <>
                    <MaterialIcon icon="check" size={20} /> Redefinir Senha
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              <Link
                to="/forgot-password"
                className="font-bold text-primary hover:underline"
              >
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
