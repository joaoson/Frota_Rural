import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

/** QueryClient isolado por teste: sem retry nem cache compartilhado entre casos. */
export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

interface RenderOptions {
  /** URL inicial do MemoryRouter. */
  route?: string;
  /** Padrão de rota quando o componente lê `useParams`. */
  path?: string;
  /** Rotas extras para afirmar navegação (ex.: `{ "/login": <p>Login</p> }`). */
  routes?: Record<string, ReactNode>;
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, { route = "/", path, routes = {}, queryClient = createTestQueryClient() }: RenderOptions = {}) {
  const tree = path || Object.keys(routes).length
    ? <Routes><Route path={path ?? route.split("?")[0]} element={ui} />{Object.entries(routes).map(([to, element]) => <Route key={to} path={to} element={element} />)}</Routes>
    : ui;
  return {
    user: userEvent.setup(),
    queryClient,
    ...render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter></QueryClientProvider>),
  };
}

export function renderHookWithQuery<T>(hook: () => T, queryClient = createTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, ...renderHook(hook, { wrapper }) };
}
