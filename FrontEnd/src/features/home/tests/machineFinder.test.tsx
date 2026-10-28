import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/app/container";
import MachineFinderChat from "../components/MachineFinderChat";

const mocks = vi.hoisted(() => ({ send: vi.fn(), reducedMotion: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => mocks.reducedMotion,
}));
vi.mock("@/app/container", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { PostingStore } = await import("@/features/postings/api/PostingStore");
  const { HttpPostingRepository } = await import("@/features/postings/api/PostingRepository");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return { queryClient, postingStore: new PostingStore(new HttpPostingRepository({ send: mocks.send }), queryClient) };
});
const result = { status: 200, data: { total: 1, dates_checked: true, match_type: "exact", ai_unavailable: false, results: [{
  posting: { id: "posting-real", machinery: "machine-real", machine_brand: "Valtra", machine_model: "BH 224", hourly_rate: "250.00", location_address: "Curitiba, PR", machine_usage_purpose: "Preparo de solo", status: "active" },
  reasons: ["Atividade informada: Preparo de solo."], soil_mentioned: false,
}] } };

function show() {
  render(<QueryClientProvider client={queryClient}><MemoryRouter><MachineFinderChat /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Encontrar máquina com a capivara" }));
}
function chooseBasics() {
  fireEvent.click(screen.getByRole("button", { name: "Preparo de solo" }));
  fireEvent.click(screen.getByRole("button", { name: "Argiloso" }));
}
function chooseState() {
  fireEvent.click(screen.getByRole("button", { name: "Sul" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Estado" }), { target: { value: "PR" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}
function finishWithoutDates() {
  chooseState();
  fireEvent.click(screen.getByRole("button", { name: "Ainda não defini as datas" }));
}
beforeEach(() => { mocks.send.mockReset().mockResolvedValue(result); mocks.reducedMotion = false; });
afterEach(() => { cleanup(); queryClient.clear(); });

it("asks five questions and searches through the real store/repository before linking to the returned listing", async () => {
  show();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Encontrar máquina com a capivara" })).toBeNull();
  chooseBasics();
  chooseState();
  fireEvent.change(screen.getByLabelText("Data de início"), { target: { value: "2099-02-10" } });
  fireEvent.change(screen.getByLabelText("Data de fim"), { target: { value: "2099-02-12" } });
  fireEvent.click(screen.getByRole("button", { name: "Encontrar máquinas" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Ver anúncio de Valtra BH 224" }).getAttribute("href")).toBe("/anuncio/posting-real"));
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith({ method: "POST", path: "postings/recommendations", body: { application: "soil_preparation", soil: "clay", state: "PR", start_date: "2099-02-10", end_date: "2099-02-12" } });
  expect(screen.getByText(/Confirme com o locador os implementos/)).toBeTruthy();
  expect(screen.queryByText("Possível alternativa · IA")).toBeNull();
});

it("identifies AI alternatives and links only to the returned catalog listing", async () => {
  mocks.send.mockResolvedValue({ ...result, data: { ...result.data, match_type: "similar", dates_checked: false,
    results: [{ ...result.data.results[0], reasons: ["Possível alternativa com enxada rotativa; confirme o implemento com o locador."] }],
  } });
  show(); chooseBasics(); finishWithoutDates();
  await waitFor(() => expect(screen.getByText("Possível alternativa · IA")).toBeTruthy());
  expect(screen.getByText(/Não encontrei uma correspondência exata/)).toBeTruthy();
  expect(screen.getByText(/Possível alternativa com enxada rotativa/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver anúncio de Valtra BH 224" }).getAttribute("href")).toBe("/anuncio/posting-real");
  expect(screen.getByText(/As datas ainda precisam ser conferidas/)).toBeTruthy();
  expect(screen.queryByText(/Encontrei 1 máquina/)).toBeNull();
});

it("keeps the empty state usable when AI is unavailable and retries with the same filters", async () => {
  mocks.send.mockResolvedValueOnce({ status: 200, data: { total: 0, results: [], dates_checked: false, match_type: "none", ai_unavailable: true } }).mockResolvedValueOnce(result);
  show(); chooseBasics(); finishWithoutDates();
  await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhum equipamento encontrado" })).toBeTruthy());
  expect(screen.getByText(/A busca por alternativas está indisponível/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("link", { name: "Explorar todos os anúncios" }).getAttribute("href")).toBe("/buscar-maquinario");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Ver anúncio de Valtra BH 224" })).toBeTruthy());
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.send.mock.calls[1][0]).toEqual(mocks.send.mock.calls[0][0]);
  expect(screen.queryByText(/A busca por alternativas está indisponível/)).toBeNull();
});

it("preserves the conversation when closed, allows skipping dates, and handles no matches", async () => {
  mocks.send.mockResolvedValue({ status: 200, data: { total: 0, results: [], dates_checked: false, match_type: "none", ai_unavailable: false } });
  show();
  chooseBasics();
  fireEvent.click(screen.getByRole("button", { name: "Fechar conversa" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Encontrar máquina com a capivara" })));
  fireEvent.click(screen.getByRole("button", { name: "Encontrar máquina com a capivara" }));
  expect(screen.getByText("Pergunta 3 de 5")).toBeTruthy();
  finishWithoutDates();
  await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhum equipamento encontrado" })).toBeTruthy());
  expect(screen.queryByRole("link", { name: /Ver anúncio de/ })).toBeNull();
  expect(mocks.send.mock.calls[0][0].body).toEqual({ application: "soil_preparation", soil: "clay", state: "PR", start_date: null, end_date: null });
  expect(screen.getByRole("link", { name: "Explorar todos os anúncios" }).getAttribute("href")).toBe("/buscar-maquinario");
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByText("Pergunta 1 de 5")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Nenhum equipamento encontrado" })).toBeNull();
});

it("limits states by region and clears a previous state when the region changes", async () => {
  show(); chooseBasics();
  fireEvent.click(screen.getByRole("button", { name: "Sul" }));
  const stateSelect = screen.getByRole("combobox", { name: "Estado" });
  expect(Array.from((stateSelect as HTMLSelectElement).options).map((option) => option.value)).toEqual(["", "PR", "RS", "SC"]);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByRole("alert").textContent).toContain("Selecione um estado");
  fireEvent.change(stateSelect, { target: { value: "PR" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Voltar uma pergunta" }));
  expect((screen.getByRole("combobox", { name: "Estado" }) as HTMLSelectElement).value).toBe("PR");
  fireEvent.click(screen.getByRole("button", { name: "Voltar uma pergunta" }));
  fireEvent.click(screen.getByRole("button", { name: "Centro-Oeste" }));
  const newSelect = screen.getByRole("combobox", { name: "Estado" }) as HTMLSelectElement;
  expect(newSelect.value).toBe("");
  expect(Array.from(newSelect.options).map((option) => option.value)).toEqual(["", "DF", "GO", "MT", "MS"]);
  fireEvent.change(newSelect, { target: { value: "DF" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.queryByLabelText("Preço máximo por hora (R$)")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ainda não defini as datas" }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
  expect(mocks.send.mock.calls[0][0].body).toEqual({ application: "soil_preparation", soil: "clay", state: "DF", start_date: null, end_date: null });
});

it.each([false, true])("makes exiting content inert and supports reopening mid-transition (reduced motion: %s)", async (reduced) => {
  mocks.reducedMotion = reduced;
  render(<QueryClientProvider client={queryClient}><MemoryRouter><MachineFinderChat /></MemoryRouter></QueryClientProvider>);
  const launcher = screen.getByRole("button", { name: "Encontrar máquina com a capivara" });
  fireEvent.click(launcher, { detail: 1 });
  const panel = screen.getByRole("dialog");
  if (reduced) expect(panel.style.transform).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Colheita" }));
  fireEvent.click(screen.getByRole("button", { name: "Fechar conversa" }), { detail: 1 });
  expect(panel.hasAttribute("inert")).toBe(true);
  expect(panel.getAttribute("aria-hidden")).toBe("true");
  expect(launcher.getAttribute("aria-hidden")).toBeNull();
  if (reduced) expect(panel.style.transform).toBe("none");
  fireEvent.click(launcher, { detail: 1 });
  await waitFor(() => expect(screen.getByRole("dialog").hasAttribute("inert")).toBe(false));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByText("Pergunta 2 de 5")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(launcher));
});

it("retries failed searches with the same answers", async () => {
  mocks.send.mockRejectedValueOnce(new Error("Servidor indisponível.")).mockResolvedValueOnce(result);
  show(); chooseBasics(); finishWithoutDates();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Servidor indisponível"));
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Ver anúncio de Valtra BH 224" })).toBeTruthy());
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.send.mock.calls[0][0]).toEqual(mocks.send.mock.calls[1][0]);
});

it("does not show a late response after restarting and supports editing a previous answer", async () => {
  let resolve!: (value: unknown) => void;
  mocks.send.mockReturnValue(new Promise((done) => { resolve = done; }));
  show(); chooseBasics(); finishWithoutDates();
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Recomeçar conversa" }));
  await act(async () => resolve(result));
  expect(screen.getByText("Pergunta 1 de 5")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Ver anúncio de/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Colheita" }));
  fireEvent.click(screen.getByRole("button", { name: "Voltar uma pergunta" }));
  expect(screen.getByText("Pergunta 1 de 5")).toBeTruthy();
  expect(screen.queryByText("Como é o solo da sua área?")).toBeNull();
});

it("validates incomplete dates before requesting recommendations and closes with Escape", () => {
  show(); chooseBasics();
  chooseState();
  fireEvent.change(screen.getByLabelText("Data de início"), { target: { value: "2099-02-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Encontrar máquinas" }));
  expect(screen.getByRole("alert").textContent).toContain("Escolha as duas datas");
  expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
