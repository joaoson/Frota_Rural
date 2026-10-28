import { describe, expect, it } from "vitest";
import { machineApiSchema, machineFormSchema, validateMachineEdit } from "../types/machineSchemas";
import { toCreatePayload, toDomain } from "../api/machineMapper";
import { MACHINE_FORM_DEFAULTS } from "../hooks/useMachineForm";

const values = { ...MACHINE_FORM_DEFAULTS, renagroNumber: "BR1234567890", model: "6110J" };

describe("machine pricing inputs", () => {
  it("preserves declared zero hours and distinguishes omitted readings", () => {
    const payload = toCreatePayload(machineFormSchema.parse({ ...values, powerCv: "110", hourMeter: "0" }), "owner");
    expect(payload).toMatchObject({ power_cv: 110, hour_meter: 0 });
    const machine = toDomain(machineApiSchema.parse({ ...payload, id: "machine" }));
    expect(machine).toMatchObject({ powerCv: 110, hourMeter: 0 });
    expect(toCreatePayload(values, "owner").hour_meter).toBeUndefined();
    expect(toDomain(machineApiSchema.parse({ id: "legacy", owner: "owner" })).hourMeter).toBeNull();
  });

  it.each([{ powerCv: "19" }, { powerCv: "701" }, { powerCv: "20.5" }, { hourMeter: "-1" }, { hourMeter: "60001" }, { hourMeter: "1.5" }])(
    "rejects invalid pricing inputs %j", (invalid) => {
      expect(machineFormSchema.safeParse({ ...values, ...invalid }).success).toBe(false);
    },
  );

  it("uses the same limits in editing and allows clearing both optional readings", () => {
    const edit = { registroRenagro: values.renagroNumber, marca: "John Deere", modelo: "6110J", anoFabricacao: "2019", potenciaCv: "", horimetro: "" };
    expect(validateMachineEdit(edit)).toEqual({});
    expect(validateMachineEdit({ ...edit, potenciaCv: "1", horimetro: "60001" })).toHaveProperty("potenciaCv");
    expect(validateMachineEdit({ ...edit, horimetro: "60001" })).toHaveProperty("horimetro");
  });
});
