import type { FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HttpError } from "@/shared/http/errors";
import { RentalPaymentButton } from "@/features/payments/components/RentalPaymentButton";
import { useRentalRecurrence } from "../hooks/useRentalRecurrence";
import { rentalMachineName, type Rental } from "../types/rental";
import type { RecurrenceFrequency } from "../types/recurrence";

const inputClass = "mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface focus:ring-2 focus:ring-primary disabled:opacity-50";
const currency = (value: string | number | null) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: string | Date | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Data indisponível";
const fieldLabels: Record<string, string> = { first_start_date: "Primeira data futura", frequency: "Frequência", occurrences: "Quantidade de novas reservas" };

function tomorrow() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function duration(rental: Rental) {
  if (!rental.startDate || !rental.endDate) return "Mesma duração da locação original";
  const hours = (rental.endDate.getTime() - rental.startDate.getTime()) / 3_600_000;
  const days = Math.floor(hours / 24);
  const remainder = Number((hours % 24).toFixed(2));
  return [days > 0 && `${days} ${days === 1 ? "dia" : "dias"}`, remainder > 0 && `${remainder.toLocaleString("pt-BR")} horas`].filter(Boolean).join(" e ");
}

function ErrorMessage({ error }: { error: Error }) {
  const messages = error instanceof HttpError && (error.hasFieldErrors || error.nonFieldErrors.length > 0)
    ? [...Object.entries(error.fieldErrors).flatMap(([field, errors]) => errors.map((message) => `${fieldLabels[field] ? `${fieldLabels[field]}: ` : ""}${message}`)), ...error.nonFieldErrors]
    : [error instanceof HttpError ? error.message : "Não foi possível concluir. Confira sua conexão e tente novamente."];
  return <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">{messages.map((message, index) => <p key={index}>{message}</p>)}</div>;
}

export function RentalRecurrenceDialog({ source, open, onOpenChange }: { source: Rental; open: boolean; onOpenChange: (open: boolean) => void }) {
  const recurrence = useRentalRecurrence(source.id);
  const { input, updateInput, preview, created, error, previewing, creating } = recurrence;
  const valid = input.first_start_date >= tomorrow() && Number.isInteger(input.occurrences) && input.occurrences >= 2 && input.occurrences <= 12;
  const setOpen = (next: boolean) => { if (!creating) onOpenChange(next); };

  function submitPreview(event: FormEvent) {
    event.preventDefault();
    if (valid && !previewing) void recurrence.requestPreview();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl p-6 sm:p-8">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-primary">{created ? "Recorrência programada" : "Programar recorrência"}</DialogTitle>
          <DialogDescription>Reutilize os dados desta locação para reservar o maquinário em novas ocasiões.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          <dl className="grid grid-cols-1 gap-3 rounded-xl bg-surface-container-low p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-on-surface-variant">Maquinário</dt><dd className="font-bold">{rentalMachineName(source)}</dd></div>
            <div><dt className="text-on-surface-variant">Duração de cada reserva</dt><dd className="font-bold">{duration(source)}</dd></div>
            <div><dt className="text-on-surface-variant">Operador</dt><dd className="font-bold">{source.operatorId ? "Mesmo operador da locação original" : "Sem operador vinculado"}</dd></div>
            <div><dt className="text-on-surface-variant">Locação original</dt><dd>{dateTime(source.startDate)} a {dateTime(source.endDate)}</dd></div>
          </dl>

          {created ? (
            <div className="space-y-4" aria-live="polite">
              <p className="font-bold text-primary">{created.occurrences} novas reservas criadas.</p>
              <p className="text-sm text-on-surface-variant">Cada reserva deve ser paga separadamente. Nenhuma cobrança foi feita ao programar a recorrência. Você também pode pagar em Minhas Locações.</p>
              <p className="rounded-xl bg-secondary-container/20 p-4 text-sm">As reservas ficam provisoriamente disponíveis por 30 minutos após a criação. Conclua o pagamento de cada reserva nesse prazo para confirmá-la.{created.reservation_expires_at && ` Prazo: ${dateTime(created.reservation_expires_at)}.`}</p>
              <ol aria-label="Reservas criadas" className="space-y-3">
                {created.rentals.map((rental, index) => (
                  <li key={rental.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/30 p-4">
                    <div><p className="text-sm font-bold">Reserva {index + 1}: {dateTime(rental.startDate)} a {dateTime(rental.endDate)}</p><p className="text-sm">{currency(rental.totalPrice)}</p></div>
                    {(rental.status === "pending" || rental.status === "awaiting_payment") && <RentalPaymentButton rentalId={rental.id} />}
                  </li>
                ))}
              </ol>
              <p className="font-bold">Total das reservas: {currency(created.total_price)}</p>
              <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg bg-primary p-3 font-bold text-on-primary">Voltar às locações</button>
              <button type="button" onClick={recurrence.startAnother} className="w-full rounded-lg border border-primary p-3 text-sm font-bold text-primary">Programar outras datas</button>
            </div>
          ) : (
            <>
              <form onSubmit={submitPreview} className="space-y-4">
                <div>
                  <label htmlFor="recurrence-first-date" className="text-sm font-bold">Primeira data futura</label>
                  <input id="recurrence-first-date" type="date" required min={tomorrow()} value={input.first_start_date} disabled={creating}
                    onChange={(event) => updateInput({ ...input, first_start_date: event.target.value })} className={inputClass} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="recurrence-frequency" className="text-sm font-bold">Frequência</label>
                    <select id="recurrence-frequency" value={input.frequency} disabled={creating} onChange={(event) => updateInput({ ...input, frequency: event.target.value as RecurrenceFrequency })} className={inputClass}>
                      <option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="recurrence-count" className="text-sm font-bold">Quantidade de novas reservas</label>
                    <input id="recurrence-count" type="number" min="2" max="12" step="1" required value={input.occurrences || ""} disabled={creating} aria-describedby="recurrence-count-help"
                      onChange={(event) => updateInput({ ...input, occurrences: Number(event.target.value) })} className={inputClass} />
                  </div>
                </div>
                <p id="recurrence-count-help" className="text-sm text-on-surface-variant">De 2 a 12 reservas futuras. A locação original não entra na quantidade e permanece como está.</p>
                {input.frequency === "monthly" && <p className="text-sm text-on-surface-variant">Nos meses sem o dia escolhido, a reserva começa no último dia do mês. Confira as datas na prévia.</p>}
                <button type="submit" disabled={!valid || previewing || creating} className="w-full rounded-lg border border-primary p-3 font-bold text-primary disabled:opacity-50">{previewing ? "Consultando disponibilidade..." : "Consultar datas e valores"}</button>
              </form>

              {error && <ErrorMessage error={error} />}
              {preview && (
                <section aria-label="Prévia da recorrência" className="space-y-4" aria-live="polite">
                  <h3 className="font-bold">Datas e valores atuais</h3>
                  <ol className="space-y-2">{preview.dates.map((date, index) => <li key={date.start_date} className="rounded-lg bg-surface-container-low p-3 text-sm"><span className="font-bold">Reserva {index + 1}:</span> {dateTime(date.start_date)} a {dateTime(date.end_date)} <span className="block font-bold text-primary">{currency(date.total_price)}</span></li>)}</ol>
                  <p className="font-bold">Total das reservas: {currency(preview.total_price)}</p>
                  <p className="text-sm text-on-surface-variant">A disponibilidade será verificada novamente ao criar. Os valores usam os preços atuais; o aluguel original não será alterado.</p>
                  <p className="rounded-xl bg-secondary-container/20 p-4 text-sm">Cada reserva exige um pagamento separado. Ao criar, as datas ficam reservadas provisoriamente por 30 minutos. Nenhuma cobrança é automática.</p>
                  <button type="button" onClick={() => void recurrence.create()} disabled={creating} className="w-full rounded-lg bg-primary p-3 font-bold text-on-primary disabled:opacity-50">{creating ? "Criando reservas..." : `Criar ${input.occurrences} reservas`}</button>
                </section>
              )}
              <button type="button" onClick={() => setOpen(false)} disabled={creating} className="w-full rounded-lg p-3 text-sm font-bold text-on-surface-variant disabled:opacity-50">Cancelar</button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
