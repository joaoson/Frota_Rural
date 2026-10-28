import type { ReactElement } from "react";
import { Route } from "react-router";

import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLocador from "@/pages/dashboard/DashboardLocador";
import DashboardLocatario from "@/pages/dashboard/DashboardLocatario";
import AnaliseLocacao from "@/pages/contracts/AnaliseLocacao";
import Mensagens from "@/pages/messages/Mensagens";
import CertificationUpload from "@/pages/documents/CertificationUpload";
import CNHUpload from "@/pages/documents/CNHUpload";
import GerenciarAnuncio from "@/pages/postings/GerenciarAnuncio";
import NovoAnuncio from "@/pages/postings/NovoAnuncio";
import NovoEquipamento from "@/pages/machines/NovoEquipamento";
import Reservar from "@/pages/postings/Reservar";

import { adminRoutes } from "./adminRoutes";

export const protectedRoutes: ReactElement = (
  <Route element={<ProtectedRoute />}>
    <Route element={<ProtectedRoute allowedRoles={["locatario", "admin"]} />}>
      <Route path="/reservar/:id" element={<Reservar />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={["locatario", "operador", "admin"]} />}>
      <Route path="/dashboard-locatario" element={<DashboardLocatario />} />
      <Route path="/dashboard-locatario/locacoes/:rentalId" element={<AnaliseLocacao />} />
    </Route>

    <Route path="/mensagens" element={<Mensagens />} />
    <Route path="/mensagens/:threadId" element={<Mensagens />} />

    <Route element={<ProtectedRoute allowedRoles={["locador", "admin"]} />}>
      <Route path="/dashboard" element={<DashboardLocador />} />
      <Route path="/dashboard/novo-equipamento" element={<NovoEquipamento />} />
      <Route path="/dashboard/novo-anuncio" element={<NovoAnuncio />} />
      <Route path="/dashboard/gerenciar-anuncio/:id" element={<GerenciarAnuncio />} />
    </Route>

    <Route path="/document/cnh" element={<CNHUpload />} />
    <Route path="/document/certification" element={<CertificationUpload />} />
    <Route path="/document/certification/:id" element={<CertificationUpload />} />

    {adminRoutes}
  </Route>
);
