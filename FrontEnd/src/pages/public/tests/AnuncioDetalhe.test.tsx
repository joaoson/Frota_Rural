import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AnuncioDetalhe from "../AnuncioDetalhe";
import { NotFoundError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { postingDetailDto, rentalDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ isAuthenticated: true, toastError: vi.fn(), map: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isAuthenticated: ui.isAuthenticated }) }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/MapaLocalizacao", () => ({ default: (props: unknown) => { ui.map(props); return <div>Mapa</div>; } }));
vi.mock("sonner", () => ({ toast: { error: ui.toastError } }));

function api(overrides: Record<string, Route> = {}) {
  serve(net.http, {
    "GET postings/posting-a": () => postingDetailDto({ photos: [{ url: "https://cdn/2.jpg" }, { url: "https://cdn/1.jpg", is_primary: true }, { url: "https://cdn/3.jpg" }] }),
    "GET rentals": () => [rentalDto({ status: "signed", start_date: "2026-10-20T08:00:00Z", end_date: "2026-10-21T18:00:00Z" }), rentalDto({ id: "old", status: "cancelled" })],
    ...overrides,
  });
}
const open = () => renderWithProviders(<AnuncioDetalhe />, { route: "/anuncio/posting-a", path: "/anuncio/:id", routes: { "/login": <p>Tela de login</p>, "/mensagens/:threadId": <p>Conversa aberta</p> } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 15, 12));
  net.http.send.mockReset(); ui.isAuthenticated = true; ui.toastError.mockReset(); ui.map.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

it("presents the machine, its price, specs and the booking call to action", async () => {
  api(); open();
  expect(screen.getByText("Carregando anúncio...")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { level: 1, name: "John Deere S790" })).toBeInTheDocument();
  expect(screen.getByText("R$ 350.00")).toBeInTheDocument();
  expect(screen.getByText("BR1029304899")).toBeInTheDocument();
  expect(screen.getByText("Plataforma 35 pés")).toBeInTheDocument();
  expect(screen.getByText("Colheitadeira revisada.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Solicitar Reserva" })).toHaveAttribute("href", "/reservar/posting-a");
  expect(ui.map).toHaveBeenCalledWith(expect.objectContaining({ endereco: "Rio Verde, GO", coordenadas: { lat: -17.79, lon: -50.92, nomeExibicao: "Rio Verde, GO" } }));
});

it("shows the cover photo first and browses the gallery in both directions", async () => {
  api(); open();
  const main = await screen.findByRole("img", { name: "John Deere S790" });
  expect(main).toHaveAttribute("src", "https://cdn/1.jpg");
  const [previous, next] = within(main.parentElement!).getAllByRole("button");
  fireEvent.click(previous);
  expect(main).toHaveAttribute("src", "https://cdn/3.jpg");
  fireEvent.click(next);
  fireEvent.click(next);
  expect(main).toHaveAttribute("src", "https://cdn/2.jpg");
  fireEvent.click(next); fireEvent.click(next);
  expect(main).toHaveAttribute("src", "https://cdn/1.jpg");
  fireEvent.click(screen.getByRole("img", { name: "Foto 3" }).parentElement!);
  expect(main).toHaveAttribute("src", "https://cdn/3.jpg");
  fireEvent.error(screen.getByRole("img", { name: "Foto 2" }));
  fireEvent.error(main);
  expect(main.getAttribute("src")).toContain("placehold.co");
});

it("blocks past days, booked days with a cleaning buffer and days outside availability", async () => {
  api({ "GET postings/posting-a": () => postingDetailDto({ availability_end: "2026-11-10" }) });
  open();
  await screen.findByRole("heading", { name: "Disponibilidade" });
  const october = screen.getByText(/outubro de 2026/i).parentElement!;
  const day = (container: HTMLElement, n: number) => within(container).getByText(String(n), { selector: "span[title]" });
  expect(day(october, 14)).toHaveAttribute("title", "Indisponível");
  expect(day(october, 16)).toHaveAttribute("title", "Disponível");
  expect(day(october, 19)).toHaveAttribute("title", "Indisponível");
  expect(day(october, 22)).toHaveAttribute("title", "Indisponível");
  expect(day(october, 23)).toHaveAttribute("title", "Disponível");
  const november = screen.getByText(/novembro de 2026/i).parentElement!;
  expect(day(november, 11)).toHaveAttribute("title", "Indisponível");
  expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(screen.getByText(/dezembro de 2026/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
  expect(screen.getByText(/outubro de 2026/i)).toBeInTheDocument();
});

it("opens the owner's conversation resolved by the server", async () => {
  api({ "POST chat/threads/resolve": () => ({ thread_id: "posting:posting-a:tenant-a", scope: "posting", scope_id: "posting-a", scope_label: "Anúncio", peer: null, can_write: true, unread_count: 0, last_message: null }) });
  const { user } = open();
  await user.click(await screen.findByRole("button", { name: /Conversar com o Locador/ }));
  expect(await screen.findByText("Conversa aberta")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "chat/threads/resolve", body: { scope: "posting", scope_id: "posting-a" } });
});

it("asks visitors to log in before chatting and reports chat failures", async () => {
  ui.isAuthenticated = false; api();
  const { user, unmount } = open();
  await user.click(await screen.findByRole("button", { name: /Conversar com o Locador/ }));
  expect(screen.getByText("Tela de login")).toBeInTheDocument();
  unmount();
  ui.isAuthenticated = true;
  api({ "POST chat/threads/resolve": () => { throw new ServerError(500, "Chat indisponível."); } });
  const second = open();
  await second.user.click(await screen.findByRole("button", { name: /Conversar com o Locador/ }));
  expect(ui.toastError).toHaveBeenCalledWith("Chat indisponível.");
  expect(screen.getByRole("button", { name: /Conversar com o Locador/ })).toBeEnabled();
});

it("omits missing details and still loads when the calendar cannot be fetched", async () => {
  api({
    "GET postings/posting-a": () => ({ id: "posting-a", hourly_rate: "100" }),
    "GET rentals": () => { throw new ServerError(500); },
  });
  open();
  expect(await screen.findByRole("heading", { level: 1, name: "Sem título" })).toBeInTheDocument();
  expect(screen.queryByText("Localização")).not.toBeInTheDocument();
  expect(screen.queryByText("Descrição")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Foto 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Sem título" }).getAttribute("src")).toContain("placehold.co");
});

it("uses the map's own geocoding for legacy postings without coordinates", async () => {
  api({ "GET postings/posting-a": () => postingDetailDto({ location_lat: null, location_lng: null }) });
  open();
  await screen.findByText("Mapa");
  expect(ui.map).toHaveBeenLastCalledWith(expect.objectContaining({ coordenadas: null }));
});

it("explains when the posting cannot be loaded", async () => {
  api({ "GET postings/posting-a": () => { throw new NotFoundError(); } });
  open();
  expect(await screen.findByText("Não foi possível carregar o anúncio.")).toBeInTheDocument();
});
