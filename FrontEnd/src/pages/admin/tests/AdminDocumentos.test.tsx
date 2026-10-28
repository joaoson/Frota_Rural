import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Documentos from "../Documentos";
import { ConflictError, NotFoundError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

const license = (overrides = {}) => ({ id: "lic-1", user: "op-1", name: "Carlos Lima", birth_date: "1990-01-01", cpf: "52998224725", rg: "123456789",
  mother_name: "Ana", nationality: "Brasileiro(a)", birth_place: "Rio Verde – GO", cnh_number: "12345678901", category: "AE",
  first_license_date: "2010-01-01", issue_date: "2025-01-01", expiration_date: "2030-01-01", issuing_state: "GO", issuing_authority: "DETRAN",
  situation: "active", acc: true, ear: true, points: 4, file_url: "documents/cnh.pdf", validation_status: "pending", created_at: "2026-10-02T10:00:00Z", ...overrides });
const certification = (overrides = {}) => ({ id: "cert-1", user: "op-2", issuing_organization: "SENAR", title: "Operação de colheitadeira", issue_date: "2025-03-01",
  expiration_date: "2027-03-01", credential_code: "SN-1", description: "Curso de 40 horas.", media_url: "documents/cert.png", validation_status: "pending", created_at: "2026-10-05T10:00:00Z", ...overrides });

const api = (routes: Record<string, Route> = {}) => serve(net.http, {
  "GET operator-licenses": () => [license(), license({ id: "lic-2", name: "Paula Reis", validation_status: "approved", created_at: null, file_url: null, acc: false, ear: false, points: 0 })],
  "GET certifications": () => [certification(), certification({ id: "cert-2", title: "NR-31", validation_status: "rejected", expiration_date: null, credential_code: null, media_url: null })],
  "GET users/op-1": () => userDto({ id: "op-1", name: "Carlos Lima", email: "carlos@example.com", phone: null }),
  "GET users/op-2": () => userDto({ id: "op-2", name: "Rita Alves", email: "rita@example.com" }),
  ...routes,
});
const open = () => renderWithProviders(<Documentos />, { queryClient: net.queryClient });
const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); toast.success.mockReset(); toast.error.mockReset(); });

it("queues pending CNHs and certifications, newest first", async () => {
  api(); open();
  expect(screen.getByText("Carregando documentos…")).toBeInTheDocument();
  await screen.findByText("Carlos Lima");
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows.map(row => within(row).getAllByRole("cell")[1].textContent)).toEqual(["Operação de colheitadeiraCertificação · SENAR", "Carlos LimaCNH · Categoria AE"]);
});

it("filters by type, status and search text", async () => {
  api(); const { user } = open();
  await screen.findByText("Carlos Lima");
  const [type, status] = screen.getAllByRole("combobox");
  await user.selectOptions(status, "all");
  expect(screen.getAllByRole("row")).toHaveLength(5);
  expect(within(rowOf("Paula Reis")).getByText("—")).toBeInTheDocument();
  await user.selectOptions(type, "certification");
  expect(screen.getAllByRole("row")).toHaveLength(3);
  await user.type(screen.getByPlaceholderText("Buscar por nome, título ou organização"), "nr-31");
  expect(within(rowOf("NR-31")).getByText("Recusado")).toBeInTheDocument();
  await user.selectOptions(status, "approved");
  expect(screen.getByText("Nenhum documento encontrado com os filtros atuais.")).toBeInTheDocument();
});

it("reviews a CNH with the driver's data, the attached PDF and an approval note", async () => {
  api({ "PATCH operator-licenses/lic-1/review": () => license({ validation_status: "approved" }) });
  const { user } = open();
  await screen.findByText("Carlos Lima");
  await user.click(rowOf("Carlos Lima"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: /Revisar CNH/ })).toBeInTheDocument();
  expect(within(dialog).getByText("Rio Verde – GO")).toBeInTheDocument();
  expect(within(dialog).getByText("EAR — Atividade Remunerada")).toBeInTheDocument();
  expect(within(dialog).getByText("Pontos: 4")).toBeInTheDocument();
  expect(await within(dialog).findByText("carlos@example.com")).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: /Baixar/ })).toHaveAttribute("href", expect.stringMatching(/\/documents\/cnh\.pdf$/));
  await user.type(within(dialog).getByLabelText("Observação / Motivo"), "Conferido com o DETRAN");
  await user.click(within(dialog).getByRole("button", { name: "Aprovar" }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "operator-licenses/lic-1/review", body: { validation_status: "approved", review_note: "Conferido com o DETRAN" } });
  expect(toast.success).toHaveBeenCalledWith("Documento aprovado com sucesso.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("requires a reason to reject a certification and previews image attachments", async () => {
  api({ "PATCH certifications/cert-1/review": () => certification({ validation_status: "rejected" }) });
  const { user } = open();
  await screen.findByText("Operação de colheitadeira");
  await user.click(rowOf("Operação de colheitadeira"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: /Revisar Certificação/ })).toBeInTheDocument();
  expect(within(dialog).getByText("SN-1")).toBeInTheDocument();
  expect(within(dialog).getByRole("img", { name: "Documento anexado" })).toHaveAttribute("src", expect.stringMatching(/cert\.png$/));
  const reject = within(dialog).getByRole("button", { name: "Recusar" });
  expect(reject).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Observação / Motivo"), "Certificado vencido");
  await user.click(reject);
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "certifications/cert-1/review", body: { validation_status: "rejected", review_note: "Certificado vencido" } });
  expect(toast.success).toHaveBeenCalledWith("Documento recusado.");
});

it("keeps reviewing when the owner profile or the review request fails", async () => {
  api({
    "GET users/op-2": () => { throw new NotFoundError(); },
    "PATCH certifications/cert-2/review": () => { throw new ConflictError("Documento já revisado."); },
  });
  const { user } = open();
  await screen.findByText("Carlos Lima");
  await user.selectOptions(screen.getAllByRole("combobox")[1], "all");
  await user.click(rowOf("NR-31"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Sem validade")).toBeInTheDocument();
  expect(within(dialog).getByText("Carregando dados do usuário...")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Aprovar" }));
  expect(toast.error).toHaveBeenCalledWith("Documento já revisado.");
  net.http.send.mockRejectedValueOnce("boom");
  await user.click(within(dialog).getByRole("button", { name: "Aprovar" }));
  expect(toast.error).toHaveBeenLastCalledWith("Falha ao aplicar a ação.");
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("warns when the queue cannot be loaded and reloads both lists on refresh", async () => {
  api({ "GET certifications": () => { throw new ServerError(500); } });
  const { user } = open();
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar os documentos."));
  api();
  await user.click(screen.getByRole("button", { name: /Atualizar/ }));
  expect(await screen.findByText("Operação de colheitadeira")).toBeInTheDocument();
});
