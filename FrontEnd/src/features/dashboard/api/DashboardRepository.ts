import type { HttpClient } from "@/shared/http/HttpClient";

import {
  type LessorDashboard,
  type LessorDashboardApi,
  type LessorDashboardFilter,
  lessorDashboardApiSchema,
} from "../types/lessorDashboard";

export interface DashboardRepository {
  lessorSummary(filter: LessorDashboardFilter): Promise<LessorDashboard>;
}

const toNumber = (value: string | null) => (value === null ? null : Number(value));

export function lessorDashboardToDomain(dto: LessorDashboardApi): LessorDashboard {
  return {
    months: dto.period.months,
    machineId: dto.machine,
    totals: {
      revenue: Number(dto.totals.revenue),
      currentMonthRevenue: Number(dto.totals.current_month_revenue),
      completedRentals: dto.totals.completed_rentals,
      reviews: dto.totals.reviews,
      averageRating: toNumber(dto.totals.average_rating),
      openRentals: dto.totals.open_rentals,
      rentals: dto.totals.rentals,
    },
    monthly: dto.monthly.map((row) => {
      // "2026-05-01" é um mês do calendário, não um instante: não passar por `new Date(string)` (UTC).
      const [year, month] = row.month.split("-").map(Number);
      return {
        month: new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short" }),
        year,
        monthIndex: month - 1,
        revenue: Number(row.revenue),
        completedRentals: row.completed_rentals,
        reviews: row.reviews,
        rating: toNumber(row.average_rating),
      };
    }),
    statusBreakdown: dto.status_breakdown,
    topMachines: dto.top_machines.map((row) => ({
      machineId: row.machine,
      name: row.name,
      completedRentals: row.completed_rentals,
      revenue: Number(row.revenue),
    })),
  };
}

export class HttpDashboardRepository implements DashboardRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async lessorSummary(filter: LessorDashboardFilter): Promise<LessorDashboard> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: "dashboard/lessor",
      query: { months: filter.months, machine: filter.machineId, time_zone: filter.timeZone },
    });
    return lessorDashboardToDomain(lessorDashboardApiSchema.parse(response.data));
  }
}
