import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { toCreatePayload, toDomain } from "../api/machineMapper";
import { BrandSelect } from "../components/BrandSelect";
import { MachineUsageLine } from "../components/MachineUsageLine";
import { useCreateMachine } from "../hooks/useCreateMachine";
import { MACHINE_FORM_DEFAULTS, useMachineForm } from "../hooks/useMachineForm";
import { useMachines } from "../hooks/useMachines";
import { useUpdateMachine } from "../hooks/useUpdateMachine";
import { brandByKey } from "../types/brands";
import { isMachineActive, machineDisplayName } from "../types/machine";
import { machineFormSchema, validateMachineEdit } from "../types/machineSchemas";
import { machineStore, net } from "@/test/container";
import { buildMachine, machineDto } from "@/test/factories";
import { ok } from "@/test/http";
import { renderHookWithQuery, renderWithProviders } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const form = { ...MACHINE_FORM_DEFAULTS, renagroNumber: "br1029304899", model: "S790" };
beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("lists, creates, updates and removes machines through the fleet API", async () => {
  net.http.send.mockResolvedValueOnce(ok([machineDto()])).mockResolvedValueOnce(ok(machineDto())).mockResolvedValueOnce(ok(machineDto({ status: "inactive" }))).mockResolvedValueOnce(ok(null));
  expect(await net.queryClient.fetchQuery(machineStore.listOptions({ ownerId: "owner-a", status: "active", brand: "John Deere", model: "S790" }))).toHaveLength(1);
  await machineStore.create(toCreatePayload(form, "owner-a"));
  expect((await machineStore.update("machine-a", { status: "inactive" } as never)).status).toBe("inactive");
  await machineStore.remove("machine-a");
  expect(net.http.send.mock.calls.map(([request]) => request)).toEqual([
    { method: "GET", path: "machines", query: { owner: "owner-a", status: "active", brand: "John Deere", model: "S790" } },
    { method: "POST", path: "machines", body: expect.objectContaining({ owner: "owner-a", renagro_number: "BR1029304899", brand: "John Deere" }) },
    { method: "PATCH", path: "machines/machine-a", body: { status: "inactive" } },
    { method: "DELETE", path: "machines/machine-a" },
  ]);
});

it("uses the typed brand when the owner picks “Outra”", () => {
  expect(toCreatePayload({ ...form, brandKey: "outra", otherBrand: "Jacto", year: "2021" }, "owner-a")).toMatchObject({ brand: "Jacto", year: 2021 });
  expect(machineFormSchema.safeParse({ ...form, brandKey: "outra", otherBrand: "" }).error?.issues[0].message).toBe("Marca é obrigatória.");
});

it.each([
  [{ year: "1979" }, false], [{ year: "2020" }, true], [{ year: "" }, true], [{ renagroNumber: "BR123" }, false],
])("validates the machine year and Renagro record (%j)", (override, valid) => {
  expect(machineFormSchema.safeParse({ ...form, ...override }).success).toBe(valid);
});

it("reports the first edit error per field", () => {
  const errors = validateMachineEdit({ registroRenagro: "", marca: "", modelo: "", anoFabricacao: "1970", potenciaCv: "", horimetro: "" });
  expect(errors).toMatchObject({ registroRenagro: "Registro Renagro é obrigatório.", marca: "Marca é obrigatória.", anoFabricacao: expect.stringContaining("O ano deve ser entre 1980") });
});

it("names machines by brand and model, falling back to the registry", () => {
  expect(machineDisplayName(buildMachine())).toBe("John Deere S790");
  expect(machineDisplayName(buildMachine({ brand: null, model: null }))).toBe("BR1029304899");
  expect(machineDisplayName(buildMachine({ brand: null, model: null, renagro_number: null }))).toBe("machine-a");
  expect([isMachineActive(buildMachine()), isMachineActive(buildMachine({ status: "inactive" }))]).toEqual([true, false]);
  expect(toDomain(machineDto({ created_at: "invalid", updated_at: "2026-01-01T00:00:00Z" }))).toMatchObject({ createdAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") });
});

it("chooses a brand from the dropdown and falls back to an initial when the logo is missing", async () => {
  const onChange = vi.fn(); const user = userEvent.setup();
  render(<BrandSelect value="john-deere" onChange={onChange} hasError />);
  await user.click(screen.getByRole("button", { name: /John Deere/ }));
  fireEvent.error(screen.getAllByRole("img", { name: "Valtra" })[0]);
  expect(screen.getAllByText("V").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: /Massey Ferguson/ }));
  expect(onChange).toHaveBeenCalledWith("massey-ferguson");
  expect(screen.queryByRole("button", { name: /Valtra/ })).not.toBeInTheDocument();
  expect(brandByKey("unknown" as never).value).toBe("john-deere");
});

it.each([
  [{ locacoes_concluidas: 0, diarias: 0, locacoes_com_leitura: 0, horas_registradas: 0, media_horas_por_diaria: null, referencia_horas_por_diaria: 8, ultima_leitura: null }, null],
  [{ locacoes_concluidas: 1, diarias: 1, locacoes_com_leitura: 0, horas_registradas: 0, media_horas_por_diaria: null, referencia_horas_por_diaria: 8, ultima_leitura: null }, "Uso: 1 locação concluída, 1 diária · sem leituras de horímetro"],
  [{ locacoes_concluidas: 2, diarias: 3, locacoes_com_leitura: 2, horas_registradas: 21, media_horas_por_diaria: "7.5", referencia_horas_por_diaria: 8, ultima_leitura: { valor: 1221, registrada_em: "2026-09-03T18:00:00Z" } }, "Uso: 2 locações concluídas, 3 diárias · 7,5 h por diária (referência 8 h)"],
])("summarises recorded machine usage (%#)", async (usage, text) => {
  net.http.send.mockResolvedValue(ok(usage));
  renderWithProviders(<MachineUsageLine machineId="machine-a" />, { queryClient: net.queryClient });
  if (text) expect(await screen.findByTestId("machine-usage")).toHaveTextContent(text);
  else await waitFor(() => expect(net.http.send).toHaveBeenCalled());
  if (!text) expect(screen.queryByTestId("machine-usage")).not.toBeInTheDocument();
});

it("refreshes fleet, rentals and postings after a machine edit", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(machineDto()));
  const create = renderHookWithQuery(() => useCreateMachine(), net.queryClient);
  const update = renderHookWithQuery(() => useUpdateMachine(), net.queryClient);
  await act(() => create.result.current.mutateAsync(toCreatePayload(form, "owner-a")));
  await act(() => update.result.current.mutateAsync({ id: "machine-a", payload: { model: "S780" } }));
  const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  expect(keys).toEqual(expect.arrayContaining(['["machines","list"]', '["postings"]']));
});

it("loads machines only when enabled and starts the form with defaults", async () => {
  net.http.send.mockResolvedValue(ok([machineDto()]));
  const disabled = renderHookWithQuery(() => useMachines({}, false), net.queryClient);
  expect(disabled.result.current.fetchStatus).toBe("idle");
  const enabled = renderHookWithQuery(() => useMachines(), net.queryClient);
  await waitFor(() => expect(enabled.result.current.data?.[0].id).toBe("machine-a"));
  expect(renderHookWithQuery(() => useMachineForm()).result.current.getValues("usagePurpose")).toBe("Plantio");
  machineStore.clear();
  expect(net.queryClient.getQueryCache().findAll({ queryKey: ["machines"] })).toHaveLength(0);
});
