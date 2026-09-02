import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MaterialIcon from "@/components/MaterialIcon";
import { contractService, type Rental } from "@/services/ContractService/ContractService";

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const daysBetween = (start: string, end: string) => Math.max(1, Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1);
import { chatService } from "@/services/ChatService/ChatService";
import { toast } from "sonner";

const formatDate = (value: string) => toDate(value).toLocaleDateString("pt-BR");

const AnaliseLocacao = () => {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [abrindoChat, setAbrindoChat] = useState(false);

  // O servidor deriva o outro participante da locação. Se houver operador
  // designado, o par fica ambíguo e a API devolve 400 pedindo o peer_id —
  // por isso o erro vai para o toast em vez de virar navegação quebrada.
  const abrirConversa = async () => {
    if (!rentalId) return;
    setAbrindoChat(true);
    try {
      const thread = await chatService.resolveThread("rental", rentalId);
      navigate(`/mensagens/${encodeURIComponent(thread.thread_id)}`);
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
    contractService.getRentalById(rentalId).then(setRental).catch(() => setRental(null)).finally(() => setLoading(false));
  }, [rentalId]);

  const analytics = useMemo(() => {
    if (!rental) return null;
    const totalDays = daysBetween(rental.startDate, rental.endDate);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const started = Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - toDate(rental.startDate).getTime()) / 86_400_000) + 1));
    const usedDays = rental.status === "completed" ? totalDays : started;
    const remainingDays = rental.status === "active" ? Math.max(0, totalDays - usedDays) : 0;
    const total = Number(rental.total.replace(/[^\d,]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    const daily = total / totalDays;
    const chart = Array.from({ length: totalDays }, (_, index) => ({ dia: `D${index + 1}`, valor: Math.round(daily * (index + 1)), previsto: Math.round(daily * (index + 1)) }));
    return { totalDays, usedDays, remainingDays, total, daily, chart };
  }, [rental]);

  if (loading) return <main className="min-h-screen bg-background grid place-items-center text-on-surface-variant">Carregando análise da locação...</main>;
  if (!rental || !analytics) return <main className="min-h-screen bg-background grid place-items-center p-6 text-center"><div><h1 className="text-2xl font-bold text-primary">Locação não encontrada</h1><Link to="/dashboard-locatario" className="mt-4 inline-block text-primary underline">Voltar ao painel</Link></div></main>;

  const extensionStart = isoDate(new Date(toDate(rental.endDate).getTime() + 86_400_000));
  const statusLabel = rental.status === "active" ? "Em operação" : rental.status === "pending" ? "Aguardando assinatura" : rental.status === "completed" ? "Concluída" : "Encerrada";

  return <main className="min-h-screen bg-background p-5 md:p-10">
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><Link to="/dashboard-locatario" className="text-sm font-bold text-primary hover:underline">← Voltar para minhas locações</Link><h1 className="mt-3 font-headline text-3xl font-black text-primary">Análise da locação</h1><p className="mt-2 text-on-surface-variant">{rental.machineName} · Contrato {rental.contractNumber}</p></div><span className="self-start rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">{statusLabel}</span></div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[{ icon: "calendar_month", label: "Período contratado", value: `${analytics.totalDays} dias`, detail: `${formatDate(rental.startDate)} — ${formatDate(rental.endDate)}` }, { icon: "event_available", label: "Dias utilizados", value: `${analytics.usedDays} dias`, detail: rental.status === "active" ? `${analytics.remainingDays} restantes` : "Período finalizado" }, { icon: "payments", label: "Valor contratado", value: rental.total, detail: `${analytics.daily.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/dia` }, { icon: "description", label: "Contrato", value: rental.contractNumber, detail: statusLabel }].map((item) => <div key={item.label} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm"><MaterialIcon icon={item.icon} className="text-primary" size={22} /><p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</p><p className="mt-1 text-xl font-black text-on-surface">{item.value}</p><p className="mt-1 text-xs text-on-surface-variant">{item.detail}</p></div>)}
      </section>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm"><div className="mb-6 flex items-start justify-between"><div><h2 className="font-headline text-xl font-bold text-on-surface">Evolução financeira</h2><p className="text-sm text-on-surface-variant">Valor acumulado do período contratado</p></div><strong className="text-primary">{analytics.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.chart}><defs><linearGradient id="rentalValue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={.35} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" opacity={.25} /><XAxis dataKey="dia" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => `R$${v}`} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /><Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" fill="url(#rentalValue)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div></section>

      <section className="rounded-2xl border border-secondary-container/40 bg-secondary-fixed/20 p-6"><h2 className="font-headline text-xl font-bold text-on-surface">Próximos passos</h2><p className="mt-1 text-sm text-on-surface-variant">Você pode solicitar uma extensão do período ou criar uma nova reserva para este mesmo equipamento.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Link to={`/reservar/${rental.postingId}?inicio=${extensionStart}&extensao=1`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary"><MaterialIcon icon="event_repeat" size={18} /> Estender locação</Link><Link to={`/reservar/${rental.postingId}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-5 py-3 text-sm font-bold text-primary"><MaterialIcon icon="replay" size={18} /> Alugar novamente</Link><button type="button" onClick={abrirConversa} disabled={abrindoChat} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-5 py-3 text-sm font-bold text-primary disabled:opacity-60"><MaterialIcon icon="chat" size={18} /> {abrindoChat ? "Abrindo..." : "Mensagens da locação"}</button></div></section>
    </div>
  </main>;
};

export default AnaliseLocacao;
