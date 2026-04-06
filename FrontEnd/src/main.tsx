import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import App from "./App.tsx";
import Buscar from "@/pages/buscar/buscar.tsx";
import {Toaster} from "sonner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
        <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/buscar" element={<Buscar />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
