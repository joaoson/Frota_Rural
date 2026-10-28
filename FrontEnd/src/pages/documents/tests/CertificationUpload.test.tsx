import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CertificationUpload from "../CertificationUpload";
const mocks = vi.hoisted(() => ({ role: "locador", save: vi.fn().mockResolvedValue(undefined), certificate: { id: "certificate-a", issuingOrganization: "SENAR", title: "Operação segura", issueDate: "2026-01-01", expirationDate: null, credentialCode: null, description: "Curso de segurança no uso de máquinas agrícolas.", mediaUrl: "/media/documents/certificate.pdf" } }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a", userRole: mocks.role }) }));
vi.mock("@/features/documents/hooks/useDocuments", () => ({ useCertification: () => ({ data: mocks.certificate }), useSaveCertification: () => ({ mutateAsync: mocks.save }), useUploadDocument: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/shared/components/PageShell", () => ({ PageShell: ({ children }: { children: ReactNode }) => children }));
afterEach(() => { cleanup(); mocks.save.mockClear(); mocks.role = "locador"; });
function DashboardProbe() { return <p>Painel do operador {useLocation().search}</p>; }
function open() { render(<MemoryRouter initialEntries={["/document/certification/certificate-a"]}><Routes><Route path="/document/certification/:id" element={<CertificationUpload />} /><Route path="/dashboard" element={<p>Dashboard</p>} /><Route path="/dashboard-locatario" element={<DashboardProbe />} /></Routes></MemoryRouter>); }
it("persists removal of an existing attachment as explicit null", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Remover arquivo do certificado" }));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar Certificação" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: "certificate-a", payload: expect.objectContaining({ media_url: null }) }));
});
it("retains the existing attachment when only certificate text is edited", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Descrição atualizada do curso de segurança." } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar Certificação" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: "certificate-a", payload: expect.objectContaining({ media_url: "/media/documents/certificate.pdf" }) }));
});
it("returns an operator to the documents tab of their own dashboard after saving", async () => {
  mocks.role = "operador";
  open();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar Certificação" }));
  expect(await screen.findByText("Painel do operador ?tab=documentos")).toBeTruthy();
});
it("links back to the documents tab of the user's dashboard", () => {
  mocks.role = "operador";
  open();
  expect(screen.getByRole("link", { name: "Voltar aos Documentos" }).getAttribute("href")).toBe("/dashboard-locatario?tab=documentos");
});
