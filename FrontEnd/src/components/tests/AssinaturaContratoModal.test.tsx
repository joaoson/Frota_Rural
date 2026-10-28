import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AssinaturaContratoModal, { type PapelAssinatura } from "../AssinaturaContratoModal";
import { BadRequestError, ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { contractDocument } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("sonner", () => ({ toast }));

const lessorSignature = { papel: "locador" as const, nome: "João Souza", email: "joao@example.com", assinado_em_utc: "2026-10-01T10:00:00Z", hash_documento: "f".repeat(64),
  algoritmo_hash: "sha256", versao_documento: "2.0.0", ip: "10.0.0.2", otp_verificado: true, hash_registro: "h1" };
const evidence = { id: "ev", contract: "c-1", role: "locatario", signer_name: "", signer_email: "", document_version: "", document_hash: "d".repeat(64),
  hash_algorithm: "sha256", signed_at: "2026-10-02T11:00:00Z", ip_address: "", user_agent: "", otp_verified: false, previous_hash: "h1", record_hash: "r".repeat(64) };

function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET contracts/c-1": () => contractDocument({ evidencia: { hash_documento_atual: "f".repeat(64), algoritmo_hash: "sha256", assinaturas: [lessorSignature] } }),
    "POST contracts/c-1/otp": () => ({ sent_to: "m***@example.com", expires_in_seconds: 300 }),
    "POST contracts/c-1/sign": () => ({ signature_evidence: evidence }),
    ...routes,
  });
}
function open(papel: PapelAssinatura = "locatario") {
  const onOpenChange = vi.fn(); const onAssinado = vi.fn();
  const page = renderWithProviders(<AssinaturaContratoModal open onOpenChange={onOpenChange} contratoId="c-1" papel={papel} onAssinado={onAssinado} />);
  return { ...page, onOpenChange, onAssinado };
}

beforeEach(() => { net.http.send.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

it("shows the contract, the other party's signature and pre-fills the signer's name", async () => {
  api(); open();
  expect(screen.getByText("Carregando o documento do contrato...")).toBeInTheDocument();
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText(/Contrato nº FR-2026-0001/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Assinatura eletrônica como locatário · FR-2026-0001/)).toBeInTheDocument();
  expect(within(dialog).getByText(/O locador/)).toHaveTextContent("já assinou em 01/10/2026 às 10:00:00 UTC. Sobre esta mesma versão do documento.");
  expect(within(dialog).getByLabelText("Nome Completo (Assinatura Digital)")).toHaveValue("Maria Silva");
  expect(within(dialog).getByText(/Colheita/)).toBeInTheDocument();
});

it("warns when the document changed after the other party signed", async () => {
  api({ "GET contracts/c-1": () => contractDocument({ evidencia: { hash_documento_atual: "novo", algoritmo_hash: "sha256", assinaturas: [lessorSignature] } }) });
  open();
  expect(await screen.findByText(/Atenção: o documento mudou desde aquele aceite./)).toBeInTheDocument();
});

it("tells a party that already signed", async () => {
  api(); open("locador");
  expect(await screen.findByText("Você já assinou este contrato.")).toBeInTheDocument();
});

it("signs after the terms, name and e-mail code and shows the receipt", async () => {
  api(); const { user, onAssinado, onOpenChange } = open();
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(/Contrato nº/);
  await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
  expect(await within(dialog).findByText("m***@example.com")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Reenviar código" })).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Código de confirmação por e-mail"), "12345x6");
  await user.click(within(dialog).getByRole("button", { name: /Assinar Contrato/ }));
  expect(toast.error).toHaveBeenCalledWith("Você precisa aceitar os termos do contrato para continuar.");
  await user.click(within(dialog).getByRole("checkbox"));
  await user.clear(within(dialog).getByLabelText("Nome Completo (Assinatura Digital)"));
  await user.click(within(dialog).getByRole("button", { name: /Assinar Contrato/ }));
  expect(toast.error).toHaveBeenCalledWith("Digite seu nome completo para assinar o contrato.");
  await user.type(within(dialog).getByLabelText("Nome Completo (Assinatura Digital)"), "Maria Silva");
  await user.click(within(dialog).getByRole("button", { name: /Assinar Contrato/ }));
  expect(await within(dialog).findByRole("heading", { name: "Comprovante da Assinatura" })).toBeInTheDocument();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "contracts/c-1/sign", body: { role: "locatario", name: "Maria Silva", revision_id: "rev-1", otp: "123456" } });
  expect(onAssinado).toHaveBeenCalledWith(expect.objectContaining({ documentHash: "d".repeat(64) }));
  expect(within(dialog).getByText("Não confirmada por código")).toBeInTheDocument();
  expect(within(dialog).getAllByText("—")).toHaveLength(4);
  await user.click(within(dialog).getByRole("button", { name: /Concluir/ }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("reloads the contract when it changed after the code request", async () => {
  let reads = 0;
  api({
    "GET contracts/c-1": () => { reads += 1; return contractDocument(); },
    "POST contracts/c-1/otp": () => { throw new ConflictError("Revisão desatualizada.", undefined, { apiCode: "stale_revision" }); },
  });
  const { user } = open();
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(/Contrato nº/);
  await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("O contrato foi atualizado. Revise o documento antes de assinar."));
  await vi.waitFor(() => expect(reads).toBe(2));
});

it.each([
  [new BadRequestError("Código expirado."), "Código expirado."],
  [new ConflictError("Revisão desatualizada.", undefined, { apiCode: "stale_revision" }), "O contrato foi atualizado. Revise o documento antes de assinar."],
  ["boom", "Erro ao assinar o contrato."],
])("explains a refused signature (%#)", async (failure, message) => {
  api({ "POST contracts/c-1/sign": () => { throw failure; } });
  const { user } = open();
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(/Contrato nº/);
  await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
  await user.type(await within(dialog).findByLabelText("Código de confirmação por e-mail"), "123456");
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: /Assinar Contrato/ }));
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
});

it.each([[new ServerError(503, "E-mail indisponível."), "E-mail indisponível."], ["boom", "Não foi possível enviar o código por e-mail."]])(
  "explains why the code was not sent (%#)", async (failure, message) => {
    api({ "POST contracts/c-1/otp": () => { throw failure; } });
    const { user, onOpenChange } = open();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/Contrato nº/);
    await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  },
);

it("explains when the contract cannot be loaded and describes contracts without optional data", async () => {
  api({ "GET contracts/c-1": () => { throw new ServerError(500); } });
  const first = open();
  expect(await screen.findByText("Não foi possível carregar o contrato para assinatura.")).toBeInTheDocument();
  first.unmount();
  api({ "GET contracts/c-1": () => contractDocument({ evidencia: undefined, revisao: null,
    equipamento: { tipo: "", marca: "", modelo: "", ano: null, renagro: "", valor_estimado: "" }, anuncio: { tipo_servico: "", finalidade_uso: "" },
    locador: { ...contractDocument().locador, documento: "", representante_nome: "Rep. Legal" } }) });
  open("locador");
  expect(await screen.findByText(/Locação de\s+maquinário/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nome Completo (Assinatura Digital)")).toHaveValue("Rep. Legal");
});
