import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/contexts/AuthContext";

type ProtectedRouteProps = {
  allowedRoles?: string[];
};

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, userRole } = useAuth();
  const location = useLocation();

  // O AuthProvider ainda está restaurando a sessão pelo cookie de refresh
  if (isLoading) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    if (userRole === "locador") return <Navigate to="/dashboard" replace />;
    if (userRole === "locatario") return <Navigate to="/dashboard-locatario" replace />;
    if (userRole === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
