export const brazilRegions = [
  { value: "north", label: "Norte", states: [
    { code: "AC", name: "Acre" }, { code: "AP", name: "Amapá" },
    { code: "AM", name: "Amazonas" }, { code: "PA", name: "Pará" },
    { code: "RO", name: "Rondônia" }, { code: "RR", name: "Roraima" },
    { code: "TO", name: "Tocantins" },
  ] },
  { value: "northeast", label: "Nordeste", states: [
    { code: "AL", name: "Alagoas" }, { code: "BA", name: "Bahia" },
    { code: "CE", name: "Ceará" }, { code: "MA", name: "Maranhão" },
    { code: "PB", name: "Paraíba" }, { code: "PE", name: "Pernambuco" },
    { code: "PI", name: "Piauí" }, { code: "RN", name: "Rio Grande do Norte" },
    { code: "SE", name: "Sergipe" },
  ] },
  { value: "central_west", label: "Centro-Oeste", states: [
    { code: "DF", name: "Distrito Federal" }, { code: "GO", name: "Goiás" },
    { code: "MT", name: "Mato Grosso" }, { code: "MS", name: "Mato Grosso do Sul" },
  ] },
  { value: "southeast", label: "Sudeste", states: [
    { code: "ES", name: "Espírito Santo" }, { code: "MG", name: "Minas Gerais" },
    { code: "RJ", name: "Rio de Janeiro" }, { code: "SP", name: "São Paulo" },
  ] },
  { value: "south", label: "Sul", states: [
    { code: "PR", name: "Paraná" }, { code: "RS", name: "Rio Grande do Sul" },
    { code: "SC", name: "Santa Catarina" },
  ] },
] as const;

export type BrazilianRegion = typeof brazilRegions[number]["value"];
export type BrazilianState = typeof brazilRegions[number]["states"][number]["code"];
