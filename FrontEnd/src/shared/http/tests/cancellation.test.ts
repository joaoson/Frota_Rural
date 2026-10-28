import axios, { AxiosError, CanceledError, type AxiosAdapter } from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpNotificationRepository } from "@/features/notifications/api/NotificationRepository";
import { NotificationStore } from "@/features/notifications/api/NotificationStore";
import { AxiosHttpClient, toHttpError } from "../AxiosHttpClient";
import { LoggingHttpClient } from "../decorators/LoggingHttpClient";
import { RefreshingHttpClient } from "../decorators/RefreshingHttpClient";
import { NetworkError } from "../errors";
import { createQueryClient } from "../queryClient";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function notificationClient(adapter: AxiosAdapter) {
  const session = { refresh: vi.fn(async () => {}), onExpired: vi.fn() };
  const http = new LoggingHttpClient(new RefreshingHttpClient(
    new AxiosHttpClient(axios.create({ adapter })), session,
  ));
  return { repository: new HttpNotificationRepository(http), session };
}

it("keeps canceled notification requests distinct from connectivity failures across the HTTP stack", async () => {
  const adapter = vi.fn<AxiosAdapter>();
  const { repository, session } = notificationClient(adapter);
  const controller = new AbortController();
  controller.abort();

  await expect(repository.list({}, controller.signal)).rejects.toMatchObject({ code: "request_canceled" });
  expect(adapter).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(session.refresh).not.toHaveBeenCalled();
  expect(session.onExpired).not.toHaveBeenCalled();
});

it("aborts an in-flight query quietly and allows its next notification request to load", async () => {
  let pendingSignal: AbortSignal | undefined;
  let completeNextRequest = false;
  const page = { results: [], count: 0, unread_count: 0 };
  const adapter = vi.fn<AxiosAdapter>((config) => {
    if (completeNextRequest) return Promise.resolve({ config, status: 200, statusText: "OK", headers: {}, data: page });
    pendingSignal = config.signal as AbortSignal;
    return new Promise((_resolve, reject) => {
      pendingSignal!.addEventListener("abort", () => reject(new CanceledError("canceled")), { once: true });
    });
  });
  const { repository, session } = notificationClient(adapter);
  const queryClient = createQueryClient();
  const store = new NotificationStore(repository, queryClient);
  const options = store.listOptions("owner", { kind: "payment" });
  const canceled = queryClient.fetchQuery(options).catch((error: unknown) => error);

  await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
  await queryClient.cancelQueries({ queryKey: options.queryKey });
  await canceled;
  expect(pendingSignal?.aborted).toBe(true);
  expect(queryClient.getQueryState(options.queryKey)?.error).toBeNull();
  expect(console.error).not.toHaveBeenCalled();
  expect(session.refresh).not.toHaveBeenCalled();

  completeNextRequest = true;
  await expect(queryClient.fetchQuery(options)).resolves.toEqual(page);
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryState(options.queryKey)?.status).toBe("success");
  queryClient.clear();
});

it("does not retry a cancellation but still retries a genuine connection failure", () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  expect(typeof retry).toBe("function");
  if (typeof retry !== "function") throw new Error("Missing retry policy");
  expect(retry(0, toHttpError(new CanceledError()))).toBe(false);
  expect(retry(0, new NetworkError())).toBe(true);
  expect(retry(2, new NetworkError())).toBe(false);
});

it("preserves native aborts as cancellation", () => {
  expect(toHttpError(new DOMException("The operation was aborted", "AbortError"))).toMatchObject({ code: "request_canceled" });
});

it("continues to report genuine network failures instead of hiding them", async () => {
  const original = new AxiosError("Network Error", "ERR_NETWORK");
  const { repository } = notificationClient(async () => { throw original; });
  await expect(repository.list({})).rejects.toMatchObject({
    code: "network_error", message: "Não foi possível conectar ao servidor.", cause: original,
  });
  expect(console.error).toHaveBeenCalledTimes(1);
});
