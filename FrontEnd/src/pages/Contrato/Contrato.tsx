import { useParams } from "react-router";
import "./Contrato.css";
import { mockContrato } from "./mock";
import type { ContratoData } from "./types";

export default function Contrato() {
  useParams<{ id: string }>();

  const data: ContratoData = mockContrato;
  const { contrato, operacao, locador, locatario, equipamento, anuncio, assinatura } = data;

  return (
    <div className="contrato-root">
      <div className="print-btn-wrap no-print">
        <button className="print-btn" onClick={() => window.print()}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>print</span>
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* PÁGINA 1 */}
      <div className="page">
        <div className="page-header">
          <div>
            <div>
              <span className="header-brand">Frota Rural</span>
              <span className="header-domain">frotarural.app</span>
            </div>
            <div className="header-title">
              Contrato de Locação de<br />Maquinário Agrícola<br />com Prestação de Serviços
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
              <div className="parte-label"><span className="dot" style={{ background: "#173901" }} />Locador</div>
              <div className="parte-nome">{locador.razao_social}</div>
              <div className="parte-info">{locador.tipo_documento} nº {locador.documento}</div>
              <div className="parte-info">{locador.endereco_completo}</div>
              <div className="parte-sep" />
              <div className="parte-info"><strong>{locador.representante_nome}</strong></div>
              <div className="parte-info" style={{ color: "#73796c" }}>
                CPF nº {locador.representante_cpf} · {locador.representante_estado_civil}
              </div>
            </div>
            <div className="parte-card">
              <div className="parte-label"><span className="dot" style={{ background: "#feb234" }} />Locatário</div>
              <div className="parte-nome">{locatario.razao_social}</div>
              <div className="parte-info">{locatario.tipo_documento} nº {locatario.documento}</div>
              <div className="parte-info">{locatario.endereco_completo}</div>
              <div className="parte-sep" />
              <div className="parte-info"><strong>{locatario.representante_nome}</strong></div>
              <div className="parte-info" style={{ color: "#73796c" }}>
                CPF nº {locatario.representante_cpf} · {locatario.representante_estado_civil}
              </div>
            </div>
          </div>

          <div style={{ fontSize: "11px", color: "#73796c", lineHeight: 1.6 }}>
            Este contrato é regido pelo <strong style={{ color: "#43493d" }}>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong> e, no que não estiver por ele previsto, pelo <strong style={{ color: "#43493d" }}>Código Civil Brasileiro (Lei nº 10.406/2002)</strong>.
          </div>

          <hr className="clausula-divider" />

          {/* Cláusula 1 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 1</div>
            <div className="clausula-titulo">Objeto do Contrato</div>
            <table className="dados">
              <tbody>
                <tr><td>Tipo de equipamento</td><td>{equipamento.tipo}</td></tr>
                <tr><td>Marca e Modelo</td><td>{equipamento.marca} {equipamento.modelo}</td></tr>
                <tr><td>Ano de fabricação</td><td>{equipamento.ano}</td></tr>
                <tr><td>Nº Renagro</td><td>{equipamento.renagro}</td></tr>
                <tr><td>Valor de referência do equipamento</td><td><strong>R$ {equipamento.valor_estimado}</strong></td></tr>
                <tr><td>Tipo de serviço</td><td>{anuncio.tipo_servico} — {anuncio.finalidade_uso}</td></tr>
                <tr><td>Local de execução</td><td>{locatario.local_servico}</td></tr>
              </tbody>
            </table>
            <div className="clausula-body">
              <div><span className="item-num">1.1</span> O equipamento será entregue livre de defeitos conhecidos que possam impedir sua operação. Caso contrário, o Locador responderá pelos danos causados ao Locatário.</div>
              <div><span className="item-num">1.2</span> A operação do equipamento deve ser realizada por operador habilitado, indicado pelo Locador, com credencial técnica válida para condução desse tipo de maquinário. O nome e os dados do operador serão informados antes do início dos serviços.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusula 2 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 2</div>
            <div className="clausula-titulo">Prazo</div>
            <div className="prazo-grid">
              <div className="prazo-card">
                <div className="prazo-label">Início</div>
                <div className="prazo-val">{contrato.data_inicio}</div>
              </div>
              <div className="prazo-card">
                <div className="prazo-label">Término</div>
                <div className="prazo-val">{contrato.data_fim}</div>
              </div>
              <div className="prazo-card destaque">
                <div className="prazo-label">Duração</div>
                <div className="prazo-val">{contrato.prazo_dias} dias</div>
              </div>
            </div>
            <div className="clausula-body">
              <div><span className="item-num">2.1</span> Na devolução, o equipamento deve estar nas mesmas condições em que foi entregue. O desgaste natural do uso regular não gera custo adicional.</div>
              <div><span className="item-num">2.2</span> A parte interessada em prorrogar deve comunicar a outra com pelo menos <strong>15 dias de antecedência</strong>. Com concordância mútua, a extensão do prazo é registrada na plataforma e o contrato segue nas mesmas condições.</div>
              <div><span className="item-num">2.3</span> Paralisações por condições climáticas adversas comprovadas suspendem o prazo sem custo adicional ao Locatário, salvo acordo em contrário registrado na plataforma.</div>
              <div><span className="item-num">2.4</span> Durante a vigência do contrato, qualquer parte pode solicitar alteração de data ou duração pela plataforma. A alteração só é efetivada com o aceite de Locador e Locatário. Enquanto pendente, os termos originais permanecem vigentes. Se o novo período conflitar com outra reserva confirmada do equipamento, a solicitação será bloqueada pela plataforma. Alterações de prazo acordadas entre as partes não geram multa.</div>
              <div><span className="item-num">2.5</span> O Locatário pode programar recorrência deste contrato com frequência semanal, quinzenal ou mensal. Para cada período, a plataforma gerará um novo contrato com as mesmas condições, sujeito ao aceite das partes. Conflitos de disponibilidade do equipamento no período recorrente bloquearão a programação, com indicação das datas com conflito para ajuste.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusula 3 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 3</div>
            <div className="clausula-titulo">Retirada e Devolução</div>
            <div className="clausula-body">
              <div><span className="item-num">3.1</span> O equipamento estará disponível para retirada a partir de <strong>{contrato.data_inicio}</strong>, no endereço: <strong>{locador.endereco_equipamento}</strong>.</div>
              <div><span className="item-num">3.2</span> No momento da retirada e da devolução, as partes realizarão vistoria do equipamento, com registro fotográfico de seu estado e leitura do horímetro.</div>
              <div><span className="item-num">3.3</span> Os custos de mobilização e desmobilização do equipamento são de responsabilidade do <strong>Locador</strong>.</div>
            </div>
          </div>
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9.5px" }}>{contrato.numero}</span>
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
          {/* Cláusula 4 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 4</div>
            <div className="clausula-titulo">Preço, Pagamento e Horímetro</div>

            <div className="valor-grid">
              <div className="valor-card">
                <div className="valor-label">Tarifa / hora</div>
                <div className="valor-num">R$ {contrato.valor_unitario}</div>
              </div>
              <div className="valor-card">
                <div className="valor-label">Estimativa</div>
                <div className="valor-num">{contrato.estimativa_horas} h</div>
              </div>
              <div className="valor-card destaque">
                <div className="valor-label">Valor estimado</div>
                <div className="valor-num">R$ {contrato.valor_total_estimado}</div>
              </div>
            </div>

            <div className="clausula-body">
              <div><span className="item-num">4.1</span> O pagamento é realizado pela plataforma FrotaRural no momento da confirmação da reserva. O comprovante é gerado automaticamente. O repasse ao Locador ocorre após a conclusão da locação.</div>
            </div>

            <div className="horim-box">
              <div className="horim-head">
                <span className="material-symbols-outlined" style={{ color: "#173901", fontSize: "14px" }}>speed</span>
                <span className="horim-head-label">Horímetro — Check-in e Check-out</span>
              </div>
              <div className="horim-nota">
                <span className="item-num">4.2</span> A leitura do horímetro é registrada em dois momentos obrigatórios na plataforma: no <strong>check-in</strong>, antes do início dos serviços, e no <strong>check-out</strong>, ao término. Em ambos, o operador deve fotografar o painel do horímetro e informar a leitura na plataforma. Esse registro é o documento oficial para o cálculo do valor final.
              </div>
              <table className="horim">
                <thead>
                  <tr>
                    <th>Momento</th>
                    <th>Como registrar</th>
                    <th style={{ color: "rgba(168,211,138,0.8)", fontSize: "8.5px" }}>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Check-in</strong> — início do serviço</td>
                    <td>Foto do horímetro anexada na plataforma</td>
                    <td style={{ color: "#73796c", fontSize: "10.5px" }}>Operador / Locador</td>
                  </tr>
                  <tr>
                    <td><strong>Check-out</strong> — fim do serviço</td>
                    <td>Foto do horímetro anexada na plataforma</td>
                    <td style={{ color: "#73796c", fontSize: "10.5px" }}>Operador / Locador</td>
                  </tr>
                  <tr className="total-row">
                    <td>Horas efetivamente utilizadas</td>
                    <td colSpan={2}>
                      Informadas pelo operador no check-out &nbsp;·&nbsp;{" "}
                      <span style={{ color: "#815500", fontSize: "10.5px" }}>Confirmadas pelo Locador na plataforma</span>
                    </td>
                  </tr>
                  <tr className="final-row">
                    <td>Valor final apurado</td>
                    <td colSpan={2} style={{ fontSize: "13px" }}>
                      <strong>Tarifa × horas informadas</strong>{" "}
                      <span style={{ fontSize: "9.5px", opacity: 0.6 }}>· gerado após confirmação do Locador</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="clausula-body">
              <div><span className="item-num">4.3</span> Se as horas informadas no check-out forem <strong>superiores</strong> à estimativa, o Locatário pagará a diferença diretamente ao Locador em até <strong>5 dias úteis</strong> após o registro do check-out. Se forem <strong>inferiores</strong>, não haverá devolução de valor — o montante pago corresponde à disponibilidade garantida do equipamento durante o período contratado.</div>
              <div><span className="item-num">4.4</span> Registros de check-out com horímetro inferior ao do check-in, ou com valores inválidos, serão rejeitados pela plataforma. As partes devem regularizar o registro antes da conclusão da locação.</div>
              <div><span className="item-num">4.5</span> O atraso no pagamento de valores devidos implica juros de mora de <strong>1% ao mês</strong> e multa de <strong>2%</strong> sobre o saldo em aberto.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusulas 5 e 6 */}
          <div className="obrig-grid">
            <div className="obrig-card">
              <div className="obrig-head">
                <div className="clausula-num" style={{ marginBottom: "1px" }}>Cláusula 5</div>
                <div className="clausula-titulo" style={{ fontSize: "13px" }}>Obrigações do Locador</div>
              </div>
              <div className="obrig-body">
                <div className="obrig-item"><span className="badge-l">5.1</span><span>Entregar o equipamento funcionando e com manutenção em dia;</span></div>
                <div className="obrig-item"><span className="badge-l">5.2</span><span>Indicar operador com credencial técnica válida, responsável pelo cumprimento da NR-31;</span></div>
                <div className="obrig-item"><span className="badge-l">5.3</span><span>Informar limitações técnicas que possam afetar a operação na área indicada;</span></div>
                <div className="obrig-item"><span className="badge-l">5.4</span><span>Realizar o check-in e o check-out na plataforma, com foto do horímetro em cada momento;</span></div>
                <div className="obrig-item"><span className="badge-l">5.5</span><span>Fornecer combustível, água e lubrificantes necessários à operação do equipamento;</span></div>
                <div className="obrig-item"><span className="badge-l">5.6</span><span>Substituir o equipamento por equivalente em caso de defeito de sua responsabilidade.</span></div>
              </div>
            </div>
            <div className="obrig-card">
              <div className="obrig-head">
                <div className="clausula-num" style={{ marginBottom: "1px" }}>Cláusula 6</div>
                <div className="clausula-titulo" style={{ fontSize: "13px" }}>Obrigações do Locatário</div>
              </div>
              <div className="obrig-body">
                <div className="obrig-item"><span className="badge-r">6.1</span><span>Efetuar os pagamentos nos prazos estabelecidos na Cláusula 4;</span></div>
                <div className="obrig-item"><span className="badge-r">6.2</span><span>Garantir acesso à área de serviço e sinalizar obstáculos no terreno;</span></div>
                <div className="obrig-item"><span className="badge-r">6.3</span><span>Informar previamente riscos no terreno (pedras, valas, cercas elétricas, tubulações);</span></div>
                <div className="obrig-item"><span className="badge-r">6.4</span><span>Não operar o equipamento sem autorização do Locador, salvo habilitação técnica comprovada;</span></div>
                <div className="obrig-item"><span className="badge-r">6.5</span><span>Zelar pela guarda do equipamento contra furto e roubo durante sua custódia.</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9.5px" }}>{contrato.numero}</span>
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
          {/* Cláusula 7 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 7</div>
            <div className="clausula-titulo">Responsabilidades</div>
            <table className="resp">
              <thead>
                <tr><th>Situação</th><th>Responsável</th></tr>
              </thead>
              <tbody>
                <tr><td>Defeito mecânico preexistente à entrega</td><td style={{ color: "#173901" }}>Locador</td></tr>
                <tr><td>Dano causado por obstáculo não informado pelo Locatário</td><td style={{ color: "#815500" }}>Locatário</td></tr>
                <tr><td>Erro do operador indicado pelo Locador</td><td style={{ color: "#173901" }}>Locador</td></tr>
                <tr><td>Furto ou roubo enquanto o equipamento estiver com o Locatário</td><td style={{ color: "#815500" }}>Locatário</td></tr>
                <tr><td>Dano por evento imprevisível (raio, enchente, granizo)</td><td style={{ color: "#73796c" }}>Nenhuma das partes</td></tr>
              </tbody>
            </table>
            <div className="clausula-body">
              <div><span className="item-num">7.2</span> Qualquer dano deve ser registrado com fotografia ou vídeo e comunicado pela plataforma. O valor do reparo será apurado com base em orçamento de oficina — cada parte pode indicar um, sendo adotada a média dos dois.</div>
              <div><span className="item-num">7.3</span> O valor de referência do equipamento (<strong>R$ {equipamento.valor_estimado}</strong>) serve como limite de indenização em caso de dano total ou perda.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusula 8 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 8</div>
            <div className="clausula-titulo">Papel da Plataforma FrotaRural</div>
            <div className="aviso-legal">
              <span className="material-symbols-outlined aviso-icon">info</span>
              <div>
                <div style={{ fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.11em", color: "#73796c", marginBottom: "4px" }}>
                  Intermediação tecnológica
                </div>
                <span>
                  A FrotaRural não é parte deste contrato e não responde por danos causados pelo equipamento, acidentes de trabalho, inadimplemento das partes, estado de conservação do equipamento, resultado agronômico dos serviços, danos ambientais ou litígios entre as partes.
                </span>
              </div>
            </div>
            <div className="clausula-body">
              <div><span className="item-num">8.1</span> A FrotaRural opera como marketplace de intermediação tecnológica, nos termos do Marco Civil da Internet (Lei nº 12.965/2014), sem que isso gere vínculo empregatício, societário ou solidariedade com as partes contratantes.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusula 9 */}
          <div className="clausula">
            <div className="clausula-num">Cláusula 9</div>
            <div className="clausula-titulo">Cancelamento e Rescisão</div>
            <div className="clausula-body">
              <div><span className="item-num">9.1</span> O cancelamento pode ser solicitado pelo módulo de contratos da plataforma, informando o motivo. O estorno seguirá a política de cancelamento vigente na data da operação.</div>
              <div><span className="item-num">9.2</span> Se o contrato não for assinado por ambas as partes dentro do prazo estipulado, a reserva é cancelada automaticamente e o pagamento é estornado.</div>
            </div>
            <div className="multa-grid">
              <div className="multa-card" style={{ background: "#f0fae8", border: "1px solid #c4efa3" }}>
                <div className="multa-label" style={{ color: "#2d5016" }}>Rescisão por culpa do Locatário</div>
                <div style={{ color: "#173901" }}>Multa de <strong>10%</strong> sobre o valor total estimado, acrescida de indenização por danos ao equipamento.</div>
              </div>
              <div className="multa-card" style={{ background: "#fff8ee", border: "1px solid #ffddb2" }}>
                <div className="multa-label" style={{ color: "#6d4700" }}>Rescisão por culpa do Locador</div>
                <div style={{ color: "#6d4700" }}>Multa de <strong>10%</strong> sobre o valor total estimado e restituição integral dos valores pagos.</div>
              </div>
            </div>
            <div className="clausula-body">
              <div><span className="item-num">9.5</span> Não há penalidade em caso de rescisão por caso fortuito ou força maior (art. 393 do Código Civil), nem em caso de alteração de prazo acordada entre as partes nos termos do item 2.4.</div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Cláusulas 10 e 11 */}
          <div className="grid-2">
            <div className="clausula">
              <div className="clausula-num">Cláusula 10</div>
              <div className="clausula-titulo" style={{ fontSize: "13px" }}>Disposições Gerais</div>
              <div className="clausula-body" style={{ fontSize: "11.5px" }}>
                <div><span className="item-num">10.1</span> Este contrato não cria vínculo empregatício entre o Locatário e pessoas indicadas pelo Locador.</div>
                <div><span className="item-num">10.2</span> As informações compartilhadas são confidenciais, conforme a LGPD (Lei nº 13.709/2018).</div>
              </div>
            </div>
            <div className="clausula">
              <div className="clausula-num">Cláusula 11</div>
              <div className="clausula-titulo" style={{ fontSize: "13px" }}>Foro</div>
              <div className="clausula-body" style={{ fontSize: "11.5px" }}>
                <div><span className="item-num">11.1</span> Fica eleito o foro do domicílio do Locatário — <strong>{locatario.municipio}/{locatario.uf}</strong> — para dirimir quaisquer conflitos oriundos deste contrato, nos termos do art. 101, I, do Código de Defesa do Consumidor. As partes comprometem-se a buscar solução por mediação antes de recorrer ao Judiciário.</div>
              </div>
            </div>
          </div>

          <hr className="clausula-divider" />

          {/* Assinaturas */}
          <div className="clausula">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ color: "#173901", fontSize: "14px" }}>draw</span>
              <span style={{ fontFamily: "'Epilogue',sans-serif", fontSize: "11px", fontWeight: 800, color: "#173901", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                Assinatura Digital
              </span>
            </div>
            <div className="info-block">
              Assinado digitalmente por meio da plataforma integrada à FrotaRural, com validade jurídica conforme a MP nº 2.200-2/2001 e a Lei nº 14.063/2020. Ao assinar, cada parte declara que leu, compreendeu e concorda com as condições deste contrato.
            </div>
            <div className="assin-grid">
              <div className="assinatura-box">
                <div className="assin-label">Locador</div>
                <div className="assin-nome">{locador.razao_social}</div>
                <div className="assin-rep">{locador.representante_nome}</div>
                <div className="assin-stamp">
                  <span className="material-symbols-outlined" style={{ color: "#173901", fontSize: "13px" }}>verified</span>
                  <div>
                    <div className="assin-stamp-label">Assinado digitalmente em</div>
                    <div className="assin-stamp-val">{assinatura.data_locador}</div>
                  </div>
                </div>
              </div>
              <div className="assinatura-box">
                <div className="assin-label">Locatário</div>
                <div className="assin-nome">{locatario.razao_social}</div>
                <div className="assin-rep">{locatario.representante_nome}</div>
                <div className="assin-stamp">
                  <span className="material-symbols-outlined" style={{ color: "#173901", fontSize: "13px" }}>verified</span>
                  <div>
                    <div className="assin-stamp-label">Assinado digitalmente em</div>
                    <div className="assin-stamp-val">{assinatura.data_locatario}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-footer">
          <span className="footer-site">frotarural.app</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9.5px" }}>{contrato.numero}</span>
          <span className="footer-num">03</span>
        </div>
      </div>
    </div>
  );
}
