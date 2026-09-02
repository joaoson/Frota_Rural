import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { toRentalDateTime } from "@/features/contracts/api/contractMapper";
import { useCreateRental, useSignContract } from "@/features/contracts/hooks/useContracts";
import type { Rental } from "@/features/contracts/types/rental";
import { usePosting } from "@/features/postings/hooks/usePostings";
import { LoadingState } from "@/shared/components/LoadingState";
import { ErrorState } from "@/shared/components/ErrorState";
import { BackLink } from "@/shared/components/BackLink";
import { PageShell } from "@/shared/components/PageShell";
import { HttpError } from "@/shared/http/errors";

const HORAS_POR_DIARIA = 8;
// Taxa cobrada pela plataforma (5%)
const TAXA_PLATAFORMA = 0.05;

type Etapa = 1 | 2 | 3;
type FormaPagamento = "pix" | "cartao";

const ETAPAS: { numero: Etapa; titulo: string }[] = [
  { numero: 1, titulo: "Dados da Reserva" },
  { numero: 2, titulo: "Pagamento" },
  { numero: 3, titulo: "Assinatura do Contrato" },
];

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(iso: string): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR");
}

function calcularDiarias(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const dataInicio = new Date(inicio);
  const dataFim = new Date(fim);
  const ms = dataFim.getTime() - dataInicio.getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function Stepper({ etapaAtual }: { etapaAtual: Etapa }) {
  return (
    <div className="flex items-center gap-2 sm:gap-4 mb-12 flex-wrap">
      {ETAPAS.map((etapa, indice) => {
        const concluida = etapa.numero < etapaAtual;
        const ativa = etapa.numero === etapaAtual;

        return (
          <div key={etapa.numero} className="flex items-center gap-2 sm:gap-4">
            <div
              className={`flex items-center gap-2.5 rounded-full pl-2 pr-4 py-2 transition-colors ${
                ativa
                  ? "bg-primary text-on-primary"
                  : concluida
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-container text-outline"
              }`}
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                  ativa
                    ? "bg-on-primary/15 text-on-primary"
                    : concluida
                      ? "bg-primary text-on-primary"
                      : "border-2 border-outline/40 text-outline"
                }`}
              >
                {concluida ? <MaterialIcon icon="check" size={16} /> : etapa.numero}
              </span>
              <span className="font-headline font-bold text-sm whitespace-nowrap">{etapa.titulo}</span>
            </div>
            {indice < ETAPAS.length - 1 && (
              <span className={`h-0.5 w-6 sm:w-10 rounded-full ${concluida ? "bg-primary" : "bg-outline/25"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CartaoPainel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <div className="h-1.5 w-full bg-gradient-to-r from-primary to-secondary-container" />
      <div className="p-7">{children}</div>
    </div>
  );
}

function TituloSecao({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-headline text-2xl font-bold text-tertiary">{children}</h2>
      <div className="h-1 w-12 bg-secondary-container mt-2 rounded-full" />
    </div>
  );
}

const Reservar = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [createdRental, setCreatedRental] = useState<Rental | null>(null);

  const postingQuery = usePosting(id ?? null);
  const anuncio = postingQuery.data ?? null;
  const loading = postingQuery.isLoading;
  const erro = postingQuery.isError ? "Não foi possível carregar o anúncio." : null;

  const createRental = useCreateRental();
  const signContract = useSignContract();

  const [etapa, setEtapa] = useState<Etapa>(1);

  // Etapa 1 — dados da reserva
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const minStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, []);

  // Etapa 3 — assinatura
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [nomeAssinatura, setNomeAssinatura] = useState("");

  // Etapa 2 — pagamento
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("pix");
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const titulo = [anuncio?.machineBrand, anuncio?.machineModel].filter(Boolean).join(" ") || "Maquinário";
  const valorDiaria = anuncio ? anuncio.hourlyRate * HORAS_POR_DIARIA : 0;

  const { diarias, subtotal, taxa, total } = useMemo(() => {
    const dias = calcularDiarias(dataInicio, dataFim);
    const sub = dias * valorDiaria;
    const tax = sub * TAXA_PLATAFORMA;
    return { diarias: dias, subtotal: sub, taxa: tax, total: sub + tax };
  }, [dataInicio, dataFim, valorDiaria]);

  const numeroContrato = `#CTR-${(id ?? "0000").slice(0, 4).toUpperCase()}`;
  const periodoTexto =
    dataInicio && dataFim ? `${formatarData(dataInicio)} – ${formatarData(dataFim)}` : "—";

  const avancarParaPagamento = () => {
    if (!dataInicio || !dataFim) {
      toast.error("Informe a data de início e a data de fim da locação.");
      return;
    }
    if (dataInicio < minStartDate) {
      toast.error("A data de início deve ser a partir de uma semana após o dia de hoje.");
      return;
    }
    if (diarias <= 0) {
      toast.error("A data de fim deve ser igual ou posterior à data de início.");
      return;
    }
    setEtapa(2);
    window.scrollTo(0, 0);
  };

  const pagar = () => {
    if (processando) return;
    setProcessando(true);
    // Simula o processamento do pagamento 
    setTimeout(async () => {
      try {
        const rental = await createRental.mutateAsync({
          postings: id ?? "",
          lessee: userId ?? "",
          start_date: toRentalDateTime(dataInicio, "start"),
          end_date: toRentalDateTime(dataFim, "end"),
          total_price: total,
          status: "pending",
        });
        setCreatedRental(rental);
        setProcessando(false);
        toast.success("Pagamento confirmado!");
        setEtapa(3);
        window.scrollTo(0, 0);
      } catch (error) {
        setProcessando(false);
        toast.error(error instanceof HttpError ? error.message : "Erro ao criar locação.");
      }
    }, 1200);
  };

  const assinarContrato = async () => {
    if (!aceitouTermos) {
      toast.error("Você precisa aceitar os termos do contrato para continuar.");
      return;
    }
    if (!nomeAssinatura.trim()) {
      toast.error("Digite seu nome completo para assinar o contrato.");
      return;
    }
    try {
      if (createdRental) {
        await signContract.mutateAsync({
          id: createdRental.id,
          role: "locatario",
          name: nomeAssinatura,
        });
      }
      toast.success("Contrato assinado! Reserva efetivada com sucesso.");
      navigate("/dashboard-locatario");
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Erro ao assinar contrato.");
    }
  };

  const resumoValores = useMemo(
    () => (
    <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20">
      <div className="flex justify-between items-center text-sm mb-3">
        <span className="text-on-surface-variant">
          Diárias {diarias > 0 && `(${diarias}x ${formatarReais(valorDiaria)})`}
        </span>
        <span className="font-bold text-tertiary">{formatarReais(subtotal)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-on-surface-variant">Taxa da Plataforma</span>
        <span className="font-bold text-tertiary">{formatarReais(taxa)}</span>
      </div>
      <div className="border-t border-outline-variant/30 mt-4 pt-4 flex justify-between items-end">
        <span className="text-[10px] uppercase font-bold text-outline tracking-widest">Total Apurado</span>
        <span className="text-2xl font-black text-primary">{formatarReais(total)}</span>
      </div>
    </div>
    ),
    [diarias, valorDiaria, subtotal, taxa, total],
  );

  return (
    <PageShell width="wide">
      <BackLink to={`/anuncio/${id}`}>Voltar ao anúncio</BackLink>

      <h1 className="font-headline text-4xl font-black text-primary mb-2">Solicitar Reserva</h1>
      <div className="h-1.5 w-20 bg-secondary-container mb-10 rounded-full" />

      {loading && (
        <LoadingState variant="text" label="Carregando reserva..." />
      )}

      {!loading && erro && (
        <ErrorState message={erro} />
      )}

      {!loading && !erro && anuncio && (
        <>
          <Stepper etapaAtual={etapa} />

          {/* ════════ ETAPA 1 — DADOS DA RESERVA ════════ */}
          {etapa === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
              {/* Resumo */}
              <CartaoPainel className="lg:col-span-2">
                <TituloSecao>Resumo da Reserva</TituloSecao>

                <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20 mb-4">
                  <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-3">
                    Maquinário Selecionado
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                      <MaterialIcon icon="agriculture" className="text-primary" size={26} />
                    </div>
                    <div>
                      <div className="font-bold text-tertiary">{titulo}</div>
                      {anuncio.locationAddress && (
                        <div className="text-xs text-on-surface-variant flex items-center gap-1">
                          <MaterialIcon icon="location_on" size={13} /> {anuncio.locationAddress}
                        </div>
                      )}
                      {anuncio.machineRenagroNumber && (
                        <div className="text-[11px] text-outline font-medium tracking-wide mt-0.5">
                          RENAGRO: {anuncio.machineRenagroNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {resumoValores}
              </CartaoPainel>

              {/* Formulário */}
              <CartaoPainel className="lg:col-span-3">
                <TituloSecao>Confirme os dados da reserva</TituloSecao>

                <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20 mb-6 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                    <MaterialIcon icon="agriculture" className="text-primary" size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-primary">{titulo}</div>
                    <div className="text-xs text-on-surface-variant">
                      {[anuncio.locationAddress, anuncio.machineRenagroNumber && `Renagro ${anuncio.machineRenagroNumber}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                      Data Início <span className="text-error">*</span>
                    </label>
                    <input
                      type="date"
                      value={dataInicio}
                      min={minStartDate}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                      Data Fim <span className="text-error">*</span>
                    </label>
                    <input
                      type="date"
                      value={dataFim}
                      min={dataInicio || undefined}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                    />
                  </div>
                </div>

                <div className="mb-7">
                  <label className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                    Observações (opcional)
                  </label>
                  <textarea
                    rows={4}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Informe detalhes adicionais sobre a locação..."
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary placeholder:text-outline/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition resize-none"
                  />
                </div>

                <button
                  onClick={avancarParaPagamento}
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-lg font-bold hover:shadow-lg transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <MaterialIcon icon="arrow_forward" size={20} /> Avançar para Pagamento
                </button>
              </CartaoPainel>
            </div>
          )}

          {/* ════════ ETAPA 2 — PAGAMENTO ════════ */}
          {etapa === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
              {/* Processar pagamento */}
              <CartaoPainel className="lg:col-span-2">
                <TituloSecao>Processar Pagamento</TituloSecao>
                <p className="text-sm text-on-surface-variant -mt-4 mb-5">Contratação de Aluguel</p>
                {resumoValores}
              </CartaoPainel>

              {/* Forma de pagamento */}
              <CartaoPainel className="lg:col-span-3">
                <TituloSecao>Forma de Pagamento</TituloSecao>

                <div className="space-y-3 mb-7">
                  {([
                    { id: "pix", icone: "qr_code_2", titulo: "Pix", sub: "Aprovação Imediata" },
                    { id: "cartao", icone: "credit_card", titulo: "Cartão de Crédito", sub: "Parcelamento em até 3x" },
                  ] as const).map((opcao) => {
                    const selecionada = formaPagamento === opcao.id;
                    return (
                      <button
                         key={opcao.id}
                        onClick={() => setFormaPagamento(opcao.id)}
                        className={`w-full flex items-center gap-4 rounded-xl p-4 border-2 transition text-left ${
                          selecionada
                            ? "border-primary bg-primary/5"
                            : "border-outline-variant/30 hover:border-outline-variant/60"
                        }`}
                      >
                        <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                          <MaterialIcon icon={opcao.icone} className="text-tertiary" size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-tertiary">{opcao.titulo}</div>
                          <div className="text-xs text-on-surface-variant">{opcao.sub}</div>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selecionada ? "border-primary" : "border-outline/40"
                          }`}
                        >
                          {selecionada && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEtapa(1);
                      window.scrollTo(0, 0);
                    }}
                    className="px-6 py-4 rounded-lg font-bold text-tertiary border border-outline-variant/40 hover:bg-surface-container-low transition"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={pagar}
                    disabled={processando}
                    className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-lg font-bold hover:shadow-lg transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    <MaterialIcon icon="lock" size={20} /> {processando ? "Processando..." : "Pagar e Avançar"}
                  </button>
                </div>

                <p className="text-xs text-on-surface-variant text-center mt-5">
                  Após o pagamento, você seguirá para a assinatura do contrato.
                </p>
              </CartaoPainel>
            </div>
          )}

          {/* ════════ ETAPA 3 — ASSINATURA DO CONTRATO ════════ */}
          {etapa === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
              {/* Detalhes do contrato */}
              <CartaoPainel className="lg:col-span-2">
                <TituloSecao>Detalhes do Contrato</TituloSecao>

                <dl className="divide-y divide-outline-variant/20">
                  {[
                    { rotulo: "Contrato", valor: numeroContrato },
                    { rotulo: "Maquinário", valor: titulo },
                    { rotulo: "Período", valor: periodoTexto },
                    { rotulo: "Locador", valor: "João Silva" },
                  ].map((item) => (
                    <div key={item.rotulo} className="flex justify-between items-center py-4">
                      <dt className="text-[10px] uppercase font-bold text-outline tracking-widest">{item.rotulo}</dt>
                      <dd className="font-bold text-tertiary text-sm text-right">{item.valor}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-4">
                    <dt className="text-[10px] uppercase font-bold text-outline tracking-widest">Valor Total</dt>
                    <dd className="font-black text-primary text-lg">{formatarReais(total)}</dd>
                  </div>
                </dl>
              </CartaoPainel>

              {/* Assinatura */}
              <CartaoPainel className="lg:col-span-3">
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 mb-7 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <MaterialIcon icon="check_circle" className="text-primary" size={24} filled />
                  </div>
                  <div>
                    <div className="font-bold text-tertiary text-sm">Pagamento confirmado com sucesso!</div>
                    <div className="text-xs text-on-surface-variant">
                      Agora assine o contrato para efetivar a reserva.
                    </div>
                  </div>
                </div>

                <TituloSecao>Assine o Contrato Digitalmente</TituloSecao>
                <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
                  Revise os termos do contrato de locação abaixo. Ao assinar, você concorda com as cláusulas e
                  responsabilidades descritas.
                </p>

                {/* Prévia do contrato */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-6 max-h-72 overflow-y-auto mb-6 text-sm text-on-surface-variant leading-relaxed space-y-3">
                  <h3 className="font-headline font-bold text-tertiary text-base">
                    Contrato de Locação de Maquinário Agrícola
                  </h3>
                  <p>
                    <strong className="text-tertiary">Contrato nº {numeroContrato.replace("#", "")}</strong>
                  </p>
                  <p>
                    Entre as partes: <strong className="text-tertiary">Locador:</strong> João Silva (CPF:
                    000.000.000-00) e <strong className="text-tertiary">Locatário:</strong>{" "}
                    {nomeAssinatura.trim() || "Locatário"} (CPF: 111.111.111-11).
                  </p>
                  <p>
                    <strong className="text-tertiary">Objeto:</strong> Locação de {titulo}
                    {anuncio.machineRenagroNumber && `, Renagro ${anuncio.machineRenagroNumber}`}
                    {anuncio.machineUsagePurpose && `, para atividade de ${anuncio.machineUsagePurpose}`}, pelo
                    período de {periodoTexto}.
                  </p>
                  <p>
                    <strong className="text-tertiary">Valor:</strong> {formatarReais(total)}, incluindo diárias e taxa
                    da plataforma.
                  </p>
                  <p>
                    O equipamento será entregue livre de defeitos conhecidos. A operação deve ser realizada por
                    operador habilitado, com credencial técnica válida (NR-31). Na devolução, o equipamento deve estar
                    nas mesmas condições em que foi entregue, ressalvado o desgaste natural do uso regular.
                  </p>
                  <p>
                    Este contrato é regido pelo Código de Defesa do Consumidor (Lei nº 8.078/1990) e pelo Código Civil
                    Brasileiro (Lei nº 10.406/2002). A FrotaRural atua como intermediadora tecnológica e não é parte
                    deste contrato.
                  </p>
                </div>

                {/* Aceite */}
                <label className="flex items-start gap-3 bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 mb-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceitouTermos}
                    onChange={(e) => setAceitouTermos(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                  />
                  <span className="text-sm text-on-surface-variant leading-relaxed">
                    Declaro que li e concordo com todos os termos e cláusulas do contrato de locação acima descrito.
                  </span>
                </label>

                {/* Assinatura digital */}
                <div className="mb-7">
                  <label className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                    Nome Completo (Assinatura Digital)
                  </label>
                  <input
                    type="text"
                    value={nomeAssinatura}
                    onChange={(e) => setNomeAssinatura(e.target.value)}
                    placeholder="Digite seu nome completo"
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary placeholder:text-outline/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEtapa(2);
                      window.scrollTo(0, 0);
                    }}
                    className="px-6 py-4 rounded-lg font-bold text-tertiary border border-outline-variant/40 hover:bg-surface-container-low transition"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={assinarContrato}
                    className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-lg font-bold hover:shadow-lg transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <MaterialIcon icon="draw" size={20} /> Assinar e Finalizar
                  </button>
                </div>
              </CartaoPainel>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
};

export default Reservar;
