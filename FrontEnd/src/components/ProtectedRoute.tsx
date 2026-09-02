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
      const access = await authStore.restoreSession();
      if (cancelled) return;
      if (access) login({ access }, parseJwt(access)?.role ?? null);
      setIsVerifying(false);
    })();

    return () => {
      cancelled = true;
    };
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
