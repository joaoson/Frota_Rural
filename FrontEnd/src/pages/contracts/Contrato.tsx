import { useAuth } from "@/contexts/useAuth";
import { ContractAmendmentsPanel } from "@/features/contracts/components/ContractAmendmentsPanel";
import { useEffect, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router";
import "./Contrato.css";
import ThemeToggle from "@/components/ThemeToggle";
import { useContractDocument } from "@/features/contracts/hooks/useContracts";
import type { AssinaturaEvidencia } from "@/features/contracts/types/contractDocument";
import { formatarUtcCompleto } from "@/shared/utils/formatarUtc";
import { ClausulasDaPagina, TextoRico } from "./ClausulasDocumento";
import { LegadoPagina1, LegadoPagina2, LegadoPagina3 } from "./ClausulasLegadas";

/** Campos sem dado cadastrado voltam vazios do servidor — o contrato não inventa valores. */
const ou = (valor: string | number | null | undefined, fallback = "Não informado") =>
  valor === null || valor === undefined || valor === "" ? fallback : String(valor);

/**
 * Evidência do aceite eletrônico de uma das partes.
 *
 * É o que dá força probatória à assinatura eletrônica simples: o hash prova
 * qual documento foi aceito, o timestamp e o IP provam quando e de onde, e o
 * hash do registro encadeia tudo em um log em que uma alteração é detectável.
 */
function BlocoEvidencia({ evidencia }: { evidencia: AssinaturaEvidencia }) {
  return (
    <div className="evid-box">
      <div className="evid-title">Evidência do aceite</div>
      <div className="evid-row">
        <span className="evid-key">Data e hora (UTC)</span>
        <span className="evid-val">{formatarUtcCompleto(evidencia.assinado_em_utc)}</span>
      </div>
      <div className="evid-row">
        <span className="evid-key">E-mail</span>
        <span className="evid-val">{ou(evidencia.email, "—")}</span>
      </div>
      <div className="evid-row">
        <span className="evid-key">IP de origem</span>
        <span className="evid-val">{ou(evidencia.ip, "—")}</span>
      </div>
      <div className="evid-row">
        <span className="evid-key">Versão do documento</span>
        <span className="evid-val">{ou(evidencia.versao_documento, "—")}</span>
      </div>
      {evidencia.otp_verificado && (
        <div className="evid-row">
          <span className="evid-key">Posse do e-mail</span>
          <span className="evid-val evid-otp">
            <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>mark_email_read</span>
            Confirmada por código
          </span>
        </div>
      )}
      <div className="evid-row" style={{ display: "block", marginTop: "4px" }}>
        <span className="evid-key">
          Hash {evidencia.algoritmo_hash.toUpperCase()} do documento assinado
        </span>
        <div className="evid-hash">{evidencia.hash_documento}</div>
      </div>
    </div>
  );
}

export default function Contrato() {
  const { userId } = useAuth();
  const { id } = useParams<{ id: string }>();
  const documentQuery = useContractDocument(id ?? null);
  const data = documentQuery.data ?? null;
  const loading = documentQuery.isLoading;
  const [searchParams] = useSearchParams();
  const printedId = useRef<string | null>(null);
  const requestedPrint = searchParams.get("print") === "1";
  useEffect(() => {
    if (!data || !id || !requestedPrint || printedId.current === id) return;
    const timer = window.setTimeout(() => { printedId.current = id; window.print(); }, 250);
    return () => window.clearTimeout(timer);
  }, [data, id, requestedPrint]);

  if (loading) {
    return (
      <div className="contrato-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--ct-backdrop)" }}>
        <p style={{ color: "var(--ct-muted)", fontFamily: "'Epilogue', sans-serif", fontSize: "14px" }}>
          Carregando documento do contrato...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="contrato-root" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--ct-backdrop)", gap: "16px" }}>
        <p style={{ color: "var(--ct-error)", fontFamily: "'Epilogue', sans-serif", fontWeight: "bold", fontSize: "16px" }}>
          Contrato não encontrado.
        </p>
        <Link to="/" style={{ padding: "10px 20px", background: "var(--ct-brand-2)", color: "var(--ct-on-brand)", textDecoration: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px" }}>
          Voltar ao Início
        </Link>
      </div>
    );
  }

  const { contrato, operacao, locador, locatario, assinatura, evidencia, revisao } = data;
  const evidenciaLocador = evidencia?.assinaturas.find((a) => a.papel === "locador");
  const evidenciaLocatario = evidencia?.assinaturas.find((a) => a.papel === "locatario");

  return (
    <div className="contrato-root">
      {id && data.revisao && data.gestao && <div className="no-print mx-auto my-5 max-w-4xl"><ContractAmendmentsPanel contractId={id} actorId={userId} document={data} /></div>}
      <div className="print-btn-wrap no-print">
        <ThemeToggle />
        <button className="print-btn" onClick={() => window.print()}>
          <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: "16px" }}>print</span>
          Imprimir / Salvar PDF
        </button>
      </div>

      {data.previa && (
        <div className="info-block" role="status" style={{ maxWidth: "820px", margin: "0 auto 12px" }}>
          <strong style={{ color: "#43493d" }}>Prévia do contrato.</strong> O texto é congelado quando o
          pagamento é confirmado, e só essa versão congelada pode ser assinada.
        </div>
      )}

      {/* PÁGINA 1 */}
      <div className="page">
        <div className="page-header">
          <div>
            <div>
              <span className="header-brand">Frota Rural</span>
              <span className="header-domain">frotarural.app</span>
            </div>
            <div className="header-title">
              {data.titulo ?? <>Contrato de Locação de<br />Maquinário Agrícola<br />com Prestação de Serviços</>}
            </div>
          </div>
          <div className="header-id">
            <div className="header-id-label">Identificação</div>
            <div className="header-id-row">
              <span className="header-id-key">Nº Contrato</span>
              <span className="header-id-val">{contrato.numero}</span>
            </div>
            <div className="header-id-row">
              <span className="header-id-key">Operação</span>
              <span className="header-id-val">{operacao.codigo}</span>
            </div>
            <div className="header-id-row">
              <span className="header-id-key">Gerado em</span>
              <span className="header-id-val">{contrato.data_geracao}</span>
            </div>
          </div>
        </div>

        <div className="page-body">
          {/* Partes */}
          <div className="partes-grid">
            <div className="parte-card">
              <div className="parte-label"><span className="dot" style={{ background: "var(--ct-brand-text)" }} />Locador</div>
              <div className="parte-nome">{locador.razao_social}</div>
              <div className="parte-info">
                {ou(locador.tipo_documento, "Documento")} nº {ou(locador.documento, "—")}
              </div>
              <div className="parte-info">{ou(locador.endereco_completo, "—")}</div>
              <div className="parte-sep" />
              <div className="parte-info"><strong>{ou(locador.representante_nome, "—")}</strong></div>
              {(locador.representante_cpf || locador.representante_estado_civil) && (
                <div className="parte-info" style={{ color: "#73796c" }}>
                  {[
                    locador.representante_cpf && `CPF nº ${locador.representante_cpf}`,
                    locador.representante_estado_civil,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
            <div className="parte-card">
              <div className="parte-label"><span className="dot" style={{ background: "var(--ct-gold)" }} />Locatário</div>
              <div className="parte-nome">{locatario.razao_social}</div>
              <div className="parte-info">
                {ou(locatario.tipo_documento, "Documento")} nº {ou(locatario.documento, "—")}
              </div>
              <div className="parte-info">{ou(locatario.endereco_completo, "—")}</div>
              <div className="parte-sep" />
              <div className="parte-info"><strong>{ou(locatario.representante_nome, "—")}</strong></div>
              {(locatario.representante_cpf || locatario.representante_estado_civil) && (
                <div className="parte-info" style={{ color: "#73796c" }}>
                  {[
                    locatario.representante_cpf && `CPF nº ${locatario.representante_cpf}`,
                    locatario.representante_estado_civil,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: "var(--ct-muted)", lineHeight: 1.6 }}>
            {data.preambulo ? <TextoRico texto={data.preambulo} /> : (
              <>Este contrato é regido pelo <strong style={{ color: "var(--ct-ink-2)" }}>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong> e, no que não estiver por ele previsto, pelo <strong style={{ color: "var(--ct-ink-2)" }}>Código Civil Brasileiro (Lei nº 10.406/2002)</strong>.</>
            )}
          </div>

          <hr className="clausula-divider" />

          {data.clausulas ? <ClausulasDaPagina clausulas={data.clausulas} pagina={1} /> : <LegadoPagina1 data={data} />}
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "var(--ct-on-brand-faint)", fontSize: "9.5px" }}>{contrato.numero}</span>
          <span className="footer-num">01</span>
        </div>
      </div>

      {/* PÁGINA 2 */}
      <div className="page">
        <div className="mini-header">
          <span className="mini-header-brand">Frota Rural</span>
          <span className="mini-header-sub">frotarural.app</span>
        </div>

        <div className="page-body">
          {data.clausulas ? <ClausulasDaPagina clausulas={data.clausulas} pagina={2} /> : <LegadoPagina2 data={data} />}
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "var(--ct-on-brand-faint)", fontSize: "9.5px" }}>{contrato.numero}</span>
          <span className="footer-num">02</span>
        </div>
      </div>

      {/* PÁGINA 3 */}
      <div className="page">
        <div className="mini-header">
          <span className="mini-header-brand">Frota Rural</span>
          <span className="mini-header-sub">frotarural.app</span>
        </div>

        <div className="page-body">
          {data.clausulas ? <ClausulasDaPagina clausulas={data.clausulas} pagina={3} /> : <LegadoPagina3 data={data} />}

          <hr className="clausula-divider" />

          {/* Assinaturas */}
          <div className="clausula">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ color: "var(--ct-brand-text)", fontSize: "14px" }}>draw</span>
              <span style={{ fontFamily: "'Epilogue',sans-serif", fontSize: "11px", fontWeight: 800, color: "var(--ct-brand-text)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                Assinatura Digital
              </span>
            </div>
            <div className="info-block">
              {data.declaracao_assinatura ? <TextoRico texto={data.declaracao_assinatura} /> : (
                <>Assinado eletronicamente por meio da plataforma FrotaRural. A assinatura eletrônica simples tem validade entre as partes nos termos da <strong style={{ color: "#43493d" }}>MP nº 2.200-2/2001, art. 10, §2º</strong>, e da <strong style={{ color: "#43493d" }}>Lei nº 14.063/2020, art. 4º, I</strong>. Ao assinar, cada parte declara que leu, compreendeu e concorda com as condições deste contrato.</>
              )}
            </div>
            <div className="assin-grid">
              <div className="assinatura-box">
                <div className="assin-label">Locador</div>
                <div className="assin-nome">{ou(locador.razao_social, "—")}</div>
                <div className="assin-rep">{ou(locador.representante_nome, "—")}</div>
                <div className="assin-stamp">
                  <span className="material-symbols-outlined" style={{ color: "var(--ct-brand-text)", fontSize: "13px" }}>verified</span>
                  <div>
                    <div className="assin-stamp-label">Assinado eletronicamente em</div>
                    <div className="assin-stamp-val">{assinatura.data_locador}</div>
                  </div>
                </div>
                {evidenciaLocador && <BlocoEvidencia evidencia={evidenciaLocador} />}
              </div>
              <div className="assinatura-box">
                <div className="assin-label">Locatário</div>
                <div className="assin-nome">{ou(locatario.razao_social, "—")}</div>
                <div className="assin-rep">{ou(locatario.representante_nome, "—")}</div>
                <div className="assin-stamp">
                  <span className="material-symbols-outlined" style={{ color: "var(--ct-brand-text)", fontSize: "13px" }}>verified</span>
                  <div>
                    <div className="assin-stamp-label">Assinado eletronicamente em</div>
                    <div className="assin-stamp-val">{assinatura.data_locatario}</div>
                  </div>
                </div>
                {evidenciaLocatario && <BlocoEvidencia evidencia={evidenciaLocatario} />}
              </div>
            </div>

            {evidencia && (
              <div className="info-block" style={{ marginTop: "10px" }}>
                <strong style={{ color: "#43493d" }}>
                  Verificação de integridade — versão {ou(contrato.versao_documento, "—")}
                  {revisao && <> · revisão nº {revisao.numero}, congelada em {formatarUtcCompleto(revisao.criada_em_utc)}</>}
                </strong>
                {data.legado && (
                  <div style={{ marginTop: "3px" }}>
                    Documento legado: assinado antes do congelamento das revisões. O hash cobre os termos, mas
                    não o texto das cláusulas.
                  </div>
                )}
                <div style={{ marginTop: "3px" }}>
                  Hash {evidencia.algoritmo_hash.toUpperCase()} deste documento:
                </div>
                <div className="evid-hash">{evidencia.hash_documento_atual}</div>
                <div style={{ marginTop: "3px" }}>
                  O hash acima deve coincidir com o registrado em cada aceite. Se divergir, o documento
                  foi alterado depois de assinado. Os registros de assinatura são gravados em log
                  imutável e encadeado, e a trilha completa — com IP, User-Agent e conferência da
                  cadeia — está disponível na plataforma.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "var(--ct-on-brand-faint)", fontSize: "9.5px" }}>{contrato.numero}</span>
          <span className="footer-num">03</span>
        </div>
      </div>
    </div>
  );
}
