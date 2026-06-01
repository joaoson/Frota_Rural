import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { userService } from "@/services/UserService/UserService";
import { parseJwt, type JwtPayload } from "@/utils/jwt";

type ProtectedRouteProps = {
  allowedRoles?: string[];
};

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, userRole, login } = useAuth();
  const [isVerifying, setIsVerifying] = useState(!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      setIsVerifying(false);
      return;
    }

    userService
      .silentRefresh()
      .then(async (response) => {
        const payload = parseJwt<JwtPayload>(response.access);
        try {
          const user = await userService.getById(payload.user_id);
          login(response, user.role);
        } catch {
          login(response);
        }
      })
      .catch(() => {})
      .finally(() => setIsVerifying(false));
  }, [isAuthenticated, login]);

  if (isVerifying) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    if (userRole === "locador") return <Navigate to="/dashboard" replace />;
    if (userRole === "locatario") return <Navigate to="/dashboard-locatario" replace />;
    if (userRole === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
