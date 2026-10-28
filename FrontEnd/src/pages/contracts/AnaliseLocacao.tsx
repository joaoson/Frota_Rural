import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MaterialIcon from "@/components/MaterialIcon";
import { contractStore } from "@/app/container";
import type { Rental } from "@/features/contracts/types/rental";
import { rentalStatusBadge } from "@/features/contracts/types/rentalBadges";

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);
/** A entidade traz Date; os cálculos da página trabalham com YYYY-MM-DD. */
const iso = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const daysBetween = (start: string, end: string) => Math.max(1, Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1);
import { chatStore } from "@/app/container";
import { toast } from "sonner";

/** Referência de uso por diária; o preço é fixo por diária (ADR 0002). */
const HORAS_POR_DIARIA = 8;

const formatDate = (value: string) => toDate(value).toLocaleDateString("pt-BR");

const AnaliseLocacao = () => {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [abrindoChat, setAbrindoChat] = useState(false);

  const abrirConversa = async () => {
    if (!rentalId || !rental?.lessorId || abrindoChat) return;
    setAbrindoChat(true);
    try {
      const thread = await chatStore.resolveThread("rental", rentalId, rental.lessorId);
      navigate(`/mensagens/${encodeURIComponent(thread.threadId)}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível abrir a conversa.",
      );
    } finally {
      setAbrindoChat(false);
    }
  };

  useEffect(() => {
    if (!rentalId) return;
    let ignored = false;
    setLoading(true);
    contractStore.findRentalById(rentalId)
      .then(value => { if (!ignored) setRental(value); })
      .catch(() => { if (!ignored) setRental(null); })
      .finally(() => { if (!ignored) setLoading(false); });
    return () => { ignored = true; };
  }, [rentalId]);

  const analytics = useMemo(() => {
    if (!rental?.startDate || !rental.endDate) return null;
    const totalDays = daysBetween(iso(rental.startDate), iso(rental.endDate));
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const started = Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - toDate(iso(rental.startDate)).getTime()) / 86_400_000) + 1));
    const usedDays = ["completed", "closed"].includes(rental.status ?? "") ? totalDays : ["active", "signed"].includes(rental.status ?? "") ? started : 0;
    const remainingDays = ["active", "signed"].includes(rental.status ?? "") ? Math.max(0, totalDays - usedDays) : 0;
    // A entidade já entrega número; formatar é papel da apresentação.
    const total = rental.totalPrice ?? 0;
    const daily = total / totalDays;
    const chart = Array.from({ length: totalDays }, (_, index) => ({ dia: `D${index + 1}`, valor: Math.round(daily * (index + 1)), previsto: Math.round(daily * (index + 1)) }));
    return { totalDays, usedDays, remainingDays, total, daily, chart };
  }, [rental]);

  if (loading) return <main className="min-h-screen bg-background grid place-items-center text-on-surface-variant">Carregando análise da locação...</main>;
  if (!rental || !analytics) return <main className="min-h-screen bg-background grid place-items-center p-6 text-center"><div><h1 className="text-2xl font-bold text-primary">Locação não encontrada</h1><Link to="/dashboard-locatario?tab=locacoes" className="mt-4 inline-block text-primary underline">Voltar ao painel</Link></div></main>;

  const extensionStart = isoDate(new Date(Math.max(Date.now() + 86_400_000, toDate(iso(rental.endDate)).getTime() + 86_400_000)));
  const statusLabel = rentalStatusBadge(rental.status).label;

  return <main className="min-h-screen bg-background p-5 md:p-10">
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><Link to="/dashboard-locatario?tab=locacoes" className="text-sm font-bold text-primary hover:underline">← Voltar para minhas locações</Link><h1 className="mt-3 font-headline text-3xl font-black text-primary">Análise da locação</h1><p className="mt-2 text-on-surface-variant">{[rental.machineBrand, rental.machineModel].filter(Boolean).join(" ")} · Contrato {rental.contractNumber}</p></div><span className="self-start rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">{statusLabel}</span></div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[{ icon: "calendar_month", label: "Período contratado", value: `${analytics.totalDays} dias`, detail: `${formatDate(iso(rental.startDate))} — ${formatDate(iso(rental.endDate))}` }, { icon: "event_available", label: "Dias decorridos", value: `${analytics.usedDays} dias`, detail: ["active", "signed"].includes(rental.status ?? "") ? `${analytics.remainingDays} restantes` : statusLabel }, { icon: "payments", label: "Valor contratado", value: analytics.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), detail: `${analytics.daily.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/dia` }, { icon: "description", label: "Contrato", value: rental.contractNumber, detail: statusLabel }].map((item) => <div key={item.label} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm"><MaterialIcon icon={item.icon} className="text-primary" size={22} /><p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</p><p className="mt-1 text-xl font-black text-on-surface">{item.value}</p><p className="mt-1 text-xs text-on-surface-variant">{item.detail}</p></div>)}
      </section>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm"><div className="mb-6 flex items-start justify-between"><div><h2 className="font-headline text-xl font-bold text-on-surface">Evolução financeira</h2><p className="text-sm text-on-surface-variant">Projeção proporcional ao período contratado; não representa pagamentos recebidos</p></div><strong className="text-primary">{analytics.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.chart}><defs><linearGradient id="rentalValue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" opacity={.25} /><XAxis dataKey="dia" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => `R$${v}`} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /><Area type="monotone" dataKey="valor" stroke="var(--primary)" fill="url(#rentalValue)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div></section>

      <section aria-labelledby="uso-equipamento" className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="uso-equipamento" className="font-headline text-xl font-bold text-on-surface">Uso do equipamento</h2>
            <p className="text-sm text-on-surface-variant">Informativo — as leituras do horímetro não alteram o valor da locação.</p>
          </div>
        </div>
        {rental.meter?.checkIn || rental.meter?.checkOut ? (
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Retirada", value: rental.meter.checkIn ? `${rental.meter.checkIn.value.toLocaleString("pt-BR")} h` : "—" },
              { label: "Devolução", value: rental.meter.checkOut ? `${rental.meter.checkOut.value.toLocaleString("pt-BR")} h` : "—" },
              { label: "Horas usadas", value: rental.meter.hoursUsed !== null ? `${rental.meter.hoursUsed.toLocaleString("pt-BR")} h` : "Aguardando devolução" },
              {
                label: "Média por diária",
                value: rental.meter.hoursUsed !== null && analytics.totalDays
                  ? `${(rental.meter.hoursUsed / analytics.totalDays).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                  : "—",
                detail: rental.meter.referenceHours ? `Referência: ${HORAS_POR_DIARIA} h por diária (${rental.meter.referenceHours} h no período)` : undefined,
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</dt>
                <dd className="mt-1 text-lg font-black text-on-surface">{item.value}</dd>
                {item.detail ? <dd className="text-xs text-on-surface-variant">{item.detail}</dd> : null}
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-on-surface-variant">O locador ainda não registrou leituras do horímetro nesta locação.</p>
        )}
      </section>

      <section className="rounded-2xl border border-secondary-container/40 bg-secondary-fixed/20 p-6"><h2 className="font-headline text-xl font-bold text-on-surface">Próximos passos</h2><p className="mt-1 text-sm text-on-surface-variant">Você pode consultar disponibilidade para uma nova reserva deste equipamento. Uma nova reserva não altera o contrato atual.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Link to={`/reservar/${rental.postingId}?inicio=${extensionStart}&extensao=1`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary"><MaterialIcon icon="event_repeat" size={18} /> Reservar próximo período</Link><Link to={`/reservar/${rental.postingId}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-5 py-3 text-sm font-bold text-primary"><MaterialIcon icon="replay" size={18} /> Alugar novamente</Link><button type="button" onClick={abrirConversa} disabled={abrindoChat || !rental.lessorId} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-5 py-3 text-sm font-bold text-primary disabled:opacity-60"><MaterialIcon icon="chat" size={18} /> {abrindoChat ? "Abrindo..." : "Mensagens da locação"}</button></div></section>
    </div>
  </main>;
};

export default AnaliseLocacao;
