import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MapaLocalizacao from "../MapaLocalizacao";

const fetchMock = vi.fn();
let resize: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null = null;
class FakeResizeObserver {
  constructor(callback: typeof resize) { resize = callback; }
  observe() {} disconnect() {}
}
const found = (lat: string, lon: string, name: string) => ({ ok: true, status: 200, json: async () => [{ lat, lon, display_name: name }] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  fetchMock.mockReset(); resize = null;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = () => act(() => vi.advanceTimersByTimeAsync(700));

it("asks for a location while nothing searchable was typed", () => {
  render(<MapaLocalizacao endereco="RV" cep="759" mensagemVazia="Digite o endereço" />);
  expect(screen.getByText("Digite o endereço")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("waits for typing to stop, geocodes the address and draws the tile mosaic", async () => {
  fetchMock.mockResolvedValue(found("-17.79", "-50.92", "Rio Verde, Goiás"));
  const onCoordenadas = vi.fn();
  render(<MapaLocalizacao endereco="Rio Verde, GO" onCoordenadas={onCoordenadas} zoom={2} />);
  expect(screen.getByText("Localizando no mapa...")).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(699));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByText("Rio Verde, Goiás")).toBeInTheDocument();
  expect(onCoordenadas).toHaveBeenCalledWith({ lat: -17.79, lon: -50.92, nomeExibicao: "Rio Verde, Goiás" });
  act(() => resize?.([{ contentRect: { width: 600, height: 300 } }]));
  const tiles = document.querySelectorAll("img[aria-hidden]");
  expect(tiles.length).toBeGreaterThan(0);
  expect([...tiles].every(tile => /^https:\/\/tile\.openstreetmap\.org\/2\/[0-3]\/[0-3]\.png$/.test(tile.getAttribute("src")!))).toBe(true);
  expect(screen.getByRole("link", { name: /Ampliar/ })).toHaveAttribute("href", expect.stringContaining("openstreetmap.org/?mlat=-17.79"));
  expect(screen.getByRole("link", { name: "© OpenStreetMap" })).toBeInTheDocument();
});

it("uses stored coordinates without calling the geocoder", () => {
  render(<MapaLocalizacao endereco="Fazenda" coordenadas={{ lat: 1, lon: 2, nomeExibicao: "Fazenda Boa Vista" }} />);
  expect(screen.getByText("Fazenda Boa Vista")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("tells the user when the address is not found or the service fails", async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
  const { rerender } = render(<MapaLocalizacao endereco="Lugar Nenhum" />);
  await settle();
  expect(screen.getByText("Não localizamos este endereço no mapa. Confira o CEP ou a cidade.")).toBeInTheDocument();
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => [] });
  rerender(<MapaLocalizacao endereco="Outro Lugar Distante" />);
  expect(screen.getByText("Localizando no mapa...")).toBeInTheDocument();
  await settle();
  expect(screen.getByText("Não foi possível carregar o mapa agora.")).toBeInTheDocument();
});

it("cancels the pending lookup when the address changes mid-typing", async () => {
  fetchMock.mockImplementation((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { rerender } = render(<MapaLocalizacao endereco="Cidade Um" cep="75900-123" />);
  await settle();
  rerender(<MapaLocalizacao endereco="Cidade Dois" cep="75900-123" />);
  await settle();
  expect(error).not.toHaveBeenCalled();
  expect(screen.getByText("Localizando no mapa...")).toBeInTheDocument();
});
