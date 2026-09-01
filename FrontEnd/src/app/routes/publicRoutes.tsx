import type { ReactElement } from "react";
import { Navigate, Route } from "react-router";

import AnuncioDetalhe from "@/pages/AnuncioDetalhe";
import BuscarMaquinario from "@/pages/BuscarMaquinario";
import Contrato from "@/pages/Contrato/Contrato";
import CNHUpload from "@/pages/Documents/CNHUpload";
import SelfieUpload from "@/pages/Documents/SelfieUpload";
import Help from "@/pages/Help";
import Index from "@/pages/Index";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/PasswordReset/ForgotPassword";
import ResetPassword from "@/pages/PasswordReset/ResetPassword";
import Reservar from "@/pages/Reservar";
import Signup from "@/pages/Signup";

/** Rotas abertas, sem autenticação. */
export const publicRoutes: ReactElement[] = [
  <Route key="home" path="/" element={<Index />} />,
  <Route key="help" path="/help" element={<Help />} />,

  // Autenticação
  <Route key="signup" path="/signup" element={<Signup />} />,
  <Route key="login" path="/login" element={<Login />} />,
  <Route key="cadastro" path="/cadastro" element={<Navigate to="/login" replace />} />,
  <Route key="forgot" path="/forgot-password" element={<ForgotPassword />} />,
  <Route key="reset" path="/reset-password" element={<ResetPassword />} />,

  // Credenciais e documentos durante o cadastro
  <Route key="signup-doc" path="/signup/document-upload" element={<CNHUpload />} />,
  <Route key="signup-selfie" path="/signup/profile-upload" element={<SelfieUpload />} />,

  // Busca e detalhes públicos
  <Route key="buscar" path="/buscar" element={<Navigate to="/buscar-maquinario" replace />} />,
  <Route key="buscar-maq" path="/buscar-maquinario" element={<BuscarMaquinario />} />,
  <Route key="anuncio" path="/anuncio/:id" element={<AnuncioDetalhe />} />,
  <Route key="reservar" path="/reservar/:id" element={<Reservar />} />,
  <Route key="contrato" path="/contrato/:id" element={<Contrato />} />,
];
