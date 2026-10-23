import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPassword from "../ForgotPassword";
import Login from "../Login";
import ResetPassword from "../ResetPassword";
import { BadRequestError, ServerError, UnauthorizedError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { serve, type Route as ApiRoute } from "@/test/http";
import { fakeJwt } from "@/test/jwt";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ login: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ login: ui.login }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const api = (routes: Record<string, ApiRoute>) => serve(net.http, routes);
const homes = { "/dashboard": <p>Painel do locador</p>, "/admin": <p>Admin</p>, "/mensagens": <p>Mensagens</p> };

function openLogin(from?: string) {
  return {
    user: userEvent.setup(),
    ...render(<QueryClientProvider client={net.queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/login", state: from ? { from } : null }]}>
        <Routes><Route path="/login" element={<Login />} />{Object.entries(homes).map(([path, el]) => <Route key={path} path={path} element={el} />)}</Routes>
      </MemoryRouter>
    </QueryClientProvider>),
  };
}

beforeEach(() => { net.http.send.mockReset(); ui.login.mockReset(); ui.toast.success.mockReset(); ui.toast.error.mockReset(); });

it.each([["locador", undefined, "Painel do locador"], ["admin", undefined, "Admin"], ["locatario", "/mensagens", "Mensagens"]])(
  "logs a %s in and returns them to %s or their home", async (role, from, landing) => {
    const access = fakeJwt({ user_id: "u", role, exp: 2_000_000_000 });
    api({ "POST login": () => ({ access }) });
    const { user } = openLogin(from);
    await user.type(screen.getByLabelText("E-mail"), "Maria@Example.com");
    await user.type(screen.getByLabelText("Senha"), "Senha1234");
    await user.click(screen.getByRole("button", { name: /Entrar na Plataforma/ }));
    expect(await screen.findByText(landing)).toBeInTheDocument();
    expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "login", body: { email: "maria@example.com", password: "Senha1234" } });
    expect(ui.login).toHaveBeenCalledWith({ access }, role);
    expect(ui.toast.success).toHaveBeenCalledWith("Login realizado com sucesso!");
  },
);

it("validates credentials locally and lets the user reveal the password", async () => {
  const { user } = openLogin();
  await user.click(screen.getByRole("button", { name: /Entrar na Plataforma/ }));
  expect(await screen.findByText("E-mail é obrigatório.")).toBeInTheDocument();
  expect(screen.getByText("Senha é obrigatória.")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Senha"), "segredo");
  await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
  await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  expect(net.http.send).not.toHaveBeenCalled();
});

it.each([[new UnauthorizedError(), "E-mail ou senha incorretos."], ["boom", "Não foi possível entrar. Tente novamente."]])(
  "explains a refused login (%#)", async (failure, message) => {
    api({ "POST login": () => { throw failure; } });
    const { user } = openLogin();
    await user.type(screen.getByLabelText("E-mail"), "maria@example.com");
    await user.type(screen.getByLabelText("Senha"), "errada");
    await user.click(screen.getByRole("button", { name: /Entrar na Plataforma/ }));
    await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  },
);

it("confirms a reset link was sent without revealing whether the account exists", async () => {
  api({ "POST password-reset/request": () => ({}) });
  const { user } = renderWithProviders(<ForgotPassword />, { queryClient: net.queryClient });
  await user.click(screen.getByRole("button", { name: /Enviar Link/ }));
  expect(await screen.findByText("E-mail é obrigatório.")).toBeInTheDocument();
  await user.type(screen.getByLabelText("E-mail"), "Maria@Example.com");
  await user.click(screen.getByRole("button", { name: /Enviar Link/ }));
  expect(await screen.findByRole("heading", { name: "E-mail Enviado" })).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "password-reset/request", body: { email: "maria@example.com" } });
  expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/login");
});

it.each([[new ServerError(503, "Serviço de e-mail indisponível."), "Serviço de e-mail indisponível."], ["boom", "Não foi possível enviar o link."]])(
  "reports a failed reset request (%#)", async (failure, message) => {
    api({ "POST password-reset/request": () => { throw failure; } });
    const { user } = renderWithProviders(<ForgotPassword />, { queryClient: net.queryClient });
    await user.type(screen.getByLabelText("E-mail"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: /Enviar Link/ }));
    await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  },
);

const openReset = (query: string) => renderWithProviders(<ResetPassword />, { queryClient: net.queryClient, route: `/reset-password${query}`, path: "/reset-password", routes: { "/login": <p>Tela de login</p> } });

it("refuses a reset link without a token", () => {
  openReset("");
  expect(screen.getByRole("heading", { name: "Link Inválido" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Solicitar novo link" })).toHaveAttribute("href", "/forgot-password");
});

it.each([["?token=abc123", "abc123"], [`?token=3D${"x".repeat(43)}`, "x".repeat(43)]])(
  "sets a new password with the token from the e-mail (%s)", async (query, token) => {
    api({ "POST password-reset/confirm": () => null });
    const { user } = openReset(query);
    await user.type(screen.getByLabelText("Nova Senha"), "NovaSenha1");
    await user.type(screen.getByLabelText("Confirmar Nova Senha"), "NovaSenha1");
    await user.click(screen.getByRole("button", { name: /Redefinir Senha/ }));
    expect(await screen.findByText("Tela de login")).toBeInTheDocument();
    expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "password-reset/confirm", body: { token, new_password: "NovaSenha1" } });
    expect(ui.toast.success).toHaveBeenCalledWith("Senha redefinida com sucesso!");
  },
);

it("checks that both passwords match before calling the API", async () => {
  const { user } = openReset("?token=abc");
  await user.type(screen.getByLabelText("Nova Senha"), "NovaSenha1");
  await user.type(screen.getByLabelText("Confirmar Nova Senha"), "NovaSenha2");
  await user.click(screen.getByRole("button", { name: /Redefinir Senha/ }));
  expect(await screen.findByText("As senhas não coincidem.")).toBeInTheDocument();
  expect(net.http.send).not.toHaveBeenCalled();
});

it.each([[new BadRequestError("Token expirado."), "Link de redefinição inválido ou expirado."], ["boom", "Não foi possível redefinir a senha."]])(
  "explains why the password could not be reset (%#)", async (failure, message) => {
    api({ "POST password-reset/confirm": () => { throw failure; } });
    const { user } = openReset("?token=abc");
    await user.type(screen.getByLabelText("Nova Senha"), "NovaSenha1");
    await user.type(screen.getByLabelText("Confirmar Nova Senha"), "NovaSenha1");
    await user.click(screen.getByRole("button", { name: /Redefinir Senha/ }));
    await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  },
);
