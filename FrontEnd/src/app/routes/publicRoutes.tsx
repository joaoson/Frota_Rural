import type { ReactElement } from "react";
import { Navigate, Route } from "react-router";

import AnuncioDetalhe from "@/pages/public/AnuncioDetalhe";
import BuscarMaquinario from "@/pages/public/BuscarMaquinario";
import Contrato from "@/pages/contracts/Contrato";
import CNHUpload from "@/pages/documents/CNHUpload";
import SelfieUpload from "@/pages/documents/SelfieUpload";
import Help from "@/pages/public/Help";
import Index from "@/pages/public/Index";
import Login from "@/pages/auth/Login";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Reservar from "@/pages/postings/Reservar";
import Signup from "@/pages/auth/Signup";

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
