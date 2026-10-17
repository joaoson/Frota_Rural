import { AxiosError, type AxiosResponse } from "axios";
import { expect, it } from "vitest";
import { toHttpError } from "../AxiosHttpClient";
import { BadRequestError, ConflictError } from "../errors";

function responseError(status: number, data: unknown) {
  return toHttpError(new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status, data } as AxiosResponse));
}

it("preserves pricing's 422 status and useful backend message across the shared adapter", () => {
  const response = { status: 422, data: { error: "Não encontramos dados confiáveis para esta máquina." } } as AxiosResponse;
  const error = toHttpError(new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, response));
  expect(error.status).toBe(422);
  expect(error.message).toBe(response.data.error);
});

it("keeps structured conflict fields and API codes available to forms", () => {
  const error = responseError(409, {
    code: "duplicate_email", message: "Dados em conflito.", errors: { email: ["Este e-mail já está em uso."] },
  });
  expect(error).toBeInstanceOf(ConflictError);
  expect(error.apiCode).toBe("duplicate_email");
  expect(error.firstErrorFor("email")).toBe("Este e-mail já está em uso.");
  expect(error.firstFieldError()).toEqual({ field: "email", message: "Este e-mail já está em uso." });
});

it.each([
  { code: "invalid_token", message: "Token expirado.", errors: { non_field_errors: ["Token expirado."] } },
  { non_field_errors: ["Token expirado."] },
])("keeps non-field validation errors separate for password reset and recurrence", data => {
  const error = responseError(400, data);
  expect(error).toBeInstanceOf(BadRequestError);
  expect(error.hasFieldErrors).toBe(false);
  expect(error.nonFieldErrors).toEqual(["Token expirado."]);
  expect(error.message).toBe("Token expirado.");
});

it("retains field validation from legacy feature endpoints", () => {
  const error = responseError(400, { first_start_date: ["Escolha uma data futura."] });
  expect(error.firstErrorFor("first_start_date")).toBe("Escolha uma data futura.");
  expect(error.message).toBe("Escolha uma data futura.");
});

it("retains structured pricing errors without losing the 422 status", () => {
  const error = responseError(422, { code: "pricing_unavailable", message: "Pesquisa indisponível.", errors: {} });
  expect(error.status).toBe(422);
  expect(error.message).toBe("Pesquisa indisponível.");
  expect(error.apiCode).toBe("pricing_unavailable");
});
