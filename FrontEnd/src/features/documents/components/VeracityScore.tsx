import MaterialIcon from "@/components/MaterialIcon";
import { StatusBadge } from "@/shared/components/StatusBadge";

import { veracityBand } from "../types/documentBadges";

interface VeracityScoreProps {
  /** 0 a 100, ou `null` quando o modelo não avaliou a CNH. */
  score: number | null;
  /** A CNH foi recusada pelo modelo, não por um administrador. */
  autoRejected: boolean;
}

/** Índice de veracidade da CNH para o administrador (nunca exibido ao dono do documento). */
export function VeracityScore({ score, autoRejected }: VeracityScoreProps) {
  const band = score === null ? null : veracityBand(score);

  return (
    <div className="mt-4 bg-surface-container-low rounded-xl p-4 border border-outline-variant/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MaterialIcon icon="fact_check" size={16} className="text-primary dark:text-primary-bright" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            Índice de Veracidade
          </span>
        </div>
        {band && <StatusBadge config={band.badge} dense />}
      </div>

      {score === null || band === null ? (
        <p className="mt-2 text-xs text-on-surface-variant">
          Esta CNH não foi avaliada pelo modelo (desligado, indisponível ou cadastro anterior a ele).
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-headline text-3xl font-bold text-on-surface">{score}</span>
            <span className="text-sm text-on-surface-variant">/ 100</span>
          </div>
          <div
            role="progressbar"
            aria-label="Índice de veracidade"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
          >
            <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${score}%` }} />
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">{band.hint}</p>
        </>
      )}

      {autoRejected && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-error">
          <MaterialIcon icon="block" size={14} />
          Recusada automaticamente pelo modelo. Sua decisão a substitui.
        </p>
      )}
    </div>
  );
}
