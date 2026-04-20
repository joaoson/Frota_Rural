import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import App from "./App.tsx";
import BuscarMaquinario from "@/pages/BuscarMaquinario.tsx";
import AnuncioDetalhe from "@/pages/AnuncioDetalhe.tsx";
import Signup from "@/pages/Signup.tsx";
import NovoEquipamento from "@/pages/NovoEquipamento.tsx";
import NovoAnuncio from "@/pages/NovoAnuncio.tsx";
import DashboardLocador from "@/pages/DashboardLocador.tsx";
import DashboardAdmin from "@/pages/DashboardAdmin.tsx";
import { Toaster } from "sonner";
import CNHUpload from "./pages/Documents/CNHUpload.tsx";
import SelfieUpload from "./pages/Documents/SelfieUpload.tsx";
import Login from "./pages/Login.tsx";
import Help from "./pages/Help.tsx";
import Buscar from "./pages/Buscar.tsx";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="bottom-right" />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/help" element={<Help />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/document-upload" element={<CNHUpload />} />
          <Route path="/signup/profile-upload" element={<SelfieUpload />} />
          <Route path="/novo-equipamento" element={<NovoEquipamento />} />
          <Route path="/novo-anuncio" element={<NovoAnuncio />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLocador />} />
            <Route
              path="/dashboard/novo-equipamento"
              element={<NovoEquipamento />}
            />
            <Route path="/dashboard/novo-anuncio" element={<NovoAnuncio />} />
            <Route path="/admin" element={<DashboardAdmin />} />
          </Route>
          <Route path="/buscar" element={<Buscar />} />
          <Route path="/buscar-maquinario" element={<BuscarMaquinario />} />
          <Route path="/anuncio/:id" element={<AnuncioDetalhe />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
