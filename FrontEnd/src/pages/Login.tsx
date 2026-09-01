import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useLoginForm } from "@/features/auth/hooks/useAuthForms";
import { useLogin } from "@/features/auth/hooks/useLogin";
import { parseJwt } from "@/shared/auth/jwt";
import { HttpError } from "@/shared/http/errors";

const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

function inputClass(hasError: boolean, extra = ""): string {
  return `${INPUT_BASE} ${extra} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const form = useLoginForm();
  const login = useLogin();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const access = await login.mutateAsync({
        email: values.email.toLowerCase(),
        password: values.password,
      });

      toast.success("Login realizado com sucesso!");

      const role = parseJwt(access)?.role ?? null;
      const from = (location.state as { from?: string } | null)?.from;

      if (from) navigate(from, { replace: true });
      else if (role === "locador") navigate("/dashboard");
      else navigate("/dashboard-locatario");
    } catch (error) {
      // InvalidCredentials (401) e AccountDisabled (403) já chegam traduzidos
      // pelo AuthRepository, com mensagens distintas.
      toast.error(
        error instanceof HttpError ? error.message : "Não foi possível entrar. Tente novamente.",
      );
    }
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="lock" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary">
                Acesso à Plataforma
              </h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">
                Entre com suas credenciais para continuar
              </p>
            </div>

            <form className="space-y-6" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  E-mail
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
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
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

              <div className="flex justify-between items-center">
                <Link to="/forgot-password" className="text-sm font-bold text-primary hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>

              <button
                type="submit"
                disabled={login.isPending}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {login.isPending ? (
                  "Carregando..."
                ) : (
                  <>
                    <MaterialIcon icon="person_add" size={20} /> Entrar na Plataforma
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              Não tem conta?{" "}
              <Link to="/signup" className="font-bold text-primary hover:underline">
                Crie agora
              </Link>
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
