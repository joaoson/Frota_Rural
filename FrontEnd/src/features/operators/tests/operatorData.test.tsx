import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toPayload } from "../api/operatorMapper";
import { useCreateOperator, useOperators, useUnlinkOperator, useUpdateOperator } from "../hooks/useOperators";
import { operatorFormSchema } from "../types/operatorSchemas";
import { net, operatorStore } from "@/test/container";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const operatorDto = { id: "operator-a", name: "Carlos Lima", document: "52998224725", email: "carlos@example.com", address: "Fazenda Boa Vista", birth_date: "1990-01-01" };
const form = { name: "Carlos Lima", birthDate: "1990-01-01", document: "529.982.247-25", email: "Carlos@Example.com", phone: "(64) 99999-0000",
  cep: "75900-000", address: "Fazenda Boa Vista", city: "Rio Verde", state: "GO" as const, password: "" };

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

it("sends operator data without masks and only sets a password when one was typed", () => {
  expect(toPayload(form)).toEqual({ name: "Carlos Lima", birth_date: "1990-01-01", document: "52998224725", email: "carlos@example.com",
    phone: "+5564999990000", address: "Fazenda Boa Vista", city: "Rio Verde", state: "GO", cep: "75900000" });
  expect(toPayload({ ...form, password: "Senha1234" })).toHaveProperty("password", "Senha1234");
});

it.each([
  [{}, null],
  [{ name: "C4rlos" }, "Nome deve conter apenas letras."],
  [{ birthDate: "2008-10-22" }, "É necessário ter 18 anos ou mais para se cadastrar."],
  [{ document: "123" }, "Informe um CPF ou CNPJ válido."],
  [{ phone: "123" }, "Telefone deve ter 10 ou 11 dígitos."],
  [{ cep: "7590" }, "CEP deve ter 8 dígitos."],
  [{ cep: "" }, null],
  [{ state: "XX" }, "Selecione o estado."],
])("applies the public sign-up rules to operators (%j)", (override, message) => {
  const result = operatorFormSchema.safeParse({ ...form, ...override });
  expect(result.success ? null : result.error.issues[0].message).toBe(message);
});

it("lists the team only when enabled and maps missing contact fields to null", async () => {
  net.http.send.mockResolvedValue(ok([operatorDto]));
  expect(renderHookWithQuery(() => useOperators(false), net.queryClient).result.current.fetchStatus).toBe("idle");
  const team = renderHookWithQuery(() => useOperators(), net.queryClient);
  await waitFor(() => expect(team.result.current.data?.[0]).toMatchObject({ id: "operator-a", phone: null, city: null, status: null }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "users/operators" });
  expect(await operatorStore.list()).toHaveLength(1);
});

it("creates, edits and unlinks operators and refreshes the team", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(operatorDto));
  const create = renderHookWithQuery(() => useCreateOperator());
  const update = renderHookWithQuery(() => useUpdateOperator());
  const unlink = renderHookWithQuery(() => useUnlinkOperator());
  await act(() => create.result.current.mutateAsync(toPayload(form)));
  await act(() => update.result.current.mutateAsync({ id: "operator-a", payload: { phone: "+5564988887777" } }));
  await act(() => unlink.result.current.mutateAsync("operator-a"));
  expect(net.http.send.mock.calls.map(([request]) => `${request.method} ${request.path}`)).toEqual(["POST users/operators", "PATCH users/operators/operator-a", "DELETE users/operators/operator-a"]);
  expect(invalidate).toHaveBeenCalledTimes(3);
  operatorStore.clear();
  expect(net.queryClient.getQueryData(["operators", "list"])).toBeUndefined();
});
