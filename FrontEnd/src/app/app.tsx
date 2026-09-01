import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";

import { queryClient } from "./container";
import { AppRouter } from "./router";

/**
 * Composição de providers.
 *
 * Ordem importa: AuthProvider fica dentro do BrowserRouter porque a navegação
 * já está disponível ali; o QueryClientProvider envolve ambos para que qualquer
 * rota possa consultar o cache.
 */
export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="frota-rural-theme"
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Toaster position="bottom-right" />
            <AppRouter />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
