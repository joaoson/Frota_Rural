import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetDashboardPreferences, searchPreference, useDashboardPreference } from "../hooks/useDashboardPreference";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const useSearch = (user: string | null, section = "fleet") => useDashboardPreference(user, section, searchPreference, "");

it("restores preferences after a new session and isolates accounts and sections", () => {
  const { result, rerender, unmount } = renderHook(({ user, section }) => useSearch(user, section), { initialProps: { user: "owner", section: "fleet" } });
  act(() => result.current[1]("Trator"));
  rerender({ user: "tenant", section: "fleet" });
  expect(result.current[0]).toBe("");
  act(() => result.current[1]("Colheitadeira"));
  rerender({ user: "owner", section: "fleet" });
  expect(result.current[0]).toBe("Trator");
  rerender({ user: "owner", section: "rentals" });
  expect(result.current[0]).toBe("");
  unmount();
  const restored = renderHook(() => useSearch("owner"));
  expect(restored.result.current[0]).toBe("Trator");
});

it.each(['{broken', '42', '"' + 'a'.repeat(201) + '"'])("recovers invalid storage: %s", (stored) => {
  localStorage.setItem("frota:dashboard:v1:owner:fleet", stored);
  const { result } = renderHook(() => useSearch("owner"));
  expect(result.current[0]).toBe("");
  act(() => result.current[1]("Novo filtro"));
  expect(result.current[0]).toBe("Novo filtro");
});

it("resets only the current account and keeps unrelated preferences", () => {
  localStorage.setItem("theme", "dark");
  const owner = renderHook(() => useSearch("owner"));
  const tenant = renderHook(() => useSearch("tenant"));
  act(() => { owner.result.current[1]("A"); tenant.result.current[1]("B"); });
  act(() => resetDashboardPreferences("owner"));
  expect(owner.result.current[0]).toBe("");
  expect(tenant.result.current[0]).toBe("B");
  expect(localStorage.getItem("theme")).toBe("dark");
});

it("continues working when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const { result } = renderHook(() => useSearch("blocked-user"));
  act(() => result.current[1]("Trator"));
  expect(result.current[0]).toBe("Trator");
  act(() => result.current[1](value => value + " novo"));
  expect(result.current[0]).toBe("Trator novo");
});

it("synchronizes storage events from another tab", () => {
  const { result } = renderHook(() => useSearch("owner"));
  act(() => {
    localStorage.setItem("frota:dashboard:v1:owner:fleet", '"Outro filtro"');
    window.dispatchEvent(new StorageEvent("storage", { key: "frota:dashboard:v1:owner:fleet" }));
  });
  expect(result.current[0]).toBe("Outro filtro");
});
