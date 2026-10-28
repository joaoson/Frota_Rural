import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import NovoAnuncio from "../NovoAnuncio";
import { HttpError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { machineDto, pricingSuggestionDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a" }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/MapaLocalizacao", () => ({ default: ({ onCoordenadas }: { onCoordenadas: (c: unknown) => void }) => (
  <button type="button" onClick={() => onCoordenadas({ lat: -17.7912345, lon: -50.9187654, nomeExibicao: "Rio Verde" })}>Confirmar ponto no mapa</button>
) }));

const viaCep = { cep: "75900-000", logradouro: "Rua A", bairro: "Centro", localidade: "Rio Verde", uf: "GO" };
function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET machines": () => [machineDto(), machineDto({ id: "machine-b", brand: null, model: null, renagro_number: null })],
    "POST pricing/suggest": () => pricingSuggestionDto(),
    "GET 75900000/json/": () => viaCep,
    "POST postings": () => ({ id: "posting-new", machinery: "machine-a", hourly_rate: "192.15" }),
    "POST postings/posting-new/photos": () => ({ id: "p1", path: "p", url: "u" }),
    ...routes,
  });
}
const open = () => renderWithProviders(<NovoAnuncio />, { queryClient: net.queryClient, route: "/dashboard/novo-anuncio", routes: { "/dashboard": <p>Meus anúncios</p> } });
const jpeg = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

async function fillRequired(user: UserEvent) {
  await screen.findByRole("option", { name: /John Deere S790/ });
  await user.selectOptions(screen.getByLabelText("Equipamento da Frota *"), "machine-a");
  await user.type(screen.getByLabelText("Valor por Hora (R$) *"), "200");
  await user.type(screen.getByLabelText("CEP"), "75900000");
  await vi.waitFor(() => expect(screen.getByLabelText("Localização *")).toHaveValue("Rio Verde, GO"));
}

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); Object.values(ui.toast).forEach(fn => fn.mockReset()); });

it("lists active machines and suggests a market price the owner can apply or dismiss", async () => {
  api(); const { user } = open();
  expect(await screen.findByRole("option", { name: "machine-b — sem registro" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Sugerir valor/ })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Equipamento da Frota *"), "machine-a");
  await user.click(screen.getByRole("button", { name: /Sugerir valor/ }));
  await user.click(await screen.findByRole("button", { name: /Usar/ }));
  expect(screen.getByLabelText("Valor por Hora (R$) *")).toHaveValue(192.15);
  expect(ui.toast.success).toHaveBeenCalledWith("Valor aplicado. Você pode ajustá-lo antes de publicar.");
  await user.click(screen.getByRole("button", { name: "Fechar sugestão" }));
  expect(screen.getByRole("button", { name: /Sugerir valor/ })).toBeInTheDocument();
});

it.each([
  [new HttpError("unprocessable_entity", "Não encontramos dados confiáveis para esta máquina.", 422), "Não encontramos dados confiáveis para esta máquina."],
  [new ServerError(502), "Erro ao consultar a sugestão de preço. Tente novamente."],
])("explains a pricing failure without blocking manual entry (%#)", async (failure, message) => {
  api({ "POST pricing/suggest": () => { throw failure; } });
  const { user } = open();
  await screen.findByRole("option", { name: /John Deere S790/ });
  await user.selectOptions(screen.getByLabelText("Equipamento da Frota *"), "machine-a");
  await user.click(screen.getByRole("button", { name: /Sugerir valor/ }));
  expect(await screen.findByText(message)).toBeInTheDocument();
});

it("publishes with the suggestion reference, rounded map point and every photo", async () => {
  api(); const { user, container } = open();
  await fillRequired(user);
  await user.click(screen.getByRole("button", { name: /Sugerir valor/ }));
  await screen.findByRole("button", { name: /Usar/ });
  await user.click(screen.getByRole("button", { name: "Confirmar ponto no mapa" }));
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, [jpeg("a.jpg"), jpeg("b.jpg")]);
  await user.click(screen.getAllByRole("button", { name: "remover" })[1]);
  await user.click(screen.getByRole("button", { name: /Publicar Anúncio/ }));
  expect(await screen.findByText("Meus anúncios")).toBeInTheDocument();
  expect(ui.toast.success).toHaveBeenCalledWith("Anúncio publicado com as fotos.");
  const posted = net.http.send.mock.calls.find(([request]) => request.method === "POST" && request.path === "postings")![0].body;
  // O CEP sai mascarado: o serializer de anúncios normaliza para 8 dígitos.
  expect(posted).toMatchObject({
    machinery: "machine-a", hourly_rate: "200", location_cep: "75900-000", location_address: "Rio Verde, GO", location_lat: -17.791235, location_lng: -50.918765, suggestion_id: "suggestion-a",
  });
  expect(net.http.send.mock.calls.filter(([request]) => request.path === "postings/posting-new/photos")).toHaveLength(1);
});

it("rejects photos that are not JPG/PNG or exceed 5MB", async () => {
  api(); const { container } = open();
  // Sem `applyAccept`: o navegador deixaria arrastar qualquer arquivo para a área de fotos.
  const user = userEvent.setup({ applyAccept: false });
  await screen.findByRole("option", { name: /John Deere S790/ });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, [new File(["x"], "a.gif", { type: "image/gif" }), jpeg("grande.jpg", 5 * 1024 * 1024 + 1)]);
  expect(ui.toast.error).toHaveBeenCalledWith("Use apenas JPG ou PNG.");
  expect(ui.toast.error).toHaveBeenCalledWith('"grande.jpg" excede 5MB.');
  expect(screen.queryByRole("button", { name: "remover" })).not.toBeInTheDocument();
});

it.each([
  [[{ id: "p", path: "p", url: "u" }, null], "Anúncio publicado, mas 1 de 2 fotos não foram enviadas."],
  [[null, null], "Anúncio publicado, mas as fotos não puderam ser enviadas."],
])("warns when some photos fail but keeps the posting (%#)", async (uploads, message) => {
  let call = 0;
  api({ "POST postings/posting-new/photos": () => { const result = uploads[call++]; if (!result) throw new ServerError(500); return result; } });
  const { user, container } = open();
  await fillRequired(user);
  await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [jpeg("a.jpg"), jpeg("b.jpg")]);
  await user.click(screen.getByRole("button", { name: /Publicar Anúncio/ }));
  await vi.waitFor(() => expect(ui.toast.warning).toHaveBeenCalledWith(message));
});

it("publishes without photos and clears the CEP when the location is typed", async () => {
  api(); const { user } = open();
  await fillRequired(user);
  await user.type(screen.getByLabelText("Localização *"), " - Fazenda");
  expect(screen.getByLabelText("CEP")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: /Publicar Anúncio/ }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Anúncio publicado."));
});

it.each([[new ServerError(500, "Fora do ar."), "Fora do ar."], ["boom", "Erro ao publicar anúncio. Verifique os dados e tente novamente."]])(
  "explains why the posting was not published (%#)", async (failure, message) => {
    api({ "POST postings": () => { throw failure; } });
    const { user } = open();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /Publicar Anúncio/ }));
    await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  },
);

it("warns about an unknown CEP and asks to register a machine first", async () => {
  api({ "GET machines": () => [], "GET 75900000/json/": () => ({ ...viaCep, erro: true }) });
  const { user } = open();
  expect(await screen.findByRole("link", { name: "Cadastre um equipamento" })).toHaveAttribute("href", "/dashboard/novo-equipamento");
  expect(screen.getByRole("button", { name: /Publicar Anúncio/ })).toBeDisabled();
  await user.type(screen.getByLabelText("CEP"), "75900000");
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("CEP não encontrado."));
});

it("offers to reload the fleet when it cannot be loaded", async () => {
  api({ "GET machines": () => { throw new ServerError(500); } });
  const { user } = open();
  const alert = await screen.findByRole("alert");
  api();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByRole("option", { name: /John Deere S790/ })).toBeInTheDocument();
  expect(alert).not.toBeInTheDocument();
});
