import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import "./index.css";
import App from "./App.tsx";
import Index from "@/pages/Index.tsx";
import BuscarMaquinario from "@/pages/BuscarMaquinario.tsx";
import AnuncioDetalhe from "@/pages/AnuncioDetalhe.tsx";
import Signup from "@/pages/Signup.tsx";
import NovoEquipamento from "@/pages/NovoEquipamento.tsx";
import NovoAnuncio from "@/pages/NovoAnuncio.tsx";
import GerenciarAnuncio from "@/pages/GerenciarAnuncio.tsx";
import DashboardLocador from "@/pages/DashboardLocador.tsx";
import DashboardLocatario from "@/pages/DashboardLocatario.tsx";
import AdminLayout from "@/components/AdminLayout.tsx";
import AdminUsers from "@/pages/Admin/Users.tsx";
import AdminAnuncios from "@/pages/Admin/Anuncios.tsx";
import AdminDocumentos from "@/pages/Admin/Documentos.tsx";
import AdminPlaceholder from "@/pages/Admin/AdminPlaceholder.tsx";
import { Toaster } from "sonner";

import SelfieUpload from "./pages/Documents/SelfieUpload.tsx";
import Login from "./pages/Login.tsx";
import ForgotPassword from "./pages/PasswordReset/ForgotPassword.tsx";
import ResetPassword from "./pages/PasswordReset/ResetPassword.tsx";
import Help from "./pages/Help.tsx";
import Buscar from "./pages/Buscar.tsx";
import Contrato from "./pages/Contrato/Contrato.tsx";
import Reservar from "@/pages/Reservar.tsx";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import CNHUpload from "./pages/Documents/CNHUpload.tsx";
import CertificationUpload from "./pages/Documents/CertificationUpload.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="bottom-right" />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/help" element={<Help />} />
          // Auth
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          // Credenciais e documentos
          <Route path="/signup/document-upload" element={<CNHUpload />} />
          <Route path="/signup/profile-upload" element={<SelfieUpload />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLocador />} />
            <Route
              path="/dashboard-locatario"
              element={<DashboardLocatario />}
            />
            <Route
              path="/dashboard/novo-equipamento"
              element={<NovoEquipamento />}
            />
            <Route path="/dashboard/novo-anuncio" element={<NovoAnuncio />} />
            <Route
              path="/dashboard/gerenciar-anuncio/:id"
              element={<GerenciarAnuncio />}
            />
            <Route path="/document/cnh" element={<CNHUpload />} />
            <Route
              path="/document/certification"
              element={<CertificationUpload />}
            />
            <Route
              path="/document/certification/:id"
              element={<CertificationUpload />}
            />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="anuncios" element={<AdminAnuncios />} />
              <Route path="documentos" element={<AdminDocumentos />} />
              <Route
                path="denuncias"
                element={<AdminPlaceholder title="Denúncias" />}
              />
              <Route
                path="relatorios"
                element={<AdminPlaceholder title="Relatórios" />}
              />
            </Route>
          </Route>
          <Route path="/buscar" element={<Buscar />} />
          <Route path="/buscar-maquinario" element={<BuscarMaquinario />} />
          <Route path="/anuncio/:id" element={<AnuncioDetalhe />} />
          <Route path="/reservar/:id" element={<Reservar />} />
          <Route path="/contrato/:id" element={<Contrato />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
