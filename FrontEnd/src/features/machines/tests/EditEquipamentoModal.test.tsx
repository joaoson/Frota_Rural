import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditEquipamentoModal, { type EquipamentoData } from "@/components/EditEquipamentoModal";

afterEach(cleanup);

const machine: EquipamentoData = {
  id: "machine-a", registroRenagro: "BR1234567890", marca: "John Deere", modelo: "5075E",
  anoFabricacao: "2022", potenciaCv: "75", horimetro: "1000", finalidade: "Plantio", especificacoes: "Cabine",
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("editing a machine", () => {
  it("discards cancelled changes when reopening the same machine", () => {
    const props = { equipamento: machine, onSave: vi.fn(), onOpenChange: vi.fn() };
    const { rerender } = render(<EditEquipamentoModal {...props} open />);
    fireEvent.change(screen.getByLabelText("Horímetro (horas)"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    rerender(<EditEquipamentoModal {...props} open={false} />);
    rerender(<EditEquipamentoModal {...props} equipamento={{ ...machine, horimetro: "1200" }} open />);
    expect((screen.getByLabelText("Horímetro (horas)") as HTMLInputElement).value).toBe("1200");
  });

  it("waits for the server before closing and prevents duplicate saves", async () => {
    const pending = deferred();
    const onSave = vi.fn(() => pending.promise);
    const onOpenChange = vi.fn();
    render(<EditEquipamentoModal equipamento={machine} open onSave={onSave} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(onOpenChange).not.toHaveBeenCalled();
    const saving = screen.getByRole("button", { name: /Salvando/ }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    fireEvent.click(saving);
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the edited readings when saving fails and allows retry", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Network failure")).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<EditEquipamentoModal equipamento={machine} open onSave={onSave} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText("Horímetro (horas)"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível salvar"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Horímetro (horas)") as HTMLInputElement).value).toBe("2000");
    fireEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ horimetro: "2000" }));
  });
});
