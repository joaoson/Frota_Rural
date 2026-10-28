import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { REFUND_LABELS, type CancellationQuote, type RentalRefund } from "@/features/contracts/types/management";
import MaterialIcon from "@/components/MaterialIcon";
import type { MeterReadingKind, RentalMeter } from "@/features/contracts/types/rental";
import { canDo, isOpenRental, rentalPhaseBadge } from "@/features/contracts/types/rentalLifecycle";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StarRating } from "@/shared/components/StarRating";
import type { DashboardView } from "./DashboardCollection";

export interface RentalCardData {
  id: string;
  status: string | null;
  /** Fase e ações vindas do servidor; sem elas o cartão usa a regra antiga por status. */
  phase?: string | null;
  allowedActions?: string[];
  notes?: string;
  tipoCultura?: string | null;
  meter?: RentalMeter | null;
  refunds?: RentalRefund[];
  signatureDeadline?: Date | null;
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
  view?: DashboardView;
  counterparty: Counterparty;
  review: ReviewPanel;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onCancel?: (reason: string) => void;
  onPreviewCancellation?: () => Promise<CancellationQuote>;
  onAmend?: () => void;
  cancelling?: boolean;
  cancelLabel?: string;
  onScheduleRecurrence?: () => void;
  paymentAction?: React.ReactNode;
  recurrenceIndex?: number | null;
  /** Quando presente, "Analisar" vira link para a análise da locação. */
  analysisHref?: string;
  /** Locador: registra leitura do horímetro. Devolve true quando gravou. */
  onRecordReading?: (kind: MeterReadingKind, value: number, note: string) => Promise<boolean>;
  /** Locador: conclui a locação, com a leitura de devolução opcional. */
  onComplete?: (finalHourMeter?: number) => Promise<boolean>;
  meterBusy?: boolean;
}

const HOUR_METER_MAX = 60000;
const METER_NOTICE = "As leituras do horímetro são só acompanhamento de uso: não alteram o valor da locação.";

/** "" vira undefined; inteiro de 0 a 60.000 vira número; o resto é inválido (null). */
function parseReading(raw: string): number | undefined | null {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= HOUR_METER_MAX ? value : null;
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
  view = "grid",
  counterparty,
  review,
  detailsOpen,
  onToggleDetails,
  onCancel,
  onPreviewCancellation,
  onAmend,
  cancelling = false,
  cancelLabel = "Recusar",
  analysisHref,
  onScheduleRecurrence,
  paymentAction,
  recurrenceIndex,
  onRecordReading,
  onComplete,
  meterBusy = false,
}: RentalCardProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const previewCancellation = async () => {
    setConfirmCancel(true);
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(true);
    try { if (onPreviewCancellation) setQuote(await onPreviewCancellation()); }
    catch (error) { setQuoteError(error instanceof Error ? error.message : "Não foi possível consultar o estorno."); }
    finally { setQuoteLoading(false); }
  };
  const [meterForm, setMeterForm] = useState<MeterReadingKind | "complete" | null>(null);
  const [meterValue, setMeterValue] = useState("");
  const [meterNote, setMeterNote] = useState("");
  const [meterError, setMeterError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#locacao-${rental.id}`) {
      cardRef.current?.scrollIntoView?.({ block: "center" });
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [rental.id, hash]);
  const badge = rentalPhaseBadge(rental);
  const isOpenStage = isOpenRental(rental);
  const isClosedStage = !isOpenStage;
  const canCancel = canDo(rental, "cancel");
  const canReview = canDo(rental, "review");
  const meter = rental.meter ?? null;
  // A leitura de devolução na conclusão só cabe depois de uma retirada registrada.
  const askReadingOnComplete = Boolean(meter?.checkIn && !meter?.checkOut);

  const openMeterForm = (form: MeterReadingKind | "complete") => {
    setMeterForm(form);
    setMeterValue("");
    setMeterNote("");
    setMeterError(null);
  };

  const submitMeterForm = async () => {
    if (!meterForm) return;
    const value = parseReading(meterValue);
    if (value === null || (meterForm !== "complete" && value === undefined)) {
      setMeterError(`Informe a leitura em horas inteiras, de 0 a ${HOUR_METER_MAX.toLocaleString("pt-BR")}.`);
      return;
    }
    const done = meterForm === "complete"
      ? await onComplete?.(value)
      : await onRecordReading?.(meterForm, value as number, meterNote.trim());
    if (done) setMeterForm(null);
  };

  return (
    <div ref={cardRef} id={`locacao-${rental.id}`} tabIndex={-1} className="@container/rental scroll-mt-20 focus:outline-2 focus:outline-primary bg-surface-container-low rounded-2xl border border-outline-variant/30 relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
      <div className="absolute left-0 top-0 bottom-0 w-2 bg-secondary-container" />
      <div className="ml-2 p-4 sm:ml-4 sm:p-6">
        <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
          <StatusBadge config={badge} />
          <span className="text-sm font-bold text-outline">{rental.contract}</span>
        </div>

        <div className={`grid grid-cols-1 @sm/rental:grid-cols-2 ${view === "list" ? "@3xl/rental:grid-cols-4" : ""} gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 mb-4`}>
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
          <Field label="Cultura">
            <div className="font-bold text-on-surface text-sm">{rental.tipoCultura ?? "Não informada"}</div>
          </Field>
        </div>

        {rental.signatureDeadline && rental.phase === "aguardando_assinaturas" && <p className="mb-3 text-sm text-on-surface-variant">Assine até {rental.signatureDeadline.toLocaleString("pt-BR")}. Sem as duas assinaturas, a reserva será cancelada com estorno integral.</p>}
        {rental.refunds?.map(refund => <p key={refund.id} role="status" className="mb-3 rounded-lg bg-secondary-container/20 p-3 text-sm">{REFUND_LABELS[refund.status]}: {refund.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{refund.status === "failed" && ". O estorno continuará em acompanhamento; as datas já foram liberadas."}</p>)}
        {recurrenceIndex != null && <p className="mb-3 text-xs font-bold text-primary">Reserva recorrente · Ocorrência {recurrenceIndex}</p>}
        <div className="flex flex-wrap gap-2">
          {onScheduleRecurrence && <button type="button" onClick={onScheduleRecurrence} className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20"><MaterialIcon icon="event_repeat" size={14} /> Programar recorrência</button>}
          {paymentAction}
          {onAmend && canDo(rental, "amend") && <button type="button" onClick={onAmend} className="rounded-lg border border-primary/30 px-4 py-2 text-xs font-bold text-primary">Alterar datas</button>}
          {onRecordReading && canDo(rental, "record_check_in") && (
            <button type="button" onClick={() => openMeterForm("check_in")} className="flex items-center gap-1 rounded-lg border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/10">
              <MaterialIcon icon="speed" size={14} /> {meter?.checkIn ? "Corrigir leitura de retirada" : "Registrar retirada"}
            </button>
          )}
          {onRecordReading && canDo(rental, "record_check_out") && (
            <button type="button" onClick={() => openMeterForm("check_out")} className="flex items-center gap-1 rounded-lg border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/10">
              <MaterialIcon icon="speed" size={14} /> {meter?.checkOut ? "Corrigir leitura de devolução" : "Registrar devolução"}
            </button>
          )}
          {onComplete && canDo(rental, "complete") && (
            <button type="button" onClick={() => openMeterForm("complete")} className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:shadow-md">
              <MaterialIcon icon="task_alt" size={14} /> Concluir locação
            </button>
          )}
          {canCancel && onCancel && (
            <button type="button" onClick={() => void previewCancellation()} disabled={cancelling} className="px-4 border-2 border-error/50 text-error hover:bg-error-container/20 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50">
              {cancelLabel}
            </button>
          )}
          {canReview && review.alreadyReviewed && <span className="px-4 py-2 text-xs text-on-surface-variant">Avaliação enviada</span>}
          {canReview && !review.alreadyReviewed && (
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
            <div className="grid grid-cols-1 @sm/rental:grid-cols-2 gap-3 text-sm">
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
            {meter && (meter.checkIn || meter.checkOut) ? (
              <div className="grid grid-cols-1 @sm/rental:grid-cols-2 gap-3 text-sm">
                <DetailRow label="Horímetro">
                  <span className="text-on-surface font-bold">
                    Retirada {meter.checkIn ? `${meter.checkIn.value.toLocaleString("pt-BR")} h` : "—"} ·
                    Devolução {meter.checkOut ? `${meter.checkOut.value.toLocaleString("pt-BR")} h` : "—"}
                  </span>
                </DetailRow>
                {meter.hoursUsed !== null && (
                  <DetailRow label="Uso registrado">
                    <span className="text-on-surface font-bold">
                      {meter.hoursUsed.toLocaleString("pt-BR")} h
                      {meter.referenceHours ? ` (referência: ${meter.referenceHours} h)` : ""}
                    </span>{" "}
                    <span className="text-xs text-on-surface-variant">· informativo, não altera o valor</span>
                  </DetailRow>
                )}
              </div>
            ) : null}
            {rental.notes ? (
              <DetailRow label="Observações do locatário">
                <span className="text-on-surface whitespace-pre-line">{rental.notes}</span>
              </DetailRow>
            ) : null}
          </div>
        )}

        {meterForm && (
          <div role="group" aria-label={meterForm === "complete" ? "Concluir locação" : "Registrar leitura do horímetro"} className="mt-4 rounded-xl border border-primary/30 p-4 space-y-3">
            <p className="text-sm font-bold text-on-surface">
              {meterForm === "complete"
                ? "Concluir esta locação?"
                : meterForm === "check_in" ? "Leitura do horímetro na retirada" : "Leitura do horímetro na devolução"}
            </p>
            <p className="text-xs text-on-surface-variant">{METER_NOTICE}</p>
            {(meterForm !== "complete" || askReadingOnComplete) && (
              <label className="block text-xs font-bold text-outline">
                {meterForm === "complete" ? "Leitura de devolução (opcional, em horas)" : "Leitura (horas)"}
                <input type="number" inputMode="numeric" min={0} max={HOUR_METER_MAX} step={1} value={meterValue}
                  onChange={(event) => { setMeterValue(event.target.value); setMeterError(null); }} className={`${PANEL_INPUT} mt-1`} />
              </label>
            )}
            {meterForm !== "complete" && (
              <label className="block text-xs font-bold text-outline">
                Observação (opcional)
                <input type="text" maxLength={500} value={meterNote} onChange={(event) => setMeterNote(event.target.value)} className={`${PANEL_INPUT} mt-1`} />
              </label>
            )}
            {meterError && <p role="alert" className="text-xs text-error">{meterError}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={meterBusy} onClick={() => void submitMeterForm()} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-50">
                {meterBusy ? "Salvando..." : meterForm === "complete" ? "Confirmar conclusão" : "Salvar leitura"}
              </button>
              <button type="button" disabled={meterBusy} onClick={() => setMeterForm(null)} className="rounded-lg border px-4 py-2 text-sm">Voltar</button>
            </div>
          </div>
        )}

        {confirmCancel && canCancel && onCancel && (
          <div role="group" aria-label="Confirmar cancelamento da reserva" className="mt-4 rounded-xl border border-error/30 p-4 space-y-3">
            <p className="text-sm">Cancelar esta reserva? As datas serão liberadas para novas locações.</p>
            {quoteLoading && <p role="status">Consultando política e estorno...</p>}
            {quoteError && <div role="alert"><p className="text-error">{quoteError}</p><button type="button" onClick={() => void previewCancellation()}>Tentar novamente</button></div>}
            {quote && <div className="space-y-2 text-sm"><p>{quote.policyText}</p><p>Estorno previsto: <strong>{quote.refundAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></p><p>Valor retido: {quote.retainedAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{!quote.allowed && <p role="alert">O cancelamento não está disponível neste momento.</p>}</div>}
            <label className="block text-sm">Motivo do cancelamento (opcional)<textarea maxLength={1000} value={cancelReason} onChange={event => setCancelReason(event.target.value)} className={`${PANEL_INPUT} mt-1`} /></label>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={cancelling || quoteLoading || Boolean(onPreviewCancellation && !quote?.allowed)} onClick={() => onCancel(cancelReason.trim())} className="rounded-lg bg-error text-white px-4 py-2 text-sm disabled:opacity-50">{cancelling ? "Cancelando..." : "Confirmar cancelamento"}</button>
              <button type="button" disabled={cancelling} onClick={() => setConfirmCancel(false)} className="rounded-lg border px-4 py-2 text-sm">Manter reserva</button>
            </div>
          </div>
        )}

        {review.open && canReview && !review.alreadyReviewed && (
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
