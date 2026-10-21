import { Fragment } from "react";
import type { BlocoClausula, Clausula } from "@/features/contracts/types/contractDocument";

/** `**trecho**` do texto do servidor vira negrito; o resto é texto puro. */
export function TextoRico({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/).map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**")
          ? <strong key={i}>{parte.slice(2, -2)}</strong>
          : <Fragment key={i}>{parte}</Fragment>,
      )}
    </>
  );
}

const COR_PARTE = {
  locador: "var(--ct-brand-text)",
  locatario: "var(--ct-gold-text)",
  nenhuma: "var(--ct-muted)",
} as const;

function Bloco({ bloco }: { bloco: BlocoClausula }) {
  switch (bloco.tipo) {
    case "itens":
      return (
        <div className="clausula-body">
          {bloco.itens.map((item) => (
            <div key={item.num}><span className="item-num">{item.num}</span> <TextoRico texto={item.texto} /></div>
          ))}
        </div>
      );
    case "tabela":
      return (
        <table className="dados">
          <tbody>
            {bloco.linhas.map(([rotulo, valor]) => (
              <tr key={rotulo}><td>{rotulo}</td><td><TextoRico texto={valor} /></td></tr>
            ))}
          </tbody>
        </table>
      );
    case "cartoes":
      return (
        <div className={`${bloco.estilo}-grid`}>
          {bloco.itens.map((cartao) => (
            <div key={cartao.rotulo} className={`${bloco.estilo}-card${cartao.destaque ? " destaque" : ""}`}>
              <div className={`${bloco.estilo}-label`}>{cartao.rotulo}</div>
              <div className={bloco.estilo === "prazo" ? "prazo-val" : "valor-num"}>{cartao.valor}</div>
            </div>
          ))}
        </div>
      );
    case "responsabilidades":
      return (
        <table className="resp">
          <thead><tr><th>Situação</th><th>Responsável</th></tr></thead>
          <tbody>
            {bloco.linhas.map((linha) => (
              <tr key={linha.situacao}>
                <td>{linha.situacao}</td>
                <td style={{ color: COR_PARTE[linha.parte] }}>{linha.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "aviso":
      return (
        <div className="aviso-legal">
          <span className="material-symbols-outlined aviso-icon">info</span>
          <div>
            <div style={{ fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.11em", color: "var(--ct-muted)", marginBottom: "4px" }}>
              {bloco.titulo}
            </div>
            <span><TextoRico texto={bloco.texto} /></span>
          </div>
        </div>
      );
    case "multas":
      return (
        <div className="multa-grid">
          {bloco.itens.map((multa) => {
            const ok = multa.tom === "ok";
            return (
              <div key={multa.rotulo} className="multa-card" style={ok
                ? { background: "var(--ct-ok-bg)", border: "1px solid var(--ct-ok-line)" }
                : { background: "var(--ct-warn-bg)", border: "1px solid var(--ct-warn-line)" }}>
                <div className="multa-label" style={{ color: ok ? "var(--ct-ok-label)" : "var(--ct-warn-text)" }}>{multa.rotulo}</div>
                <div style={{ color: ok ? "var(--ct-brand-text)" : "var(--ct-warn-text)" }}><TextoRico texto={multa.texto} /></div>
              </div>
            );
          })}
        </div>
      );
  }
}

function ClausulaSimples({ clausula, compacta = false }: { clausula: Clausula; compacta?: boolean }) {
  return (
    <div className="clausula">
      <div className="clausula-num">{clausula.numero}</div>
      <div className="clausula-titulo" style={compacta ? { fontSize: "13px" } : undefined}>{clausula.titulo}</div>
      {clausula.blocos.map((bloco, i) => <Bloco key={i} bloco={bloco} />)}
    </div>
  );
}

function CartaoObrigacoes({ clausula }: { clausula: Clausula }) {
  const marcador = clausula.parte === "locador" ? "badge-l" : "badge-r";
  return (
    <div className="obrig-card">
      <div className="obrig-head">
        <div className="clausula-num" style={{ marginBottom: "1px" }}>{clausula.numero}</div>
        <div className="clausula-titulo" style={{ fontSize: "13px" }}>{clausula.titulo}</div>
      </div>
      <div className="obrig-body">
        {clausula.blocos.flatMap((bloco) => bloco.tipo === "itens" ? bloco.itens : []).map((item) => (
          <div key={item.num} className="obrig-item"><span className={marcador}>{item.num}</span><span><TextoRico texto={item.texto} /></span></div>
        ))}
      </div>
    </div>
  );
}

/** Agrupa cláusulas vizinhas com o mesmo `layout` em colunas, como no contrato impresso. */
function agrupar(clausulas: Clausula[]): Clausula[][] {
  const grupos: Clausula[][] = [];
  for (const clausula of clausulas) {
    const anterior = grupos[grupos.length - 1];
    if (clausula.layout && anterior?.[0].layout === clausula.layout) anterior.push(clausula);
    else grupos.push([clausula]);
  }
  return grupos;
}

/** Cláusulas de uma página do documento 2.0.0, separadas por divisores. */
export function ClausulasDaPagina({ clausulas, pagina }: { clausulas: Clausula[]; pagina: number }) {
  const grupos = agrupar(clausulas.filter((clausula) => clausula.pagina === pagina));
  return (
    <>
      {grupos.map((grupo, i) => (
        <Fragment key={grupo[0].numero}>
          {i > 0 && <hr className="clausula-divider" />}
          {grupo[0].layout === "obrigacoes" ? (
            <div className="obrig-grid">{grupo.map((c) => <CartaoObrigacoes key={c.numero} clausula={c} />)}</div>
          ) : grupo[0].layout === "lado_a_lado" ? (
            <div className="grid-2">{grupo.map((c) => <ClausulaSimples key={c.numero} clausula={c} compacta />)}</div>
          ) : (
            <ClausulaSimples clausula={grupo[0]} />
          )}
        </Fragment>
      ))}
    </>
  );
}
