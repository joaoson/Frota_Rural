import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AnaliseLocacao from "../AnaliseLocacao";
import { NotFoundError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { rentalDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, () => null])));

const reading = (value: number) => ({ id: `m${value}`, value, recorded_at: "2026-10-05T08:00:00Z" });
const api = (rental: Record<string, unknown>, routes: Record<string, Route> = {}) => serve(net.http, { "GET rentals/rental-a": () => rentalDto({ contract_number: "FR-1", ...rental }), ...routes });
const open = () => renderWithProviders(<AnaliseLocacao />, { route: "/dashboard-locatario/locacoes/rental-a", path: "/dashboard-locatario/locacoes/:rentalId", routes: { "/mensagens/:threadId": <p>Conversa</p> } });
const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 6, 15));
  net.http.send.mockReset(); toast.error.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it("tracks elapsed and remaining days of an ongoing rental and its meter usage", async () => {
  api({ status: "signed", start_date: "2026-10-05T08:00:00Z", end_date: "2026-10-08T18:00:00Z", total_price: "3200",
    meter: { check_in: reading(1200), check_out: null, hours_used: null, reference_hours: 32 } });
  open();
  expect(await screen.findByRole("heading", { name: "Análise da locação" })).toBeInTheDocument();
  expect(within(stat("Período contratado")).getByText("4 dias")).toBeInTheDocument();
  expect(within(stat("Dias decorridos")).getByText("2 dias")).toBeInTheDocument();
  expect(within(stat("Dias decorridos")).getByText("2 restantes")).toBeInTheDocument();
  const usage = screen.getByRole("region", { name: "Uso do equipamento" });
  expect(within(usage).getByText("1.200 h")).toBeInTheDocument();
  expect(within(usage).getByText("Aguardando devolução")).toBeInTheDocument();
  expect(within(usage).getByText("Referência: 8 h por diária (32 h no período)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Reservar próximo período/ })).toHaveAttribute("href", "/reservar/posting-a?inicio=2026-10-09&extensao=1");
});

it("reports the full usage of a completed rental", async () => {
  api({ status: "completed", start_date: "2026-09-01T08:00:00Z", end_date: "2026-09-02T18:00:00Z",
    meter: { check_in: null, check_out: reading(1220), hours_used: 20, reference_hours: null } });
  open();
  expect(await within(await screen.findByText("Dias decorridos").then(el => el.parentElement!)).findByText("2 dias")).toBeInTheDocument();
  const usage = screen.getByRole("region", { name: "Uso do equipamento" });
  expect(within(usage).getByText("—")).toBeInTheDocument();
  expect(within(usage).getByText("10 h")).toBeInTheDocument();
});

it("shows a pending rental without usage and explains there are no readings yet", async () => {
  api({ status: "pending", machine_brand: null, start_date: "2026-11-01T08:00:00Z", end_date: "2026-11-01T18:00:00Z" });
  open();
  expect(await screen.findByText("O locador ainda não registrou leituras do horímetro nesta locação.")).toBeInTheDocument();
  expect(within(stat("Dias decorridos")).getByText("0 dias")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Reservar próximo período/ })).toHaveAttribute("href", "/reservar/posting-a?inicio=2026-11-02&extensao=1");
});

it("opens the rental conversation with the owner and reports failures", async () => {
  api({ status: "signed" }, { "POST chat/threads/resolve": () => { throw new ServerError(503, "Chat indisponível."); } });
  const { user, unmount } = open();
  await user.click(await screen.findByRole("button", { name: /Mensagens da locação/ }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Chat indisponível."));
  unmount();
  api({ status: "signed" }, { "POST chat/threads/resolve": () => { throw "boom"; } });
  const second = open();
  await second.user.click(await screen.findByRole("button", { name: /Mensagens da locação/ }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível abrir a conversa."));
});

it("disables messaging without a known owner and handles missing rentals", async () => {
  api({ status: "signed", lessor_id: null });
  const first = open();
  expect(await screen.findByRole("button", { name: /Mensagens da locação/ })).toBeDisabled();
  first.unmount();
  serve(net.http, { "GET rentals/rental-a": () => { throw new NotFoundError(); } });
  open();
  expect(await screen.findByRole("heading", { name: "Locação não encontrada" })).toBeInTheDocument();
});
