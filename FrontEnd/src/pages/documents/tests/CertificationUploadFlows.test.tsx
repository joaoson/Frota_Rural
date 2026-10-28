import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CertificationUpload from "../CertificationUpload";
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

const saved = (overrides = {}) => ({ id: "cert-1", user: "op-1", issuing_organization: "SENAR", title: "Operação de colheitadeira", issue_date: "2025-03-01",
  expiration_date: null, credential_code: null, description: "Curso de 40 horas.", media_url: "documents/cert.png", validation_status: "approved", ...overrides });
const api = (routes: Record<string, Route> = {}) => serve(net.http, {
  "GET certifications/cert-1": () => saved(),
  "POST documents/upload": () => ({ url: "documents/novo.pdf" }),
  "POST certifications": () => saved({ id: "cert-2" }),
  "PATCH certifications/cert-1": () => saved(),
  ...routes,
});
const open = (id?: string) => renderWithProviders(<CertificationUpload />, { queryClient: net.queryClient, route: id ? `/document/certification/${id}` : "/document/certification", path: id ? "/document/certification/:id" : "/document/certification", routes: { "/dashboard": <p>Painel</p> } });

async function fill(user: UserEvent) {
  await user.type(screen.getByLabelText("Título do Curso *"), "NR-31 Segurança");
  await user.type(screen.getByLabelText("Organização Emissora *"), "SENAR");
  fireEvent.change(screen.getByLabelText("Data de Emissão *"), { target: { value: "2025-03-01" } });
  fireEvent.change(screen.getByLabelText("Data de Validade (Opcional)"), { target: { value: "2027-03-01" } });
  await user.type(screen.getByLabelText("Código da Credencial"), "SN-31");
  await user.type(screen.getByLabelText("Descrição *"), "Treinamento de segurança no campo.");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  net.http.send.mockReset(); net.queryClient.clear(); ui.userId = "op-1"; ui.toast.success.mockReset(); ui.toast.error.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it("registers a certification with its uploaded file", async () => {
  api(); const { user, container } = open();
  expect(screen.getByRole("heading", { name: "Nova Certificação" })).toBeInTheDocument();
  await fill(user);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
  expect(screen.queryByText("nota.txt")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { files: [new File(["%PDF"], "certificado.pdf", { type: "application/pdf" })] } });
  expect(screen.getByText("certificado.pdf")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Cadastrar Certificação/ }));
  expect(await screen.findByText("Painel")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("Certificação cadastrada com sucesso.");
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "certifications", body: expect.objectContaining({
    user: "op-1", title: "NR-31 Segurança", expiration_date: "2027-03-01", credential_code: "SN-31", media_url: "documents/novo.pdf",
  }) });
});

it("shows the stored image and updates the certification keeping it", async () => {
  api(); const { user } = open("cert-1");
  expect(await screen.findByRole("heading", { name: "Editar Certificação" })).toBeInTheDocument();
  expect(screen.getByLabelText("Título do Curso *")).toHaveValue("Operação de colheitadeira");
  expect(screen.getByRole("link", { name: "Abrir arquivo do certificado" })).toHaveAttribute("href", expect.stringMatching(/documents\/cert\.png$/));
  expect(screen.getByText(/Imagem ·/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Atualizar Certificação/ }));
  expect(await screen.findByText("Painel")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("Certificação atualizada com sucesso.");
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "certifications/cert-1", body: expect.objectContaining({ media_url: "documents/cert.png" }) });
});

it("shows a PDF placeholder for a stored PDF", async () => {
  api({ "GET certifications/cert-1": () => saved({ media_url: "documents/cert.pdf" }) });
  open("cert-1");
  expect(await screen.findByText(/PDF ·/)).toBeInTheDocument();
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Remover arquivo do certificado" })).toBeInTheDocument());
});

it.each([
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { title: ["Título já cadastrado."] } }), "Título já cadastrado.", null],
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { user: ["Usuário inválido."] } }), null, "Usuário inválido."],
  [new ServerError(500), null, "Erro no servidor."],
  ["boom", null, "Erro ao cadastrar certificação. Verifique os dados e tente novamente."],
])("explains why a new certification was not saved (%#)", async (failure, fieldMessage, toastMessage) => {
  api({ "POST certifications": () => { throw failure; } });
  const { user } = open();
  await fill(user);
  await user.click(screen.getByRole("button", { name: /Cadastrar Certificação/ }));
  if (fieldMessage) expect(await screen.findByText(fieldMessage)).toBeInTheDocument();
  if (toastMessage) await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(toastMessage));
});

it("uses an edit-specific message when an update fails", async () => {
  api({ "PATCH certifications/cert-1": () => { throw "boom"; } });
  const { user } = open("cert-1");
  await screen.findByRole("heading", { name: "Editar Certificação" });
  await vi.waitFor(() => expect(screen.getByLabelText("Título do Curso *")).toHaveValue("Operação de colheitadeira"));
  await user.click(screen.getByRole("button", { name: /Atualizar Certificação/ }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Erro ao atualizar certificação. Verifique os dados e tente novamente."));
});

it("requires a session and validates required fields", async () => {
  ui.userId = null; api();
  const { user } = open();
  await user.click(screen.getByRole("button", { name: /Cadastrar Certificação/ }));
  expect(await screen.findByText("Título do curso é obrigatório.")).toBeInTheDocument();
  await fill(user);
  await user.click(screen.getByRole("button", { name: /Cadastrar Certificação/ }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Usuário não autenticado. Faça login para cadastrar a certificação."));
});
