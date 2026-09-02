import type { ReactElement } from "react";
import { Navigate, Route } from "react-router";

import AdminLayout from "@/components/AdminLayout";
import AdminPlaceholder from "@/pages/admin/AdminPlaceholder";
import AdminAnuncios from "@/pages/admin/Anuncios";
import AdminDocumentos from "@/pages/admin/Documentos";
import AdminUsers from "@/pages/admin/Users";

/** Subárvore de administração. Renderizada dentro do bloco protegido. */
export const adminRoutes: ReactElement = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Navigate to="users" replace />} />
    <Route path="users" element={<AdminUsers />} />
    <Route path="anuncios" element={<AdminAnuncios />} />
    <Route path="documentos" element={<AdminDocumentos />} />
    <Route path="denuncias" element={<AdminPlaceholder title="Denúncias" />} />
    <Route path="relatorios" element={<AdminPlaceholder title="Relatórios" />} />
  </Route>
);
