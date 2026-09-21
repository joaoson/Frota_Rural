import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import MaterialIcon from "@/components/MaterialIcon";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StarRating } from "@/shared/components/StarRating";

export interface RentalCardData {
  id: string;
  status: string | null;
  contract: string | null;
  machine: string;
  period: string;
  total: string;
}

interface Counterparty {
  label: string;
  name: string;
  icon: string;
  className: string;
}

interface ReviewPanel {
  alreadyReviewed?: boolean;
  buttonLabel: string;
  title: string;
  prompt: string;
  open: boolean;
  onToggle: () => void;
  rating: number;
  onRatingChange: (rating: number) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

interface RentalCardProps {
  rental: RentalCardData;
  counterparty: Counterparty;
  review: ReviewPanel;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
  cancelLabel?: string;
  onScheduleRecurrence?: () => void;
  paymentAction?: React.ReactNode;
  recurrenceIndex?: number | null;
  /** Quando presente, "Analisar" vira link para a análise da locação. */
  analysisHref?: string;
}

const PANEL_INPUT =
  "w-full bg-surface-container-lowest border-none rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary text-on-surface shadow-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-outline text-xs font-bold uppercase">{label}:</span>{" "}
      {children}
    </div>
  );
}

export function RentalCard({
  rental,
  counterparty,
  review,
  detailsOpen,
  onToggleDetails,
  onCancel,
  cancelling = false,
  cancelLabel = "Recusar",
  analysisHref,
  onScheduleRecurrence,
  paymentAction,
  recurrenceIndex,
}: RentalCardProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#locacao-${rental.id}`) {
      cardRef.current?.scrollIntoView?.({ block: "center" });
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [rental.id, hash]);
  const badge = rentalStatusBadge(rental.status);
  const isOpenStage = ["pending", "awaiting_payment", "active", "signed", "validating"].includes(rental.status ?? "");
  const isClosedStage = rental.status === "completed" || rental.status === "cancelled" || rental.status === "closed";

  return (
    <div ref={cardRef} id={`locacao-${rental.id}`} tabIndex={-1} className="scroll-mt-20 focus:outline-2 focus:outline-primary bg-surface-container-low rounded-2xl border border-outline-variant/30 relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
      <div className="absolute left-0 top-0 bottom-0 w-2 bg-secondary-container" />
      <div className="ml-4 p-6">
        <div className="flex justify-between items-start mb-4">
          <StatusBadge config={badge} />
          <span className="text-sm font-bold text-outline">{rental.contract}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 mb-4">
          <Field label={counterparty.label}>
            <div className={`font-bold text-sm flex items-center gap-1 ${counterparty.className}`}>
              <MaterialIcon icon={counterparty.icon} size={14} /> {counterparty.name}
            </div>
          </Field>
          <Field label="Maquinário">
            <div className="font-bold text-on-surface text-sm">{rental.machine}</div>
          </Field>
          <Field label="Período">
            <div className="font-bold text-primary text-sm">{rental.period}</div>
          </Field>
          <Field label="Valor">
            <div className="font-black text-primary text-lg">{rental.total}</div>
          </Field>
        </div>

        {recurrenceIndex != null && <p className="mb-3 text-xs font-bold text-primary">Reserva recorrente · Ocorrência {recurrenceIndex}</p>}
        <div className="flex flex-wrap gap-2">
          {onScheduleRecurrence && <button type="button" onClick={onScheduleRecurrence} className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20"><MaterialIcon icon="event_repeat" size={14} /> Programar recorrência</button>}
          {paymentAction}
          {rental.status === "pending" && onCancel && (
            <button type="button" onClick={() => setConfirmCancel(true)} disabled={cancelling} className="px-4 border-2 border-error/50 text-error hover:bg-error-container/20 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50">
              {cancelLabel}
            </button>
          )}
          {rental.status === "completed" && review.alreadyReviewed && <span className="px-4 py-2 text-xs text-on-surface-variant">Avaliação enviada</span>}
          {rental.status === "completed" && !review.alreadyReviewed && (
            <button
              onClick={review.onToggle}
              className="px-4 bg-secondary-container/30 text-secondary py-2 rounded-lg font-bold text-xs hover:bg-secondary-container/50 transition-colors flex items-center gap-1"
            >
              <MaterialIcon icon="star" size={14} /> {review.buttonLabel}
            </button>
          )}
          {isOpenStage &&
            (analysisHref ? (
              <Link
                to={analysisHref}
                className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20"
              >
                <MaterialIcon icon="analytics" size={14} /> Analisar
              </Link>
            ) : (
              <button onClick={onToggleDetails} className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20">
                <MaterialIcon icon="analytics" size={14} /> Analisar
              </button>
            ))}
          {isClosedStage && (
            <button
              onClick={onToggleDetails}
              className="px-4 bg-surface-container-high text-on-surface-variant py-2 rounded-lg font-bold text-xs hover:bg-outline-variant/30 transition-colors flex items-center gap-1"
            >
              <MaterialIcon icon="visibility" size={14} /> Ver Detalhes
            </button>
          )}
        </div>

        {detailsOpen && (
          <div className="mt-4 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 space-y-3 animate-in fade-in">
            <h4 className="font-headline font-bold text-on-surface text-sm">
              Detalhes da Locação
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailRow label="Contrato">
                <span className="text-on-surface font-bold">{rental.contract ?? "Ainda não disponível"}</span>
              </DetailRow>
              <DetailRow label={counterparty.label}>
                <span className="text-on-surface font-bold">{counterparty.name}</span>
              </DetailRow>
              <DetailRow label="Maquinário">
                <span className="text-on-surface font-bold">{rental.machine}</span>
              </DetailRow>
              <DetailRow label="Período">
                <span className="text-on-surface font-bold">{rental.period}</span>
              </DetailRow>
              <DetailRow label="Valor Total">
                <span className="text-primary font-black">{rental.total}</span>
              </DetailRow>
              <DetailRow label="Status">
                <span className="text-on-surface font-bold">{badge.label}</span>
              </DetailRow>
            </div>
          </div>
        )}

        {confirmCancel && rental.status === "pending" && onCancel && (
          <div role="group" aria-label="Confirmar cancelamento da reserva" className="mt-4 rounded-xl border border-error/30 p-4 space-y-3">
            <p className="text-sm">Cancelar esta reserva? As datas serão liberadas para novas locações.</p>
            <div className="flex gap-3">
              <button type="button" disabled={cancelling} onClick={onCancel} className="rounded-lg bg-error text-white px-4 py-2 text-sm disabled:opacity-50">{cancelling ? "Cancelando..." : "Confirmar cancelamento"}</button>
              <button type="button" disabled={cancelling} onClick={() => setConfirmCancel(false)} className="rounded-lg border px-4 py-2 text-sm">Manter reserva</button>
            </div>
          </div>
        )}

        {review.open && rental.status === "completed" && !review.alreadyReviewed && (
          <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
            <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
              <MaterialIcon icon="star" size={16} className="text-secondary" /> {review.title}
            </h4>
            <p className="text-sm text-on-surface-variant">{review.prompt}</p>
            <StarRating value={review.rating} onChange={review.onRatingChange} className="gap-2" />
            <textarea
              placeholder="Conte como foi a experiência..."
              rows={2}
              value={review.comment}
              onChange={(event) => review.onCommentChange(event.target.value)}
              className={`${PANEL_INPUT} resize-none`}
            />
            <button
              onClick={review.onSubmit}
              disabled={review.submitting}
              className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all text-sm disabled:opacity-50"
            >
              {review.submitting ? "Enviando..." : "Enviar Avaliação"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
