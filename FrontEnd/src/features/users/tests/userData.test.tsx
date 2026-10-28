import { act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { toCreatePayload } from "../api/userMapper";
import { useSignupForm } from "../hooks/useSignupForm";
import { useChangePassword, useCreateUser, useUpdateProfile, useUploadProfilePhoto, useUser, useUsers } from "../hooks/useUsers";
import { isBlocked } from "../types/user";
import { userStatusBadge } from "../types/userBadges";
import { documentSchema, maxBirthDate, signupFormSchema } from "../types/userSchemas";
import { net, userStore } from "@/test/container";
import { buildUser, userDto } from "@/test/factories";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const signup = { role: "locador" as const, name: "Maria Silva", birthDate: "1990-05-10", document: "529.982.247-25", email: "maria@example.com",
  phone: "(64) 99999-0000", cep: "75900-000", address: "Rua das Palmeiras, 100", city: "Rio Verde", state: "GO", portePropriedade: "", password: "Senha1234" };

beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("sends sign-up data unmasked, with a lower-case e-mail, international phone and the contract venue", () => {
  expect(toCreatePayload(signupFormSchema.parse({ ...signup, email: "Maria@Example.com" }))).toEqual({
    name: "Maria Silva", birth_date: "1990-05-10", document: "52998224725", email: "maria@example.com", phone: "+5564999990000",
    role: "locador", address: "Rua das Palmeiras, 100", city: "Rio Verde", state: "GO", cep: "75900000", password: "Senha1234", porte_propriedade: null,
  });
});

it.each([
  [{}, null],
  [{ name: "M4ria" }, "Nome deve conter apenas letras."],
  [{ birthDate: "1899-01-01" }, "Data inválida."],
  [{ birthDate: maxBirthDate(new Date("2099-01-01")) }, "É necessário ter 18 anos ou mais para se cadastrar."],
  [{ document: "123" }, "Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos)."],
  [{ document: "529.982.247-24" }, "CPF inválido. Verifique os dígitos informados."],
  [{ document: "11.222.333/0001-80" }, "CNPJ inválido. Verifique os dígitos informados."],
  [{ phone: "6499" }, "Telefone deve ter 10 ou 11 dígitos."],
  [{ cep: "759" }, "CEP deve ter exatamente 8 dígitos."],
  [{ password: "senhafraca" }, "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número"],
])("validates sign-up rules (%j)", (override, message) => {
  const result = signupFormSchema.safeParse({ ...signup, ...override });
  expect(result.success ? null : result.error.issues[0].message).toBe(message);
});

it("accepts a valid CNPJ for companies and computes the adult birth limit from a given day", () => {
  expect(documentSchema.safeParse("11.222.333/0001-81").success).toBe(true);
  expect(maxBirthDate(new Date("2026-10-21T12:00:00Z"))).toBe("2008-10-21");
});

it.each([["active", "Ativo", false], ["warned", "Advertido", false], ["suspended", "Suspenso", true], ["banned", "Banido", true], [null, "—", false], ["pending", "pending", false]])(
  "shows account status %s and blocks only suspended or banned users", (status, label, blocked) => {
    expect(userStatusBadge(status).label).toBe(label);
    expect(isBlocked(buildUser({ status }))).toBe(blocked);
  },
);

it("loads users and skips the profile query until there is an id", async () => {
  net.http.send.mockResolvedValue(ok([userDto({ created_at: "2026-01-01T00:00:00Z" })]));
  const list = renderHookWithQuery(() => useUsers(), net.queryClient);
  await waitFor(() => expect(list.result.current.data?.[0].createdAt).toEqual(new Date("2026-01-01T00:00:00Z")));
  expect(net.http.send).toHaveBeenCalledWith({ method: "GET", path: "users" });
  expect(renderHookWithQuery(() => useUser(null), net.queryClient).result.current.fetchStatus).toBe("idle");
  net.http.send.mockResolvedValue(ok(userDto()));
  expect((await userStore.fetchById("user-a")).name).toBe("Maria Silva");
  expect(net.http.send).toHaveBeenLastCalledWith({ method: "GET", path: "users/user-a" });
});

it("creates accounts and updates profiles, refreshing the cached user", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(userDto({ phone: "64988887777" })));
  const create = renderHookWithQuery(() => useCreateUser());
  const update = renderHookWithQuery(() => useUpdateProfile());
  await act(() => create.result.current.mutateAsync(toCreatePayload(signup)));
  await act(() => update.result.current.mutateAsync({ id: "user-a", input: { phone: "64988887777" } }));
  expect(net.http.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "POST", path: "users/create" }));
  expect(net.http.send).toHaveBeenNthCalledWith(2, { method: "PATCH", path: "users/user-a", body: { phone: "64988887777" } });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users", "detail", "user-a"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users", "list"] });
});

it("replaces the cached profile with the uploaded photo so every avatar updates", async () => {
  net.queryClient.setQueryData(["users", "detail", "user-a"], buildUser());
  net.http.send.mockResolvedValue(ok(userDto({ profile_photo_url: "https://cdn/maria.jpg" })));
  const upload = renderHookWithQuery(() => useUploadProfilePhoto());
  await act(() => upload.result.current.mutateAsync({ id: "user-a", file: new File(["x"], "maria.jpg") }));
  expect(net.queryClient.getQueryData<{ profilePhotoUrl: string }>(["users", "detail", "user-a"])?.profilePhotoUrl).toBe("https://cdn/maria.jpg");
  expect(net.http.send.mock.calls[0][0]).toMatchObject({ method: "POST", path: "users/user-a/photo", headers: { "Content-Type": undefined } });
});

it("changes the password with the current one as proof", async () => {
  net.http.send.mockResolvedValue(ok(null));
  const change = renderHookWithQuery(() => useChangePassword());
  await act(() => change.result.current.mutateAsync({ id: "user-a", currentPassword: "Antiga123", newPassword: "Nova12345" }));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "users/user-a/change-password", body: { current_password: "Antiga123", new_password: "Nova12345" } });
});

it("starts sign-up as a renter and forgets users on logout", () => {
  expect(renderHookWithQuery(() => useSignupForm()).result.current.getValues("role")).toBe("locatario");
  net.queryClient.setQueryData(["users", "list"], []);
  userStore.clear();
  expect(net.queryClient.getQueryData(["users", "list"])).toBeUndefined();
});
