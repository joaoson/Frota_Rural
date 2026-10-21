import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Signup from "../Signup";
import { ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const viaCep = { cep: "75900-000", logradouro: "Rua das Palmeiras", bairro: "Centro", localidade: "Rio Verde", uf: "go" };
const api = (routes: Record<string, Route> = {}) => serve(net.http, { "GET 75900000/json/": () => viaCep, "POST users/create": () => userDto(), ...routes });
const open = () => renderWithProviders(<Signup />, { queryClient: net.queryClient, route: "/signup", routes: { "/login": <p>Tela de login</p> } });

async function fill(user: UserEvent) {
  await user.type(screen.getByLabelText("Nome Completo*"), "Maria Silva");
  fireEvent.change(screen.getByLabelText("Data de Nascimento*"), { target: { value: "1990-05-10" } });
  await user.type(screen.getByLabelText(/CPF \/ CNPJ/), "52998224725");
  await user.type(screen.getByLabelText("E-mail*"), "Maria@Example.com");
  await user.type(screen.getByLabelText("Telefone *"), "64999990000");
  await user.type(screen.getByLabelText("CEP*"), "75900000");
  await vi.waitFor(() => expect(screen.getByLabelText("Cidade*")).toHaveValue("Rio Verde"));
  await user.type(screen.getByLabelText("Senha*"), "Senha1234");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  net.http.send.mockReset(); net.queryClient.clear(); toast.success.mockReset(); toast.error.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it("creates an owner account with the address filled from the CEP", async () => {
  api(); const { user } = open();
  await user.click(screen.getByRole("button", { name: "Sou Locador" }));
  expect(screen.getByRole("button", { name: "Sou Locador" })).toHaveClass("bg-primary");
  await fill(user);
  expect(screen.getByLabelText("Endereço*")).toHaveValue("Rua das Palmeiras, Centro");
  expect(screen.getByLabelText("Estado*")).toHaveValue("GO");
  await user.click(screen.getByRole("button", { name: /Criar Conta/ }));
  expect(await screen.findByText("Tela de login")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "users/create", body: expect.objectContaining({
    role: "locador", document: "52998224725", email: "maria@example.com", phone: "+5564999990000", cep: "75900000", city: "Rio Verde", state: "GO",
  }) });
  expect(toast.success).toHaveBeenCalledWith("Cadastro realizado com sucesso! Prossiga para o login e aproveite a plataforma.");
});

it("validates every required field before calling the API", async () => {
  api(); const { user } = open();
  await user.click(screen.getByRole("button", { name: /Criar Conta/ }));
  for (const message of ["Nome é obrigatório.", "Data de nascimento é obrigatória.", "Documento é obrigatório.", "E-mail é obrigatório.", "Telefone é obrigatório.", "CEP é obrigatório.", "Selecione o estado."]) {
    expect(await screen.findByText(message)).toBeInTheDocument();
  }
  expect(net.http.send).not.toHaveBeenCalled();
});

it("warns when the CEP does not exist", async () => {
  api({ "GET 75900000/json/": () => ({ ...viaCep, erro: true }) });
  const { user } = open();
  await user.type(screen.getByLabelText("CEP*"), "75900000");
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("CEP não encontrado."));
  expect(screen.getByLabelText("Cidade*")).toHaveValue("");
});

it.each([
  [new ConflictError("Dados em conflito.", undefined, { fieldErrors: { email: ["Este e-mail já está em uso."] } }), "Este e-mail já está em uso.", null],
  [new ConflictError("Dados em conflito.", undefined, { fieldErrors: { employer: ["Empregador inválido."] } }), null, "Empregador inválido."],
  [new ServerError(500), null, "Erro no servidor."],
  ["boom", null, "Ocorreu um problema com o cadastro. Tente novamente mais tarde."],
])("explains why the account was not created (%#)", async (failure, fieldMessage, toastMessage) => {
  api({ "POST users/create": () => { throw failure; } });
  const { user } = open();
  await fill(user);
  await user.click(screen.getByRole("button", { name: /Criar Conta/ }));
  if (fieldMessage) expect(await screen.findByText(fieldMessage)).toBeInTheDocument();
  if (toastMessage) await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(toastMessage));
  expect(screen.queryByText("Tela de login")).not.toBeInTheDocument();
});
