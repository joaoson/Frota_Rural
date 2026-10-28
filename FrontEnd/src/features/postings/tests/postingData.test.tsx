import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpPostingRepository } from "../api/PostingRepository";
import { toDateInput, toEditPayload, toWritePayload } from "../api/postingMapper";
import { PostingSearchEmptyState } from "../components/PostingSearchEmptyState";
import { usePostingEditForm, usePostingForm } from "../hooks/usePostingForm";
import { useCreatePosting, useDeletePosting, usePosting, usePostings, useUpdatePosting, useUploadPostingPhotos } from "../hooks/usePostings";
import { isPostingActive, postingMachineName } from "../types/posting";
import { postingStatusBadge } from "../types/postingBadges";
import { postingEditFormSchema, postingFormSchema } from "../types/postingSchemas";
import { net, postingStore } from "@/test/container";
import { postingDetailDto, postingListDto } from "@/test/factories";
import { fakeHttp, ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const form = { machinery: "machine-a", hourlyRate: "350", cep: "", locationAddress: "Rio Verde, GO", availabilityStart: "2026-09-01", availabilityEnd: "2026-12-31", description: "Revisada", modalidadeEntrega: "" };

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("searches postings by owner, machine, status and availability window", async () => {
  net.http.send.mockResolvedValue(ok([postingListDto({ hourly_rate: "", availability_start: "invalid", location_address: null })]));
  const [posting] = await postingStore.list({ ownerId: "owner-a", machineryId: "machine-a", status: "active", availableFrom: "2026-09-01", availableUntil: "2026-09-10" });
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "postings", query: { owner: "owner-a", machinery: "machine-a", status: "active", available_from: "2026-09-01", available_until: "2026-09-10" } });
  expect(posting).toMatchObject({ hourlyRate: 0, availabilityStart: null, locationAddress: null });
});

it("maps posting details with coordinates, photos and missing optional fields", async () => {
  net.http.send.mockResolvedValueOnce(ok(postingDetailDto({ photos: [{ url: "a.jpg", is_primary: true }, { url: "b.jpg" }] })))
    .mockResolvedValueOnce(ok({ id: "posting-b", hourly_rate: "10" }));
  expect(await postingStore.findById("posting-a")).toMatchObject({ latitude: -17.79, longitude: -50.92, photos: [{ url: "a.jpg", isPrimary: true }, { url: "b.jpg", isPrimary: false }] });
  expect(await postingStore.findById("posting-b")).toMatchObject({ latitude: null, locationCep: null, maxReservationDays: null, machineRenagroNumber: null, photos: [] });
});

it("returns the new posting id and sends edits and removals to that posting", async () => {
  net.http.send.mockResolvedValueOnce(ok({ id: "posting-new", machinery: "machine-a", hourly_rate: "350" })).mockResolvedValue(ok(null));
  expect(await postingStore.create(toWritePayload(form))).toBe("posting-new");
  await postingStore.update("posting-new", { status: "inactive" });
  await postingStore.remove("posting-new");
  expect(net.http.send.mock.calls.map(([request]) => `${request.method} ${request.path}`)).toEqual(["POST postings", "PATCH postings/posting-new", "DELETE postings/posting-new"]);
});

it("uploads the first photo as cover and keeps the posting when one photo fails", async () => {
  const http = fakeHttp();
  http.send.mockResolvedValueOnce(ok({ id: "p1", path: "p/1.jpg", url: "https://cdn/1.jpg", is_primary: true }))
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce(ok({ id: "p3", path: "p/3.jpg", url: "https://cdn/3.jpg" }));
  const files = ["1.jpg", "2.jpg", "3.jpg"].map(name => new File(["x"], name, { type: "image/jpeg" }));
  const result = await new HttpPostingRepository(http).uploadPhotos("posting-a", files);
  expect(result).toEqual({ failed: 1, uploaded: [{ id: "p1", path: "p/1.jpg", url: "https://cdn/1.jpg", isPrimary: true }, { id: "p3", path: "p/3.jpg", url: "https://cdn/3.jpg", isPrimary: false }] });
  const bodies = http.send.mock.calls.map(([request]) => request.body as FormData);
  expect(bodies.map(body => body.get("is_primary"))).toEqual(["true", "false", "false"]);
  expect(http.send.mock.calls[0][0]).toMatchObject({ path: "postings/posting-a/photos", headers: { "Content-Type": undefined } });
});

it("recommends machines with the reasons and availability check returned by the API", async () => {
  net.http.send.mockResolvedValue(ok({ results: [{ posting: postingListDto(), reasons: ["Plataforma para soja"], soil_mentioned: true }], total: 1, dates_checked: true, match_type: "exact", ai_unavailable: false }));
  const result = await postingStore.recommend({ application: "harvesting", soil: "clay", state: "GO", startDate: "2026-09-01", endDate: null });
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "postings/recommendations", body: { application: "harvesting", soil: "clay", state: "GO", start_date: "2026-09-01", end_date: null } });
  expect(result).toMatchObject({ total: 1, datesChecked: true, matchType: "exact", aiUnavailable: false, results: [{ reasons: ["Plataforma para soja"], soilMentioned: true }] });
});

it("sends whole-day availability and rounds coordinates to the column precision", () => {
  expect(toWritePayload(form, { lat: -17.7912345678, lon: -50.9187654321 })).toMatchObject({
    location_cep: "", availability_start: "2026-09-01T00:00:00", availability_end: "2026-12-31T23:59:59", location_lat: -17.791235, location_lng: -50.918765,
  });
  expect(toEditPayload({ ...form, status: "inactive", availabilityStart: "", availabilityEnd: "", cep: "75900000" }, null)).toMatchObject({
    status: "inactive", location_cep: "75900000", availability_start: null, availability_end: null, location_lat: null, location_lng: null,
  });
  expect(toDateInput(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09-01");
  expect(toDateInput(null)).toBe("");
});

it.each([
  [{}, null],
  [{ hourlyRate: "0" }, "Informe um valor maior que zero."],
  [{ hourlyRate: "" }, "Valor por hora é obrigatório."],
  [{ availabilityEnd: "2026-08-01" }, "A data final deve ser posterior à inicial."],
])("validates posting creation and edition alike (%j)", (override, message) => {
  for (const [schema, values] of [[postingFormSchema, form], [postingEditFormSchema, { ...form, status: "active" }]] as const) {
    const result = schema.safeParse({ ...values, ...override });
    expect(result.success ? null : result.error.issues[0].message).toBe(message);
  }
});

it.each([
  ["active", "Ativo"], ["rejected", "Reprovado"], ["pending_review", "Em análise"], ["suspended", "Suspenso"],
  ["draft", "Rascunho"], ["inactive", "Inativo"], ["archived", "archived"], [null, "—"],
])("labels posting status %s as %s", (status, label) => {
  expect(postingStatusBadge(status).label).toBe(label);
});

it("names postings by machine and recognises active ones", () => {
  expect(postingMachineName({ machineBrand: "Case", machineModel: null })).toBe("Case");
  expect(postingMachineName({ machineBrand: null, machineModel: null })).toBe("Equipamento");
  expect([isPostingActive("active"), isPostingActive("draft")]).toEqual([true, false]);
});

it("lets the visitor clear filters from the empty search result", async () => {
  const onClear = vi.fn();
  render(<PostingSearchEmptyState onClear={onClear} compact />);
  await userEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
  expect(screen.getByRole("status")).toHaveTextContent("Nenhum equipamento encontrado");
  expect(onClear).toHaveBeenCalledOnce();
});

it("loads posting lists and skips the detail query without an id", async () => {
  net.http.send.mockResolvedValue(ok([postingListDto()]));
  const list = renderHookWithQuery(() => usePostings(), net.queryClient);
  const detail = renderHookWithQuery(() => usePosting(null), net.queryClient);
  await waitFor(() => expect(list.result.current.data).toHaveLength(1));
  expect(detail.result.current.fetchStatus).toBe("idle");
  net.http.send.mockResolvedValue(ok(postingDetailDto()));
  const loaded = renderHookWithQuery(() => usePosting("posting-a"), net.queryClient);
  await waitFor(() => expect(loaded.result.current.data?.id).toBe("posting-a"));
});

it("refreshes listings after posting mutations and the detail after an edit", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValueOnce(ok({ id: "posting-new", machinery: "m", hourly_rate: "1" })).mockResolvedValue(ok({ id: "p", path: "p", url: "u" }));
  const create = renderHookWithQuery(() => useCreatePosting());
  const update = renderHookWithQuery(() => useUpdatePosting());
  const remove = renderHookWithQuery(() => useDeletePosting());
  const upload = renderHookWithQuery(() => useUploadPostingPhotos());
  await act(() => create.result.current.mutateAsync({}));
  await act(() => update.result.current.mutateAsync({ id: "posting-a", payload: {} }));
  await act(() => remove.result.current.mutateAsync("posting-a"));
  await act(() => upload.result.current.mutateAsync({ postingId: "posting-a", files: [new File(["x"], "a.jpg")] }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["postings", "detail", "posting-a"] });
  expect(invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === '["postings","list"]')).toHaveLength(4);
});

it("starts posting forms empty and edit forms as active", () => {
  const create = renderHookWithQuery(() => usePostingForm({ machinery: "machine-a" }));
  const edit = renderHookWithQuery(() => usePostingEditForm());
  expect(create.result.current.getValues()).toMatchObject({ machinery: "machine-a", hourlyRate: "" });
  expect(edit.result.current.getValues("status")).toBe("active");
});

it("forgets cached postings on logout", () => {
  net.queryClient.setQueryData(["postings", "list", {}], []);
  postingStore.clear();
  expect(net.queryClient.getQueryData(["postings", "list", {}])).toBeUndefined();
});
