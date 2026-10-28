import { z } from "zod";

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);

/** Resposta de `GET /api/dashboard/lessor`: agregada no banco, valores decimais como string. */
export const lessorDashboardApiSchema = z.object({
  period: z.object({ months: z.number(), start: z.string(), end: z.string(), time_zone: z.string() }),
  machine: z.string().nullable(),
  totals: z.object({
    revenue: decimal,
    current_month_revenue: decimal,
    completed_rentals: z.number(),
    reviews: z.number(),
    average_rating: decimal.nullable(),
    open_rentals: z.number(),
    rentals: z.number(),
  }),
  monthly: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revenue: decimal,
    completed_rentals: z.number(),
    reviews: z.number(),
    average_rating: decimal.nullable(),
  })),
  status_breakdown: z.array(z.object({ status: z.string(), label: z.string(), total: z.number() })),
  top_machines: z.array(z.object({
    machine: z.string(),
    name: z.string(),
    completed_rentals: z.number(),
    revenue: decimal,
  })),
});

export type LessorDashboardApi = z.infer<typeof lessorDashboardApiSchema>;

export interface LessorDashboardFilter {
  months: number;
  machineId?: string;
  timeZone: string;
}

export interface LessorDashboardMonth {
  /** Rótulo curto do eixo, por exemplo "mai.". */
  month: string;
  year: number;
  monthIndex: number;
  revenue: number;
  completedRentals: number;
  reviews: number;
  rating: number | null;
}

export interface LessorDashboard {
  months: number;
  machineId: string | null;
  totals: {
    revenue: number;
    currentMonthRevenue: number;
    completedRentals: number;
    reviews: number;
    averageRating: number | null;
    openRentals: number;
    rentals: number;
  };
  monthly: LessorDashboardMonth[];
  statusBreakdown: { status: string; label: string; total: number }[];
  topMachines: { machineId: string; name: string; completedRentals: number; revenue: number }[];
}
