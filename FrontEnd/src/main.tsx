import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import App from "./App.tsx";
import Help from "./pages/Help.tsx";
import Signup from "@/pages/Signup/Signup.tsx";
import NovoEquipamento from "@/pages/NovoEquipamento.tsx";
import RouteStub from "@/pages/RouteStub.tsx";
import { Toaster } from "sonner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/help" element={<Help />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/novo-equipamento" element={<NovoEquipamento />} />
        <Route path="/dashboard" element={<RouteStub title="Dashboard" />} />
        <Route path="/buscar" element={<RouteStub title="Explorar Máquinas" />} />
        <Route path="/login" element={<RouteStub title="Entrar" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
