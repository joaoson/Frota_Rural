import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppRouter } from "../router";
import { App } from "../app";
import PageTitle from "@/components/PageTitle";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/useAuth";
import { UnauthorizedError } from "@/shared/http/errors";
import { net, tokenStore } from "@/test/container";
import { ok } from "@/test/http";
import { fakeJwt } from "@/test/jwt";

vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/features/chat/hooks/useChatSocket", () => ({ useChatSocket: () => ({ status: "closed", subscribe: vi.fn(), unsubscribe: vi.fn(), sendMessage: vi.fn(), sendRead: vi.fn(), sendTyping: vi.fn() }) }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/pages/admin/Anuncios", () => ({ default: () => <h1>AdminAnuncios</h1> }));
vi.mock("@/pages/admin/Documentos", () => ({ default: () => <h1>AdminDocumentos</h1> }));
vi.mock("@/pages/admin/Denuncias", () => ({ default: () => <h1>AdminDenuncias</h1> }));
vi.mock("@/pages/admin/Users", () => ({ default: () => <h1>AdminUsers</h1> }));
vi.mock("@/pages/dashboard/DashboardLocador", () => ({ default: () => <h1>DashboardLocador</h1> }));
vi.mock("@/pages/dashboard/DashboardLocatario", () => ({ default: () => <h1>DashboardLocatario</h1> }));
vi.mock("@/pages/contracts/AnaliseLocacao", () => ({ default: () => <h1>AnaliseLocacao</h1> }));
vi.mock("@/pages/messages/Mensagens", () => ({ default: () => <h1>Mensagens</h1> }));
vi.mock("@/pages/documents/CertificationUpload", () => ({ default: () => <h1>CertificationUpload</h1> }));
vi.mock("@/pages/documents/CNHUpload", () => ({ default: () => <h1>CNHUpload</h1> }));
vi.mock("@/pages/postings/GerenciarAnuncio", () => ({ default: () => <h1>GerenciarAnuncio</h1> }));
vi.mock("@/pages/postings/NovoAnuncio", () => ({ default: () => <h1>NovoAnuncio</h1> }));
vi.mock("@/pages/machines/NovoEquipamento", () => ({ default: () => <h1>NovoEquipamento</h1> }));
vi.mock("@/pages/postings/Reservar", () => ({ default: () => <h1>Reservar</h1> }));
vi.mock("@/pages/public/AnuncioDetalhe", () => ({ default: () => <h1>AnuncioDetalhe</h1> }));
vi.mock("@/pages/public/BuscarMaquinario", () => ({ default: () => <h1>BuscarMaquinario</h1> }));
vi.mock("@/pages/contracts/Contrato", () => ({ default: () => <h1>Contrato</h1> }));
vi.mock("@/pages/documents/SelfieUpload", () => ({ default: () => <h1>SelfieUpload</h1> }));
vi.mock("@/pages/public/Help", () => ({ default: () => <h1>Help</h1> }));
vi.mock("@/pages/public/Terms", () => ({ default: () => <h1>Terms</h1> }));
vi.mock("@/pages/public/Privacy", () => ({ default: () => <h1>Privacy</h1> }));
vi.mock("@/pages/public/Index", () => ({ default: () => <h1>Index</h1> }));
vi.mock("@/pages/auth/Login", () => ({ default: () => <h1>Login</h1> }));
vi.mock("@/pages/auth/ForgotPassword", () => ({ default: () => <h1>ForgotPassword</h1> }));
vi.mock("@/pages/auth/ResetPassword", () => ({ default: () => <h1>ResetPassword</h1> }));
vi.mock("@/pages/auth/Signup", () => ({ default: () => <h1>Signup</h1> }));

const session = (role: string) => ok({ access: fakeJwt({ user_id: `${role}-a`, role, exp: 2_000_000_000 }) });

function SessionProbe() {
  const { userId, userRole, isAuthenticated, logout, setUserRole } = useAuth();
  return <aside>
    <output aria-label="sessão">{isAuthenticated ? `${userId}:${userRole}` : "anônimo"}</output>
    <button onClick={logout}>Sair</button>
    <button onClick={() => setUserRole("admin")}>Promover</button>
  </aside>;
}

function renderApp(route: string) {
  return render(<QueryClientProvider client={net.queryClient}><MemoryRouter initialEntries={[route]}><AuthProvider><PageTitle /><SessionProbe /><AppRouter /></AuthProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { net.http.send.mockReset(); tokenStore.setAccessToken(null); });
afterEach(() => { window.history.replaceState(null, "", "/"); });

it("sends visitors of a protected page to login", async () => {
  net.http.send.mockRejectedValue(new UnauthorizedError());
  renderApp("/dashboard?tab=frota");
  expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
  expect(screen.getByLabelText("sessão")).toHaveTextContent("anônimo");
  expect(document.title).toBe("Entrar · Frota Rural");
});

it.each([
  ["locador", "/dashboard", "DashboardLocador", "Painel do locador · Frota Rural"],
  ["locatario", "/reservar/posting-a", "Reservar", "Reservar maquinário · Frota Rural"],
  ["operador", "/dashboard-locatario/locacoes/rental-a", "AnaliseLocacao", "Análise da locação · Frota Rural"],
  ["admin", "/admin", "AdminUsers", "Administração · Usuários · Frota Rural"],
  ["admin", "/admin/relatorios", "Relatórios", "Administração · Relatórios · Frota Rural"],
  ["locador", "/mensagens/rental:a", "Mensagens", "Frota Rural — Locação de Maquinário Agrícola"],
])("restores a %s session from the refresh cookie and opens %s", async (role, route, heading, title) => {
  net.http.send.mockResolvedValue(session(role));
  renderApp(route);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByLabelText("sessão")).toHaveTextContent(`${role}-a:${role}`);
  expect(document.title).toBe(title);
  expect(tokenStore.getAccessToken()).not.toBeNull();
});

it.each([
  ["locatario", "/dashboard", "DashboardLocatario"],
  ["locador", "/reservar/posting-a", "DashboardLocador"],
  ["operador", "/admin/users", "DashboardLocatario"],
])("redirects a %s away from %s to their own home", async (role, route, heading) => {
  net.http.send.mockResolvedValue(session(role));
  renderApp(route);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

it.each([["/cadastro", "Login"], ["/buscar", "BuscarMaquinario"], ["/anuncio/posting-a", "AnuncioDetalhe"], ["/rota-inexistente", "Opa, saímos da trilha."]])(
  "serves public route %s without a session", async (route, heading) => {
    net.http.send.mockRejectedValue(new UnauthorizedError());
    renderApp(route);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  },
);

it("logs out locally, clears cached data and lets the role be adjusted", async () => {
  const user = userEvent.setup();
  net.http.send.mockResolvedValueOnce(session("locador")).mockResolvedValue(ok(null));
  renderApp("/mensagens");
  await screen.findByText("locador-a:locador");
  await user.click(screen.getByRole("button", { name: "Promover" }));
  expect(screen.getByLabelText("sessão")).toHaveTextContent("locador-a:admin");
  net.queryClient.setQueryData(["contracts", "rentals", {}], []);
  await user.click(screen.getByRole("button", { name: "Sair" }));
  expect(screen.getByLabelText("sessão")).toHaveTextContent("anônimo");
  expect(net.queryClient.getQueryData(["contracts", "rentals", {}])).toBeUndefined();
  expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
  expect(net.http.send).toHaveBeenLastCalledWith({ method: "POST", path: "logout" });
});

it("ends the session everywhere when the token can no longer be refreshed", async () => {
  net.http.send.mockResolvedValue(session("locatario"));
  renderApp("/dashboard-locatario");
  await screen.findByText("locatario-a:locatario");
  act(() => tokenStore.notifyExpired());
  expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
});

it("requires the auth provider around consumers", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<SessionProbe />)).toThrow("useAuth must be used within an AuthProvider");
});

it("boots the whole application at the current URL", async () => {
  net.http.send.mockRejectedValue(new UnauthorizedError());
  window.history.replaceState(null, "", "/help");
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe("Ajuda · Frota Rural"));
});

it("mounts the app into #root", async () => {
  const renderRoot = vi.fn();
  vi.doMock("react-dom/client", () => ({ createRoot: vi.fn(() => ({ render: renderRoot })) }));
  document.body.innerHTML = '<div id="root"></div>';
  await import("@/main");
  const { createRoot } = await import("react-dom/client");
  expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
  expect(renderRoot).toHaveBeenCalledOnce();
  vi.doUnmock("react-dom/client");
});
