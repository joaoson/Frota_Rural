import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";

export interface EquipamentoData {
  id: string;
  registroRenagro: string;
  marca: string;
  modelo: string;
  anoFabricacao: string;
  finalidade: string;
  horimetroInicial: string;
  horimetroFinal: string;
  especificacoes: string;
}

interface EditEquipamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamento: EquipamentoData;
  onSave: (data: EquipamentoData) => void;
}

const inputClass =
  "w-full bg-surface-container border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow";

const labelClass =
  "text-[10px] font-bold uppercase tracking-widest text-outline";

const EditEquipamentoModal = ({
  open,
  onOpenChange,
  equipamento,
  onSave,
}: EditEquipamentoModalProps) => {
  const [form, setForm] = useState<EquipamentoData>(equipamento);

  useEffect(() => {
    if (open) setForm(equipamento);
  }, [equipamento, open]);

  const handleChange = (field: keyof EquipamentoData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-container-lowest border-outline-variant/30 rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon="edit" size={20} className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-headline text-xl font-bold text-primary">
                Editar Equipamento
              </DialogTitle>
              <DialogDescription className="text-on-surface-variant text-xs mt-0.5">
                Atualize as informações do seu maquinário
              </DialogDescription>
            </div>
          </div>
          <div className="h-1 w-12 bg-secondary-container mt-3" />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 pb-8 pt-6 space-y-6">
          {/* Renagro */}
          <div className="space-y-1.5">
            <label className={labelClass}>Nº Registro Renagro *</label>
            <input
              type="text"
              value={form.registroRenagro}
              onChange={(e) => handleChange("registroRenagro", e.target.value)}
              className={inputClass}
              placeholder="BR1029304899"
            />
            <p className="text-[11px] text-outline font-medium">
              Requisito para formalização do contrato na plataforma.
            </p>
          </div>

          {/* Marca / Modelo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Marca *</label>
              <input
                type="text"
                value={form.marca}
                onChange={(e) => handleChange("marca", e.target.value)}
                className={inputClass}
                placeholder="John Deere"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Modelo *</label>
              <input
                type="text"
                value={form.modelo}
                onChange={(e) => handleChange("modelo", e.target.value)}
                className={inputClass}
                placeholder="S700"
              />
            </div>
          </div>

          {/* Ano / Finalidade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Ano de Fabricação</label>
              <input
                type="number"
                value={form.anoFabricacao}
                onChange={(e) => handleChange("anoFabricacao", e.target.value)}
                className={inputClass}
                placeholder="2022"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Finalidade de Uso</label>
              <select
                value={form.finalidade}
                onChange={(e) => handleChange("finalidade", e.target.value)}
                className={inputClass}
              >
                <option>Plantio</option>
                <option>Pulverização</option>
                <option>Colheita</option>
                <option>Preparo de Solo</option>
              </select>
            </div>
          </div>

          {/* Horímetros */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={`${labelClass} flex items-center gap-1`}>
                <MaterialIcon icon="speed" size={14} /> Horím. Inicial
              </label>
              <input
                type="number"
                value={form.horimetroInicial}
                onChange={(e) => handleChange("horimetroInicial", e.target.value)}
                className={inputClass}
                placeholder="1250 h"
              />
            </div>
            <div className="space-y-1.5">
              <label className={`${labelClass} flex items-center gap-1`}>
                <MaterialIcon icon="speed" size={14} /> Horím. Final
              </label>
              <input
                type="number"
                value={form.horimetroFinal}
                onChange={(e) => handleChange("horimetroFinal", e.target.value)}
                className={inputClass}
                placeholder="1300 h"
              />
            </div>
          </div>

          {/* Especificações */}
          <div className="space-y-1.5">
            <label className={labelClass}>Especificações Técnicas</label>
            <textarea
              value={form.especificacoes}
              onChange={(e) => handleChange("especificacoes", e.target.value)}
              rows={3}
              className={inputClass}
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
