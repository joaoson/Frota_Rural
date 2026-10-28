import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GerenciarAnuncio from "../GerenciarAnuncio";
import { ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { postingDetailDto, rentalDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a" }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/MapaLocalizacao", () => ({ default: ({ coordenadas, onCoordenadas }: { coordenadas: { lat: number } | null; onCoordenadas: (c: unknown) => void }) => (
  <div><output aria-label="ponto do mapa">{coordenadas ? String(coordenadas.lat) : "sem ponto"}</output>
    <button type="button" onClick={() => onCoordenadas({ lat: -15.6, lon: -56.1, nomeExibicao: "Cuiabá" })}>Localizar no mapa</button></div>
) }));

function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET postings/posting-a": () => postingDetailDto({ location_cep: "75900000", availability_start: "2026-01-01T00:00:00Z", availability_end: "2026-12-31T00:00:00Z" }),
    "GET rentals": () => [rentalDto({ status: "completed", total_price: "1200" }), rentalDto({ id: "r2", postings: "outro", status: "completed" })],
    "GET reviews": () => [{ id: "rv", rental: "rental-a", reviewer: "t", reviewee: "owner-a", rating: 4 }],
    "PATCH postings/posting-a": () => null,
    "DELETE postings/posting-a": () => null,
    "GET 78000000/json/": () => ({ cep: "78000-000", logradouro: "", bairro: "", localidade: "Cuiabá", uf: "MT" }),
    ...routes,
  });
}
const open = () => renderWithProviders(<GerenciarAnuncio />, { queryClient: net.queryClient, route: "/dashboard/gerenciar-anuncio/posting-a", path: "/dashboard/gerenciar-anuncio/:id", routes: { "/dashboard": <p>Meus anúncios</p> } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  net.http.send.mockReset(); net.queryClient.clear(); ui.toast.success.mockReset(); ui.toast.error.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it("loads the posting with its stored map point and performance", async () => {
  api(); open();
  expect(screen.getByText("Carregando anúncio...")).toBeInTheDocument();
  expect(await screen.findByLabelText("Valor por Hora (R$) *")).toHaveValue(350);
  expect(screen.getByLabelText("CEP")).toHaveValue("75900-000");
  expect(screen.getByLabelText("ponto do mapa")).toHaveTextContent("-17.79");
  expect(screen.getByText("R$ 1.200,00")).toBeInTheDocument();
});

it("saves edits with a new location found on the map", async () => {
  api(); const { user } = open();
  await screen.findByLabelText("Valor por Hora (R$) *");
  await user.selectOptions(screen.getByLabelText("Status do Anúncio"), "inactive");
  await user.clear(screen.getByLabelText("CEP"));
  await user.type(screen.getByLabelText("CEP"), "78000000");
  await vi.waitFor(() => expect(screen.getByLabelText("Localização *")).toHaveValue("Cuiabá, MT"));
  expect(screen.getByLabelText("ponto do mapa")).toHaveTextContent("sem ponto");
  await user.click(screen.getByRole("button", { name: "Localizar no mapa" }));
  await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
  expect(await screen.findByText("Meus anúncios")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "postings/posting-a", body: expect.objectContaining({ status: "inactive", location_address: "Cuiabá, MT", location_lat: -15.6, location_lng: -56.1 }) });
});

it.each([[new ConflictError("Anúncio com reservas ativas."), "Anúncio com reservas ativas."], ["boom", "Erro ao atualizar o anúncio."]])(
  "explains why an edit was refused (%#)", async (failure, message) => {
    api({ "PATCH postings/posting-a": () => { throw failure; } });
    const { user } = open();
    await screen.findByLabelText("Valor por Hora (R$) *");
    await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  },
);

it("validates the price and period before saving", async () => {
  api(); const { user } = open();
  await screen.findByLabelText("Valor por Hora (R$) *");
  await user.clear(screen.getByLabelText("Valor por Hora (R$) *"));
  await user.type(screen.getByLabelText("Valor por Hora (R$) *"), "0");
  await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
  expect(await screen.findByText("Informe um valor maior que zero.")).toBeInTheDocument();
  expect(net.http.send.mock.calls.some(([request]) => request.method === "PATCH")).toBe(false);
});

it("deletes the posting after confirmation and reports failures", async () => {
  api({ "DELETE postings/posting-a": () => { throw "boom"; } });
  const { user } = open();
  await screen.findByLabelText("Valor por Hora (R$) *");
  await user.click(screen.getByRole("button", { name: /Excluir Anúncio/ }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Erro ao remover anúncio."));
  api();
  await user.click(screen.getByRole("button", { name: /Excluir Anúncio/ }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir" }));
  expect(await screen.findByText("Meus anúncios")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("Anúncio removido.");
});

it("locks the status of a posting under moderation but keeps it editable", async () => {
  api({ "GET postings/posting-a": () => postingDetailDto({ status: "pending_review", location_lat: null, location_lng: null, location_cep: null }), "GET rentals": () => [], "GET reviews": () => [] });
  open();
  expect(await screen.findByLabelText("Status do Anúncio")).toBeDisabled();
  expect(screen.getByRole("option", { name: "Em análise" })).toBeInTheDocument();
  expect(screen.getByText(/Este anúncio está em análise/)).toBeInTheDocument();
  expect(screen.getByLabelText("ponto do mapa")).toHaveTextContent("sem ponto");
});

it("warns about an unknown CEP and offers to reload a posting that failed", async () => {
  api({ "GET 78000000/json/": () => ({ cep: "", logradouro: "", bairro: "", localidade: "", uf: "", erro: true }) });
  const { user, unmount } = open();
  await screen.findByLabelText("Valor por Hora (R$) *");
  await user.clear(screen.getByLabelText("CEP"));
  await user.type(screen.getByLabelText("CEP"), "78000000");
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("CEP não encontrado."));
  unmount();
  net.queryClient.clear();
  api({ "GET postings/posting-a": () => { throw new ServerError(500); } });
  const second = open();
  const alert = await screen.findByRole("alert");
  api();
  await second.user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByLabelText("Valor por Hora (R$) *")).toBeInTheDocument();
});

it("offers to reload the rental history when it fails", async () => {
  api({ "GET rentals": () => { throw new ServerError(500); } });
  const { user } = open();
  const alert = await screen.findByText(/Não foi possível carregar o histórico/);
  api();
  await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("4,0")).toBeInTheDocument();
});
