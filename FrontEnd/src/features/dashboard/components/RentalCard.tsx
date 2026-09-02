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

interface ReschedulePanel {
  open: boolean;
  onToggle: () => void;
}

interface RentalCardProps {
  rental: RentalCardData;
  counterparty: Counterparty;
  review: ReviewPanel;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  reschedule?: ReschedulePanel;
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
  reschedule,
}: RentalCardProps) {
  const badge = rentalStatusBadge(rental.status);
  const isOpenStage = rental.status === "pending" || rental.status === "active";
  const isClosedStage = rental.status === "completed" || rental.status === "cancelled";

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
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

        <div className="flex flex-wrap gap-2">
          {rental.status === "pending" && (
            <button className="px-4 border-2 border-error/50 text-error hover:bg-error-container/20 py-2 rounded-lg font-bold text-xs transition-colors">
              Recusar
            </button>
          )}
          {isOpenStage && (
            <button
              onClick={reschedule?.onToggle}
              className="px-4 bg-transparent text-tertiary py-2 rounded-lg font-bold text-xs hover:bg-tertiary/10 transition-colors flex items-center gap-1 border border-tertiary/50"
            >
              <MaterialIcon icon="event_repeat" size={14} /> Reagendar
            </button>
          )}
          {rental.status === "completed" && (
            <button
              onClick={review.onToggle}
              className="px-4 bg-secondary-container/30 text-secondary py-2 rounded-lg font-bold text-xs hover:bg-secondary-container/50 transition-colors flex items-center gap-1"
            >
              <MaterialIcon icon="star" size={14} /> {review.buttonLabel}
            </button>
          )}
          {isOpenStage && (
            <button className="px-4 bg-primary/10 text-primary py-2 rounded-lg font-bold text-xs hover:bg-primary/20 transition-colors flex items-center gap-1 border border-primary/20">
              <MaterialIcon icon="analytics" size={14} /> Analisar
            </button>
          )}
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
                <span className="text-on-surface font-bold">{rental.contract}</span>
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

        {reschedule?.open && (
          <div className="mt-4 bg-secondary-fixed/20 border border-secondary-container/30 rounded-xl p-5 space-y-4 animate-in fade-in">
            <h4 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
              <MaterialIcon icon="event_repeat" size={16} className="text-secondary" /> Solicitar
              Reagendamento
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-outline">
                  Nova Data Início
                </label>
                <input type="date" className={PANEL_INPUT} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-outline">
                  Nova Data Fim
                </label>
                <input type="date" className={PANEL_INPUT} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-outline">
                Motivo
              </label>
              <textarea
                placeholder="Ex: Chuvas atrasaram o preparo..."
                rows={2}
                className={`${PANEL_INPUT} resize-none`}
              />
            </div>
            <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm">
              <MaterialIcon icon="send" size={16} /> Enviar Solicitação
            </button>
          </div>
        )}

        {review.open && (
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
