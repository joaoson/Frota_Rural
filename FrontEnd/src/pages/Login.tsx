import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { LoginUserRequest } from "@/services/UserService/models/LoginUserRequest";
import { userService } from "@/services/UserService/UserService";
import { UserServiceError } from "@/services/UserService/errors/UserError";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { parseJwt, type JwtPayload } from "@/utils/jwt";
import { homeRouteForRole } from "@/utils/homeRoute";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const validateField = (fieldName: string, value: string) => {
    let errorMsg = "";
    if (fieldName === "email") {
      const trimmed = value.trim();
      if (!trimmed) errorMsg = "E-mail é obrigatório.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) errorMsg = "E-mail inválido.";
    } else if (fieldName === "password") {
      if (!value) errorMsg = "Senha é obrigatória.";
    }
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const emailError = validateField("email", email);
    const passwordError = validateField("password", password);

    if (emailError || passwordError) {
      toast.error("Por favor, preencha as credenciais corretamente.");
      return;
    }

    setLoading(true);

    const request: LoginUserRequest = {
      email: email.toLowerCase().trim(),
      password: password.trim(),
    };

    try {
      const response = await userService.login(request);
      const payload = parseJwt<JwtPayload>(response.access);
      const user = await userService.getById(payload.user_id);
      
      login(response, user.role);
      toast.success("Login realizado com sucesso!");
      
      const from = (location.state as any)?.from;
      navigate(from ?? homeRouteForRole(user.role), { replace: true });
    } catch (error) {
      if (error instanceof UserServiceError) {
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
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 text-primary dark:text-primary-bright rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="lock" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">
                Acesso à Plataforma
              </h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">
                Entre com suas credenciais para continuar
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label htmlFor="e-mail" className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  E-mail
                </label>
                <input id="e-mail"
                  type="email"
                  placeholder="contato@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) validateField("email", e.target.value);
                  }}
                  onBlur={(e) => validateField("email", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.email ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.email && <p className="text-[11px] text-error font-medium mt-1">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="senha" className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha
                </label>
                <div className="relative">
                  <input id="senha"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) validateField("password", e.target.value);
                    }}
                    onBlur={(e) => validateField("password", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 pr-12 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.password ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                  >
                    <MaterialIcon icon={showPassword ? "visibility_off" : "visibility"} size={20} />
                  </button>
                </div>
                {errors.password && <p className="text-[11px] text-error font-medium mt-1">{errors.password}</p>}
              </div>
              <div className="flex justify-between items-center">
                <Link
                  to="/forgot-password"
                  className="text-sm font-bold text-primary dark:text-primary-bright hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  "Carregando..."
                ) : (
                  <>
                    <MaterialIcon icon="person_add" size={20} /> Entrar na
                    Plataforma
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              Não tem conta?{" "}
              <Link
                to="/signup"
                className="font-bold text-primary dark:text-primary-bright hover:underline"
              >
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
