import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatSocketProvider } from "@/contexts/ChatSocketContext";
import PageTitle from "@/components/PageTitle";

import { queryClient } from "./container";
import { AppRouter } from "./router";

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
            <ChatSocketProvider>
              <PageTitle />
              <Toaster position="bottom-right" />
              <AppRouter />
            </ChatSocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
