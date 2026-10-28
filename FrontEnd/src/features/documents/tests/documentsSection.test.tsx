import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentsSection } from "../components/DocumentsSection";

const mocks = vi.hoisted(() => ({
  licenses: { data: [] as object[], isLoading: false, isError: false, refetch: vi.fn() },
  certifications: { data: [] as object[], isLoading: false, isError: false, refetch: vi.fn() },
  filters: vi.fn(),
  store: { removeLicense: vi.fn(), removeCertification: vi.fn(), invalidateLicenses: vi.fn(), invalidateCertifications: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../hooks/useDocuments", () => ({
  useOperatorLicenses: (...args: unknown[]) => { mocks.filters("licenses", ...args); return mocks.licenses; },
  useCertifications: (...args: unknown[]) => { mocks.filters("certifications", ...args); return mocks.certifications; },
}));
vi.mock("@/app/container", () => ({ documentStore: mocks.store }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const license = (id: string, validationStatus: string, reviewNote: string | null = null) => ({
  id, name: "Carlos Lima", category: "AE", expirationDate: "2030-01-01T12:00:00", validationStatus, reviewNote,
});
const certification = (id: string, validationStatus: string, reviewNote: string | null = null) => ({
  id, title: `NR-31 ${id}`, issuingOrganization: "SENAR", issueDate: "2025-03-01T12:00:00", validationStatus, reviewNote,
});
const show = (userId: string | null = "op-1") => render(<MemoryRouter><DocumentsSection userId={userId} /></MemoryRouter>);

beforeEach(() => {
  Object.assign(mocks.licenses, { data: [], isLoading: false, isError: false });
  Object.assign(mocks.certifications, { data: [], isLoading: false, isError: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("loads only the signed-in user's CNH and certifications", () => {
  show();
  expect(mocks.filters).toHaveBeenCalledWith("licenses", { userId: "op-1" }, true);
  expect(mocks.filters).toHaveBeenCalledWith("certifications", { userId: "op-1" }, true);
  cleanup(); mocks.filters.mockClear();
  show(null);
  expect(mocks.filters).toHaveBeenCalledWith("licenses", { userId: undefined }, false);
});

it("invites the user to send documents when there are none", () => {
  show();
  expect(screen.getByText("Nenhuma CNH cadastrada")).toBeTruthy();
  expect(screen.getByText("Nenhuma certificação cadastrada")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Nova CNH/ }).getAttribute("href")).toBe("/document/cnh");
  expect(screen.getByRole("link", { name: /Nova Certificação/ }).getAttribute("href")).toBe("/document/certification");
});

it("shows each document's review result and the reason for a refusal", () => {
  mocks.licenses.data = [license("lic-1", "rejected", "Foto ilegível")];
  mocks.certifications.data = [certification("c1", "approved"), certification("c2", "pending"), certification("c3", "rejected", "Sem carimbo")];
  show();
  expect(screen.getByRole("link", { name: /Editar CNH/ })).toBeTruthy();
  expect(screen.getByText("Foto ilegível")).toBeTruthy();
  expect(screen.getByText("Sem carimbo")).toBeTruthy();
  expect(screen.getAllByText("Recusado")).toHaveLength(2);
  expect(screen.getByText("Aprovado")).toBeTruthy();
  expect(screen.getByText("Pendente")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Editar" }).map(link => link.getAttribute("href")))
    .toEqual(["/document/cnh", "/document/certification/c1", "/document/certification/c2", "/document/certification/c3"]);
});

it("removes a CNH after confirmation and refreshes the list", async () => {
  mocks.licenses.data = [license("lic-1", "approved")];
  mocks.store.removeLicense.mockResolvedValue(undefined);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("CNH removida com sucesso!"));
  expect(mocks.store.removeLicense).toHaveBeenCalledWith("lic-1");
  expect(mocks.store.invalidateLicenses).toHaveBeenCalled();
});

it.each([
  ["license", "Não foi possível remover a CNH."],
  ["certification", "Não foi possível remover a certificação."],
])("keeps the %s and reports when removal fails", async (kind, message) => {
  if (kind === "license") mocks.licenses.data = [license("lic-1", "pending")];
  else mocks.certifications.data = [certification("c1", "pending")];
  mocks.store.removeLicense.mockRejectedValue(new Error("offline"));
  mocks.store.removeCertification.mockRejectedValue(new Error("offline"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(message));
});

it("removes a certification after confirmation", async () => {
  mocks.certifications.data = [certification("c1", "approved")];
  mocks.store.removeCertification.mockResolvedValue(undefined);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Certificação removida com sucesso!"));
  expect(mocks.store.invalidateCertifications).toHaveBeenCalled();
});

it("waits for both lists and offers a retry when one fails", () => {
  mocks.licenses.isLoading = true;
  show();
  expect(screen.getByRole("status").textContent).toBe("Carregando dados...");
  cleanup();
  mocks.licenses.isLoading = false;
  mocks.certifications.isError = true;
  show();
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Tentar novamente" }));
  expect(mocks.licenses.refetch).toHaveBeenCalled();
  expect(mocks.certifications.refetch).toHaveBeenCalled();
});
