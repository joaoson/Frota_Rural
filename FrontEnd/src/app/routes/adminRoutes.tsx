import type { ReactElement } from "react";
import { Navigate, Route } from "react-router";

import AdminLayout from "@/components/AdminLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminPlaceholder from "@/pages/admin/AdminPlaceholder";
import AdminAnuncios from "@/pages/admin/Anuncios";
import AdminDocumentos from "@/pages/admin/Documentos";
import AdminDenuncias from "@/pages/admin/Denuncias";
import AdminUsers from "@/pages/admin/Users";

// Sem a guarda de papel, qualquer usuário autenticado abria /admin e batia nos
// endpoints de moderação.
export const adminRoutes: ReactElement = (
  <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<Navigate to="users" replace />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="anuncios" element={<AdminAnuncios />} />
      <Route path="documentos" element={<AdminDocumentos />} />
      <Route path="denuncias" element={<AdminDenuncias />} />
      <Route path="relatorios" element={<AdminPlaceholder title="Relatórios" />} />
    </Route>
  </Route>
);
