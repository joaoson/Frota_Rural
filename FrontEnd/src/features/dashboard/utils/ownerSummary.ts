export const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const matchesSearch = (query: string, ...values: unknown[]) => values.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
export const yearOptions = (years: (number | null | undefined)[]) => ["Todos", ...[...new Set(years.filter((year): year is number => year != null))].sort((a, b) => b - a).map(String)];
