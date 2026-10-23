import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardMachineSearch from "../DashboardMachineSearch";
import { ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { postingListDto } from "@/test/factories";
import { serve } from "@/test/http";
import { renderWithProviders } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const postings = [
  postingListDto({ id: "p1", machine_usage_purpose: "Colheita", hourly_rate: "500", location_address: "Rio Verde, GO", availability_start: "2026-09-01T00:00:00Z", availability_end: "2026-09-30T00:00:00Z" }),
  postingListDto({ id: "p2", machine_brand: "Case", machine_model: "Puma", machine_usage_purpose: "Preparo de solo", hourly_rate: "200", location_address: "Sorriso, MT", availability_start: "2026-11-01T00:00:00Z", availability_end: "2026-12-31T00:00:00Z" }),
  postingListDto({ id: "p3", machine_brand: null, machine_model: null, machine_usage_purpose: null, location_address: null, primary_photo_url: "https://cdn/p3.jpg", availability_start: null, availability_end: null }),
];
const open = () => renderWithProviders(<DashboardMachineSearch />, { queryClient: net.queryClient });
const titles = () => screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);

beforeEach(() => { net.http.send.mockReset(); localStorage.clear(); });

it("lists active postings with fallbacks for missing data", async () => {
  serve(net.http, { "GET postings": () => postings });
  open();
  expect(screen.getByText("Carregando equipamentos disponíveis...")).toBeInTheDocument();
  expect(await screen.findByText("Case Puma")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ status: "active" }) }));
  expect(screen.getByRole("heading", { name: "Maquinário" })).toBeInTheDocument();
  expect(screen.getByText("Localização não informada")).toBeInTheDocument();
  expect(screen.getByText("Atividade não informada")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Ver disponibilidade" })[0]).toHaveAttribute("href", "/anuncio/p1");
  fireEvent.error(screen.getByRole("img", { name: "Maquinário" }));
  expect(screen.getByRole("img", { name: "Maquinário" }).getAttribute("src")).toContain("placehold.co");
});

it("combines text, activity, location, price and period filters", async () => {
  serve(net.http, { "GET postings": () => postings });
  const { user } = open();
  await screen.findByText("Case Puma");
  await user.type(screen.getByLabelText("Busca livre"), "puma");
  expect(titles()).toEqual(["Case Puma"]);
  await user.clear(screen.getByLabelText("Busca livre"));
  await user.selectOptions(screen.getByLabelText("Atividade agrícola"), "Colheita");
  expect(titles()).toEqual(["John Deere S790"]);
  await user.selectOptions(screen.getByLabelText("Atividade agrícola"), "");
  await user.type(screen.getByLabelText("Localização"), "sorriso");
  expect(titles()).toEqual(["Case Puma"]);
  await user.clear(screen.getByLabelText("Localização"));
  await user.type(screen.getByLabelText("Preço máx. (R$/h)"), "300");
  expect(titles()).toEqual(["Case Puma"]);
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  fireEvent.change(screen.getByLabelText("Data início"), { target: { value: "2026-10-01" } });
  expect(titles()).toEqual(["Case Puma", "Maquinário"]);
  fireEvent.change(screen.getByLabelText("Data início"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Data fim"), { target: { value: "2026-10-01" } });
  expect(titles()).toEqual(["John Deere S790", "Maquinário"]);
  await user.type(screen.getByLabelText("Busca livre"), "inexistente");
  expect(screen.getByText("Nenhum equipamento encontrado para estes filtros.")).toBeInTheDocument();
  expect(screen.getByText(/equipamentos disponíveis/)).toBeInTheDocument();
});

it("explains when available machines cannot be loaded", async () => {
  serve(net.http, { "GET postings": () => { throw new ServerError(500); } });
  open();
  expect(await screen.findByText("Não foi possível carregar os equipamentos. Tente novamente.")).toBeInTheDocument();
});
