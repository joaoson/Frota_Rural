import type { ContratoData } from "@/features/contracts/types/contractDocument";

/** Campos sem dado cadastrado voltam vazios do servidor — o contrato não inventa valores. */
const ou = (valor: string | number | null | undefined, fallback = "Não informado") =>
  valor === null || valor === undefined || valor === "" ? fallback : String(valor);

/*
 * Cláusulas do documento legado 1.0.0, exatamente como eram exibidas quando os
 * contratos anteriores às revisões foram assinados. Esse texto não fazia parte
 * do hash; contratos novos recebem as cláusulas do servidor (`clausulas`).
 */

export function LegadoPagina1({ data }: { data: ContratoData }) {
  const { contrato, locador, locatario, equipamento, anuncio } = data;
  return (
    <>
      {/* Cláusula 1 */}
      <div className="clausula">
        <div className="clausula-num">Cláusula 1</div>
        <div className="clausula-titulo">Objeto do Contrato</div>
        <table className="dados">
          <tbody>
            <tr><td>Tipo de equipamento</td><td>{ou(equipamento.tipo)}</td></tr>
            <tr><td>Marca e Modelo</td><td>{ou(`${equipamento.marca} ${equipamento.modelo}`.trim())}</td></tr>
            <tr><td>Ano de fabricação</td><td>{ou(equipamento.ano)}</td></tr>
            <tr><td>Nº Renagro</td><td>{ou(equipamento.renagro)}</td></tr>
            {equipamento.valor_estimado && (
              <tr><td>Valor de referência do equipamento</td><td><strong>R$ {equipamento.valor_estimado}</strong></td></tr>
            )}
            <tr>
              <td>Tipo de serviço</td>
              <td>{[anuncio.tipo_servico, anuncio.finalidade_uso].filter(Boolean).join(" — ")}</td>
            </tr>
            <tr><td>Local de execução</td><td>{ou(locatario.local_servico)}</td></tr>
          </tbody>
        </table>
        <div className="clausula-body">
          <div><span className="item-num">1.1</span> O equipamento será entregue livre de defeitos conhecidos que possam impedir sua operation. Caso contrário, o Locador responderá pelos danos causados ao Locatário.</div>
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
          <div><span className="item-num">3.1</span> O equipamento estará disponível para retirada a partir de <strong>{contrato.data_inicio}</strong>, no endereço: <strong>{ou(locador.endereco_equipamento)}</strong>.</div>
          <div><span className="item-num">3.2</span> No momento da retirada e da devolução, as partes realizarão vistoria do equipamento, com registro fotográfico de seu estado e leitura do horímetro.</div>
          <div><span className="item-num">3.3</span> Os custos de mobilização e desmobilização do equipamento são de responsabilidade do <strong>Locador</strong>.</div>
        </div>
      </div>
    </>
  );
}

export function LegadoPagina2({ data }: { data: ContratoData }) {
  const { contrato } = data;
  return (
    <>
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
          <div>
            <span className="item-num">4.1</span> O pagamento é realizado pela plataforma FrotaRural no momento da confirmação da reserva. O comprovante é gerado automaticamente. O repasse ao Locador ocorre após a conclusão da locação.
            {contrato.valor_locacao && contrato.valor_taxa_plataforma && (
              <>
                {" "}O valor estimado se compõe de <strong>R$ {contrato.valor_locacao}</strong> de locação
                {" "}(tarifa × horas estimadas) e <strong>R$ {contrato.valor_taxa_plataforma}</strong> de taxa
                da plataforma
                {contrato.percentual_taxa_plataforma && ` (${contrato.percentual_taxa_plataforma}%)`}.
              </>
            )}
          </div>
        </div>

        <div className="horim-box">
          <div className="horim-head">
            <span className="material-symbols-outlined" style={{ color: "var(--ct-brand-text)", fontSize: "14px" }}>speed</span>
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
                <th style={{ color: "var(--ct-brand-soft)", fontSize: "8.5px" }}>Responsável</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Check-in</strong> — início do serviço</td>
                <td>Foto do horímetro anexada na plataforma</td>
                <td style={{ color: "var(--ct-muted)", fontSize: "10.5px" }}>Operador / Locador</td>
              </tr>
              <tr>
                <td><strong>Check-out</strong> — fim do serviço</td>
                <td>Foto do horímetro anexada na plataforma</td>
                <td style={{ color: "var(--ct-muted)", fontSize: "10.5px" }}>Operador / Locador</td>
              </tr>
              <tr className="total-row">
                <td>Horas efetivamente utilizadas</td>
                <td colSpan={2}>
                  Informadas pelo operador no check-out &nbsp;·&nbsp;{" "}
                  <span style={{ color: "var(--ct-gold-text)", fontSize: "10.5px" }}>Confirmadas pelo Locador na plataforma</span>
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
    </>
  );
}

export function LegadoPagina3({ data }: { data: ContratoData }) {
  const { equipamento, locatario } = data;
  return (
    <>
      {/* Cláusula 7 */}
      <div className="clausula">
        <div className="clausula-num">Cláusula 7</div>
        <div className="clausula-titulo">Responsabilidades</div>
        <table className="resp">
          <thead>
            <tr><th>Situação</th><th>Responsável</th></tr>
          </thead>
          <tbody>
            <tr><td>Defeito mecânico preexistente à entrega</td><td style={{ color: "var(--ct-brand-text)" }}>Locador</td></tr>
            <tr><td>Dano causado por obstáculo não informado pelo Locatário</td><td style={{ color: "var(--ct-gold-text)" }}>Locatário</td></tr>
            <tr><td>Erro do operador indicado pelo Locador</td><td style={{ color: "var(--ct-brand-text)" }}>Locador</td></tr>
            <tr><td>Furto ou roubo enquanto o equipamento estiver com o Locatário</td><td style={{ color: "var(--ct-gold-text)" }}>Locatário</td></tr>
            <tr><td>Dano por evento imprevisível (raio, enchente, granizo)</td><td style={{ color: "var(--ct-muted)" }}>Nenhuma das partes</td></tr>
          </tbody>
        </table>
        <div className="clausula-body">
          <div><span className="item-num">7.2</span> Qualquer dano deve ser registrado com fotografia ou vídeo e comunicado pela plataforma. O valor do reparo será apurado com base em orçamento de oficina — cada parte pode indicar um, sendo adotada a média dos dois.</div>
          <div>
            <span className="item-num">7.3</span>{" "}
            {equipamento.valor_estimado ? (
              <>O valor de referência do equipamento (<strong>R$ {equipamento.valor_estimado}</strong>) serve como limite de indenização em caso de dano total ou perda.</>
            ) : (
              <>Em caso de dano total ou perda, a indenização terá como limite o valor de mercado do equipamento na data do evento, apurado por laudo ou por orçamento nos termos do item 7.2.</>
            )}
          </div>
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
            <div style={{ fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.11em", color: "var(--ct-muted)", marginBottom: "4px" }}>
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
          <div className="multa-card" style={{ background: "var(--ct-ok-bg)", border: "1px solid var(--ct-ok-line)" }}>
            <div className="multa-label" style={{ color: "var(--ct-ok-label)" }}>Rescisão por culpa do Locatário</div>
            <div style={{ color: "var(--ct-brand-text)" }}>Multa de <strong>10%</strong> sobre o valor total estimado, acrescida de indenização por danos ao equipamento.</div>
          </div>
          <div className="multa-card" style={{ background: "var(--ct-warn-bg)", border: "1px solid var(--ct-warn-line)" }}>
            <div className="multa-label" style={{ color: "var(--ct-warn-text)" }}>Rescisão por culpa do Locador</div>
            <div style={{ color: "var(--ct-warn-text)" }}>Multa de <strong>10%</strong> sobre o valor total estimado e restituição integral dos valores pagos.</div>
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
            <div>
              <span className="item-num">11.1</span> Fica eleito o foro do domicílio do Locatário
              {locatario.municipio && locatario.uf && (
                <> — <strong>{locatario.municipio}/{locatario.uf}</strong></>
              )}
              {" "}— para dirimir quaisquer conflitos oriundos deste contrato, nos termos do art. 101, I, do Código de Defesa do Consumidor. As partes comprometem-se a buscar solução por mediação antes de recorrer ao Judiciário.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
