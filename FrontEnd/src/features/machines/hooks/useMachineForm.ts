import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import { machineFormSchema, type MachineFormValues } from "../types/machineSchemas";

export const MACHINE_FORM_DEFAULTS: MachineFormValues = {
  renagroNumber: "",
  brandKey: "john-deere",
  otherBrand: "",
  model: "",
  year: "",
  usagePurpose: "Plantio",
  initialHorimeter: "",
  technicalSpecifications: "",
};

/**
 * Substitui os oito `useState` de campo e o `switch` de `validateField` da
 * versão anterior de NovoEquipamento. As regras passam a viver no schema zod,
 * num só lugar, reutilizável.
 */
export function useMachineForm(): UseFormReturn<MachineFormValues> {
  return useForm<MachineFormValues>({
    resolver: zodResolver(machineFormSchema),
    defaultValues: MACHINE_FORM_DEFAULTS,
    mode: "onBlur",
  });
}
