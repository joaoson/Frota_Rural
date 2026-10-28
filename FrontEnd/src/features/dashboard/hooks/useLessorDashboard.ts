import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { dashboardStore } from "@/app/container";

import type { LessorDashboardFilter } from "../types/lessorDashboard";

/** Fuso do navegador, para que os meses do painel sigam o calendário de quem consulta. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

/** Mantém os gráficos anteriores enquanto um novo período ou máquina é carregado. */
export function useLessorDashboard(filter: LessorDashboardFilter, enabled: boolean) {
  return useQuery({ ...dashboardStore.lessorSummaryOptions(filter), enabled, placeholderData: keepPreviousData });
}
