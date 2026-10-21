import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Contrato from "@/pages/contracts/Contrato";
import AssinaturaContratoModal from "@/components/AssinaturaContratoModal";
import { HttpError } from "@/shared/http/errors";
import type { ContratoData } from "../types/contractDocument";

const mocks = vi.hoisted(() => ({
  document: null as unknown,
  findContractDocument: vi.fn(),
  requestSignatureOtp: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/features/contracts/hooks/useContracts", () => ({
  useContractDocument: () => ({ data: mocks.document, isLoading: false }),
}));
vi.mock("@/app/container", () => ({
  contractStore: {
    findContractDocument: mocks.findContractDocument,
    requestSignatureOtp: mocks.requestSignatureOtp,
    sign: mocks.sign,
  },
}));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

const parte = {
  razao_social: "Parte", tipo_documento: "CPF" as const, documento: "123.456.789-09", endereco_completo: "Rua 1",
  representante_nome: "Parte", representante_cpf: "", representante_estado_civil: "",
};

function documento(overrides: Partial<ContratoData> = {}): ContratoData {
  return {
    titulo: "Contrato de Locação de Maquinário Agrícola com Prestação de Serviços",
    contrato: {
      numero: "#CTR-AAAA", versao_documento: "2.0.0", data_geracao: "21/10/2026", data_inicio: "2026-11-01",
      data_fim: "2026-11-02", prazo_dias: 2, valor_unitario: "180,00", horas_por_diaria: 8, valor_diaria: "1.440,00",
      diarias: 2, valor_locacao: "2.880,00", valor_taxa_plataforma: "144,00", percentual_taxa_plataforma: "5,00",
      valor_total: "3.024,00",
    },
    operacao: { codigo: "OP-AAAAA" },
    locador: { ...parte, endereco_equipamento: "Fazenda" },
    locatario: { ...parte, municipio: "Castro", uf: "PR", local_servico: "Sítio" },
    equipamento: { tipo: "Trator", marca: "John Deere", modelo: "6110J", ano: 2021, renagro: "BR1", valor_estimado: "" },
    anuncio: { tipo_servico: "Locação de Maquinário", finalidade_uso: "Plantio" },
    preambulo: "Este contrato é regido pelo **CDC**.",
    declaracao_assinatura: "Assinado eletronicamente pela plataforma.",
    clausulas: [
      {
        numero: "Cláusula 4", titulo: "Preço e Pagamento", pagina: 2, blocos: [
          { tipo: "cartoes", estilo: "valor", itens: [{ rotulo: "Valor total", valor: "R$ 3.024,00", destaque: true }] },
          { tipo: "itens", itens: [{ num: "4.2", texto: "O valor **não há cobrança adicional nem devolução em função do uso**." }] },
        ],
      },
      { numero: "Cláusula 5", titulo: "Obrigações do Locador", pagina: 2, layout: "obrigacoes", parte: "locador",
        blocos: [{ tipo: "itens", itens: [{ num: "5.4", texto: "Realizar a vistoria;" }] }] },
      { numero: "Cláusula 6", titulo: "Obrigações do Locatário", pagina: 2, layout: "obrigacoes", parte: "locatario",
        blocos: [{ tipo: "itens", itens: [{ num: "6.1", texto: "Pagar;" }] }] },
    ],
    revisao: { id: "rev-1", numero: 1, hash: "a".repeat(64), criada_em_utc: "2026-10-21T12:00:00+00:00" },
    legado: false,
    previa: false,
    assinatura: { data_locador: "—", data_locatario: "—" },
    evidencia: { hash_documento_atual: "a".repeat(64), algoritmo_hash: "sha256", assinaturas: [] },
    ...overrides,
  };
}

function renderPage() {
  render(<MemoryRouter initialEntries={["/contrato/contract-a"]}><Routes><Route path="/contrato/:id" element={<Contrato />} /></Routes></MemoryRouter>);
}

describe("contract page", () => {
  it("renders the server's clause text, grouped like the printed contract, with the frozen revision", () => {
    mocks.document = documento();
    renderPage();
    const strong = screen.getByText("não há cobrança adicional nem devolução em função do uso");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.getByText("Obrigações do Locador").closest(".obrig-grid")).toBe(screen.getByText("Obrigações do Locatário").closest(".obrig-grid"));
    expect(screen.getByText(/revisão nº 1/)).toBeTruthy();
    expect(screen.queryByText("Horímetro — Check-in e Check-out")).toBeNull();
    expect(screen.queryByText(/Prévia do contrato/)).toBeNull();
  });

  it("marks an unpaid contract as a preview", () => {
    mocks.document = documento({ previa: true, revisao: null });
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("Prévia do contrato");
  });

  it("keeps the wording legacy contracts were signed with", () => {
    const legacy = documento({ legado: true, revisao: null, clausulas: undefined, preambulo: undefined, titulo: undefined });
    legacy.contrato = { ...legacy.contrato, versao_documento: "1.0.0", estimativa_horas: 16, valor_total_estimado: "3.024,00" };
    mocks.document = legacy;
    renderPage();
    expect(screen.getByText("Horímetro — Check-in e Check-out")).toBeTruthy();
    expect(screen.getByText(/Documento legado/)).toBeTruthy();
  });
});

describe("signature modal", () => {
  it("reloads the contract and asks for a new reading when the revision changed", async () => {
    mocks.findContractDocument
      .mockResolvedValueOnce(documento())
      .mockResolvedValueOnce(documento({ revisao: { id: "rev-2", numero: 2, hash: "b".repeat(64), criada_em_utc: "2026-10-22T12:00:00+00:00" } }));
    mocks.requestSignatureOtp.mockResolvedValue({ sentTo: "pa***@teste.com", expiresInSeconds: 600 });
    mocks.sign.mockRejectedValue(new HttpError("conflict", "O contrato foi atualizado.", 409, undefined, { apiCode: "stale_revision" }));
    render(<AssinaturaContratoModal open onOpenChange={() => {}} contratoId="contract-a" papel="locatario" />);

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    fireEvent.change(await screen.findByLabelText("Código de confirmação por e-mail"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Assinar Contrato/ }));

    await waitFor(() => expect(mocks.findContractDocument).toHaveBeenCalledTimes(2));
    expect(mocks.requestSignatureOtp).toHaveBeenCalledWith("contract-a", "locatario", "rev-1");
    expect(mocks.sign).toHaveBeenCalledWith("contract-a", "locatario", "Parte", "123456", "rev-1");
    // The new text must be accepted again with a new code.
    expect((await screen.findByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeTruthy();
  });
});
