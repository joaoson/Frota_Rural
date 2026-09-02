import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import { useLoginForm } from "@/features/auth/hooks/useAuthForms";
import { useLogin } from "@/features/auth/hooks/useLogin";
import { parseJwt } from "@/shared/auth/jwt";
import { FormField } from "@/shared/components/FormField";
import { inputClass } from "@/shared/components/inputStyles";
import { GradientButton } from "@/shared/components/GradientButton";
import { PageHeader } from "@/shared/components/PageHeader";
import { PageShell } from "@/shared/components/PageShell";
import { PasswordField } from "@/shared/components/PasswordField";
import { HttpError } from "@/shared/http/errors";

const Login = () => {
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
      toast.error(
        error instanceof HttpError ? error.message : "Não foi possível entrar. Tente novamente.",
      );
    }
  });

  return (
    <PageShell width="centered">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
          <PageHeader
            icon="lock"
            align="center"
            title="Acesso à Plataforma"
            subtitle="Entre com suas credenciais para continuar"
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

            <PasswordField
              label="Senha"
              placeholder="••••••••"
              error={errors.password?.message}
              {...form.register("password")}
            />

            <div className="flex justify-between items-center">
              <Link to="/forgot-password" className="text-sm font-bold text-primary hover:underline">
                Esqueceu a senha?
              </Link>
            </div>

            <GradientButton
              type="submit"
              icon="person_add"
              pending={login.isPending}
              pendingLabel="Carregando..."
            >
              Entrar na Plataforma
            </GradientButton>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-8">
            Não tem conta?{" "}
            <Link to="/signup" className="font-bold text-primary hover:underline">
              Crie agora
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
};

export default Login;
