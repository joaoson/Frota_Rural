import { expect, it } from "vitest";
import { documentsRouteForRole, homeRouteForRole } from "../homeRoute";

it.each([
  ["operador", "/dashboard-locatario?tab=documentos"],
  ["locador", "/dashboard?tab=documentos"],
  ["admin", "/dashboard?tab=documentos"],
  [null, "/dashboard?tab=documentos"],
])("sends a %s back to the documents tab of their own dashboard", (role, route) => {
  expect(documentsRouteForRole(role)).toBe(route);
});

it("keeps the operator's documents tab under their home dashboard", () => {
  expect(documentsRouteForRole("operador").startsWith(homeRouteForRole("operador"))).toBe(true);
});
