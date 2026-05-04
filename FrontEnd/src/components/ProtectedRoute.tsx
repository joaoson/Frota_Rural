import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { userService } from "@/services/UserService/UserService";

const ProtectedRoute = () => {
  const { isAuthenticated, login } = useAuth();
  const [isVerifying, setIsVerifying] = useState(!isAuthenticated);

  // Checa validade do token e tenta fazer silent refresh com base no cookie salvo
  // de refresh token. Enquanto isso, bloqueia acesso às rotas protegidas (retorna null).
  useEffect(() => {
    if (isAuthenticated) {
      setIsVerifying(false);
      return;
    }

    userService
      .silentRefresh()
      .then((response) => login(response))
      .catch(() => {})
      .finally(() => setIsVerifying(false));
  }, []);

  if (isVerifying) return null;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
