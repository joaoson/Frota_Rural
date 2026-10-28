import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { LessorDashboard, LessorDashboardFilter } from "../types/lessorDashboard";
import type { DashboardRepository } from "./DashboardRepository";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  lessor: (filter: LessorDashboardFilter) => [...dashboardKeys.all, "lessor", filter] as const,
};

export class DashboardStore {
  private readonly repository: DashboardRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: DashboardRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  lessorSummaryOptions(
    filter: LessorDashboardFilter,
  ): UseQueryOptions<LessorDashboard, Error, LessorDashboard, ReturnType<typeof dashboardKeys.lessor>> {
    return {
      queryKey: dashboardKeys.lessor(filter),
      queryFn: () => this.repository.lessorSummary(filter),
    };
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: dashboardKeys.all });
  }
}
