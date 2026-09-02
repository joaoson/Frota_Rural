import { useEffect, useState } from "react";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import HashDisplay from "@/components/HashDisplay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import { contractService } from "@/services/ContractService/ContractService";
import type { SignatureEvidenceRecord } from "@/services/ContractService/ContractService";
import type { ContratoData } from "@/pages/Contrato/types";
import { formatarUtcCompleto } from "@/utils/formatarUtc";

export type PapelAssinatura = "locador" | "locatario";

interface AssinaturaContratoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id do aluguel ou do contrato — a API resolve os dois. */
  contratoId: string;
  papel: PapelAssinatura;
  /** Chamado depois do aceite gravado, para a tela recarregar o contrato. */
  onAssinado?: (evidencia: SignatureEvidenceRecord | null) => void;
}

const rotuloDaOutraParte: Record<PapelAssinatura, string> = {
  locador: "locatário",
  locatario: "locador",
};

/**
 * Aceite eletrônico de uma das partes, em modal.
 *
 * Mesmo fluxo em ambos os papéis (leitura do documento → aceite dos termos →
 * confirmação de posse do e-mail por código → assinatura), com o `papel`
 * decidindo apenas para quem o código é enviado e como o aceite é gravado.
 * Nenhuma evidência sai daqui: hash, timestamp, IP e User-Agent são todos
 * derivados no servidor no momento do aceite.
 */
export default function AssinaturaContratoModal({
  open,
  onOpenChange,
  contratoId,
  papel,
  onAssinado,
}: AssinaturaContratoModalProps) {
  const [contrato, setContrato] = useState<ContratoData | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [nomeAssinatura, setNomeAssinatura] = useState("");
  const [codigoOtp, setCodigoOtp] = useState("");
  const [otpEnviadoPara, setOtpEnviadoPara] = useState<string | null>(null);
  const [enviandoOtp, setEnviandoOtp] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const [recibo, setRecibo] = useState<SignatureEvidenceRecord | null>(null);

  // Cada abertura recomeça do zero: o modal serve a vários contratos da lista.
  useEffect(() => {
    if (!open || !contratoId) return;
    setContrato(null);
    setErro(null);
    setAceitouTermos(false);
    setNomeAssinatura("");
    setCodigoOtp("");
    setOtpEnviadoPara(null);
    setRecibo(null);
    setAssinando(false);
    setCarregando(true);

    let cancelado = false;
    contractService
      .getContractById(contratoId)
      .then((dados) => {
        if (cancelado) return;
        setContrato(dados);
        // Sugere o nome cadastrado da parte; o campo continua editável porque
        // é ele que vai gravado na evidência como assinatura.
        const parte = dados?.[papel === "locador" ? "locador" : "locatario"];
        setNomeAssinatura(parte?.representante_nome || parte?.razao_social || "");
      })
      .catch((e) => {
        if (cancelado) return;
        console.error("Erro ao carregar o contrato:", e);
        setErro("Não foi possível carregar o contrato para assinatura.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [open, contratoId, papel]);

  const jaAssinadoPorMim = contrato?.evidencia?.assinaturas.some((a) => a.papel === papel) ?? false;

  const solicitarCodigo = async () => {
    if (enviandoOtp) return;
    setEnviandoOtp(true);
    try {
      const { sentTo } = await contractService.requestSignatureOtp(contratoId, papel);
      setOtpEnviadoPara(sentTo);
      toast.success(`Código enviado para ${sentTo}.`);
    } catch (e) {
      const mensagem =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Não foi possível enviar o código por e-mail.";
      toast.error(mensagem);
    } finally {
      setEnviandoOtp(false);
    }
  };

  const assinar = async () => {
    if (assinando) return;
    if (!aceitouTermos) {
      toast.error("Você precisa aceitar os termos do contrato para continuar.");
      return;
    }
    if (!nomeAssinatura.trim()) {
      toast.error("Digite seu nome completo para assinar o contrato.");
      return;
    }
    if (codigoOtp.trim().length !== 6) {
      toast.error("Confirme seu e-mail: solicite o código e informe os 6 dígitos.");
      return;
    }

    setAssinando(true);
    try {
      const { evidence } = await contractService.signContract(
        contratoId,
        papel,
        nomeAssinatura,
        codigoOtp.trim(),
      );
      setRecibo(evidence);
      toast.success("Contrato assinado! A evidência do aceite foi registrada.");
      onAssinado?.(evidence);
    } catch (e) {
      const mensagem =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Erro ao assinar o contrato.";
      toast.error(mensagem);
    } finally {
      setAssinando(false);
    }
  };

  const linhasRecibo = recibo
    ? [
        { rotulo: "Assinado por", valor: recibo.signer_name || recibo.signer_email || "—" },
        { rotulo: "E-mail", valor: recibo.signer_email || "—" },
        { rotulo: "Data e hora (UTC)", valor: formatarUtcCompleto(recibo.signed_at) },
        { rotulo: "IP de origem", valor: recibo.ip_address || "—" },
        { rotulo: "Versão do documento", valor: recibo.document_version || "—" },
        {
          rotulo: "Posse do e-mail",
          valor: recibo.otp_verified ? "Confirmada por código" : "Não confirmada por código",
        },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-container-lowest border-outline-variant/30 rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon={recibo ? "verified" : "draw"} size={20} className="text-primary" filled={!!recibo} />
            </div>
            <div>
              <DialogTitle className="font-headline text-xl font-bold text-primary">
                {recibo ? "Comprovante da Assinatura" : "Assinar Contrato"}
              </DialogTitle>
              <DialogDescription className="text-on-surface-variant text-xs mt-0.5">
                {recibo
                  ? "Guarde estes dados: eles comprovam o que você assinou."
                  : `Assinatura eletrônica como ${papel === "locador" ? "locador" : "locatário"}${
                      contrato ? ` · ${contrato.contrato.numero}` : ""
                    }`}
              </DialogDescription>
            </div>
          </div>
          <div className="h-1 w-12 bg-secondary-container mt-3" />
        </DialogHeader>

        <div className="px-8 pb-8 pt-6">
          {carregando && (
            <p className="text-sm text-on-surface-variant py-10 text-center">
              Carregando o documento do contrato...
            </p>
          )}

          {!carregando && erro && (
            <div className="bg-error-container rounded-xl border border-error/20 p-6 text-center">
              <p className="text-error font-bold text-sm">{erro}</p>
            </div>
          )}

          {/* ── Recibo, depois do aceite gravado ── */}
          {!carregando && !erro && recibo && (
            <>
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 mb-6 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MaterialIcon icon="verified" className="text-primary" size={24} filled />
                </div>
                <div>
                  <div className="font-bold text-tertiary text-sm">Contrato assinado!</div>
                  <div className="text-xs text-on-surface-variant">
                    O aceite foi registrado em log imutável.
                  </div>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
                Estes dados comprovam qual documento você aceitou, quando e de onde — a evidência
                exigida para a assinatura eletrônica simples (MP nº 2.200-2/2001, art. 10, §2º, e
                Lei nº 14.063/2020, art. 4º, I).
              </p>

              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl divide-y divide-outline-variant/20 mb-6">
                {linhasRecibo.map((linha) => (
                  <div key={linha.rotulo} className="flex justify-between items-baseline gap-4 px-5 py-3">
                    <span className="text-xs text-on-surface-variant shrink-0">{linha.rotulo}</span>
                    <span className="text-sm font-bold text-tertiary text-right break-words">
                      {linha.valor}
                    </span>
                  </div>
                ))}
                <div className="px-5 py-3">
                  <HashDisplay
                    label={`Hash ${recibo.hash_algorithm.toUpperCase()} do documento assinado`}
                    value={recibo.document_hash}
                  />
                </div>
                <div className="px-5 py-3">
                  <HashDisplay
                    label="Hash do registro (log encadeado)"
                    value={recibo.record_hash}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-3.5 rounded-lg font-bold hover:shadow-lg transition-all shadow-md flex items-center justify-center gap-2"
              >
                <MaterialIcon icon="check" size={20} /> Concluir
              </button>
            </>
          )}

          {/* ── Aceite já registrado antes desta sessão ── */}
          {!carregando && !erro && !recibo && contrato && jaAssinadoPorMim && (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-6 text-center">
              <MaterialIcon icon="verified" className="text-primary mb-2" size={28} filled />
              <p className="font-bold text-tertiary text-sm mb-1">Você já assinou este contrato.</p>
              <p className="text-xs text-on-surface-variant">
                A evidência do seu aceite está no documento do contrato.
              </p>
            </div>
          )}

          {/* ── Fluxo de assinatura ── */}
          {!carregando && !erro && !recibo && contrato && !jaAssinadoPorMim && (
            <>
              <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
                Revise os termos abaixo. Ao assinar, você concorda com as cláusulas e
                responsabilidades do contrato de locação.
              </p>

              {/* Prévia do documento — os mesmos dados cujo hash será registrado */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 max-h-64 overflow-y-auto mb-6 text-sm text-on-surface-variant leading-relaxed space-y-3">
                <h3 className="font-headline font-bold text-tertiary text-base">
                  Contrato de Locação de Maquinário Agrícola
                </h3>
                <p>
                  <strong className="text-tertiary">
                    Contrato nº {contrato.contrato.numero.replace("#", "")}
                  </strong>{" "}
                  · Operação {contrato.operacao.codigo}
                </p>
                <p>
                  Entre as partes: <strong className="text-tertiary">Locador:</strong>{" "}
                  {contrato.locador.razao_social}
                  {contrato.locador.documento &&
                    ` (${contrato.locador.tipo_documento || "Documento"}: ${contrato.locador.documento})`}{" "}
                  e <strong className="text-tertiary">Locatário:</strong>{" "}
                  {contrato.locatario.razao_social}
                  {contrato.locatario.documento &&
                    ` (${contrato.locatario.tipo_documento || "Documento"}: ${contrato.locatario.documento})`}
                  .
                </p>
                <p>
                  <strong className="text-tertiary">Objeto:</strong> Locação de{" "}
                  {[contrato.equipamento.marca, contrato.equipamento.modelo].filter(Boolean).join(" ") ||
                    "maquinário"}
                  {contrato.equipamento.renagro && `, Renagro ${contrato.equipamento.renagro}`}
                  {contrato.anuncio.finalidade_uso &&
                    `, para atividade de ${contrato.anuncio.finalidade_uso}`}
                  , pelo período de {contrato.contrato.data_inicio} a {contrato.contrato.data_fim} (
                  {contrato.contrato.prazo_dias} dias).
                </p>
                <p>
                  <strong className="text-tertiary">Valor:</strong> R${" "}
                  {contrato.contrato.valor_total_estimado}, incluindo locação (R${" "}
                  {contrato.contrato.valor_locacao}) e taxa da plataforma (R${" "}
                  {contrato.contrato.valor_taxa_plataforma}).
                </p>
                <p>
                  O equipamento será entregue livre de defeitos conhecidos. A operação deve ser
                  realizada por operador habilitado, com credencial técnica válida (NR-31). Na
                  devolução, o equipamento deve estar nas mesmas condições em que foi entregue,
                  ressalvado o desgaste natural do uso regular.
                </p>
                <p>
                  Este contrato é regido pelo Código de Defesa do Consumidor (Lei nº 8.078/1990) e
                  pelo Código Civil Brasileiro (Lei nº 10.406/2002). A FrotaRural atua como
                  intermediadora tecnológica e não é parte deste contrato.
                </p>
                <p>
                  A assinatura eletrônica simples tem validade entre as partes nos termos da MP nº
                  2.200-2/2001, art. 10, §2º, e da Lei nº 14.063/2020, art. 4º, I. Antes do aceite,
                  você confirma a posse do seu e-mail por meio de um código. No aceite ficam
                  registrados o hash do documento, a data e hora UTC, o seu IP e o seu identificador
                  de usuário.
                </p>
                {contrato.evidencia && (
                  <div className="pt-2 border-t border-outline-variant/30">
                    <HashDisplay
                      label={`Hash ${contrato.evidencia.algoritmo_hash.toUpperCase()} deste documento`}
                      value={contrato.evidencia.hash_documento_atual}
                    />
                  </div>
                )}
              </div>

              {/* Aceite da outra parte, quando já houver — contexto de quem assina agora */}
              {contrato.evidencia?.assinaturas
                .filter((a) => a.papel !== papel)
                .map((a) => (
                  <div
                    key={a.hash_registro}
                    className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 mb-6 flex items-start gap-3"
                  >
                    <MaterialIcon icon="how_to_reg" className="text-primary shrink-0" size={20} />
                    <div className="text-xs text-on-surface-variant leading-relaxed">
                      O {rotuloDaOutraParte[papel]} <strong className="text-tertiary">{a.nome}</strong>{" "}
                      já assinou em {formatarUtcCompleto(a.assinado_em_utc)}.
                      {a.hash_documento === contrato.evidencia?.hash_documento_atual ? (
                        <> Sobre esta mesma versão do documento.</>
                      ) : (
                        <span className="text-error font-bold">
                          {" "}
                          Atenção: o documento mudou desde aquele aceite.
                        </span>
                      )}
                    </div>
                  </div>
                ))}

              {/* Aceite */}
              <label className="flex items-start gap-3 bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceitouTermos}
                  onChange={(e) => setAceitouTermos(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                />
                <span className="text-sm text-on-surface-variant leading-relaxed">
                  Declaro que li e concordo com todos os termos e cláusulas do contrato de locação
                  acima descrito.
                </span>
              </label>

              {/* Assinatura digital */}
              <div className="mb-5">
                <label htmlFor="nome-completo-assinatura-digital" className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                  Nome Completo (Assinatura Digital)
                </label>
                <input id="nome-completo-assinatura-digital"
                  type="text"
                  value={nomeAssinatura}
                  onChange={(e) => setNomeAssinatura(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary placeholder:text-outline/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>

              {/* Confirmação por e-mail: prova a posse do endereço cadastrado */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 mb-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1">
                      Confirmação por e-mail <span className="text-error">*</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Para assinar, confirme que o e-mail da sua conta é seu: solicite o código e
                      informe os 6 dígitos abaixo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={solicitarCodigo}
                    disabled={enviandoOtp}
                    className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-primary border border-primary/40 hover:bg-primary/5 transition disabled:opacity-50"
                  >
                    {enviandoOtp ? "Enviando..." : otpEnviadoPara ? "Reenviar código" : "Enviar código"}
                  </button>
                </div>
                {!otpEnviadoPara ? (
                  <p className="text-xs text-outline">
                    Clique em <strong>Enviar código</strong> para receber os 6 dígitos no e-mail da
                    sua conta.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-on-surface-variant mb-2">
                      Código enviado para <strong className="text-tertiary">{otpEnviadoPara}</strong>.
                      Não recebeu? Verifique o spam ou reenvie.
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={codigoOtp}
                      onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-40 bg-surface border border-outline-variant/40 rounded-lg px-4 py-2.5 text-sm text-tertiary tracking-[0.35em] font-bold placeholder:text-outline/60 placeholder:tracking-[0.35em] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-6 py-3.5 rounded-lg font-bold text-tertiary border border-outline-variant/40 hover:bg-surface-container-low transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={assinar}
                  disabled={assinando || codigoOtp.trim().length !== 6}
                  className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary py-3.5 rounded-lg font-bold hover:shadow-lg transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <MaterialIcon icon="draw" size={20} />
                  {assinando ? "Registrando assinatura..." : "Assinar Contrato"}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
