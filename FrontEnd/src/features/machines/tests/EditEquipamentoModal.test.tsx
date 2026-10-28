import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import EditEquipamentoModal, { type EquipamentoData } from "@/components/EditEquipamentoModal";
import { ConflictError } from "@/shared/http/errors";

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

describe("validating machine edits", () => {
  it.each([
    ["Nº Registro Renagro *", "registroRenagro", "BR12", /O registro Renagro deve conter BR/],
    ["Marca *", "marca", "", "Marca é obrigatória."],
    ["Modelo *", "modelo", "", "Modelo é obrigatório."],
    ["Ano de Fabricação", "anoFabricacao", "1970", /O ano deve ser entre 1980/],
    ["Potência (cv)", "potenciaCv", "5", "A potência deve ser um número inteiro entre 20 e 700 cv."],
    ["Horímetro (horas)", "horimetro", "-3", "O horímetro deve ser um número inteiro entre 0 e 60000 horas."],
  ] as const)("flags %s on blur and clears the error once fixed", async (label, field, invalid, message) => {
    const user = userEvent.setup();
    render(<EditEquipamentoModal equipamento={machine} open onSave={vi.fn()} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText(label);
    await user.clear(input);
    if (invalid) await user.type(input, invalid);
    await user.tab();
    expect(screen.getByText(message)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, machine[field]);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("refuses to save invalid data and saves a normalised registry with a custom purpose", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<EditEquipamentoModal equipamento={{ ...machine, finalidade: "Transporte" }} open onSave={onSave} onOpenChange={onOpenChange} />);
    expect(screen.getByRole("option", { name: "Transporte" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Modelo *"));
    await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Modelo *"), "6110J");
    await user.clear(screen.getByLabelText("Nº Registro Renagro *"));
    await user.type(screen.getByLabelText("Nº Registro Renagro *"), " br1234567890 ");
    await user.selectOptions(screen.getByLabelText("Finalidade de Uso"), "Colheita");
    await user.clear(screen.getByLabelText("Especificações Técnicas"));
    await user.type(screen.getByLabelText("Especificações Técnicas"), "Piloto automático");
    await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ registroRenagro: "BR1234567890", modelo: "6110J", finalidade: "Colheita", especificacoes: "Piloto automático" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("explains server refusals and lets the owner cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSave = vi.fn().mockRejectedValueOnce(new ConflictError("Registro Renagro já usado.")).mockRejectedValueOnce("boom");
    render(<EditEquipamentoModal equipamento={machine} open onSave={onSave} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(await screen.findByText("Registro Renagro já usado.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(await screen.findByText("Não foi possível salvar o equipamento. Tente novamente.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
