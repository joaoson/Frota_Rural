import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import App from "./App.tsx";
import Help from "./pages/Help.tsx";
import Signup from "@/pages/Signup.tsx";
import NovoEquipamento from "@/pages/NovoEquipamento.tsx";
import NovoAnuncio from "@/pages/NovoAnuncio.tsx";
import DashboardLocador from "@/pages/DashboardLocador.tsx";
import RouteStub from "@/pages/RouteStub.tsx";
import { Toaster } from "sonner";
import CNHUpload from "./pages/Documents/CNHUpload.tsx";
import SelfieUpload from "./pages/Documents/SelfieUpload.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/help" element={<Help />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signup/document-upload" element={<CNHUpload />} />
        <Route path="/signup/profile-upload" element={<SelfieUpload />} />
        <Route path="/novo-equipamento" element={<NovoEquipamento />} />
        <Route path="/novo-anuncio" element={<NovoAnuncio />} />
        <Route path="/dashboard" element={<DashboardLocador />} />
        <Route
          path="/dashboard/novo-equipamento"
          element={<NovoEquipamento />}
        />
        <Route path="/dashboard/novo-anuncio" element={<NovoAnuncio />} />
        <Route
          path="/buscar"
          element={<RouteStub title="Explorar Máquinas" />}
        />
        <Route path="/login" element={<RouteStub title="Entrar" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
