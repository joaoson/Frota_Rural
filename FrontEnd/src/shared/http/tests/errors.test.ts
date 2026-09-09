import { AxiosError, type AxiosResponse } from "axios";
import { expect, it } from "vitest";
import { toHttpError } from "../AxiosHttpClient";

it("preserves pricing's 422 status and useful backend message across the shared adapter", () => {
  const response = { status: 422, data: { error: "Não encontramos dados confiáveis para esta máquina." } } as AxiosResponse;
  const error = toHttpError(new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, response));
  expect(error.status).toBe(422);
  expect(error.message).toBe(response.data.error);
});
