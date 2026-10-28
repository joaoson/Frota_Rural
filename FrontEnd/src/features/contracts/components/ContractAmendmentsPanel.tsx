import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { contractStore } from "@/app/container";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HttpError } from "@/shared/http/errors";
import { useContractDocument } from "../hooks/useContracts";
import type { ContratoData } from "../types/contractDocument";
import type { AmendmentDecision, AmendmentInput, ContractAmendment } from "../types/management";

const inputClass = "mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm";
const dateTime = (value: Date | string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const labels: Record<ContractAmendment["status"], string> = { pending: "Aguardando resposta", accepted: "Aceita", rejected: "Recusada", withdrawn: "Retirada", expired: "Expirada" };

/** Troca somente a data local, preservando o horário contratado. */
function replaceDate(original: string, day: string): string {
  const value = new Date(original);
  const [year, month, date] = day.split("-").map(Number);
  value.setFullYear(year, month - 1, date);
  return value.toISOString();
}

function ErrorMessage({ error }: { error: Error }) {
  const messages = error instanceof HttpError && (error.hasFieldErrors || error.nonFieldErrors.length)
    ? [...Object.values(error.fieldErrors).flat(), ...error.nonFieldErrors] : [error.message];
  return <div role="alert" className="rounded-lg bg-error/10 p-3 text-sm text-error">{messages.map((message, index) => <p key={index}>{message}</p>)}</div>;
}

export function ContractAmendmentsPanel({ contractId, actorId, document }: { contractId: string; actorId: string | null; document: ContratoData }) {
  const list = useQuery(contractStore.amendmentsOptions(contractId));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const proposal = useMutation({ mutationFn: (input: AmendmentInput) => contractStore.proposeAmendment(contractId, input), onSuccess: () => { setStart(""); setEnd(""); setReason(""); } });
  const decision = useMutation({ mutationFn: ({ id, action }: { id: string; action: AmendmentDecision }) => contractStore.decideAmendment(contractId, id, action) });
  const busy = proposal.isPending || decision.isPending;
  const pending = list.data?.some(item => item.status === "pending");
  const canPropose = document.gestao?.allowed_actions.includes("amend") && document.revisao && !pending && list.isSuccess;
  const error = list.error ?? proposal.error ?? decision.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!document.revisao || !document.gestao || !canPropose || busy) return;
    proposal.mutate({ baseRevision: document.revisao.id, proposedStart: replaceDate(document.gestao.start_date, start), proposedEnd: replaceDate(document.gestao.end_date, end), reason: reason.trim() });
  }

  return <section aria-label="Alterações de datas" className="space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 text-on-surface">
    <h2 className="text-lg font-bold">Alterações de datas</h2>
    <p className="text-sm">A troca mantém a quantidade de diárias e o preço pago. As datas atuais valem até a outra parte aceitar. Após o aceite, ambos precisam assinar a nova revisão.</p>
    {document.prazo_assinatura && <p className="text-sm">Prazo de assinatura: {dateTime(document.prazo_assinatura)}.</p>}
    {list.isLoading && <p role="status">Carregando solicitações...</p>}
    {error && <ErrorMessage error={error} />}
    {list.isError && <button onClick={() => void list.refetch()}>Tentar novamente</button>}
    {list.data?.map(item => <article key={item.id} className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <p className="font-bold">{labels[item.status]}</p>
      <p>Proposta por {item.proposerName}</p>
      <p>Datas anteriores: {dateTime(item.originalStart)} a {dateTime(item.originalEnd)}</p>
      <p className="font-bold">Datas propostas: {dateTime(item.proposedStart)} a {dateTime(item.proposedEnd)}</p>
      <p className="whitespace-pre-line">Motivo: {item.reason}</p>
      {item.status === "pending" && <><p>Responder até {dateTime(item.expiresAt)}.</p><div className="flex flex-wrap gap-3">
        {actorId === item.proposerId
          ? <button disabled={busy} onClick={() => decision.mutate({ id: item.id, action: "withdraw" })} className="rounded-lg border p-2 disabled:opacity-50">Retirar solicitação</button>
          : <><button disabled={busy} onClick={() => decision.mutate({ id: item.id, action: "accept" })} className="rounded-lg bg-primary p-2 font-bold text-on-primary disabled:opacity-50">Aceitar novas datas</button><button disabled={busy} onClick={() => decision.mutate({ id: item.id, action: "reject" })} className="rounded-lg border p-2 disabled:opacity-50">Recusar alteração</button></>}
      </div></>}
    </article>)}
    {canPropose && <form onSubmit={submit} className="space-y-3">
      {document.gestao && <p className="text-sm">Período atual: {dateTime(document.gestao.start_date)} a {dateTime(document.gestao.end_date)}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Novo início<input type="date" required value={start} onChange={event => setStart(event.target.value)} className={inputClass} /></label><label className="text-sm">Novo término<input type="date" required min={start} value={end} onChange={event => setEnd(event.target.value)} className={inputClass} /></label></div>
      <label className="block text-sm">Motivo da alteração<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} className={inputClass} /></label>
      <p className="text-sm text-on-surface-variant">Mantenha {document.contrato.diarias ?? document.contrato.prazo_dias} diárias e pelo menos 7 dias de antecedência. Para prorrogar, faça uma nova reserva.</p>
      <button disabled={busy || !reason.trim()} className="rounded-lg bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50">{proposal.isPending ? "Enviando..." : "Solicitar alteração"}</button>
    </form>}
  </section>;
}

export function ContractAmendmentsDialog({ contractId, actorId, onClose }: { contractId: string; actorId: string | null; onClose: () => void }) {
  const document = useContractDocument(contractId);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Alterar datas da locação</DialogTitle><DialogDescription>Envie uma proposta ou responda à solicitação da outra parte.</DialogDescription></DialogHeader>
    {document.isLoading && <p role="status">Carregando contrato...</p>}
    {document.error && <ErrorMessage error={document.error} />}
    {document.data && <ContractAmendmentsPanel contractId={contractId} actorId={actorId} document={document.data} />}
  </DialogContent></Dialog>;
}
