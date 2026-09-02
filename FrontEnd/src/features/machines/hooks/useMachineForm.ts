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

export function useMachineForm(): UseFormReturn<MachineFormValues> {
  return useForm<MachineFormValues>({
    resolver: zodResolver(machineFormSchema),
    defaultValues: MACHINE_FORM_DEFAULTS,
    mode: "onBlur",
  });
}
