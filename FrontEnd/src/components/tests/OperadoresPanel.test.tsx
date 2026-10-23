import { fireEvent, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OperadoresPanel from "../OperadoresPanel";
import { BadRequestError, ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));

const operator = (overrides = {}) => ({ id: "op-1", name: "Carlos Lima", document: "52998224725", email: "carlos@example.com", phone: "+5564999990000",
  address: "Fazenda Boa Vista", city: "Rio Verde", state: "go", cep: "75900000", birth_date: "1990-01-01", status: "active", ...overrides });
const viaCep = { cep: "75900-000", logradouro: "Rua das Palmeiras", bairro: "Centro", localidade: "Rio Verde", uf: "go" };

function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET users/operators": () => [operator(), operator({ id: "op-2", name: "Bruno Dias", document: "123", email: "bruno@example.com", phone: null, city: null, state: null, cep: null, status: "pending" })],
    "GET 75900000/json/": () => viaCep,
    ...routes,
  });
}
const open = () => renderWithProviders(<OperadoresPanel />, { queryClient: net.queryClient });
const field = (label: string) => screen.getByLabelText(label);
const cardOf = (name: string) => screen.getByRole("heading", { name }).closest("[class*='rounded-2xl']") as HTMLElement;

async function fillNew(user: UserEvent) {
  await user.type(field("Nome Completo*"), "Ana Reis");
  fireEvent.change(field("Data de Nascimento*"), { target: { value: "1995-05-05" } });
  await user.type(field("CPF / CNPJ*"), "52998224725");
  await user.type(field("E-mail*"), "Ana@Example.com");
  await user.type(field("Telefone*"), "64988887777");
  await user.type(field("CEP*"), "75900000");
  await vi.waitFor(() => expect(field("Cidade*")).toHaveValue("Rio Verde"));
  await user.type(field("Senha Inicial*"), "Senha1234");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  net.http.send.mockReset(); toast.success.mockReset(); toast.error.mockReset(); localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

it("lists the team with formatted contact data and searches it", async () => {
  api(); const { user } = open();
  expect(screen.getByText("Carregando operadores...")).toBeInTheDocument();
  const carlos = await screen.findByRole("heading", { name: "Carlos Lima" }).then(() => cardOf("Carlos Lima"));
  expect(within(carlos).getByText("529.982.247-25")).toBeInTheDocument();
  expect(within(carlos).getByText("(64) 99999-0000")).toBeInTheDocument();
  expect(within(carlos).getByText("Rio Verde / go")).toBeInTheDocument();
  expect(within(carlos).getByText("Ativo")).toBeInTheDocument();
  const bruno = cardOf("Bruno Dias");
  expect(within(bruno).getByText("123")).toBeInTheDocument();
  expect(within(bruno).getAllByText("—")).toHaveLength(2);
  expect(within(bruno).getByText("pending")).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText(/Buscar por nome/), "bruno@");
  expect(screen.queryByRole("heading", { name: "Carlos Lima" })).not.toBeInTheDocument();
  await user.clear(screen.getByPlaceholderText(/Buscar por nome/));
  await user.type(screen.getByPlaceholderText(/Buscar por nome/), "ninguém");
  expect(screen.getByRole("heading", { name: "Nenhum operador encontrado" })).toBeInTheDocument();
});

it("invites the owner to register the first operator and retries a failed load", async () => {
  serve(net.http, { "GET users/operators": () => { throw new ServerError(500); } });
  const { user } = open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar seus operadores.");
  serve(net.http, { "GET users/operators": () => [] });
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByRole("heading", { name: "Nenhum operador cadastrado" })).toBeInTheDocument();
});

it("registers an operator with the address from the CEP and an initial password", async () => {
  api({ "POST users/operators": () => operator({ id: "op-3", name: "Ana Reis", email: "ana@example.com" }) });
  const { user } = open();
  await screen.findByRole("heading", { name: "Carlos Lima" });
  await user.click(screen.getByRole("button", { name: /Cadastrar Operador/ }));
  expect(screen.getByRole("heading", { name: "Novo Operador" })).toBeInTheDocument();
  await fillNew(user);
  expect(field("Endereço*")).toHaveValue("Rua das Palmeiras, Centro");
  expect(field("Estado*")).toHaveValue("GO");
  await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect(field("Senha Inicial*")).toHaveAttribute("type", "text");
  await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
  await user.click(within(screen.getByRole("heading", { name: "Novo Operador" }).closest("div.rounded-2xl")!).getByRole("button", { name: /Cadastrar Operador/ }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Operador cadastrado. Repasse a senha inicial para que ele acesse a conta."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "users/operators", body: {
    name: "Ana Reis", birth_date: "1995-05-05", document: "52998224725", email: "ana@example.com", phone: "+5564988887777",
    address: "Rua das Palmeiras, Centro", city: "Rio Verde", state: "GO", cep: "75900000", password: "Senha1234",
  } });
  expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toEqual(["Ana Reis", "Bruno Dias", "Carlos Lima"]);
});

it("validates the form on blur and before saving", async () => {
  api(); const { user } = open();
  await screen.findByRole("heading", { name: "Carlos Lima" });
  await user.click(screen.getByRole("button", { name: /Cadastrar Operador/ }));
  await user.type(field("E-mail*"), "ana@");
  await user.tab();
  expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
  await user.type(field("E-mail*"), "example.com");
  expect(screen.queryByText("E-mail inválido.")).not.toBeInTheDocument();
  await user.selectOptions(field("Estado*"), "GO");
  await user.click(field("Senha Inicial*")); await user.tab();
  expect(screen.getByText("Senha é obrigatória.")).toBeInTheDocument();
  fireEvent.submit(field("Nome Completo*").closest("form")!);
  expect(toast.error).toHaveBeenCalledWith("Corrija os erros do formulário antes de salvar.");
  expect(screen.getByText("Nome é obrigatório.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("heading", { name: "Novo Operador" })).not.toBeInTheDocument();
});

it("edits an operator keeping unchanged data as stored and without asking for a password", async () => {
  api({ "PATCH users/operators/op-2": () => operator({ id: "op-2", name: "Bruno Dias Filho", document: "123", email: "bruno@example.com" }) });
  const { user } = open();
  const bruno = await screen.findByRole("heading", { name: "Bruno Dias" }).then(() => cardOf("Bruno Dias"));
  await user.click(within(bruno).getByRole("button", { name: /Editar/ }));
  expect(screen.getByRole("heading", { name: "Editar Operador" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Senha Inicial*")).not.toBeInTheDocument();
  expect(field("CPF / CNPJ*")).toHaveValue("123");
  await user.clear(field("Nome Completo*"));
  await user.type(field("Nome Completo*"), "Bruno Dias Filho");
  await user.type(field("Telefone*"), "64977776666");
  await user.type(field("CEP*"), "75900000");
  await vi.waitFor(() => expect(field("Cidade*")).toHaveValue("Rio Verde"));
  await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Operador atualizado."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "users/operators/op-2", body: expect.objectContaining({ name: "Bruno Dias Filho", document: "123" }) });
  expect(screen.getByRole("heading", { name: "Bruno Dias Filho" })).toBeInTheDocument();
});

it.each([
  [new ConflictError("Conflito.", undefined, { fieldErrors: { document: ["Documento já cadastrado."] } }), "Documento já cadastrado."],
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { email: ["E-mail já em uso."] } }), "E-mail já em uso."],
  [new ServerError(500, "Servidor indisponível."), "Servidor indisponível."],
  ["boom", "Não foi possível salvar o operador. Tente novamente."],
])("explains why an operator could not be saved (%#)", async (failure, message) => {
  api({ "PATCH users/operators/op-1": () => { throw failure; } });
  const { user } = open();
  const carlos = await screen.findByRole("heading", { name: "Carlos Lima" }).then(() => cardOf("Carlos Lima"));
  await user.click(within(carlos).getByRole("button", { name: /Editar/ }));
  await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  expect(screen.getByRole("heading", { name: "Editar Operador" })).toBeInTheDocument();
});

it("warns when the CEP is unknown or the lookup fails", async () => {
  api({ "GET 75900000/json/": () => ({ ...viaCep, erro: true }), "GET 75900001/json/": () => { throw new ServerError(503); } });
  const { user } = open();
  await screen.findByRole("heading", { name: "Carlos Lima" });
  await user.click(screen.getByRole("button", { name: /Cadastrar Operador/ }));
  await user.type(field("CEP*"), "75900000");
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível consultar o CEP. Preencha o endereço manualmente."));
  await user.clear(field("CEP*"));
  await user.type(field("CEP*"), "75900001");
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
});

it("unlinks an operator after confirmation, closing its open edit form", async () => {
  api({ "DELETE users/operators/op-1": () => null });
  const { user } = open();
  const carlos = await screen.findByRole("heading", { name: "Carlos Lima" }).then(() => cardOf("Carlos Lima"));
  await user.click(within(carlos).getByRole("button", { name: /Editar/ }));
  await user.click(within(carlos).getByRole("button", { name: /Desvincular/ }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desvincular" }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Carlos Lima foi desvinculado da sua equipe."));
  expect(screen.queryByRole("heading", { name: "Carlos Lima" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Editar Operador" })).not.toBeInTheDocument();
});

it("reports a failed unlink and closes the form from its header", async () => {
  api({ "DELETE users/operators/op-1": () => { throw new ServerError(500); } });
  const { user } = open();
  const carlos = await screen.findByRole("heading", { name: "Carlos Lima" }).then(() => cardOf("Carlos Lima"));
  await user.click(within(carlos).getByRole("button", { name: /Desvincular/ }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desvincular" }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível desvincular o operador."));
  await user.click(within(cardOf("Carlos Lima")).getByRole("button", { name: /Editar/ }));
  await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
  expect(screen.queryByRole("heading", { name: "Editar Operador" })).not.toBeInTheDocument();
});
