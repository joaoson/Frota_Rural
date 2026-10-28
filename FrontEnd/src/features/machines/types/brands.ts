export const BRANDS = [
  { value: "john-deere", label: "John Deere", logo: "/brands/john-deere.png" },
  { value: "massey-ferguson", label: "Massey Ferguson", logo: "/brands/massey-ferguson.png" },
  { value: "new-holland", label: "New Holland", logo: "/brands/new-holland.png" },
  { value: "valtra", label: "Valtra", logo: "/brands/valtra.png" },
  { value: "outra", label: "Outra", logo: "" },
] as const;

export type BrandKey = (typeof BRANDS)[number]["value"];

export const BRAND_KEYS = BRANDS.map((brand) => brand.value) as [BrandKey, ...BrandKey[]];

export const OTHER_BRAND: BrandKey = "outra";

export function brandByKey(key: BrandKey): (typeof BRANDS)[number] {
  return BRANDS.find((brand) => brand.value === key) ?? BRANDS[0];
}

export function brandLabel(key: BrandKey): string {
  return brandByKey(key).label;
}
