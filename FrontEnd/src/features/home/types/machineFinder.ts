import type { MachineApplication, SoilType } from "@/features/postings/types/recommendation";

export const applications: { value: MachineApplication; label: string }[] = [
  { value: "soil_preparation", label: "Preparo de solo" },
  { value: "planting", label: "Plantio e cultivo" },
  { value: "spraying", label: "Pulverização" },
  { value: "harvesting", label: "Colheita" },
];
export const soils: { value: SoilType; label: string }[] = [
  { value: "clay", label: "Argiloso" },
  { value: "sand", label: "Arenoso" },
  { value: "mixed", label: "Misto" },
  { value: "unknown", label: "Não sei informar" },
];
export const questions = [
  "Qual trabalho você precisa fazer?",
  "Como é o solo da sua área?",
  "Em qual região do Brasil você precisa da máquina?",
  "Em qual estado dessa região?",
  "Para quais dias você precisa dela?",
];

/** Use the visitor's calendar rather than converting a local day to UTC. */
export function tomorrowDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
