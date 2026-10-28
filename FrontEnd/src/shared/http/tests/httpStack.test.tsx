import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosHttpClient, createAxiosInstance, createPublicAxiosInstance, toHttpError } from "../AxiosHttpClient";
import { applyFieldErrors } from "../applyFieldErrors";
import { AuthenticatedHttpClient } from "../decorators/AuthenticatedHttpClient";
import { LoggingHttpClient } from "../decorators/LoggingHttpClient";
import { RefreshingHttpClient } from "../decorators/RefreshingHttpClient";
import { BadRequestError, ForbiddenError, HttpError, NotFoundError, RequestCanceledError, ServerError, UnauthorizedError, UnexpectedError } from "../errors";
import { coordenadasParaTile, geocodificarLocal, urlMapaCompleto, urlTile } from "../GeocodingClient";
import { createQueryClient } from "../queryClient";
import { CepNotFound, formatAddress, ViaCepClient } from "../ViaCepClient";
import { InMemoryTokenStore } from "@/shared/auth/InMemoryTokenStore";
import { SessionService } from "@/shared/auth/SessionService";
import { isCepComplete, useCepLookup } from "@/shared/hooks/useCepLookup";
import { net } from "@/test/container";
import { fakeHttp, ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";
import { useForm } from "react-hook-form";

vi.mock("@/app/container", () => import("@/test/container"));

const response = (status: number, data: unknown) => new AxiosError("Request failed", "ERR", undefined, undefined, { status, data } as AxiosResponse);

afterEach(() => { vi.unstubAllGlobals(); });

it("sends requests through axios with query, body, headers and abort signal and returns status and data", async () => {
  const adapter = vi.fn<AxiosAdapter>(async config => ({ data: { ok: true }, status: 201, statusText: "Created", headers: {}, config }));
  const client = new AxiosHttpClient(axios.create({ adapter, baseURL: "http://api.test/" }));
  const signal = new AbortController().signal;
  expect(await client.send({ method: "POST", path: "rentals", query: { page: 2 }, body: { a: 1 }, headers: { "X-Trace": "1" }, signal })).toEqual({ status: 201, data: { ok: true } });
  const config = adapter.mock.calls[0][0];
  expect(config).toMatchObject({ method: "post", url: "rentals", params: { page: 2 }, data: JSON.stringify({ a: 1 }), signal });
  expect(config.headers["X-Trace"]).toBe("1");
});

it("translates transport failures into domain errors", async () => {
  const failing = new AxiosHttpClient(axios.create({ adapter: async () => { throw response(404, { detail: "Locação não encontrada." }); } }));
  await expect(failing.send({ method: "GET", path: "rentals/x" })).rejects.toThrow(new NotFoundError("Locação não encontrada."));
  expect(createAxiosInstance("http://api.test/api/").defaults).toMatchObject({ withCredentials: true, baseURL: "http://api.test/api/" });
  expect(createPublicAxiosInstance("https://viacep.com.br/ws/").defaults.withCredentials).toBeUndefined();
});

it.each([
  [401, { detail: "Token inválido." }, UnauthorizedError, "Token inválido.", 401],
  [403, { message: "Sem permissão." }, ForbiddenError, "Sem permissão.", 403],
  [418, { error: "Chá." }, UnexpectedError, "Chá.", undefined],
  [503, "Service Unavailable", ServerError, "Erro no servidor.", 503],
  [400, { email: "Inválido.", code: "x" }, BadRequestError, "Inválido.", 400],
  [400, { errors: [], message: "Lista não estruturada." }, BadRequestError, "Lista não estruturada.", 400],
  [400, { photos: [1, 2] }, BadRequestError, "Dados inválidos.", 400],
  [422, null, HttpError, "Não foi possível processar os dados.", 422],
])("maps HTTP %s responses to a typed error with the best available message", (status, data, type, message, exposedStatus) => {
  const error = toHttpError(response(status, data));
  expect(error).toBeInstanceOf(type);
  expect(error.message).toBe(message);
  expect(error.status).toBe(exposedStatus);
});

it("keeps unknown failures and already-typed errors as they are", () => {
  const typed = new NotFoundError();
  expect(toHttpError(typed)).toBe(typed);
  expect(toHttpError("weird")).toBeInstanceOf(UnexpectedError);
  expect(toHttpError(new axios.CanceledError())).toBeInstanceOf(RequestCanceledError);
  expect(new BadRequestError().firstFieldError()).toBeUndefined();
  expect(new BadRequestError("x", undefined, { fieldErrors: { email: [] , cpf: ["CPF inválido."] } }).firstFieldError()).toEqual({ field: "cpf", message: "CPF inválido." });
});

it("adds the bearer token only when a session exists", async () => {
  const inner = fakeHttp(); inner.send.mockResolvedValue(ok(null));
  const tokens = new InMemoryTokenStore();
  const client = new AuthenticatedHttpClient(inner, tokens);
  await client.send({ method: "GET", path: "public", headers: { Accept: "json" } });
  tokens.setAccessToken("abc");
  await client.send({ method: "GET", path: "private", headers: { Accept: "json" } });
  expect(inner.send.mock.calls.map(([request]) => request.headers)).toEqual([{ Accept: "json" }, { Accept: "json", Authorization: "Bearer abc" }]);
});

it("refreshes an expired access token once for concurrent requests and retries them", async () => {
  const inner = fakeHttp(); const tokens = new InMemoryTokenStore();
  const sessionHttp = fakeHttp(); sessionHttp.send.mockResolvedValue(ok({ access: "renewed" }));
  const session = new SessionService(sessionHttp, tokens);
  inner.send.mockRejectedValueOnce(new UnauthorizedError()).mockRejectedValueOnce(new UnauthorizedError()).mockResolvedValue(ok("data"));
  const client = new RefreshingHttpClient(inner, session);
  const results = await Promise.all([client.send({ method: "GET", path: "a" }), client.send({ method: "GET", path: "b" })]);
  expect(results).toEqual([ok("data"), ok("data")]);
  expect(sessionHttp.send).toHaveBeenCalledOnce();
  expect(sessionHttp.send).toHaveBeenCalledWith({ method: "POST", path: "login/refresh" });
  expect(tokens.getAccessToken()).toBe("renewed");
});

it("ends the session when the refresh cookie is no longer valid and does not retry other errors", async () => {
  const inner = fakeHttp(); const tokens = new InMemoryTokenStore(); const expired = vi.fn();
  tokens.subscribeExpired(expired); tokens.setAccessToken("old");
  const sessionHttp = fakeHttp(); sessionHttp.send.mockRejectedValue(new UnauthorizedError());
  const client = new RefreshingHttpClient(inner, new SessionService(sessionHttp, tokens));
  const unauthorized = new UnauthorizedError();
  inner.send.mockRejectedValueOnce(unauthorized).mockRejectedValueOnce(new ServerError(500));
  await expect(client.send({ method: "GET", path: "a" })).rejects.toBe(unauthorized);
  expect(expired).toHaveBeenCalledOnce();
  expect(tokens.getAccessToken()).toBeNull();
  await expect(client.send({ method: "GET", path: "b" })).rejects.toBeInstanceOf(ServerError);
  expect(sessionHttp.send).toHaveBeenCalledOnce();
});

it("logs successes and failures in development without logging cancellations", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const inner = fakeHttp();
  inner.send.mockResolvedValueOnce(ok(null, 204)).mockRejectedValueOnce(new ServerError(500)).mockRejectedValueOnce(new RequestCanceledError());
  const client = new LoggingHttpClient(inner);
  await client.send({ method: "GET", path: "rentals" });
  await expect(client.send({ method: "GET", path: "rentals" })).rejects.toBeInstanceOf(ServerError);
  await expect(client.send({ method: "GET", path: "rentals" })).rejects.toBeInstanceOf(RequestCanceledError);
  expect(log.mock.calls[0][0]).toContain("GET rentals → 204");
  expect(error).toHaveBeenCalledOnce();
});

it.each([
  [new RequestCanceledError(), 0, false], [new BadRequestError(), 0, false], [new ServerError(500), 1, true],
  [new ServerError(500), 2, false], [new Error("offline"), 0, true],
])("retries only transient query failures (%#)", (error, failures, retry) => {
  const policy = createQueryClient().getDefaultOptions().queries!.retry as (count: number, error: Error) => boolean;
  expect(policy(failures, error)).toBe(retry);
});

it("fills street and city from a CEP and rejects unknown or incomplete ones", async () => {
  const http = fakeHttp(); const client = new ViaCepClient(http);
  http.send.mockResolvedValueOnce(ok({ cep: "75900-000", logradouro: "Rua A", bairro: "Centro", localidade: "Rio Verde", uf: "GO" }))
    .mockResolvedValueOnce(ok({ cep: "", logradouro: "", bairro: "", localidade: "", uf: "", erro: "true" }));
  const address = await client.findByCep("75900-000");
  expect(http.send).toHaveBeenCalledWith({ method: "GET", path: "75900000/json/" });
  expect(address).toEqual({ street: "Rua A", neighborhood: "Centro", city: "Rio Verde", state: "GO", cep: "75900-000" });
  await expect(client.findByCep("00000-000")).rejects.toBeInstanceOf(CepNotFound);
  await expect(client.findByCep("123")).rejects.toMatchObject({ cep: "123", message: "CEP não encontrado." });
  expect([formatAddress(address), formatAddress(address, "logradouro"), formatAddress({ ...address, neighborhood: "" }, "municipio")])
    .toEqual(["Rua A, Centro, Rio Verde, GO", "Rua A, Centro", "Rio Verde, GO"]);
});

it("looks up CEPs from forms through the shared hook", async () => {
  net.http.send.mockResolvedValue(ok({ cep: "75900-000", logradouro: "Rua A", bairro: "Centro", localidade: "Rio Verde", uf: "GO" }));
  const { result } = renderHookWithQuery(() => useCepLookup());
  expect(result.current.address).toBeNull();
  await act(() => result.current.lookup("75900000"));
  await waitFor(() => expect(result.current.address?.city).toBe("Rio Verde"));
  expect([isCepComplete("75900-000"), isCepComplete("7590")]).toEqual([true, false]);
});

it("places backend field errors on mapped form fields only", () => {
  const { result } = renderHook(() => useForm<{ email: string; document: string }>());
  const error = new BadRequestError("Dados inválidos.", undefined, { fieldErrors: { email: ["E-mail em uso."], owner: ["Inválido."], document: [] } });
  expect(applyFieldErrors(result.current, error, { email: "email", document: "document" })).toBe(true);
  expect(result.current.getFieldState("email").error?.message).toBe("E-mail em uso.");
  expect(applyFieldErrors(result.current, error, {})).toBe(false);
  expect(applyFieldErrors(result.current, new Error("x"), { email: "email" })).toBe(false);
});

const fetchMock = vi.fn();
const reply = (body: unknown, okStatus = true) => ({ ok: okStatus, status: okStatus ? 200 : 429, json: async () => body });
beforeEach(() => { fetchMock.mockReset(); });

  it("geocodes by CEP first, falls back to the address and caches the answer", async () => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([{ lat: "-17.79", lon: "-50.92", display_name: "Rio Verde, GO" }]));
  const local = { endereco: "Rio Verde, GO", cep: "75900-001" };
  expect(await geocodificarLocal(local)).toEqual({ lat: -17.79, lon: -50.92, nomeExibicao: "Rio Verde, GO" });
  expect(await geocodificarLocal(local)).toEqual({ lat: -17.79, lon: -50.92, nomeExibicao: "Rio Verde, GO" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain("postalcode=75900001");
  expect(String(fetchMock.mock.calls[1][0])).toContain("countrycodes=br");
});

it("does not search too-short addresses and surfaces rate limiting", async () => {
  vi.stubGlobal("fetch", fetchMock);
  expect(await geocodificarLocal({ endereco: "RV", cep: "123" })).toBeNull();
  expect(await geocodificarLocal({})).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(reply([], false));
  await expect(geocodificarLocal({ endereco: "Cidade inexistente" })).rejects.toThrow("Nominatim respondeu 429");
  fetchMock.mockResolvedValue(reply([]));
  expect(await geocodificarLocal({ cep: "11111111" })).toBeNull();
});

it("computes OpenStreetMap tiles and links for a point", () => {
  const point = { lat: 0, lon: 0, nomeExibicao: "" };
  expect(coordenadasParaTile(point, 1)).toEqual({ x: 1, y: 1 });
  expect(urlTile(1, 2, 3)).toBe("https://tile.openstreetmap.org/3/1/2.png");
  expect(urlMapaCompleto({ lat: -1, lon: 2, nomeExibicao: "" })).toBe("https://www.openstreetmap.org/?mlat=-1&mlon=2#map=13/-1/2");
});
