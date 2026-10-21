import { expect, it, vi } from "vitest";
import { clearSpecialChars } from "../clearSpecialChars";
import { formatarUtcCompleto } from "../formatarUtc";
import { getInitials } from "../getInitials";
import { homeRouteForRole } from "../homeRoute";
import { maskCEP } from "../masks/maskCEP";
import { maskDocument } from "../masks/maskDocument";
import { maskPhone } from "../masks/maskPhone";
import { maskRG } from "../masks/maskRG";
import { masked } from "@/shared/lib/maskedRegister";
import type { UseFormRegisterReturn } from "react-hook-form";

it.each([
  [maskCEP, "75900000", "75900-000"],
  [maskPhone, "64999990000", "(64) 99999-0000"],
  [maskRG, "123456789", "12.345.678-9"],
  [maskDocument, "52998224725", "529.982.247-25"],
  [maskDocument, "11222333000181", "11.222.333/0001-81"],
  [maskDocument, "abc529", "529"],
])("formats typed digits as the Brazilian mask (%#)", (mask, typed, shown) => {
  expect(mask(typed)).toBe(shown);
});

it("strips mask characters before values reach the API", () => {
  expect(clearSpecialChars("529.982.247-25")).toBe("52998224725");
});

it("shows the signature timestamp in UTC exactly as recorded in the evidence", () => {
  expect(formatarUtcCompleto("2026-10-21T03:04:05-03:00")).toBe("21/10/2026 às 06:04:05 UTC");
  expect(formatarUtcCompleto("not a date")).toBe("not a date");
});

it.each([["Maria", "MA"], ["Maria da Silva", "MS"], ["  joão  souza ", "JS"]])("derives avatar initials from %j", (name, initials) => {
  expect(getInitials(name)).toBe(initials);
});

it.each([["locador", "/dashboard"], ["locatario", "/dashboard-locatario"], ["operador", "/dashboard-locatario"], ["admin", "/admin"], [null, "/"], ["visitante", "/"]])(
  "sends the %s role to its home page", (role, route) => {
    expect(homeRouteForRole(role)).toBe(route);
  },
);

it("applies the mask before react-hook-form reads a typed value", () => {
  const onChange = vi.fn();
  const registration = { name: "cep", onChange, onBlur: vi.fn(), ref: vi.fn() } as unknown as UseFormRegisterReturn<"cep">;
  const event = { target: { value: "75900000" } };
  masked(registration, maskCEP).onChange(event);
  expect(onChange).toHaveBeenCalledWith({ target: { value: "75900-000" } });
  masked(registration, maskCEP).onChange({ target: {} });
  expect(onChange).toHaveBeenLastCalledWith({ target: {} });
});
