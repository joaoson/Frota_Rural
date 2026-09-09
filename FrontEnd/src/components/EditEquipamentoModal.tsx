import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import { validateMachineEdit } from "@/features/machines/types/machineSchemas";

/**
 * Campos editáveis de uma máquina. O horímetro acumulado entra na sugestão
 * de preço; as leituras inicial/final de Rentals medem apenas uma locação.
 */
export interface EquipamentoData {
  id: string;
  registroRenagro: string;
  marca: string;
  modelo: string;
  anoFabricacao: string;
  potenciaCv: string;
  horimetro: string;
  finalidade: string;
  especificacoes: string;
}

interface EditEquipamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamento: EquipamentoData;
  onSave: (data: EquipamentoData) => void;
}

const labelClass =
  "text-[10px] font-bold uppercase tracking-widest text-outline";

const EditEquipamentoModal = ({
  open,
  onOpenChange,
  equipamento,
  onSave,
}: EditEquipamentoModalProps) => {
  const [form, setForm] = useState<EquipamentoData>(equipamento);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Recarrega o formulário quando o modal abre com outro equipamento.
  // Sincronizar no render evita o setState-dentro-de-efeito.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && loadedFor !== equipamento.id) {
    setLoadedFor(equipamento.id);
    setForm(equipamento);
    setErrors({});
  }

  const validateField = (fieldName: keyof EquipamentoData, value: string): string => {
    const message = validateMachineEdit({ ...form, [fieldName]: value })[fieldName] ?? "";
    setErrors((prev) => ({ ...prev, [fieldName]: message }));
    return message;
  };

  const handleChange = (field: keyof EquipamentoData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      validateField(field, value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const found = validateMachineEdit(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // O Renagro é UNIQUE no banco: sem normalizar, "br..." e "BR..." viram
    // dois registros distintos para a mesma máquina.
    onSave({ ...form, registroRenagro: form.registroRenagro.trim().toUpperCase() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-container-lowest border-outline-variant/30 rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon="edit" size={20} className="text-primary dark:text-primary-bright" />
            </div>
            <div>
              <DialogTitle className="font-headline text-xl font-bold text-primary dark:text-primary-bright">
                Editar Equipamento
              </DialogTitle>
              <DialogDescription className="text-on-surface-variant text-xs mt-0.5">
                Atualize as informações do seu maquinário
              </DialogDescription>
            </div>
          </div>
          <div className="h-1 w-12 bg-secondary-container mt-3" />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 pb-8 pt-6 space-y-6" noValidate>
          {/* Renagro */}
          <div className="space-y-1.5">
            <label htmlFor="no-registro-renagro" className={labelClass}>Nº Registro Renagro *</label>
            <input id="no-registro-renagro"
              type="text"
              value={form.registroRenagro}
              onChange={(e) => handleChange("registroRenagro", e.target.value)}
              onBlur={(e) => validateField("registroRenagro", e.target.value)}
              className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.registroRenagro ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
              placeholder="BR1029304899"
            />
            {errors.registroRenagro ? (
              <p className="text-[11px] text-error font-medium mt-1">{errors.registroRenagro}</p>
            ) : (
              <p className="text-[11px] text-outline font-medium">
                Requisito para formalização do contrato na plataforma.
              </p>
            )}
          </div>

          {/* Marca / Modelo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="marca" className={labelClass}>Marca *</label>
              <input id="marca"
                type="text"
                value={form.marca}
                onChange={(e) => handleChange("marca", e.target.value)}
                onBlur={(e) => validateField("marca", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.marca ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                placeholder="John Deere"
              />
              {errors.marca && <p className="text-[11px] text-error font-medium mt-1">{errors.marca}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="modelo" className={labelClass}>Modelo *</label>
              <input id="modelo"
                type="text"
                value={form.modelo}
                onChange={(e) => handleChange("modelo", e.target.value)}
                onBlur={(e) => validateField("modelo", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.modelo ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                placeholder="S700"
              />
              {errors.modelo && <p className="text-[11px] text-error font-medium mt-1">{errors.modelo}</p>}
            </div>
          </div>

          {/* Ano / Finalidade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="ano-de-fabricacao" className={labelClass}>Ano de Fabricação</label>
              <input id="ano-de-fabricacao"
                type="number"
                value={form.anoFabricacao}
                onChange={(e) => handleChange("anoFabricacao", e.target.value)}
                onBlur={(e) => validateField("anoFabricacao", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.anoFabricacao ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                placeholder="2022"
              />
              {errors.anoFabricacao && <p className="text-[11px] text-error font-medium mt-1">{errors.anoFabricacao}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="finalidade-de-uso" className={labelClass}>Finalidade de Uso</label>
              <select id="finalidade-de-uso"
                value={form.finalidade}
                onChange={(e) => handleChange("finalidade", e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              >
                <option>Plantio</option>
                <option>Pulverização</option>
                <option>Colheita</option>
                <option>Preparo de Solo</option>
              </select>
            </div>
          </div>

          {/* Potência / Horímetro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="potencia-cv" className={labelClass}>Potência (cv)</label>
              <input id="potencia-cv"
                type="number"
                min={20}
                max={700}
                step={1}
                value={form.potenciaCv}
                onChange={(e) => handleChange("potenciaCv", e.target.value)}
                onBlur={(e) => validateField("potenciaCv", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.potenciaCv ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                placeholder="110"
              />
              {errors.potenciaCv && <p className="text-[11px] text-error font-medium mt-1">{errors.potenciaCv}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="horimetro" className={labelClass}>Horímetro (horas)</label>
              <input id="horimetro"
                type="number"
                min={0}
                max={60000}
                step={1}
                value={form.horimetro}
                onChange={(e) => handleChange("horimetro", e.target.value)}
                onBlur={(e) => validateField("horimetro", e.target.value)}
                className={`w-full bg-surface-container border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.horimetro ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                placeholder="4900"
              />
              {errors.horimetro ? (
                <p className="text-[11px] text-error font-medium mt-1">{errors.horimetro}</p>
              ) : (
                <p className="text-[11px] text-outline font-medium">Mantenha atualizado: entra no cálculo do valor sugerido.</p>
              )}
            </div>
          </div>

          {/* Especificações */}
          <div className="space-y-1.5">
            <label htmlFor="especificacoes-tecnicas" className={labelClass}>Especificações Técnicas</label>
            <textarea id="especificacoes-tecnicas"
              value={form.especificacoes}
              onChange={(e) => handleChange("especificacoes", e.target.value)}
              rows={3}
              className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              placeholder="Motor, plataforma, recursos adicionais..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 border border-outline-variant/40 text-on-surface font-semibold py-3 rounded-lg hover:bg-surface-container transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
            >
              <MaterialIcon icon="save" size={18} /> Salvar Alterações
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditEquipamentoModal;
