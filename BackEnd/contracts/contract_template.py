"""Cláusulas do contrato de locação, versão 2.1.0 do modelo.

O texto mora no servidor para entrar no hash do aceite: o que a parte lê é o
mesmo que fica congelado na revisão (ADR 0002 e passo 1.2 do plano). O front só
desenha os blocos. Uma mudança de redação é uma nova versão do modelo; revisões
já congeladas guardam o texto da versão em que nasceram.

Convenções do texto: `**trecho**` vira negrito. Tipos de bloco:

- `itens`: parágrafos numerados (`num`, `texto`);
- `tabela`: pares rótulo/valor;
- `cartoes`: destaques (`estilo` "prazo" ou "valor");
- `responsabilidades`: situação, responsável e a parte a que se refere;
- `aviso`: quadro informativo;
- `multas`: quadros de penalidade (`tom` "ok" ou "aviso").

`layout` agrupa cláusulas vizinhas: "obrigacoes" (cartões lado a lado com marcador
por parte) e "lado_a_lado" (duas colunas). `pagina` reproduz a paginação impressa.
"""

from typing import Any

TEMPLATE_VERSION = "2.1.0"

TITULO = "Contrato de Locação de Maquinário Agrícola com Prestação de Serviços"

PREAMBULO = (
    "Este contrato é regido pelo **Código de Defesa do Consumidor (Lei nº 8.078/1990)** e, no que "
    "não estiver por ele previsto, pelo **Código Civil Brasileiro (Lei nº 10.406/2002)**."
)

DECLARACAO_ASSINATURA = (
    "Assinado eletronicamente por meio da plataforma FrotaRural. A assinatura eletrônica simples tem "
    "validade entre as partes nos termos da **MP nº 2.200-2/2001, art. 10, §2º**, e da "
    "**Lei nº 14.063/2020, art. 4º, I**. Ao assinar, cada parte declara que leu, compreendeu e "
    "concorda com as condições deste contrato."
)


def _ou(valor: object, fallback: str = "Não informado") -> str:
    """Campos sem dado cadastrado: o contrato não inventa valores."""
    return fallback if valor is None or valor == "" else str(valor)


def _itens(*itens: tuple[str, str]) -> dict[str, Any]:
    return {"tipo": "itens", "itens": [{"num": num, "texto": texto} for num, texto in itens]}


def _clausula(numero: int, titulo: str, pagina: int, *blocos: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"numero": f"Cláusula {numero}", "titulo": titulo, "pagina": pagina, "blocos": list(blocos), **extra}


def _objeto(doc: dict[str, Any]) -> dict[str, Any]:
    equipamento, anuncio, locatario = doc["equipamento"], doc["anuncio"], doc["locatario"]
    linhas = [
        ["Tipo de equipamento", _ou(equipamento["tipo"])],
        ["Marca e Modelo", _ou(f"{equipamento['marca']} {equipamento['modelo']}".strip())],
        ["Ano de fabricação", _ou(equipamento["ano"])],
        ["Nº Renagro", _ou(equipamento["renagro"])],
    ]
    if equipamento["valor_estimado"]:
        linhas.append(["Valor de referência do equipamento", f"**R$ {equipamento['valor_estimado']}**"])
    linhas += [
        ["Tipo de serviço", " — ".join(filter(None, [anuncio["tipo_servico"], anuncio["finalidade_uso"]]))],
        ["Local de execução", _ou(locatario["local_servico"])],
    ]
    return _clausula(
        1, "Objeto do Contrato", 1,
        {"tipo": "tabela", "linhas": linhas},
        _itens(
            ("1.1", "O equipamento será entregue livre de defeitos conhecidos que possam impedir sua "
                    "operação. Caso contrário, o Locador responderá pelos danos causados ao Locatário."),
            ("1.2", "A operação do equipamento deve ser realizada por operador habilitado, indicado pelo "
                    "Locador, com credencial técnica válida para condução desse tipo de maquinário. O nome "
                    "e os dados do operador serão informados antes do início dos serviços."),
        ),
    )


def _prazo(doc: dict[str, Any]) -> dict[str, Any]:
    contrato = doc["contrato"]
    return _clausula(
        2, "Prazo", 1,
        {"tipo": "cartoes", "estilo": "prazo", "itens": [
            {"rotulo": "Início", "valor": contrato["data_inicio"], "destaque": False},
            {"rotulo": "Término", "valor": contrato["data_fim"], "destaque": False},
            {"rotulo": "Duração", "valor": f"{contrato['prazo_dias']} dias", "destaque": True},
        ]},
        _itens(
            ("2.1", "Na devolução, o equipamento deve estar nas mesmas condições em que foi entregue. O "
                    "desgaste natural do uso regular não gera custo adicional."),
            ("2.2", "A prorrogação é feita por uma nova reserva na plataforma, sujeita à disponibilidade "
                    "do equipamento, com pagamento e contrato próprios. Ela não altera os termos deste "
                    "contrato."),
            ("2.3", "Paralisações por condições climáticas adversas comprovadas suspendem o prazo sem custo "
                    "adicional ao Locatário, salvo acordo em contrário registrado na plataforma."),
            ("2.4", "Antes do início, uma parte pode solicitar uma troca de datas com a mesma quantidade de "
                    "diárias, sem alterar o preço ou gerar novo pagamento. O aceite da outra parte depende de "
                    "disponibilidade e de pelo menos 7 dias de antecedência do novo início. Até esse aceite, "
                    "o período anterior continua valendo. Ao aceitar, uma nova revisão é emitida e ambas as "
                    "partes precisam assiná-la. A redução do período não é suportada; prorrogações exigem nova reserva."),
            ("2.5", "O Locatário pode programar a recorrência desta locação com frequência semanal, "
                    "quinzenal ou mensal. Para cada período, a plataforma gera uma nova reserva e um novo "
                    "contrato com as mesmas condições, cada um sujeito a pagamento próprio e ao aceite das "
                    "partes. Conflitos de disponibilidade do equipamento bloqueiam a programação, com "
                    "indicação da data em conflito."),
        ),
    )


def _retirada(doc: dict[str, Any]) -> dict[str, Any]:
    return _clausula(
        3, "Retirada e Devolução", 1,
        _itens(
            ("3.1", f"O equipamento estará disponível para retirada a partir de "
                    f"**{doc['contrato']['data_inicio']}**, no endereço: "
                    f"**{_ou(doc['locador']['endereco_equipamento'])}**."),
            ("3.2", "No momento da retirada e da devolução, as partes realizarão vistoria do equipamento. "
                    "O Locador pode registrar na plataforma as leituras do horímetro, que servem apenas "
                    "para acompanhamento de uso."),
            ("3.3", "Os custos de mobilização e desmobilização do equipamento são de responsabilidade do "
                    "**Locador**."),
        ),
    )


def _preco(doc: dict[str, Any]) -> dict[str, Any]:
    contrato = doc["contrato"]
    horas = contrato["horas_por_diaria"]
    composicao = ""
    if contrato["valor_locacao"] and contrato["valor_taxa_plataforma"]:
        percentual = contrato["percentual_taxa_plataforma"]
        composicao = (
            f" O valor total se compõe de **R$ {contrato['valor_locacao']}** de locação (diária × "
            f"diárias) e **R$ {contrato['valor_taxa_plataforma']}** de taxa da plataforma"
            f"{f' ({percentual}%)' if percentual else ''}."
        )
    return _clausula(
        4, "Preço e Pagamento", 2,
        {"tipo": "cartoes", "estilo": "valor", "itens": [
            {"rotulo": f"Diária ({horas} h × R$ {contrato['valor_unitario']})",
             "valor": f"R$ {contrato['valor_diaria']}", "destaque": False},
            {"rotulo": "Diárias", "valor": str(contrato["diarias"]), "destaque": False},
            {"rotulo": "Valor total", "valor": f"R$ {contrato['valor_total']}", "destaque": True},
        ]},
        _itens(
            ("4.1", "O pagamento do valor total é realizado pela plataforma FrotaRural no momento da "
                    "confirmação da reserva. O comprovante é gerado automaticamente. O repasse ao Locador "
                    f"ocorre após a conclusão da locação.{composicao}"),
            ("4.2", f"O preço é fixo por diária: cada dia de calendário do período, incluindo o de início e "
                    f"o de término, corresponde a uma diária de **{horas} horas** à tarifa contratada. O "
                    "valor não depende das horas efetivamente trabalhadas: **não há cobrança adicional nem "
                    "devolução em função do uso**."),
            ("4.3", "As leituras do horímetro registradas na plataforma servem apenas para acompanhamento "
                    "de uso e não alteram o valor desta locação. Leituras negativas, acima de 60.000 horas "
                    "ou com valor final menor que o inicial são recusadas pela plataforma."),
            ("4.4", "O atraso no pagamento de valores devidos implica juros de mora de **1% ao mês** e multa "
                    "de **2%** sobre o saldo em aberto."),
        ),
    )


def _obrigacoes() -> list[dict[str, Any]]:
    return [
        _clausula(
            5, "Obrigações do Locador", 2,
            _itens(
                ("5.1", "Entregar o equipamento funcionando e com manutenção em dia;"),
                ("5.2", "Indicar operador com credencial técnica válida, responsável pelo cumprimento da NR-31;"),
                ("5.3", "Informar limitações técnicas que possam afetar a operação na área indicada;"),
                ("5.4", "Realizar com o Locatário a vistoria de retirada e de devolução do equipamento;"),
                ("5.5", "Fornecer combustível, água e lubrificantes necessários à operação do equipamento;"),
                ("5.6", "Substituir o equipamento por equivalente em caso de defeito de sua responsabilidade."),
            ),
            layout="obrigacoes", parte="locador",
        ),
        _clausula(
            6, "Obrigações do Locatário", 2,
            _itens(
                ("6.1", "Efetuar o pagamento previsto na Cláusula 4;"),
                ("6.2", "Garantir acesso à área de serviço e sinalizar obstáculos no terreno;"),
                ("6.3", "Informar previamente riscos no terreno (pedras, valas, cercas elétricas, tubulações);"),
                ("6.4", "Não operar o equipamento sem autorização do Locador, salvo habilitação técnica comprovada;"),
                ("6.5", "Zelar pela guarda do equipamento contra furto e roubo durante sua custódia."),
            ),
            layout="obrigacoes", parte="locatario",
        ),
    ]


def _responsabilidades(doc: dict[str, Any]) -> dict[str, Any]:
    valor = doc["equipamento"]["valor_estimado"]
    limite = (
        f"O valor de referência do equipamento (**R$ {valor}**) serve como limite de indenização em caso "
        "de dano total ou perda."
        if valor else
        "Em caso de dano total ou perda, a indenização terá como limite o valor de mercado do equipamento "
        "na data do evento, apurado por laudo ou por orçamento nos termos do item 7.2."
    )
    return _clausula(
        7, "Responsabilidades", 3,
        {"tipo": "responsabilidades", "linhas": [
            {"situacao": "Defeito mecânico preexistente à entrega", "responsavel": "Locador", "parte": "locador"},
            {"situacao": "Dano causado por obstáculo não informado pelo Locatário", "responsavel": "Locatário",
             "parte": "locatario"},
            {"situacao": "Erro do operador indicado pelo Locador", "responsavel": "Locador", "parte": "locador"},
            {"situacao": "Furto ou roubo enquanto o equipamento estiver com o Locatário", "responsavel": "Locatário",
             "parte": "locatario"},
            {"situacao": "Dano por evento imprevisível (raio, enchente, granizo)", "responsavel": "Nenhuma das partes",
             "parte": "nenhuma"},
        ]},
        _itens(
            ("7.2", "Qualquer dano deve ser registrado com fotografia ou vídeo e comunicado pela plataforma. O "
                    "valor do reparo será apurado com base em orçamento de oficina — cada parte pode indicar "
                    "um, sendo adotada a média dos dois."),
            ("7.3", limite),
        ),
    )


def _plataforma() -> dict[str, Any]:
    return _clausula(
        8, "Papel da Plataforma FrotaRural", 3,
        {"tipo": "aviso", "titulo": "Intermediação tecnológica", "texto": (
            "A FrotaRural não é parte deste contrato e não responde por danos causados pelo equipamento, "
            "acidentes de trabalho, inadimplemento das partes, estado de conservação do equipamento, "
            "resultado agronômico dos serviços, danos ambientais ou litígios entre as partes."
        )},
        _itens(
            ("8.1", "A FrotaRural opera como marketplace de intermediação tecnológica, nos termos do Marco Civil "
                    "da Internet (Lei nº 12.965/2014), sem que isso gere vínculo empregatício, societário ou "
                    "solidariedade com as partes contratantes."),
        ),
    )


def _cancelamento() -> dict[str, Any]:
    return _clausula(
        9, "Cancelamento e Rescisão", 3,
        _itens(
            ("9.1", "A reserva é paga integralmente na confirmação; não existe caução reembolsável separada. "
                    "Antes do pagamento, o cancelamento é gratuito. O locatário recebe estorno de 100% se "
                    "cancelar com pelo menos 7 dias de antecedência do início, ou de 90% se cancelar com "
                    "menos de 7 dias, com retenção de 10%. O cancelamento pelo locador gera estorno integral "
                    "ao locatário. Após o início, o cancelamento deve ser tratado pela administração."),
            ("9.2", "As duas assinaturas devem ser concluídas até **24 horas antes do início**. A falta de "
                    "qualquer assinatura até esse prazo determina o cancelamento automático da reserva, "
                    "com estorno integral. Uma alteração de datas aceita inicia novo prazo para ambas as assinaturas."),
            ("9.3", "O cancelamento libera as datas imediatamente. O estorno é acompanhado separadamente na "
                    "plataforma; seu processamento ou eventual falha não reabre a reserva. O prazo para "
                    "o crédito depende do provedor e do meio de pagamento. Pagamento confirmado após um "
                    "cancelamento gera estorno integral, sem reativar a locação."),
        ),
    )


def _gerais_e_foro(doc: dict[str, Any]) -> list[dict[str, Any]]:
    locatario = doc["locatario"]
    foro = f" — **{locatario['municipio']}/{locatario['uf']}**" if locatario["municipio"] and locatario["uf"] else ""
    return [
        _clausula(
            10, "Disposições Gerais", 3,
            _itens(
                ("10.1", "Este contrato não cria vínculo empregatício entre o Locatário e pessoas indicadas pelo "
                         "Locador."),
                ("10.2", "As informações compartilhadas são confidenciais, conforme a LGPD (Lei nº 13.709/2018)."),
            ),
            layout="lado_a_lado",
        ),
        _clausula(
            11, "Foro", 3,
            _itens(
                ("11.1", f"Fica eleito o foro do domicílio do Locatário{foro} — para dirimir quaisquer conflitos "
                         "oriundos deste contrato, nos termos do art. 101, I, do Código de Defesa do Consumidor. "
                         "As partes comprometem-se a buscar solução por mediação antes de recorrer ao Judiciário."),
            ),
            layout="lado_a_lado",
        ),
    ]


def render_clausulas(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Cláusulas já preenchidas com os dados do documento."""
    return [
        _objeto(doc), _prazo(doc), _retirada(doc), _preco(doc), *_obrigacoes(),
        _responsabilidades(doc), _plataforma(), _cancelamento(), *_gerais_e_foro(doc),
    ]
