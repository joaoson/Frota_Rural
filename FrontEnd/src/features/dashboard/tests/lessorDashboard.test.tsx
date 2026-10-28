import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContractStore } from "@/features/contracts/api/ContractStore";
import { HttpDashboardRepository } from "../api/DashboardRepository";
import { DashboardStore, dashboardKeys } from "../api/DashboardStore";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/app/container", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { DashboardStore } = await import("../api/DashboardStore");
  const { HttpDashboardRepository } = await import("../api/DashboardRepository");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { queryClient, dashboardStore: new DashboardStore(new HttpDashboardRepository({ send: mocks.send }), queryClient) };
});
const { browserTimeZone, useLessorDashboard } = await import("../hooks/useLessorDashboard");
const { queryClient: containerClient } = await import("@/app/container");

const payload = {
  period: { months: 3, start: "2026-01-01", end: "2026-03-15", time_zone: "America/Sao_Paulo" },
  machine: null,
  totals: { revenue: "650.00", current_month_revenue: "550.00", completed_rentals: 3, reviews: 3, average_rating: "4.00", open_rentals: 2, rentals: 8 },
  monthly: [
    { month: "2026-01-01", revenue: "100.00", completed_rentals: 1, reviews: 0, average_rating: null },
    { month: "2026-02-01", revenue: "0.00", completed_rentals: 0, reviews: 2, average_rating: "4.50" },
    { month: "2026-03-01", revenue: "550.00", completed_rentals: 2, reviews: 1, average_rating: "3.00" },
  ],
  status_breakdown: [{ status: "pending", label: "Pendente", total: 1 }],
  top_machines: [{ machine: "machine-a", name: "John Deere 6110J", completed_rentals: 2, revenue: "400.00" }],
};
const filter = { months: 3, machineId: "machine-a", timeZone: "America/Sao_Paulo" };

afterEach(() => { mocks.send.mockReset(); containerClient.clear(); vi.restoreAllMocks(); });

it("requests the filtered summary and maps calendar months without shifting them to UTC", async () => {
  mocks.send.mockResolvedValue({ status: 200, data: payload });
  const summary = await new HttpDashboardRepository({ send: mocks.send }).lessorSummary(filter);
  expect(mocks.send).toHaveBeenCalledWith({
    method: "GET", path: "dashboard/lessor",
    query: { months: 3, machine: "machine-a", time_zone: "America/Sao_Paulo" },
  });
  expect(summary.monthly.map(({ year, monthIndex, revenue, rating }) => ({ year, monthIndex, revenue, rating }))).toEqual([
    { year: 2026, monthIndex: 0, revenue: 100, rating: null },
    { year: 2026, monthIndex: 1, revenue: 0, rating: 4.5 },
    { year: 2026, monthIndex: 2, revenue: 550, rating: 3 },
  ]);
  expect(summary.monthly[0].month).toBe(new Date(2026, 0, 1).toLocaleDateString("pt-BR", { month: "short" }));
  expect(summary.totals).toEqual({ revenue: 650, currentMonthRevenue: 550, completedRentals: 3, reviews: 3, averageRating: 4, openRentals: 2, rentals: 8 });
  expect(summary.topMachines).toEqual([{ machineId: "machine-a", name: "John Deere 6110J", completedRentals: 2, revenue: 400 }]);
  expect(summary.machineId).toBeNull();
});

it("rejects a malformed summary instead of drawing wrong numbers", async () => {
  mocks.send.mockResolvedValue({ status: 200, data: { ...payload, totals: { ...payload.totals, revenue: 650 } } });
  await expect(new HttpDashboardRepository({ send: mocks.send }).lessorSummary(filter)).rejects.toThrow();
});

it("keys the cache by filter and is cleared on logout and invalidated with rentals", async () => {
  const client = new QueryClient();
  const repository = { lessorSummary: vi.fn().mockResolvedValue({}) };
  const store = new DashboardStore(repository, client);
  const options = store.lessorSummaryOptions(filter);
  expect(options.queryKey).toEqual(["dashboard", "lessor", filter]);
  await client.fetchQuery(options);
  expect(repository.lessorSummary).toHaveBeenCalledWith(filter);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await new ContractStore({} as never, client).invalidateRentals();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
  store.clear();
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
});

it("loads through the hook only when enabled and falls back to Brasília time", async () => {
  mocks.send.mockResolvedValue({ status: 200, data: payload });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={containerClient}>{children}</QueryClientProvider>;
  const disabled = renderHook(() => useLessorDashboard(filter, false), { wrapper });
  expect(disabled.result.current.fetchStatus).toBe("idle");
  expect(mocks.send).not.toHaveBeenCalled();
  const { result } = renderHook(() => useLessorDashboard(filter, true), { wrapper });
  await waitFor(() => expect(result.current.data?.totals.revenue).toBe(650));
  expect(browserTimeZone()).toBeTruthy();
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("no Intl"); });
  expect(browserTimeZone()).toBe("America/Sao_Paulo");
});
