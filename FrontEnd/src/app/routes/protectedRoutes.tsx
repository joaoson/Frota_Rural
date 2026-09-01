import type { ReactElement } from "react";
import { Route } from "react-router";

import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLocador from "@/pages/DashboardLocador";
import DashboardLocatario from "@/pages/DashboardLocatario";
import CertificationUpload from "@/pages/Documents/CertificationUpload";
import CNHUpload from "@/pages/Documents/CNHUpload";
import GerenciarAnuncio from "@/pages/GerenciarAnuncio";
import NovoAnuncio from "@/pages/NovoAnuncio";
import NovoEquipamento from "@/pages/NovoEquipamento";

import { adminRoutes } from "./adminRoutes";

/**
 * Rotas que exigem sessão. O bloco externo garante autenticação; o interno
 * restringe por papel.
 */
export const protectedRoutes: ReactElement = (
  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<DashboardLocador />} />
    <Route path="/dashboard-locatario" element={<DashboardLocatario />} />

    <Route element={<ProtectedRoute allowedRoles={["locador", "admin"]} />}>
      <Route path="/dashboard/novo-equipamento" element={<NovoEquipamento />} />
    </Route>

    <Route path="/dashboard/novo-anuncio" element={<NovoAnuncio />} />
    <Route path="/dashboard/gerenciar-anuncio/:id" element={<GerenciarAnuncio />} />

    <Route path="/document/cnh" element={<CNHUpload />} />
    <Route path="/document/certification" element={<CertificationUpload />} />
    <Route path="/document/certification/:id" element={<CertificationUpload />} />

    {adminRoutes}
  </Route>
);
