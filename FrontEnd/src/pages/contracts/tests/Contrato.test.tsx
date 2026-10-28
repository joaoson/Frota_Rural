import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Contrato from "../Contrato";
import { NotFoundError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { contractDocument } from "@/test/factories";
import { serve } from "@/test/http";
import { renderWithProviders } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "tenant-a" }) }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

const signature = (papel: "locador" | "locatario", overrides = {}) => ({ papel, nome: papel, email: `${papel}@example.com`, assinado_em_utc: "2026-10-01T10:00:00Z",
  hash_documento: `hash-${papel}`, algoritmo_hash: "sha256", versao_documento: "2.0.0", ip: "10.0.0.1", otp_verificado: true, hash_registro: `reg-${papel}`, ...overrides });
const open = (query = "") => renderWithProviders(<Contrato />, { queryClient: net.queryClient, route: `/contrato/rental-a${query}`, path: "/contrato/:id" });
const print = vi.fn();

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); print.mockReset(); window.print = print; });
afterEach(() => { vi.useRealTimers(); });

it("shows both parties, their representatives and each signature's evidence", async () => {
  serve(net.http, { "GET contracts/rental-a": () => contractDocument({
    locador: { ...contractDocument().locador, representante_cpf: "111.222.333-44", representante_estado_civil: "Casado" },
    locatario: { ...contractDocument().locatario, representante_estado_civil: "Solteira", endereco_completo: "", tipo_documento: "" },
    evidencia: { hash_documento_atual: "hash-locador", algoritmo_hash: "sha256", assinaturas: [signature("locador"), signature("locatario", { email: "", ip: "", versao_documento: "", otp_verificado: false })] },
  }) });
  open();
  expect(await screen.findByText("CPF nº 111.222.333-44 · Casado")).toBeInTheDocument();
  expect(screen.getByText("Solteira")).toBeInTheDocument();
  expect(screen.getAllByText("Evidência do aceite")).toHaveLength(2);
  expect(screen.getAllByText("Confirmada por código")).toHaveLength(1);
  expect(screen.getByText("hash-locatario")).toBeInTheDocument();
  screen.getByRole("button", { name: /Imprimir \/ Salvar PDF/ }).click();
  expect(print).toHaveBeenCalledOnce();
});

it("opens the print dialog once when the link asks for it", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  serve(net.http, { "GET contracts/rental-a": () => contractDocument({ previa: true }) });
  open("?print=1");
  expect(await screen.findByText(/Prévia do contrato/)).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(print).toHaveBeenCalledOnce();
});

it("tells the user when the contract does not exist", async () => {
  serve(net.http, { "GET contracts/rental-a": () => { throw new NotFoundError(); } });
  open();
  expect(screen.getByText("Carregando documento do contrato...")).toBeInTheDocument();
  expect(await screen.findByText("Contrato não encontrado.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar ao Início" })).toHaveAttribute("href", "/");
});
