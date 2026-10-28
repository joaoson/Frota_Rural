import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AdminUsers from "../Users";
import { ForbiddenError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

const users = [
  userDto({ id: "u1", name: "Maria Silva", email: "maria@example.com", role: "locatario", status: "active" }),
  userDto({ id: "u2", name: "João Souza", email: "joao@example.com", document: "11222333000181", role: "locador", status: "suspended" }),
  userDto({ id: "u3", name: "Pedro Lima", email: "pedro@example.com", role: "operador", status: "banned" }),
];
const api = (routes: Record<string, Route> = {}) => serve(net.http, { "GET users": () => users, ...routes });
const open = () => renderWithProviders(<AdminUsers />, { queryClient: net.queryClient });
const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); toast.success.mockReset(); toast.error.mockReset(); });

it("lists users with status and only offers actions that still make sense", async () => {
  api(); open();
  expect(screen.getByText("Carregando usuários…")).toBeInTheDocument();
  await screen.findByText("Maria Silva");
  expect(within(row("Maria Silva")).getByText("Ativo")).toBeInTheDocument();
  expect(within(row("Maria Silva")).getByRole("button", { name: /Advertir/ })).toBeEnabled();
  expect(within(row("João Souza")).getByRole("button", { name: /Advertir/ })).toBeDisabled();
  expect(within(row("João Souza")).getByRole("button", { name: /Banir/ })).toBeEnabled();
  for (const action of [/Advertir/, /Suspender/, /Banir/]) expect(within(row("Pedro Lima")).getByRole("button", { name: action })).toBeDisabled();
});

it("finds users by name, e-mail or document and filters by status and role", async () => {
  api(); const { user } = open();
  await screen.findByText("Maria Silva");
  await user.type(screen.getByPlaceholderText("Buscar por nome, email ou documento"), "11222333");
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.getByText("João Souza")).toBeInTheDocument();
  await user.clear(screen.getByPlaceholderText("Buscar por nome, email ou documento"));
  const [status, role] = screen.getAllByRole("combobox");
  await user.selectOptions(status, "banned");
  expect(screen.getByText("Pedro Lima")).toBeInTheDocument();
  await user.selectOptions(role, "locador");
  expect(screen.getByText("Nenhum usuário encontrado com os filtros atuais.")).toBeInTheDocument();
});

it.each([
  [/Advertir/, "Confirmar advertir", "warn"],
  [/Suspender/, "Confirmar suspender", "suspend"],
  [/Banir/, "Confirmar banir", "ban"],
])("confirms the %s action against the chosen user before applying it", async (button, title, action) => {
  api({ [`PUT admin/users/u1/${action}`]: () => ({ message: "Ação registrada." }) });
  const { user } = open();
  await screen.findByText("Maria Silva");
  await user.click(within(row("Maria Silva")).getByRole("button", { name: button }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: title })).toBeInTheDocument();
  expect(within(dialog).getByText("maria@example.com · locatario")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
  expect(toast.success).toHaveBeenCalledWith("Ação registrada.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the dialog open and explains a refused moderation", async () => {
  api({ "PUT admin/users/u1/warn": () => { throw new ForbiddenError("Sem permissão para moderar."); } });
  const { user } = open();
  await screen.findByText("Maria Silva");
  await user.click(within(row("Maria Silva")).getByRole("button", { name: /Advertir/ }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar" }));
  expect(toast.error).toHaveBeenCalledWith("Sem permissão para moderar.");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("uses a generic message for unexpected moderation failures and closes with Escape", async () => {
  net.http.send.mockImplementation(async request => {
    if (request.method === "GET") return { status: 200, data: users };
    throw new TypeError("network down");
  });
  const { user } = open();
  await screen.findByText("Maria Silva");
  await user.click(within(row("Maria Silva")).getByRole("button", { name: /Suspender/ }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar" }));
  expect(toast.error).toHaveBeenCalledWith("Falha ao aplicar a ação.");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("warns when users cannot be loaded and refreshes on demand", async () => {
  api({ "GET users": () => { throw new ForbiddenError(); } });
  const { user } = open();
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar os usuários."));
  api();
  await user.click(screen.getByRole("button", { name: /Atualizar/ }));
  expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
});
