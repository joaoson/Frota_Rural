import { useState } from "react";
import { Link, useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { passwordPattern } from "@/utils/regexPatterns";
import type { LoginUserRequest } from "@/services/UserService/models/LoginUserRequest";
import { userService } from "@/services/UserService/UserService";
import { UserServiceError } from "@/services/UserService/errors/UserError";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { parseJwt, type JwtPayload } from "@/utils/jwt";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      
      if (user.role === "locador") {
        navigate("/dashboard");
      } else {
        navigate("/dashboard-locatario");
      }
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
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 pr-12 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                    required
                    pattern={passwordPattern.regex.source}
                    title={passwordPattern.title}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
                  >
                    <MaterialIcon icon={showPassword ? "visibility_off" : "visibility"} size={20} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Link
                  to="/forgot-password"
                  className="text-sm font-bold text-primary hover:underline"
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
                className="font-bold text-primary hover:underline"
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
