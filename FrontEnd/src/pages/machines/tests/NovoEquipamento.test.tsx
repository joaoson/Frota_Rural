import { screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import NovoEquipamento from "../NovoEquipamento";
import { BadRequestError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { machineDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ userId: "owner-a" as string | null, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: ui.userId }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const api = (routes: Record<string, Route> = {}) => serve(net.http, { "POST machines": () => machineDto(), ...routes });
const open = () => renderWithProviders(<NovoEquipamento />, { queryClient: net.queryClient });

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); ui.userId = "owner-a"; ui.toast.success.mockReset(); ui.toast.error.mockReset(); });

it("registers a machine for the fleet and clears the form for the next one", async () => {
  api(); const { user } = open();
  await user.type(screen.getByLabelText("Nº Registro Renagro *"), "br1029304899");
  await user.type(screen.getByLabelText("Modelo *"), "S790");
  await user.type(screen.getByLabelText("Ano de Fabricação"), "2022");
  await user.selectOptions(screen.getByLabelText("Finalidade de Uso"), "Colheita");
  await user.type(screen.getByLabelText("Potência (cv)"), "400");
  await user.type(screen.getByLabelText("Horímetro (horas)"), "1200");
  await user.type(screen.getByLabelText("Especificações Técnicas"), "Plataforma 35 pés");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Equipamento cadastrado com sucesso."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "machines", body: {
    owner: "owner-a", renagro_number: "BR1029304899", brand: "John Deere", model: "S790", year: 2022, power_cv: 400, hour_meter: 1200,
    technical_specifications: "Plataforma 35 pés", usage_purpose: "Colheita",
  } });
  expect(screen.getByLabelText("Modelo *")).toHaveValue("");
});

it("asks for the brand name when the owner picks “Outra”", async () => {
  api(); const { user } = open();
  await user.click(screen.getByRole("button", { name: /John Deere/ }));
  await user.click(screen.getByRole("button", { name: /Outra/ }));
  await user.type(screen.getByLabelText("Nº Registro Renagro *"), "BR1029304899");
  await user.type(screen.getByLabelText("Modelo *"), "Uniport");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  expect(await screen.findByText("Marca é obrigatória.")).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("Digite a marca"), "Jacto");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  await vi.waitFor(() => expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ brand: "Jacto" }) })));
  await user.click(screen.getByRole("button", { name: /John Deere/ }));
  await user.click(screen.getByRole("button", { name: /Valtra/ }));
  expect(screen.queryByPlaceholderText("Digite a marca")).not.toBeInTheDocument();
});

it("shows registry and model rules before submitting", async () => {
  api(); const { user } = open();
  await user.type(screen.getByLabelText("Nº Registro Renagro *"), "123");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  expect(await screen.findByText(/O registro Renagro deve conter BR/)).toBeInTheDocument();
  expect(screen.getByText("Modelo é obrigatório.")).toBeInTheDocument();
  expect(net.http.send).not.toHaveBeenCalled();
});

it.each([
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { renagro_number: ["Registro já cadastrado."] } }), "Registro já cadastrado.", null],
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { owner: ["Dono inválido."] } }), null, "Dono inválido."],
  [new ServerError(500), null, "Erro no servidor."],
  ["boom", null, "Erro ao cadastrar equipamento. Verifique os dados e tente novamente."],
])("explains why the machine was not saved (%#)", async (failure, fieldMessage, toastMessage) => {
  api({ "POST machines": () => { throw failure; } });
  const { user } = open();
  await user.type(screen.getByLabelText("Nº Registro Renagro *"), "BR1029304899");
  await user.type(screen.getByLabelText("Modelo *"), "S790");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  if (fieldMessage) expect(await screen.findByText(fieldMessage)).toBeInTheDocument();
  if (toastMessage) await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(toastMessage));
});

it("requires a session to register machines", async () => {
  ui.userId = null; api();
  const { user } = open();
  await user.type(screen.getByLabelText("Nº Registro Renagro *"), "BR1029304899");
  await user.type(screen.getByLabelText("Modelo *"), "S790");
  await user.click(screen.getByRole("button", { name: /Cadastrar Equipamento/ }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Usuário não autenticado. Faça login para cadastrar o equipamento."));
  expect(net.http.send).not.toHaveBeenCalled();
});
