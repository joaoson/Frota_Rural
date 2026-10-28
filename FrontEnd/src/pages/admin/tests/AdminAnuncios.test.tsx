import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AdminAnuncios from "../Anuncios";
import { ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { postingListDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

const postings = [
  postingListDto({ id: "p1", status: "pending_review", primary_photo_url: "https://cdn/p1.jpg" }),
  postingListDto({ id: "p2", machine_brand: null, machine_model: null, machine_year: null, machine_usage_purpose: null, description: null, location_address: null, status: "active" }),
  postingListDto({ id: "p3", machine_brand: "Case", machine_model: "Puma", status: "rejected", description: "Trator para preparo de solo" }),
];
const api = (routes: Record<string, Route> = {}) => serve(net.http, { "GET postings": () => postings, ...routes });
const open = () => renderWithProviders(<AdminAnuncios />, { queryClient: net.queryClient });
const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); toast.success.mockReset(); toast.error.mockReset(); });

it("lists every posting with photo, price, location and the moderation actions allowed by its status", async () => {
  api(); open();
  expect(screen.getByText("Carregando anúncios…")).toBeInTheDocument();
  await screen.findByText("Máquina sem identificação");
  expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ path: "postings", query: expect.objectContaining({ status: undefined }) }));
  expect(screen.getByRole("img", { name: "John Deere S790" })).toHaveAttribute("src", "https://cdn/p1.jpg");
  expect(within(row("Máquina sem identificação")).getByText("—")).toBeInTheDocument();
  expect(within(row("Máquina sem identificação")).getByRole("button", { name: /Aprovar/ })).toBeDisabled();
  expect(within(row("Case Puma")).getByRole("button", { name: /Reprovar/ })).toBeDisabled();
  expect(within(row("Case Puma")).getByText("Reprovado")).toBeInTheDocument();
});

it("filters by text in machine, place or description and by status", async () => {
  api(); const { user } = open();
  await screen.findByText("Case Puma");
  await user.type(screen.getByPlaceholderText("Buscar por máquina, local ou descrição"), "preparo");
  expect(screen.getByText("Case Puma")).toBeInTheDocument();
  expect(screen.queryByText("John Deere S790")).not.toBeInTheDocument();
  await user.clear(screen.getByPlaceholderText("Buscar por máquina, local ou descrição"));
  await user.type(screen.getByPlaceholderText("Buscar por máquina, local ou descrição"), "rio verde");
  expect(screen.getAllByRole("row")).toHaveLength(3);
  await user.selectOptions(screen.getByRole("combobox"), "suspended");
  expect(screen.getByText("Nenhum anúncio encontrado com os filtros atuais.")).toBeInTheDocument();
});

it("approves a posting after confirmation", async () => {
  api({ "PUT admin/postings/p1/approve": () => ({ message: "Anúncio aprovado com sucesso." }) });
  const { user } = open();
  await screen.findByText("John Deere S790");
  await user.click(within(row("John Deere S790")).getByRole("button", { name: /Aprovar/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/R\$\s350,00 · Rio Verde, GO/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
  expect(toast.success).toHaveBeenCalledWith("Anúncio aprovado com sucesso.");
});

it("requires a reason before rejecting and sends it trimmed", async () => {
  api({ "PUT admin/postings/p2/reject": () => ({}) });
  const { user } = open();
  await screen.findByText("Máquina sem identificação");
  await user.click(within(row("Máquina sem identificação")).getByRole("button", { name: /Reprovar/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/sem local/)).toBeInTheDocument();
  const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByPlaceholderText(/Descreva o motivo/), "  Fotos de outra máquina  ");
  await user.click(confirm);
  expect(net.http.send).toHaveBeenCalledWith({ method: "PUT", path: "admin/postings/p2/reject", body: { reason: "Fotos de outra máquina" } });
  expect(toast.success).toHaveBeenCalledWith("Anúncio reprovado.");
});

it("explains moderation failures and lets the admin cancel", async () => {
  api({ "PUT admin/postings/p1/approve": () => { throw new ConflictError("Anúncio já moderado."); } });
  const { user } = open();
  await screen.findByText("John Deere S790");
  await user.click(within(row("John Deere S790")).getByRole("button", { name: /Aprovar/ }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar" }));
  expect(toast.error).toHaveBeenCalledWith("Anúncio já moderado.");
  net.http.send.mockRejectedValueOnce("boom");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" }));
  expect(toast.error).toHaveBeenLastCalledWith("Falha ao aplicar a ação.");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("warns when postings cannot be loaded and retries on refresh", async () => {
  api({ "GET postings": () => { throw new ServerError(500); } });
  const { user } = open();
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar os anúncios."));
  api();
  await user.click(screen.getByRole("button", { name: /Atualizar/ }));
  expect(await screen.findByText("Case Puma")).toBeInTheDocument();
});
