import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CNHUpload from "../CNHUpload";
import { BadRequestError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ userId: "op-1" as string | null, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: ui.userId }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const savedLicense = { id: "lic-1", user: "op-1", name: "Carlos Lima", birth_date: "1990-01-01", cpf: "52998224725", rg: "123456789", mother_name: "Ana Lima",
  nationality: "Brasileiro(a)", birth_place: "Rio Verde – GO", cnh_number: "12345678901", category: "AE", first_license_date: "2010-01-01",
  issue_date: "2025-01-01", expiration_date: "2030-01-01", issuing_state: "GO", issuing_authority: "DETRAN-GO", situation: "active",
  acc: false, ear: true, points: 0, file_url: "documents/cnh.jpg", validation_status: "approved" };
const recognised = { is_valid: true, confidence: "high", score: 0.97 };

const api = (routes: Record<string, Route> = {}) => serve(net.http, {
  "GET operator-licenses": () => [],
  "POST operator-licenses/validate-document": () => recognised,
  "POST documents/upload": () => ({ url: "documents/new-cnh.jpg" }),
  "POST operator-licenses": () => savedLicense,
  "PATCH operator-licenses/lic-1": () => savedLicense,
  ...routes,
});
const open = () => renderWithProviders(<CNHUpload />, { queryClient: net.queryClient, route: "/document/cnh", routes: { "/dashboard": <p>Painel</p> } });
const photo = new File(["jpeg"], "cnh.jpg", { type: "image/jpeg" });
const choose = (user: UserEvent, file = photo) => user.upload(screen.getByLabelText(/Arraste a foto ou clique para selecionar|Clique para substituir|Documento enviado anteriormente/), file);

async function fillForm(user: UserEvent) {
  await user.type(screen.getByLabelText("Nome Completo *"), "Carlos Lima");
  fireEvent.change(screen.getByLabelText("Data de Nascimento *"), { target: { value: "1990-01-01" } });
  await user.type(screen.getByLabelText("CPF *"), "52998224725");
  await user.type(screen.getByLabelText("RG *"), "123456789");
  await user.type(screen.getByLabelText("Cidade de Nascimento *"), "Rio Verde");
  await user.selectOptions(screen.getByLabelText("Estado de Nascimento *"), "GO");
  await user.type(screen.getByLabelText("Nome da Mãe *"), "Ana Lima");
  await user.type(screen.getByLabelText("Nº CNH *"), "12345678901");
  await user.selectOptions(screen.getByLabelText("Categoria *"), "AE");
  fireEvent.change(screen.getByLabelText("Primeira Habilitação *"), { target: { value: "2010-01-01" } });
  fireEvent.change(screen.getByLabelText("Data de Emissão *"), { target: { value: "2025-01-01" } });
  fireEvent.change(screen.getByLabelText("Data de Validade *"), { target: { value: "2030-01-01" } });
  await user.selectOptions(screen.getByLabelText("UF de Emissão *"), "GO");
  await user.type(screen.getByLabelText("Órgão Emissor *"), "DETRAN-GO");
  await user.selectOptions(screen.getByLabelText("Situação *"), "active");
  await user.click(screen.getByLabelText(/EAR — Exerce Atividade Remunerada/));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  net.http.send.mockReset(); net.queryClient.clear(); ui.userId = "op-1"; ui.toast.success.mockReset(); ui.toast.error.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it("only opens the data form after the photo is recognised as a CNH", async () => {
  api(); const { user } = open();
  expect(await screen.findByRole("heading", { name: "Cadastro de CNH" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Nome Completo *")).not.toBeInTheDocument();
  await choose(user);
  expect(await screen.findByText(/Documento reconhecido como CNH/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nome Completo *")).toBeInTheDocument();
  expect(screen.getByText("cnh.jpg")).toBeInTheDocument();
});

it.each([
  [{ is_valid: true, confidence: "medium", score: 0.6 }, "Documento possivelmente é uma CNH", true],
  [{ is_valid: false, confidence: "low", score: 0.1 }, "Documento não reconhecido como CNH, favor seguir as instruções de captura de imagem", false],
  [{ is_valid: false, confidence: "low", score: 0, error: "Imagem ilegível." }, "Imagem ilegível.", false],
])("explains the authenticity check result (%#)", async (validation, message, formShown) => {
  api({ "POST operator-licenses/validate-document": () => validation });
  const { user } = open();
  await screen.findByRole("heading", { name: "Cadastro de CNH" });
  await choose(user);
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(Boolean(screen.queryByLabelText("Nome Completo *"))).toBe(formShown);
});

it("reports a validation outage and ignores files that are neither image nor PDF", async () => {
  api({ "POST operator-licenses/validate-document": () => { throw new ServerError(503, "Validador fora do ar."); } });
  const { user } = open();
  await screen.findByRole("heading", { name: "Cadastro de CNH" });
  await choose(user, new File(["x"], "cnh.docx", { type: "application/msword" }));
  expect(net.http.send).toHaveBeenCalledTimes(1);
  await choose(user);
  expect(await screen.findByText("Validador fora do ar.")).toBeInTheDocument();
  net.http.send.mockRejectedValueOnce("boom");
  await choose(user, new File(["%PDF"], "cnh.pdf", { type: "application/pdf" }));
  expect(await screen.findByText("Erro inesperado ao validar o documento.")).toBeInTheDocument();
});

it("uploads the photo and registers the CNH with unmasked identifiers", async () => {
  api(); const { user } = open();
  await screen.findByRole("heading", { name: "Cadastro de CNH" });
  await choose(user);
  await screen.findByText(/Documento reconhecido como CNH/);
  await fillForm(user);
  expect(screen.getByLabelText("CPF *")).toHaveValue("529.982.247-25");
  await user.click(screen.getByRole("button", { name: /Cadastrar CNH/ }));
  expect(await screen.findByText("Painel")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("CNH cadastrada com sucesso.");
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "operator-licenses", body: expect.objectContaining({
    user: "op-1", cpf: "52998224725", rg: "123456789", cnh_number: "12345678901", birth_place: "Rio Verde – GO", ear: true, acc: false, file_url: "documents/new-cnh.jpg",
  }) });
});

it("blocks submission with the form rules before calling the API", async () => {
  api(); const { user } = open();
  await screen.findByRole("heading", { name: "Cadastro de CNH" });
  await choose(user);
  await screen.findByText(/Documento reconhecido como CNH/);
  await user.click(screen.getByRole("button", { name: /Cadastrar CNH/ }));
  expect(await screen.findByText("Nome completo é obrigatório.")).toBeInTheDocument();
  expect(screen.getByLabelText("Nome Completo *")).toHaveAttribute("aria-invalid", "true");
  expect(net.http.send.mock.calls.some(([request]) => request.path === "operator-licenses" && request.method === "POST")).toBe(false);
});

it("loads the existing CNH for editing and keeps the previous file when none is chosen", async () => {
  api({ "GET operator-licenses": () => [savedLicense] });
  const { user } = open();
  expect(await screen.findByRole("heading", { name: "Editar CNH" })).toBeInTheDocument();
  expect(screen.getByLabelText("CPF *")).toHaveValue("529.982.247-25");
  expect(screen.getByLabelText("RG *")).toHaveValue("12.345.678-9");
  expect(screen.getByRole("img", { name: "Documento CNH" })).toHaveAttribute("src", expect.stringMatching(/documents\/cnh\.jpg$/));
  await user.clear(screen.getByLabelText("Órgão Emissor *"));
  await user.type(screen.getByLabelText("Órgão Emissor *"), "DETRAN-MT");
  await user.click(screen.getByRole("button", { name: /Atualizar CNH/ }));
  expect(await screen.findByText("Painel")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("CNH atualizada com sucesso.");
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "operator-licenses/lic-1", body: expect.objectContaining({ issuing_authority: "DETRAN-MT", file_url: "documents/cnh.jpg" }) });
});

it("shows a PDF placeholder for a previously sent PDF", async () => {
  api({ "GET operator-licenses": () => [{ ...savedLicense, file_url: "documents/cnh.pdf" }] });
  open();
  expect(await screen.findByText(/PDF · Enviado anteriormente/)).toBeInTheDocument();
});

it.each([
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { cnh_number: ["CNH já cadastrada."] } }), "CNH já cadastrada.", null],
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { user: ["Usuário inválido."] } }), null, "Usuário inválido."],
  [new ServerError(500), null, "Erro no servidor."],
  ["boom", null, "Erro ao atualizar CNH. Verifique os dados e tente novamente."],
])("explains why saving failed (%#)", async (failure, fieldMessage, toastMessage) => {
  api({ "GET operator-licenses": () => [savedLicense], "PATCH operator-licenses/lic-1": () => { throw failure; } });
  const { user } = open();
  await screen.findByRole("heading", { name: "Editar CNH" });
  await user.click(screen.getByRole("button", { name: /Atualizar CNH/ }));
  if (fieldMessage) expect(await screen.findByText(fieldMessage)).toBeInTheDocument();
  if (toastMessage) await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(toastMessage));
  expect(screen.queryByText("Painel")).not.toBeInTheDocument();
});

it("asks to log in when there is no session", async () => {
  ui.userId = null; api();
  const { user } = open();
  await choose(user);
  await screen.findByText(/Documento reconhecido como CNH/);
  await fillForm(user);
  await user.click(screen.getByRole("button", { name: /Cadastrar CNH/ }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Usuário não autenticado. Faça login para cadastrar a CNH."));
  expect(net.http.send.mock.calls.map(([request]) => request.path)).not.toContain("operator-licenses");
});
