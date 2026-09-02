import { Route, Routes } from "react-router";

import NotFound from "@/pages/public/NotFound";

import { protectedRoutes } from "./routes/protectedRoutes";
import { publicRoutes } from "./routes/publicRoutes";

/**
 * Árvore de rotas.
 *
 * Extraída de `main.tsx`, onde as 30+ rotas viviam inline. Dois defeitos reais
 * corrigidos na extração: os comentários `//` que o JSX renderizava como nós de
 * texto dentro de `<Routes>`, e a ausência de rota curinga — uma URL inexistente
 * deixava a tela em branco.
 */
export function AppRouter() {
  return (
    <Routes>
      {publicRoutes}
      {protectedRoutes}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
