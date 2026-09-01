import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

import { authStore } from "@/app/container";
import { useAuth } from "@/contexts/useAuth";
import { parseJwt } from "@/shared/auth/jwt";

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

const ROLE_HOME: Record<string, string> = {
  locador: "/dashboard",
  locatario: "/dashboard-locatario",
  admin: "/admin",
};

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, userRole, login } = useAuth();
  const [isVerifying, setIsVerifying] = useState(!isAuthenticated);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setIsVerifying(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      // O papel vem da claim do próprio token — sem GET /users/{id} extra.
      const access = await authStore.restoreSession();
      if (cancelled) return;
      if (access) login({ access }, parseJwt(access)?.role ?? null);
      setIsVerifying(false);
    })();

    return () => {
      cancelled = true;
    };
    // `login` é recriado a cada render do provider; incluí-lo faria o efeito
    // rodar em loop. A intenção é rodar uma vez por mudança de autenticação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isVerifying) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to={ROLE_HOME[userRole] ?? "/"} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
