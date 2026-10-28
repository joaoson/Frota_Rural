import { vi, type Mock } from "vitest";
import type { HttpClient, HttpRequest, HttpResponse } from "@/shared/http/HttpClient";

export type FakeHttp = HttpClient & { send: Mock<(request: HttpRequest) => Promise<HttpResponse<unknown>>> };

/** Fronteira de rede falsa: o teste decide a resposta e afirma o request enviado. */
export function fakeHttp(): FakeHttp {
  return { send: vi.fn() } as FakeHttp;
}

export const ok = <T>(data: T, status = 200): HttpResponse<T> => ({ status, data });

export type Route = (request: HttpRequest) => unknown;

/**
 * Responde por "MÉTODO caminho", como um backend falso: rotas não declaradas
 * falham com 404, e uma rota pode lançar um HttpError para simular recusa.
 */
export function serve(http: FakeHttp, routes: Record<string, Route>) {
  http.send.mockImplementation(async request => {
    const route = routes[`${request.method} ${request.path}`];
    if (!route) {
      const { NotFoundError } = await import("@/shared/http/errors");
      throw new NotFoundError(`${request.method} ${request.path}`);
    }
    return ok(await route(request));
  });
}
