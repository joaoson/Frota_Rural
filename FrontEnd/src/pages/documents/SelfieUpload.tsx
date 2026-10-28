import { Navigate } from "react-router";
import { useAuth } from "@/contexts/useAuth";
import { homeRouteForRole } from "@/shared/utils/homeRoute";

// Preserve old bookmarks without offering the former simulated upload.
export default function SelfieUpload() {
  const { isLoading, isAuthenticated, userRole } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const home = homeRouteForRole(userRole);
  return <Navigate to={home === "/admin" ? home : `${home}?tab=conta`} replace />;
}
