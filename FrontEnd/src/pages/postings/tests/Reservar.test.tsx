import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Reservar from "../Reservar";
import { BadRequestError, ConflictError, NotFoundError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { contractDocument, postingDetailDto, rentalDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, assign: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "tenant-a" }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const quote = { tarifa_hora: "100.00", horas_por_diaria: 8, valor_diaria: "800.00", diarias: 2, subtotal: "1600.00", taxa_percentual: "0.05", taxa_valor: "80.00", total: "1680.00" };
const evidence = { id: "ev-1", contract: "contract-a", role: "locatario", signer_name: "Maria Silva", signer_email: "maria@example.com", document_version: "2.0.0",
  document_hash: "d".repeat(64), hash_algorithm: "sha256", signed_at: "2026-10-01T13:04:05Z", ip_address: "10.0.0.1", user_agent: "Firefox", otp_verified: true,
  previous_hash: "0", record_hash: "r".repeat(64) };
const paidRental = rentalDto({ id: "rental-a", postings: "posting-a", status: "active", start_date: "2026-10-10T08:00:00Z", end_date: "2026-10-11T18:00:00Z",
  total_price: "1680.00", subtotal: "1600.00", platform_fee: "80.00", billable_days: 2, daily_rate: "800.00", contract_number: "FR-2026-0001" });

function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET postings/posting-a": () => postingDetailDto({ max_reservation_days: 5 }),
    "GET postings/posting-a/ocupacao": () => ({ ocupados: [{ id: "x", start_date: "2026-10-20T08:00:00Z", end_date: "2026-10-20T18:00:00Z", status: "signed" }] }),
    "GET rentals/policy": () => ({ antecedencia_minima_dias: 7, data_minima_inicio: "2026-10-08" }),
    "GET postings/posting-a/cotacao": () => quote,
    "GET rentals/rental-a": () => paidRental,
    "GET contracts/rental-a": () => contractDocument(),
    "GET rentals/rental-a/payment": () => ({ status: "approved", amount: "1680.00", rental_status: "active" }),
    ...routes,
  });
}
const open = (query = "") => {
  window.history.replaceState({}, "", `/reservar/posting-a${query}`);
  return renderWithProviders(<Reservar />, { route: `/reservar/posting-a${query}`, path: "/reservar/:id", routes: { "/dashboard-locatario": <p>Minhas locações</p> } });
};
const day = (month: RegExp, n: number) => within(screen.getByText(month).parentElement!).getByRole("button", { name: String(n) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 1, 12));
  net.http.send.mockReset(); net.queryClient.clear(); Object.values(ui.toast).forEach(fn => fn.mockReset());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

it("only allows days from the server's minimum notice and within the posting's maximum", async () => {
  api(); const { user } = open();
  expect(await screen.findByText("Máximo de 5 dias por reserva.")).toBeInTheDocument();
  expect(screen.getByText("RENAGRO: BR1029304899")).toBeInTheDocument();
  expect(day(/outubro de 2026/i, 7)).toBeDisabled();
  expect(day(/outubro de 2026/i, 7)).toHaveAttribute("title", "Data não disponível");
  await user.click(day(/outubro de 2026/i, 10));
  expect(day(/outubro de 2026/i, 15)).toHaveAttribute("title", "Máximo de 5 dias por reserva");
  await user.click(day(/outubro de 2026/i, 9));
  expect(screen.getByText("Escolha o período")).toBeInTheDocument();
  await user.click(day(/outubro de 2026/i, 11));
  expect(screen.getByText("3 diárias")).toBeInTheDocument();
  expect(await screen.findByText("R$ 1.680,00")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ path: "postings/posting-a/cotacao", query: { start_date: "2026-10-09T08:00:00Z", end_date: "2026-10-11T18:00:00Z" } }));
});

it("refuses periods that cross another booking or its cleaning day", async () => {
  api(); const { user } = open();
  await screen.findByText("Máximo de 5 dias por reserva.");
  expect(day(/outubro de 2026/i, 21)).toHaveAttribute("title", "Indisponível: reserva ou limpeza");
  await user.click(day(/outubro de 2026/i, 18));
  await user.click(day(/outubro de 2026/i, 22));
  expect(ui.toast.error).toHaveBeenCalledWith("O período inclui uma data indisponível ou reservada para limpeza da máquina.");
  expect(screen.getByText("Escolha o período")).toBeInTheDocument();
});

it("clears dates and moves between months", async () => {
  api(); const { user } = open();
  await screen.findByText("Máximo de 5 dias por reserva.");
  expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
  await user.click(day(/outubro de 2026/i, 10));
  await user.click(day(/outubro de 2026/i, 12));
  await user.click(screen.getByRole("button", { name: "Limpar check-out" }));
  expect(screen.getByText("Escolha o período")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Limpar check-in" }));
  expect(screen.queryByRole("button", { name: "Limpar check-in" })).not.toBeInTheDocument();
  await user.click(day(/outubro de 2026/i, 10));
  await user.click(screen.getByRole("button", { name: "Limpar datas" }));
  expect(screen.getByText(/Check-in – Check-out/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(screen.getByText(/dezembro de 2026/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Mês anterior" }));
  expect(screen.getByText(/outubro de 2026/i)).toBeInTheDocument();
});

it("validates the period before moving to payment", async () => {
  api(); const { user } = open();
  await screen.findByText("Máximo de 5 dias por reserva.");
  await user.click(screen.getByRole("button", { name: /Avançar para Pagamento/ }));
  expect(ui.toast.error).toHaveBeenCalledWith("Informe a data de início e a data de fim da locação.");
});

it("pre-fills the start date and an extension note from the link", async () => {
  api(); const { user } = open("?inicio=2026-10-12&extensao=1");
  await screen.findByText("Máximo de 5 dias por reserva.");
  expect(screen.getByLabelText(/Observações/)).toHaveValue("Solicitação de extensão da locação anterior.");
  await user.click(day(/outubro de 2026/i, 13));
  expect(screen.getByText("2 diárias")).toBeInTheDocument();
});

it("starts checkout for a new reservation, or goes back to edit the dates", async () => {
  api({ "POST rentals": () => rentalDto({ id: "rental-new", postings: "posting-a" }), "POST rentals/rental-new/checkout": () => ({ url: "https://checkout.stripe.test/s1", amount: "1680.00" }) });
  const { user } = open();
  await screen.findByText("Máximo de 5 dias por reserva.");
  await user.click(day(/outubro de 2026/i, 10));
  await user.click(day(/outubro de 2026/i, 11));
  await user.click(screen.getByRole("button", { name: /Avançar para Pagamento/ }));
  await user.click(screen.getByRole("button", { name: "Voltar" }));
  expect(screen.getByRole("button", { name: /Avançar para Pagamento/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Avançar para Pagamento/ }));
  // Só a navegação para o Stripe é interceptada; o restante da URL segue real.
  vi.stubGlobal("location", Object.assign(new URL(window.location.href), { assign: ui.assign }));
  await user.click(screen.getByRole("button", { name: /Pagar e Avançar/ }));
  await vi.waitFor(() => expect(ui.assign).toHaveBeenCalledWith("https://checkout.stripe.test/s1"));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "rentals", body: expect.objectContaining({ postings: "posting-a", lessee: "tenant-a", total_price: 1680, status: "pending" }) });
});

it("falls back to the local price preview when the quote is unavailable", async () => {
  api({ "GET postings/posting-a/cotacao": () => { throw new ServerError(503); }, "GET rentals/policy": () => { throw new ServerError(503); } });
  const { user } = open();
  await screen.findByText("Máximo de 5 dias por reserva.");
  await user.click(day(/outubro de 2026/i, 10));
  await user.click(day(/outubro de 2026/i, 11));
  // 2 diárias × 350/h × 8 h + 5%.
  expect(await screen.findAllByText("R$ 5.880,00")).not.toHaveLength(0);
  expect(day(/outubro de 2026/i, 7)).toBeDisabled();
});

it("warns when the occupancy calendar cannot be loaded and when the posting is missing", async () => {
  api({ "GET postings/posting-a/ocupacao": () => { throw new ServerError(500); } });
  const first = open();
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível carregar as datas indisponíveis."));
  first.unmount();
  api({ "GET postings/posting-a": () => { throw new NotFoundError(); } });
  open();
  expect(await screen.findByText("Não foi possível carregar o anúncio.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Minhas Locações" })).toHaveAttribute("href", "/dashboard-locatario?tab=locacoes");
});

it.each([
  [rentalDto({ id: "rental-a", postings: "outro-anuncio", status: "pending" }), "Esta reserva não pertence a este anúncio ou à sua conta."],
  [rentalDto({ id: "rental-a", postings: "posting-a", status: "signed" }), "Esta reserva não aguarda pagamento. Consulte seu estado em Minhas Locações."],
])("refuses to resume a reservation that cannot be paid here (%#)", async (rental, message) => {
  api({ "GET rentals/rental-a": () => rental });
  open("?locacao=rental-a");
  expect(await screen.findByText(message)).toBeInTheDocument();
});

it("resumes an unpaid reservation and links to it", async () => {
  api({ "GET rentals/rental-a": () => ({ ...paidRental, status: "awaiting_payment", subtotal: null }) });
  open("?locacao=rental-a");
  expect(await screen.findByRole("link", { name: "Ver reserva" })).toHaveAttribute("href", "/dashboard-locatario?tab=locacoes#locacao-rental-a");
  expect(screen.getByText(/Reserva rental-a · /)).toBeInTheDocument();
});

it.each([
  ["refunded", "O pagamento foi estornado. Confira o cancelamento em Minhas Locações."],
  ["expired", "O pagamento expirou. Confira suas reservas em Minhas Locações."],
])("informs the tenant when the payment was %s", async (status, message) => {
  api({ "GET rentals/rental-a/payment": () => ({ status, amount: "1680.00", rental_status: "cancelled" }) });
  open("?pagamento=sucesso&locacao=rental-a");
  await vi.waitFor(() => expect(ui.toast.info).toHaveBeenCalledWith(message));
});

it("explains a confirmed payment whose rental belongs to another posting", async () => {
  api({ "GET rentals/rental-a": () => ({ ...paidRental, postings: "outro" }) });
  open("?pagamento=sucesso&locacao=rental-a");
  expect(await screen.findByText("Seu pagamento foi confirmado, mas não foi possível carregar o contrato. Atualize a página ou consulte Minhas Locações.")).toBeInTheDocument();
});

it("tells the tenant a cancelled checkout can be retried", async () => {
  api({ "GET rentals/rental-a": () => ({ ...paidRental, status: "pending" }) });
  open("?pagamento=cancelado&locacao=rental-a");
  await vi.waitFor(() => expect(ui.toast.info).toHaveBeenCalledWith("Pagamento interrompido. Você pode tentar novamente para a mesma reserva."));
});

async function reachSignature() {
  api({
    "POST contracts/rental-a/otp": () => ({ sent_to: "m***@example.com", expires_in_seconds: 300 }),
    "POST contracts/rental-a/sign": () => ({ signature_evidence: evidence, rental_details: { ...paidRental, status: "signed" } }),
  });
  const page = open("?pagamento=sucesso&locacao=rental-a");
  expect(await screen.findByRole("heading", { name: "Pagamento confirmado" })).toBeInTheDocument();
  expect(screen.getByText("R$ 1.680,00", { selector: "p" })).toBeInTheDocument();
  await page.user.click(screen.getByRole("button", { name: "Ir para a assinatura" }));
  return page;
}

it("shows the paid contract with both parties and the document hash before signing", async () => {
  await reachSignature();
  expect(screen.getAllByText("FR-2026-0001").length).toBeGreaterThan(0);
  expect(screen.getByText(/João Souza \(CPF: 111\.222\.333-44\)/)).toBeInTheDocument();
  expect(screen.getByText(/Maria Silva \(Documento: 52998224725\)/)).toBeInTheDocument();
  expect(screen.getByText("f".repeat(64))).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Assinar e Finalizar/ })).toBeDisabled();
  expect(window.location.search).toBe("");
});

it("signs after confirming the e-mail code and shows the signature receipt", async () => {
  const { user } = await reachSignature();
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  expect(await screen.findByText("m***@example.com")).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("000000"), "12a3456");
  expect(screen.getByPlaceholderText("000000")).toHaveValue("123456");
  await user.click(screen.getByRole("button", { name: /Assinar e Finalizar/ }));
  expect(ui.toast.error).toHaveBeenCalledWith("Você precisa aceitar os termos do contrato para continuar.");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Assinar e Finalizar/ }));
  expect(ui.toast.error).toHaveBeenCalledWith("Digite seu nome completo para assinar o contrato.");
  await user.type(screen.getByLabelText("Nome Completo (Assinatura Digital)"), "Maria Silva");
  await user.click(screen.getByRole("button", { name: /Assinar e Finalizar/ }));
  expect(await screen.findByText("Contrato assinado!")).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "contracts/rental-a/sign", body: { role: "locatario", name: "Maria Silva", revision_id: "rev-1", otp: "123456" } });
  expect(screen.getByText("01/10/2026 às 13:04:05 UTC")).toBeInTheDocument();
  expect(screen.getByText("Confirmada por código")).toBeInTheDocument();
  expect(screen.getByText("r".repeat(64))).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Ir para o meu painel/ }));
  expect(screen.getByText("Minhas locações")).toBeInTheDocument();
});

it("asks to re-read the contract when it changed after the code was requested", async () => {
  const { user } = await reachSignature();
  api({
    "POST contracts/rental-a/otp": () => { throw new ConflictError("Revisão desatualizada.", undefined, { apiCode: "stale_revision" }); },
    "GET contracts/rental-a": () => contractDocument({ evidencia: undefined }),
  });
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("O contrato foi atualizado. Revise o documento antes de assinar."));
  await vi.waitFor(() => expect(screen.queryByText("f".repeat(64))).not.toBeInTheDocument());
});

it.each([
  [new BadRequestError("Código inválido."), "Código inválido."],
  ["boom", "Erro ao assinar contrato."],
])("keeps the tenant on the contract when signing fails (%#)", async (failure, message) => {
  const { user } = await reachSignature();
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  await screen.findByText("m***@example.com");
  api({ "POST contracts/rental-a/sign": () => { throw failure; } });
  await user.type(screen.getByPlaceholderText("000000"), "123456");
  await user.click(screen.getByRole("checkbox"));
  await user.type(screen.getByLabelText("Nome Completo (Assinatura Digital)"), "Maria Silva");
  await user.click(screen.getByRole("button", { name: /Assinar e Finalizar/ }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith(message));
  expect(screen.getByRole("button", { name: /Assinar e Finalizar/ })).toBeEnabled();
});

it("reports when the e-mail code cannot be sent and lets the tenant go back to payment", async () => {
  const { user } = await reachSignature();
  api({ "POST contracts/rental-a/otp": () => { throw "boom"; } });
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível enviar o código por e-mail."));
  await user.click(screen.getByRole("button", { name: "Voltar" }));
  expect(screen.getByRole("button", { name: /Pagar e Avançar/ })).toBeInTheDocument();
});

it("hides the payment confirmation overlay on its own after a few seconds", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 1, 12));
  api(); open("?pagamento=sucesso&locacao=rental-a");
  await screen.findByRole("heading", { name: "Pagamento confirmado" });
  await act(() => vi.advanceTimersByTimeAsync(7000));
  await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Pagamento confirmado" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Assinar e Finalizar/ }));
});
