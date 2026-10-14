import type { Rental } from "@/features/contracts/types/rental";
import type { Review } from "@/features/reviews/types/review";

/** Gross contractual values, grouped by completion month; these are not bank settlements. */
export function ownerSummary(rentals: Rental[], reviews: Review[], now = new Date()) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { month: date.toLocaleDateString("pt-BR", { month: "short" }), year: date.getFullYear(), monthIndex: date.getMonth(), value: 0, rating: null as number | null, ratings: [] as number[] };
  });
  for (const rental of rentals) {
    if (!["completed", "closed"].includes(rental.status ?? "") || !rental.endDate || rental.endDate > now) continue;
    const month = months.find((item) => item.year === rental.endDate!.getFullYear() && item.monthIndex === rental.endDate!.getMonth());
    if (month) month.value += rental.totalPrice ?? 0;
  }
  for (const review of reviews) {
    if (!review.createdAt || review.createdAt > now) continue;
    const month = months.find((item) => item.year === review.createdAt!.getFullYear() && item.monthIndex === review.createdAt!.getMonth());
    if (month) month.ratings.push(review.rating);
  }
  for (const month of months) month.rating = month.ratings.length ? month.ratings.reduce((sum, value) => sum + value, 0) / month.ratings.length : null;
  return { months, currentMonthTotal: months[5].value, sixMonthTotal: months.reduce((sum, month) => sum + month.value, 0) };
}
export const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const matchesSearch = (query: string, ...values: unknown[]) => values.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
export const yearOptions = (years: (number | null | undefined)[]) => ["Todos", ...[...new Set(years.filter((year): year is number => year != null))].sort((a, b) => b - a).map(String)];
