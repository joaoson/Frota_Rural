import { act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpAuthRepository } from "../api/AuthRepository";
import { useForgotPasswordForm, useLoginForm, useResetPasswordForm } from "../hooks/useAuthForms";
import { useLogin } from "../hooks/useLogin";
import { useConfirmPasswordReset, useRequestPasswordReset } from "../hooks/usePasswordReset";
import { AccountDisabled, InvalidCredentials, InvalidResetToken } from "../types/authErrors";
import { loginFormSchema, resetPasswordFormSchema } from "../types/authSchemas";
import { isExpired, parseJwt } from "@/shared/auth/jwt";
import { BadRequestError, ForbiddenError, ServerError, UnauthorizedError } from "@/shared/http/errors";
import { authStore, net, tokenStore } from "@/test/container";
import { fakeHttp, ok } from "@/test/http";
import { fakeJwt } from "@/test/jwt";
import { renderHookWithQuery } from "@/test/render";

const auth = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => auth }));

beforeEach(() => { net.http.send.mockReset(); tokenStore.setAccessToken(null); });

it.each([
  [new UnauthorizedError(), InvalidCredentials, "E-mail ou senha incorretos."],
  [new ForbiddenError(), AccountDisabled, "Esta conta está suspensa ou banida."],
  [new ServerError(500), ServerError, "Erro no servidor."],
])("explains a failed login (%#)", async (failure, expected, message) => {
  const http = fakeHttp(); http.send.mockRejectedValue(failure);
  const login = new HttpAuthRepository(http).login("maria@example.com", "x");
  await expect(login).rejects.toBeInstanceOf(expected);
  await expect(login).rejects.toThrow(message);
});

it("keeps the access token only in memory after login and drops all cached data on logout", async () => {
  const access = fakeJwt({ user_id: "user-a", role: "locador", exp: 2_000_000_000 });
  net.http.send.mockResolvedValueOnce(ok({ access })).mockResolvedValueOnce(ok(null));
  net.queryClient.setQueryData(["rentals"], ["cached"]);
  await authStore.login("maria@example.com", "Senha1234");
  expect(tokenStore.getAccessToken()).toBe(access);
  await authStore.logout();
  expect(tokenStore.getAccessToken()).toBeNull();
  expect(net.queryClient.getQueryData(["rentals"])).toBeUndefined();
  expect(net.http.send.mock.calls.map(([request]) => request.path)).toEqual(["login", "logout"]);
});

it("clears the local session even when the logout request fails", async () => {
  tokenStore.setAccessToken("token");
  net.http.send.mockRejectedValue(new ServerError(503));
  await expect(authStore.logout()).rejects.toBeInstanceOf(ServerError);
  expect(tokenStore.getAccessToken()).toBeNull();
});

it("restores the session from the refresh cookie or reports that there is none", async () => {
  net.http.send.mockResolvedValueOnce(ok({ access: "renewed" })).mockRejectedValueOnce(new UnauthorizedError());
  expect(await authStore.restoreSession()).toBe("renewed");
  expect(tokenStore.getAccessToken()).toBe("renewed");
  expect(await authStore.restoreSession()).toBeNull();
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "login/refresh" });
});

it("never reveals whether an e-mail has an account when requesting a reset", async () => {
  net.http.send.mockResolvedValueOnce(ok({ message: "Verifique seu e-mail." })).mockResolvedValueOnce(ok(undefined));
  const request = renderHookWithQuery(() => useRequestPasswordReset());
  await act(async () => { expect(await request.result.current.mutateAsync("maria@example.com")).toBe("Verifique seu e-mail."); });
  await act(async () => { expect(await request.result.current.mutateAsync("x@example.com")).toBe("Se existir uma conta com esse e-mail, enviamos um link."); });
});

it.each([
  [new BadRequestError("Token expirado."), InvalidResetToken],
  [new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { new_password: ["Muito comum."] } }), BadRequestError],
])("distinguishes an expired reset link from a rejected new password (%#)", async (failure, expected) => {
  net.http.send.mockRejectedValue(failure);
  const confirm = renderHookWithQuery(() => useConfirmPasswordReset());
  await act(() => expect(confirm.result.current.mutateAsync({ token: "t", newPassword: "Nova12345" })).rejects.toBeInstanceOf(expected));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "password-reset/confirm", body: { token: "t", new_password: "Nova12345" } });
});

it("confirms a password reset", async () => {
  net.http.send.mockResolvedValue(ok(null));
  const confirm = renderHookWithQuery(() => useConfirmPasswordReset());
  await act(() => confirm.result.current.mutateAsync({ token: "t", newPassword: "Nova12345" }));
  await waitFor(() => expect(confirm.result.current.isSuccess).toBe(true));
});

it.each([["locador", "locador"], [undefined, null]])("logs in with the role carried by the token (%s)", async (role, expected) => {
  const access = fakeJwt({ user_id: "user-a", exp: 2_000_000_000, ...(role ? { role } : {}) });
  net.http.send.mockResolvedValue(ok({ access }));
  const login = renderHookWithQuery(() => useLogin());
  await act(() => login.result.current.mutateAsync({ email: "maria@example.com", password: "Senha1234" }));
  expect(auth.login).toHaveBeenCalledWith({ access }, expected);
});

it("decodes JWT payloads and detects expiry", () => {
  const payload = parseJwt(fakeJwt({ user_id: "user-a", exp: 100, role: "admin" }));
  expect(payload).toMatchObject({ user_id: "user-a", role: "admin" });
  expect(isExpired(payload!, new Date(100_000))).toBe(true);
  expect(isExpired(payload!, new Date(99_999))).toBe(false);
  expect(parseJwt("no-payload")).toBeNull();
  expect(parseJwt("a.@@@.c")).toBeNull();
});

it("validates login and reset forms", () => {
  expect(loginFormSchema.safeParse({ email: "maria", password: "" }).error?.issues.map(issue => issue.message)).toEqual(["Informe um e-mail válido.", "Senha é obrigatória."]);
  expect(resetPasswordFormSchema.safeParse({ newPassword: "Nova12345", confirmPassword: "Nova12346" }).error?.issues[0].message).toBe("As senhas não coincidem.");
  expect(resetPasswordFormSchema.safeParse({ newPassword: "Nova12345", confirmPassword: "Nova12345" }).success).toBe(true);
  expect(renderHookWithQuery(() => useLoginForm()).result.current.getValues()).toEqual({ email: "", password: "" });
  expect(renderHookWithQuery(() => useForgotPasswordForm()).result.current.getValues()).toEqual({ email: "" });
  expect(renderHookWithQuery(() => useResetPasswordForm()).result.current.getValues()).toEqual({ newPassword: "", confirmPassword: "" });
});

it("notifies subscribers once the session expires", () => {
  const listener = vi.fn(); tokenStore.setAccessToken("token");
  const unsubscribe = tokenStore.subscribeExpired(listener);
  tokenStore.notifyExpired(); unsubscribe(); tokenStore.notifyExpired();
  expect(listener).toHaveBeenCalledOnce();
  expect(tokenStore.getAccessToken()).toBeNull();
});
