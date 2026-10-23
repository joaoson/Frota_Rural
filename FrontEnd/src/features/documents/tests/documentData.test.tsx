import { act, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HttpDocumentRepository } from "../api/DocumentRepository";
import { DocumentStore, documentKeys } from "../api/DocumentStore";
import { certificationToFormValues, certificationToPayload, licenseToFormValues, licenseToPayload } from "../api/documentMapper";
import { BirthPlace, enablesOperation, isPending, statusLabel } from "../types/document";
import { documentStatusBadge } from "../types/documentBadges";
import { certificationFormSchema, cnhFormSchema, maxDriverBirthDate } from "../types/documentSchemas";
import { CNH_FORM_DEFAULTS, useCertificationForm, useCnhForm } from "../hooks/useDocumentForms";
import * as hooks from "../hooks/useDocuments";
import { fakeHttp, ok } from "@/test/http";
import { net } from "@/test/container";
import { createTestQueryClient, renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const licenseDto = {
  id: "license-a", user: "operator-a", name: "Carlos Lima", birth_date: "1990-01-01", cpf: "52998224725", rg: "123456789",
  mother_name: "Ana Lima", father_name: null, nationality: "Brasileiro(a)", birth_place: "Rio Verde – GO", cnh_number: "12345678901",
  category: "AE", first_license_date: "2010-01-01", issue_date: "2025-01-01", expiration_date: "2030-01-01", issuing_state: "GO",
  issuing_authority: "DETRAN", situation: "active", acc: false, ear: true, points: 3, file_url: "documents/cnh.pdf",
  validation_status: "approved",
};
const certificationDto = {
  id: "cert-a", user: "operator-a", issuing_organization: "SENAR", title: "Operação de colheitadeira", issue_date: "2025-03-01",
  expiration_date: null, credential_code: "SN-1", description: "Curso de 40 horas.", media_url: null, validation_status: "pending",
};
const cnhForm = { ...CNH_FORM_DEFAULTS, name: "Carlos Lima", birthDate: "1990-01-01", cpf: "529.982.247-25", rg: "12.345.678-9",
  motherName: "Ana Lima", birthCity: "Rio Verde", birthState: "GO", cnhNumber: "123.456.789-01", category: "AE",
  firstLicenseDate: "2010-01-01", issueDate: "2025-01-01", expirationDate: "2030-01-01", issuingState: "GO",
  issuingAuthority: "DETRAN", situation: "active", points: "" };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z")); net.http.send.mockReset(); net.queryClient.clear(); });
afterEach(() => { vi.useRealTimers(); });

it("filters license and certification lists by owner and review status", async () => {
  const http = fakeHttp(); const repository = new HttpDocumentRepository(http);
  http.send.mockResolvedValueOnce(ok([licenseDto])).mockResolvedValueOnce(ok([certificationDto]));
  const [license] = await repository.listLicenses({ userId: "operator-a", validationStatus: "pending" });
  const [certification] = await repository.listCertifications();
  expect(http.send).toHaveBeenNthCalledWith(1, { method: "GET", path: "operator-licenses", query: { user: "operator-a", validation_status: "pending" } });
  expect(http.send).toHaveBeenNthCalledWith(2, { method: "GET", path: "certifications", query: { user: undefined, validation_status: undefined } });
  expect(license.birthPlace).toEqual(new BirthPlace("Rio Verde", "GO"));
  expect(certification).toMatchObject({ title: "Operação de colheitadeira", expirationDate: null, credentialCode: "SN-1" });
});

it.each([
  ["createLicense", [{ name: "x" }], { method: "POST", path: "operator-licenses", body: { name: "x" } }, licenseDto],
  ["updateLicense", ["license-a", { points: 1 }], { method: "PATCH", path: "operator-licenses/license-a", body: { points: 1 } }, licenseDto],
  ["reviewLicense", ["license-a", { validation_status: "rejected", review_note: "Ilegível" }], { method: "PATCH", path: "operator-licenses/license-a/review", body: { validation_status: "rejected", review_note: "Ilegível" } }, licenseDto],
  ["removeLicense", ["license-a"], { method: "DELETE", path: "operator-licenses/license-a" }, null],
  ["findCertificationById", ["cert-a"], { method: "GET", path: "certifications/cert-a" }, certificationDto],
  ["createCertification", [{ title: "x" }], { method: "POST", path: "certifications", body: { title: "x" } }, certificationDto],
  ["updateCertification", ["cert-a", { title: "y" }], { method: "PATCH", path: "certifications/cert-a", body: { title: "y" } }, certificationDto],
  ["reviewCertification", ["cert-a", { validation_status: "approved" }], { method: "PATCH", path: "certifications/cert-a/review", body: { validation_status: "approved" } }, certificationDto],
  ["removeCertification", ["cert-a"], { method: "DELETE", path: "certifications/cert-a" }, null],
] as const)("sends %s to the documents API", async (method, args, request, response) => {
  const http = fakeHttp(); http.send.mockResolvedValue(ok(response));
  const repository = new HttpDocumentRepository(http);
  const store = new DocumentStore(repository, new QueryClient());
  // A Store só repassa; métodos que ela não expõe são chamados no repositório.
  const target = (method in store ? store : repository) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  await target[method](...args);
  expect(http.send).toHaveBeenCalledWith(request);
});

it("uploads files as multipart and reports the CNH authenticity score", async () => {
  const http = fakeHttp(); const repository = new HttpDocumentRepository(http);
  const file = new File(["%PDF"], "cnh.pdf", { type: "application/pdf" });
  http.send.mockResolvedValueOnce(ok({ url: "documents/cnh.pdf" })).mockResolvedValueOnce(ok({ is_valid: false, confidence: "low", score: 0.2, error: "Documento ilegível" }));
  expect(await repository.uploadFile(file)).toBe("documents/cnh.pdf");
  expect(await repository.validateCnhFile(file)).toEqual({ isValid: false, confidence: "low", score: 0.2, error: "Documento ilegível" });
  const [upload, validation] = http.send.mock.calls.map(([request]) => request);
  expect(upload).toMatchObject({ method: "POST", path: "documents/upload", headers: { "Content-Type": "multipart/form-data" } });
  expect((upload.body as FormData).get("file")).toBe(file);
  expect(validation.path).toBe("operator-licenses/validate-document");
});

it("refreshes only the document group that changed and forgets everything on logout", async () => {
  const cache = new QueryClient(); const invalidate = vi.spyOn(cache, "invalidateQueries"); const remove = vi.spyOn(cache, "removeQueries");
  const store = new DocumentStore(new HttpDocumentRepository(fakeHttp()), cache);
  await store.invalidateLicenses(); await store.invalidateCertifications(); store.clear();
  expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ["documents", "licenses"] });
  expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ["documents", "certifications"] });
  expect(remove).toHaveBeenCalledWith({ queryKey: documentKeys.all });
  expect(store.certificationDetailOptions("cert-a").queryKey).toEqual(["documents", "certifications", "detail", "cert-a"]);
});

it("sends unmasked identifiers and nulls for optional CNH fields", () => {
  expect(licenseToPayload(cnhForm, "operator-a", "documents/cnh.pdf")).toMatchObject({
    user: "operator-a", cpf: "52998224725", rg: "123456789", cnh_number: "12345678901", birth_place: "Rio Verde – GO",
    father_name: null, medical_restrictions: null, observations: null, points: 0, file_url: "documents/cnh.pdf",
  });
  expect(licenseToPayload({ ...cnhForm, points: "7", fatherName: "José", observations: "EAR" }, "operator-a")).toMatchObject({ points: 7, father_name: "José", observations: "EAR" });
});

it("restores a saved license and certification into editable form values", async () => {
  const http = fakeHttp(); http.send.mockResolvedValueOnce(ok([{ ...licenseDto, birth_place: "Exterior", medical_restrictions: "Lentes" }])).mockResolvedValueOnce(ok(certificationDto));
  const repository = new HttpDocumentRepository(http);
  const [license] = await repository.listLicenses();
  expect(licenseToFormValues(license)).toMatchObject({ birthCity: "Exterior", birthState: "", fatherName: "", medicalRestrictions: "Lentes", observations: "", points: "3" });
  const certification = await repository.findCertificationById("cert-a");
  expect(certificationToFormValues(certification)).toMatchObject({ expirationDate: "", credentialCode: "SN-1" });
  expect(certificationToPayload(certificationToFormValues(certification), "operator-a", null)).toMatchObject({ expiration_date: null, credential_code: "SN-1", media_url: null });
});

it.each([
  [{}, true],
  [{ validation_status: "pending" }, false],
  [{ expiration_date: "2026-10-20" }, false],
  [{ situation: "suspended" }, false],
  [{ points: 20 }, false],
])("only lets an approved, valid and unsuspended CNH operate machines (%j)", async (override, allowed) => {
  const http = fakeHttp(); http.send.mockResolvedValue(ok([{ ...licenseDto, ...override }]));
  const [license] = await new HttpDocumentRepository(http).listLicenses();
  expect(enablesOperation(license, new Date("2026-10-21"))).toBe(allowed);
});

it("labels review states consistently in text and badges", () => {
  expect([statusLabel("approved"), statusLabel("rejected"), statusLabel("pending")]).toEqual(["Aprovado", "Rejeitado", "Pendente"]);
  expect(["approved", "rejected", "anything"].map(status => documentStatusBadge(status).label)).toEqual(["Aprovado", "Recusado", "Pendente"]);
  expect(isPending({ id: "d", userId: "u", validationStatus: "pending", reviewNote: null, createdAt: null })).toBe(true);
  expect(new BirthPlace("Lisboa", "").toString()).toBe("Lisboa");
});

it.each([
  [{}, null],
  [{ birthDate: "2009-01-01" }, "O condutor deve ter pelo menos 18 anos."],
  [{ birthDate: "1899-01-01" }, "Data de nascimento inválida."],
  [{ cpf: "529.982.247-24" }, "CPF inválido. Verifique os dígitos informados."],
  [{ rg: "123456789" }, "O RG deve seguir o formato XX.XXX.XXX-X."],
  [{ rg: "11.111.111-1" }, "RG inválido. Verifique os dígitos informados."],
  [{ cnhNumber: "123" }, "O número da CNH deve conter exatamente 11 dígitos."],
  [{ category: "Z" }, "Categoria inválida."],
  [{ firstLicenseDate: "2027-01-01" }, "A data da primeira habilitação não pode ser no futuro."],
  [{ issueDate: "2027-01-01" }, "A data de emissão não pode ser no futuro."],
  [{ situation: "unknown" }, "Situação inválida."],
  [{ expirationDate: "2026-01-01" }, "A data de validade de uma CNH ativa deve ser no futuro."],
  [{ expirationDate: "2026-01-01", situation: "expired" }, null],
  [{ points: "41" }, "A pontuação deve ser entre 0 e 40."],
])("validates the CNH form before upload (%j)", (override, message) => {
  const result = cnhFormSchema.safeParse({ ...cnhForm, ...override });
  expect(result.success ? null : result.error.issues[0].message).toBe(message);
  expect(maxDriverBirthDate()).toBe("2008-10-21");
});

it.each([
  [{}, null],
  [{ issueDate: "2027-01-01" }, "A data de emissão não pode ser no futuro."],
  [{ expirationDate: "2025-03-01" }, "A data de validade deve ser posterior à data de emissão."],
  [{ description: "Curto" }, "A descrição deve conter pelo menos 10 caracteres."],
])("validates certifications (%j)", (override, message) => {
  const base = { issuingOrganization: "SENAR", title: "Colheita", issueDate: "2025-03-01", expirationDate: "", credentialCode: "", description: "Curso de 40 horas." };
  const result = certificationFormSchema.safeParse({ ...base, ...override });
  expect(result.success ? null : result.error.issues[0].message).toBe(message);
});

it("starts document forms with defaults overridable by a saved record", () => {
  const { result: cnh } = renderHookWithQuery(() => useCnhForm({ name: "Carlos" }));
  const { result: certification } = renderHookWithQuery(() => useCertificationForm({ title: "SENAR" }));
  expect(cnh.current.getValues()).toMatchObject({ name: "Carlos", nationality: "Brasileiro(a)", points: "0" });
  expect(certification.current.getValues("title")).toBe("SENAR");
});

it("loads documents only when the query is enabled", async () => {
  net.http.send.mockResolvedValue(ok([licenseDto]));
  const disabled = renderHookWithQuery(() => hooks.useOperatorLicenses({}, false), net.queryClient);
  const detail = renderHookWithQuery(() => hooks.useCertification(null), net.queryClient);
  expect(disabled.result.current.fetchStatus).toBe("idle");
  expect(detail.result.current.fetchStatus).toBe("idle");
  const licenses = renderHookWithQuery(() => hooks.useOperatorLicenses({ userId: "operator-a" }), net.queryClient);
  await waitFor(() => expect(licenses.result.current.data?.[0].id).toBe("license-a"));
  net.http.send.mockResolvedValue(ok([certificationDto]));
  const certifications = renderHookWithQuery(() => hooks.useCertifications(), net.queryClient);
  await waitFor(() => expect(certifications.result.current.data?.[0].id).toBe("cert-a"));
  net.http.send.mockResolvedValue(ok(certificationDto));
  const one = renderHookWithQuery(() => hooks.useCertification("cert-a"), net.queryClient);
  await waitFor(() => expect(one.result.current.data?.title).toBe("Operação de colheitadeira"));
});

it.each([
  ["useSaveLicense", { payload: {} }, "POST", "operator-licenses", ["documents", "licenses"], licenseDto],
  ["useSaveLicense", { id: "license-a", payload: {} }, "PATCH", "operator-licenses/license-a", ["documents", "licenses"], licenseDto],
  ["useSaveCertification", { payload: {} }, "POST", "certifications", ["documents", "certifications"], certificationDto],
  ["useSaveCertification", { id: "cert-a", payload: {} }, "PATCH", "certifications/cert-a", ["documents", "certifications"], certificationDto],
  ["useReviewDocument", { id: "license-a", kind: "license", payload: { validation_status: "approved" } }, "PATCH", "operator-licenses/license-a/review", ["documents", "licenses"], licenseDto],
  ["useReviewDocument", { id: "cert-a", kind: "certification", payload: { validation_status: "approved" } }, "PATCH", "certifications/cert-a/review", ["documents", "certifications"], certificationDto],
] as const)("%s creates or updates and refreshes that list", async (hook, input, method, path, key, response) => {
  net.http.send.mockResolvedValue(ok(response));
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  const { result } = renderHookWithQuery(() => (hooks[hook] as () => { mutateAsync: (i: unknown) => Promise<unknown> })(), createTestQueryClient());
  await act(() => result.current.mutateAsync(input));
  expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ method, path }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});

it("uploads and validates files through mutations", async () => {
  const file = new File(["x"], "cnh.jpg");
  net.http.send.mockResolvedValueOnce(ok({ url: "documents/cnh.jpg" })).mockResolvedValueOnce(ok({ is_valid: true, confidence: "high", score: 0.98 }));
  const upload = renderHookWithQuery(() => hooks.useUploadDocument());
  const validate = renderHookWithQuery(() => hooks.useValidateCnhFile());
  await act(async () => { expect(await upload.result.current.mutateAsync(file)).toBe("documents/cnh.jpg"); });
  await act(async () => { expect(await validate.result.current.mutateAsync(file)).toMatchObject({ isValid: true, error: null }); });
});
