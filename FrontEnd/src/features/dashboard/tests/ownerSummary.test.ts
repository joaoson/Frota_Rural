import { expect, it } from "vitest";
import type { Rental } from "@/features/contracts/types/rental";
import type { Review } from "@/features/reviews/types/review";
import { ownerSummary } from "../utils/ownerSummary";
it("groups completed contractual values across a year boundary and excludes cancelled, pending and future records", () => {
  const now = new Date(2026, 1, 15);
  const summary = ownerSummary([
    { status: "completed", endDate: new Date(2026, 1, 1), totalPrice: 100 },
    { status: "closed", endDate: new Date(2025, 11, 1), totalPrice: 250 },
    { status: "cancelled", endDate: new Date(2026, 1, 1), totalPrice: 500 },
    { status: "pending", endDate: new Date(2026, 1, 1), totalPrice: 500 },
    { status: "completed", endDate: new Date(2026, 1, 20), totalPrice: 500 },
    { status: "completed", endDate: new Date(2025, 7, 1), totalPrice: 500 },
  ] as Rental[], [{ rating: 2, createdAt: new Date(2026, 1, 1) }, { rating: 4, createdAt: new Date(2026, 1, 2) }] as Review[], now);
  expect(summary.currentMonthTotal).toBe(100);
  expect(summary.sixMonthTotal).toBe(350);
  expect(summary.months[5].rating).toBe(3);
  expect(summary.months[0].rating).toBeNull();
});
