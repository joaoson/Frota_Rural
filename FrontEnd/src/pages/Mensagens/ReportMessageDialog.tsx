import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX = 1000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  /** Trecho da mensagem denunciada, para o moderador e o usuário verem o alvo. */
  preview?: string | null;
}

export default function ReportMessageDialog({ open, onOpenChange, onConfirm, preview }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sem isto o motivo da denúncia anterior reaparece na próxima abertura.
  useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = () => {
    const texto = reason.trim();
    if (!texto || submitting) return;
    setSubmitting(true);
    onConfirm(texto);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* O DialogContent deste repo não traz padding/raio/borda: cada chamador
          aplica, igual ao diálogo de reprovação em pages/Admin/Anuncios.tsx. */}
      <DialogContent className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 shadow-xl">
        <DialogHeader>
          <DialogTitle className="font-headline font-bold text-on-surface flex items-center gap-2">
            <MaterialIcon icon="flag" size={20} className="text-error" />
            Denunciar mensagem
          </DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant pt-2">
            Conte o que houve. Nossa equipe de moderação vai analisar.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 text-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">
              Mensagem denunciada
            </div>
            <p className="text-on-surface line-clamp-3 break-words">{preview}</p>
          </div>
        ) : null}

        <div className="pt-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Motivo da denúncia
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={MAX}
            placeholder="Descreva o que houve (ex.: conteúdo ofensivo, ameaça, tentativa de golpe)…"
            className="mt-1.5 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline outline-none focus:border-primary resize-none"
          />
          <p className="mt-1 text-right text-[11px] text-on-surface-variant">
            {reason.length}/{MAX}
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-lg font-bold text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!reason.trim() || submitting}
            onClick={submit}
            className="px-4 py-2 rounded-lg font-bold text-sm bg-error text-on-error hover:opacity-90 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <MaterialIcon icon="hourglass_bottom" size={16} />
                Enviando…
              </>
            ) : (
              <>
                <MaterialIcon icon="flag" size={16} />
                Enviar denúncia
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
