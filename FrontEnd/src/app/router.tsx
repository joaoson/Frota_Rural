import { Route, Routes } from "react-router";

import NotFound from "@/pages/public/NotFound";

import { protectedRoutes } from "./routes/protectedRoutes";
import { publicRoutes } from "./routes/publicRoutes";

export function AppRouter() {
  return (
    <Routes>
      {publicRoutes}
      {protectedRoutes}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
