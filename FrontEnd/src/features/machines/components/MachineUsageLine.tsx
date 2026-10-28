import { useMachineUsage } from "@/features/contracts/hooks/useContracts";

/**
 * Uso registrado pelo horímetro nas locações concluídas da máquina.
 * Informativo: não entra em preço nem em sugestão de tarifa.
 */
export function MachineUsageLine({ machineId }: { machineId: string }) {
  const { data } = useMachineUsage(machineId);
  if (!data || data.completedRentals === 0) return null;
  const average = data.averageHoursPerDay === null
    ? "sem leituras de horímetro"
    : `${data.averageHoursPerDay.toLocaleString("pt-BR")} h por diária (referência ${data.referenceHoursPerDay} h)`;
  return (
    <p className="text-xs text-on-surface-variant mt-1" data-testid="machine-usage">
      Uso: {data.completedRentals} {data.completedRentals === 1 ? "locação concluída" : "locações concluídas"},{" "}
      {data.days} {data.days === 1 ? "diária" : "diárias"} · {average}
    </p>
  );
}
