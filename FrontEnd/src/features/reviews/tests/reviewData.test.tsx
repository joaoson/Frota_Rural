import { act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCreateReview, useDeleteReview, useReceivedReviews, useWrittenReviews } from "../hooks/useReviews";
import { net, reviewStore } from "@/test/container";
import { ok } from "@/test/http";
import { renderHookWithQuery } from "@/test/render";

vi.mock("@/app/container", () => import("@/test/container"));

const reviewDto = { id: "review-a", rental: "rental-a", reviewer: "tenant-a", reviewee: "owner-a", rating: 5 };
beforeEach(() => { net.http.send.mockReset(); net.queryClient.clear(); });

it("loads received and written reviews for the signed-in user only", async () => {
  net.http.send.mockResolvedValue(ok([{ ...reviewDto, reviewer_name: "Maria", comment: "Ótima máquina", created_at: "2026-10-01T00:00:00Z" }]));
  expect(renderHookWithQuery(() => useReceivedReviews(null), net.queryClient).result.current.fetchStatus).toBe("idle");
  const received = renderHookWithQuery(() => useReceivedReviews("owner-a"), net.queryClient);
  await waitFor(() => expect(received.result.current.data?.[0]).toMatchObject({ reviewerName: "Maria", comment: "Ótima máquina", createdAt: new Date("2026-10-01T00:00:00Z") }));
  net.http.send.mockResolvedValue(ok([reviewDto]));
  const written = renderHookWithQuery(() => useWrittenReviews("tenant-a"), net.queryClient);
  await waitFor(() => expect(written.result.current.data?.[0]).toMatchObject({ reviewerName: null, revieweeName: null, comment: null, createdAt: null }));
  expect(net.http.send.mock.calls.map(([request]) => request.query)).toEqual([
    { reviewee: "owner-a", reviewer: undefined, rental: undefined },
    { reviewee: undefined, reviewer: "tenant-a", rental: undefined },
  ]);
  expect(renderHookWithQuery(() => useWrittenReviews(null), net.queryClient).result.current.fetchStatus).toBe("idle");
});

it("creates and deletes reviews and refreshes every review list", async () => {
  const invalidate = vi.spyOn(net.queryClient, "invalidateQueries");
  net.http.send.mockResolvedValue(ok(reviewDto));
  const create = renderHookWithQuery(() => useCreateReview());
  const remove = renderHookWithQuery(() => useDeleteReview());
  await act(() => create.result.current.mutateAsync({ reviewer: "tenant-a", reviewee: "owner-a", rental: "rental-a", rating: 5, comment: "" }));
  await act(() => remove.result.current.mutateAsync("review-a"));
  expect(net.http.send.mock.calls.map(([request]) => `${request.method} ${request.path}`)).toEqual(["POST reviews", "DELETE reviews/review-a"]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "list"] });
  reviewStore.clear();
});
