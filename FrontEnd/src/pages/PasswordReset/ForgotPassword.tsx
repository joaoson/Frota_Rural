import { useState } from "react";
import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { PasswordResetRequest } from "@/services/PasswordResetService/models/PasswordResetRequest";
import { toast } from "sonner";
import { passwordResetService } from "@/services/PasswordResetService/PasswordResetService";
import { PasswordResetServiceError } from "@/services/PasswordResetService/errors/PasswordResetError";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const request: PasswordResetRequest = {
      email: email.toLowerCase().trim(),
    };

    try {
      await passwordResetService.requestPasswordReset(request);
      setSent(true);
    } catch (error) {
      if (error instanceof PasswordResetServiceError) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
            {sent ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <MaterialIcon icon="mail" size={32} />
                </div>
                <h1 className="font-headline text-3xl font-bold text-primary">
                  E-mail Enviado
                </h1>
                <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
                <p className="text-sm text-on-surface-variant mt-4">
                  Se esse e-mail estiver cadastrado, você receberá um link de
                  redefinição em instantes.
                </p>
                <Link
                  to="/login"
                  className="inline-block mt-8 text-sm font-bold text-primary hover:underline"
                >
                  Voltar ao login
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-10">
                  <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <MaterialIcon icon="lock_reset" size={32} />
                  </div>
                  <h1 className="font-headline text-3xl font-bold text-primary">
                    Esqueceu a Senha?
                  </h1>
                  <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
                  <p className="text-sm text-on-surface-variant">
                    Informe seu e-mail e enviaremos um link para redefinir sua
                    senha
                  </p>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      E-mail
                    </label>
                    <input
                      type="email"
                      placeholder="contato@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      "Enviando..."
                    ) : (
                      <>
                        <MaterialIcon icon="send" size={20} /> Enviar Link
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-on-surface-variant mt-8">
                  Lembrou a senha?{" "}
                  <Link
                    to="/login"
                    className="font-bold text-primary hover:underline"
                  >
                    Entrar
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
