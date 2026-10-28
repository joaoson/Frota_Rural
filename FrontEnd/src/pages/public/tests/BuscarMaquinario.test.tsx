import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import BuscarMaquinario from "../BuscarMaquinario";
import { net } from "@/test/container";
import { postingListDto } from "@/test/factories";
import { ok } from "@/test/http";
import { renderWithProviders } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const postings = [
  postingListDto({ id: "p1", machine_brand: "John Deere", machine_model: "S790", machine_usage_purpose: "Colheita", hourly_rate: "500", location_address: "Rio Verde, GO", availability_start: "2026-09-01", availability_end: "2026-09-30" }),
  postingListDto({ id: "p2", machine_brand: "Case", machine_model: "Puma", machine_usage_purpose: "Preparo de solo", hourly_rate: "200", location_address: "Sorriso, MT", availability_start: "2026-11-01", availability_end: "2026-12-31", machine_year: null }),
  postingListDto({ id: "p3", machine_brand: "Valtra", machine_model: "BH", machine_usage_purpose: null, hourly_rate: "300", location_address: null, availability_start: null, availability_end: null, primary_photo_url: "https://cdn/p3.jpg" }),
];

const show = (data: unknown = postings) => {
  net.http.send.mockResolvedValue(ok(data));
  return renderWithProviders(<BuscarMaquinario />, { queryClient: net.queryClient });
};
const titles = () => screen.getAllByRole("heading", { level: 4 }).map(heading => heading.textContent);

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("lists only active postings with price, period and a details link", async () => {
  show();
  expect(await screen.findByText("3")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ path: "postings", query: expect.objectContaining({ status: "active" }) }));
  const card = screen.getByRole("heading", { name: "John Deere S790" }).closest("div.group") as HTMLElement;
  expect(within(card).getByText("R$ 500.00")).toBeInTheDocument();
  expect(within(card).getByText("Ano: 2022")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "Ver Detalhes" })).toHaveAttribute("href", "/anuncio/p1");
  const noPhoto = screen.getByRole("img", { name: "Case Puma" });
  expect(noPhoto.getAttribute("src")).toContain("placehold.co");
  fireEvent.error(screen.getByRole("img", { name: "Valtra BH" }));
  expect(screen.getByRole("img", { name: "Valtra BH" }).getAttribute("src")).toContain("placehold.co");
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

it("searches across machine, city and activity and offers to clear filters", async () => {
  const { user } = show();
  await screen.findByText("John Deere S790");
  await user.type(screen.getByPlaceholderText("Ex: Trator, Colheitadeira..."), "sorriso");
  expect(titles()).toEqual(["Case Puma"]);
  expect(screen.getByText(/equipamento disponível/)).toBeInTheDocument();
  await user.clear(screen.getByPlaceholderText("Ex: Trator, Colheitadeira..."));
  await user.type(screen.getByPlaceholderText("Ex: Sorriso, MT"), "Rio Verde");
  expect(titles()).toEqual(["John Deere S790"]);
  await user.click(screen.getByRole("button", { name: /Limpar filtros/ }));
  expect(titles()).toHaveLength(3);
});

it("shows the empty state when no posting matches and clears from there", async () => {
  const { user } = show();
  await screen.findByText("John Deere S790");
  await user.type(screen.getByPlaceholderText("Ex: Trator, Colheitadeira..."), "pulverizador");
  expect(screen.getByRole("status")).toHaveTextContent("Nenhum equipamento encontrado");
  await user.click(within(screen.getByRole("status")).getByRole("button", { name: /Limpar filtros/ }));
  expect(titles()).toHaveLength(3);
});

it("filters by agricultural activity", async () => {
  const { user } = show();
  await screen.findByText("John Deere S790");
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: "Colheita" }));
  expect(titles()).toEqual(["John Deere S790"]);
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: "Todas" }));
  expect(titles()).toHaveLength(3);
});

it("applies the maximum price only after the user stops typing", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    show();
    await screen.findByText("John Deere S790");
    fireEvent.change(screen.getByPlaceholderText("Ex: 400"), { target: { value: "250" } });
    expect(titles()).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(titles()).toEqual(["Case Puma"]);
  } finally { vi.useRealTimers(); }
});

it("keeps only machines available within the requested period", async () => {
  const { container } = show();
  await screen.findByText("John Deere S790");
  const [start, end] = container.querySelectorAll('input[type="date"]');
  fireEvent.change(start, { target: { value: "2026-10-15" } });
  expect(titles()).toEqual(["Case Puma", "Valtra BH"]);
  fireEvent.change(start, { target: { value: "" } });
  fireEvent.change(end, { target: { value: "2026-10-15" } });
  expect(titles()).toEqual(["John Deere S790", "Valtra BH"]);
});

it("sorts by price and switches the grid density", async () => {
  const { user } = show();
  await screen.findByText("John Deere S790");
  await user.click(screen.getAllByRole("combobox")[1]);
  await user.click(await screen.findByRole("option", { name: "Menor Preço" }));
  expect(titles()).toEqual(["Case Puma", "Valtra BH", "John Deere S790"]);
  await user.click(screen.getAllByRole("combobox")[1]);
  await user.click(await screen.findByRole("option", { name: "Maior Preço" }));
  expect(titles()).toEqual(["John Deere S790", "Valtra BH", "Case Puma"]);
  await user.click(screen.getByTitle("2 por linha"));
  expect(screen.getByTitle("2 por linha")).toHaveClass("bg-primary-container");
});

it("paginates nine postings per page", async () => {
  const many = Array.from({ length: 11 }, (_, i) => postingListDto({ id: `p${i}`, machine_model: `Modelo ${i}` }));
  const { user } = show(many);
  await screen.findByText("John Deere Modelo 0");
  expect(titles()).toHaveLength(9);
  await user.click(screen.getByRole("button", { name: "2" }));
  expect(titles()).toEqual(["John Deere Modelo 9", "John Deere Modelo 10"]);
  const [previous] = screen.getAllByRole("button").filter(button => button.textContent === "chevron_left");
  await user.click(previous);
  expect(titles()).toHaveLength(9);
  const [next] = screen.getAllByRole("button").filter(button => button.textContent === "chevron_right");
  await user.click(next);
  expect(titles()).toHaveLength(2);
});

it("tells the visitor when postings cannot be loaded", async () => {
  net.http.send.mockRejectedValue(new Error("offline"));
  renderWithProviders(<BuscarMaquinario />, { queryClient: net.queryClient });
  expect(screen.getByText("Carregando anúncios...")).toBeInTheDocument();
  expect(await screen.findByText(/Não foi possível carregar os anúncios/)).toBeInTheDocument();
});
