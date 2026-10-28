import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountSection } from "../components/AccountSection";
import { BadRequestError, ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { buildUser, userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/features/users/hooks/usePortesPropriedade", () => ({ usePortesPropriedade: () => ({ data: [], isLoading: false }) }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));

const user = buildUser({ id: "user-a", phone: "+5564999990000", cep: "75900000" });
const api = (routes: Record<string, Route> = {}) => serve(net.http, {
  "GET users/user-a": () => userDto({ id: "user-a" }),
  "PATCH users/user-a": () => userDto({ id: "user-a" }),
  "POST users/user-a/change-password": () => null,
  "GET 78000000/json/": () => ({ cep: "78000-000", logradouro: "Av. Brasil", bairro: "Centro", localidade: "Cuiabá", uf: "mt" }),
  ...routes,
});
const open = (account = user) => renderWithProviders(<AccountSection userId="user-a" user={account} roleLabel="Locatário" />, { queryClient: net.queryClient });

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); toast.success.mockReset(); toast.error.mockReset(); });

it("fills the form from the account and saves edits with the address from a new CEP", async () => {
  api(); const page = open();
  expect(screen.getByLabelText("CPF / CNPJ")).toHaveValue("529.982.247-25");
  expect(screen.getByLabelText("Telefone")).toHaveValue("(64) 99999-0000");
  expect(screen.getByLabelText("CEP")).toHaveValue("75900-000");
  await page.user.clear(screen.getByLabelText("CEP"));
  await page.user.type(screen.getByLabelText("CEP"), "78000000");
  await vi.waitFor(() => expect(screen.getByLabelText("Cidade")).toHaveValue("Cuiabá"));
  expect(screen.getByLabelText("Endereço")).toHaveValue("Av. Brasil, Centro");
  await page.user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Dados atualizados com sucesso."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "users/user-a", body: {
    name: "Maria Silva", document: "52998224725", email: "maria@example.com", phone: "+5564999990000",
    address: "Av. Brasil, Centro", city: "Cuiabá", state: "MT", cep: "78000000", porte_propriedade: null,
  } });
});

it("blocks an invalid new document and accepts a valid company document", async () => {
  api(); const page = open();
  const document = screen.getByLabelText("CPF / CNPJ") as HTMLInputElement;
  await page.user.clear(document);
  await page.user.type(document, "11222333000180");
  fireEvent.blur(document);
  expect(document.validationMessage).toBe("CNPJ inválido. Verifique os dígitos informados.");
  await page.user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  expect(net.http.send).not.toHaveBeenCalled();
  await page.user.clear(document);
  await page.user.type(document, "529");
  fireEvent.blur(document);
  expect(document.validationMessage).toBe("CPF inválido. Verifique os dígitos informados.");
  await page.user.clear(document);
  fireEvent.blur(document);
  await page.user.type(document, "11222333000181");
  fireEvent.blur(document);
  expect(document.validationMessage).toBe("");
  await page.user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await vi.waitFor(() => expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ document: "11222333000181" }) })));
});

it.each([
  [new ConflictError("Conflito.", undefined, { fieldErrors: { email: ["E-mail já em uso."] } }), "E-mail já em uso."],
  [new ServerError(500, "Serviço indisponível."), "Serviço indisponível."],
  ["boom", "Não foi possível salvar as alterações. Tente novamente."],
])("explains why the profile was not saved (%#)", async (failure, message) => {
  api({ "PATCH users/user-a": () => { throw failure; } });
  const page = open();
  await page.user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
});

it("warns when the CEP is not found", async () => {
  api({ "GET 78000000/json/": () => ({ cep: "", logradouro: "", bairro: "", localidade: "", uf: "", erro: true }) });
  const page = open();
  await page.user.clear(screen.getByLabelText("CEP"));
  await page.user.type(screen.getByLabelText("CEP"), "78000000");
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("CEP não encontrado."));
});

it("changes the password only when the confirmation matches", async () => {
  api(); const page = open();
  await page.user.type(screen.getByLabelText("Senha Atual"), "Antiga123");
  await page.user.type(screen.getByLabelText("Nova Senha"), "Nova12345");
  await page.user.type(screen.getByLabelText("Confirmar Nova Senha"), "Nova12346");
  await page.user.click(screen.getByRole("button", { name: "Alterar Senha" }));
  expect((screen.getByLabelText("Confirmar Nova Senha") as HTMLInputElement).validationMessage).toBe("As senhas não coincidem.");
  await page.user.clear(screen.getByLabelText("Confirmar Nova Senha"));
  await page.user.type(screen.getByLabelText("Confirmar Nova Senha"), "Nova12345");
  await page.user.click(screen.getByRole("button", { name: "Alterar Senha" }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Senha alterada com sucesso."));
  expect(screen.getByLabelText("Senha Atual")).toHaveValue("");
});

it.each([
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { current_password: ["Senha atual incorreta."] } }), "Senha atual incorreta."],
  [new BadRequestError("Senha fraca."), "Senha fraca."],
  [new ServerError(500), "Não foi possível alterar a senha. Tente novamente."],
])("explains why the password was not changed (%#)", async (failure, message) => {
  api({ "POST users/user-a/change-password": () => { throw failure; } });
  const page = open();
  await page.user.type(screen.getByLabelText("Senha Atual"), "Antiga123");
  await page.user.type(screen.getByLabelText("Nova Senha"), "Nova12345");
  await page.user.type(screen.getByLabelText("Confirmar Nova Senha"), "Nova12345");
  await page.user.click(screen.getByRole("button", { name: "Alterar Senha" }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
});

it("keeps documents out of the account page and handles accounts without optional data", () => {
  api();
  open(buildUser({ id: "user-a", role: "operador", document: "123", phone: null, city: null, state: null, cep: null }));
  expect(screen.queryByRole("link", { name: "Enviar ou atualizar CNH" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("CPF / CNPJ")).toHaveValue("123");
  expect(screen.getByLabelText("Telefone")).toHaveValue("");
});
