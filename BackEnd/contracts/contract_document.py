

import re
from decimal import Decimal, ROUND_HALF_UP


DOCUMENT_VERSION = "1.0.0"

# Rótulo fixo do tipo de operação intermediada pela plataforma.
TIPO_SERVICO = "Locação de Maquinário"

# Jornada diária usada para estimar as horas contratadas. Fonte única da regra:
# o frontend exibe a mesma estimativa a partir do documento devolvido pela API.
HORAS_ESTIMADAS_POR_DIA = 8


def _format_brl(value):
    """Formata um valor decimal no padrão brasileiro (1.234,56)."""
    if value is None:
        return ""
    try:
        value = Decimal(str(value))
    except (TypeError, ValueError):
        return ""
    return "{:,.2f}".format(value).replace(",", "X").replace(".", ",").replace("X", ".")


def _only_digits(value):
    return re.sub(r"\D", "", value or "")


def _tipo_documento(document):
    """CPF tem 11 dígitos, CNPJ tem 14. Sem dígitos suficientes, não afirmamos nada."""
    digits = _only_digits(document)
    if len(digits) == 14:
        return "CNPJ"
    if len(digits) == 11:
        return "CPF"
    return ""


def _format_document(document):
    """Aplica a máscara de CPF ou CNPJ; devolve o valor original se não reconhecer."""
    digits = _only_digits(document)
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return document or ""


def _cpf_do_representante(document):
    """Só devolve CPF quando o documento cadastrado é de fato um CPF.

    Para pessoa jurídica o CPF do representante legal não está cadastrado hoje,
    e inventá-lo comprometeria a validade do contrato.
    """
    if _tipo_documento(document) == "CPF":
        return _format_document(document)
    return ""


# Endereços são texto livre. Reconhecemos os formatos usados no cadastro
# ("Rua X, Cidade/UF", "Rua X - Cidade - PR", "..., Cidade, PR").
_MUNICIPIO_UF_PATTERNS = (
    re.compile(r"([A-Za-zÀ-ÿ'’\.\s]+?)\s*[/]\s*([A-Za-z]{2})\s*$"),
    re.compile(r"([A-Za-zÀ-ÿ'’\.\s]+?)\s*[-–]\s*([A-Za-z]{2})\s*$"),
    re.compile(r"([A-Za-zÀ-ÿ'’\.\s]+?)\s*,\s*([A-Za-z]{2})\s*$"),
)


def _split_municipio_uf(address):
    """Extrai (município, UF) do fim do endereço; ("", "") se não for possível."""
    if not address:
        return "", ""
    trecho = address.strip().rstrip(".").split("\n")[-1].strip()
    for pattern in _MUNICIPIO_UF_PATTERNS:
        match = pattern.search(trecho)
        if match:
            municipio = match.group(1).strip(" ,-–").strip()
            uf = match.group(2).upper()
            if municipio:
                return municipio, uf
    return "", ""


def _municipio_uf(user):
    """Município/UF da parte, do cadastro quando houver.

    `city`/`state` só passaram a ser gravados depois que o cadastro ganhou
    colunas próprias; para quem se cadastrou antes, a única fonte continua
    sendo o parser sobre o texto livre de `address`.

    Exigimos os dois campos preenchidos: município de uma fonte e UF de outra
    poderiam se contradizer, e o par identifica o foro no contrato.
    """
    municipio = (getattr(user, "city", "") or "").strip()
    uf = (getattr(user, "state", "") or "").strip().upper()
    if municipio and uf:
        return municipio, uf
    return _split_municipio_uf(getattr(user, "address", ""))


def _prazo_em_dias(start_date, end_date):
    if not start_date or not end_date:
        return 0
    return max(1, (end_date.date() - start_date.date()).days + 1)


def _to_decimal(value):
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (TypeError, ValueError):
        return None


def _composicao_valores(total_price, hourly_rate, horas):

    total = _to_decimal(total_price)
    tarifa = _to_decimal(hourly_rate)
    if total is None or tarifa is None:
        return "", "", ""

    locacao = (tarifa * Decimal(horas)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    taxa = (total - locacao).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if taxa < 0:
        taxa = Decimal("0.00")

    percentual = ""
    if locacao > 0:
        percentual = "{:.2f}".format(taxa / locacao * 100).replace(".", ",")

    return _format_brl(locacao), _format_brl(taxa), percentual


def _parte(user, tipo_documento_calculado=None):
    """Dados comuns a locador e locatário."""
    documento = getattr(user, "document", "") or ""
    return {
        "razao_social": getattr(user, "name", "") or "",
        "tipo_documento": tipo_documento_calculado or _tipo_documento(documento),
        "documento": _format_document(documento),
        "endereco_completo": getattr(user, "address", "") or "",
        "representante_nome": getattr(user, "name", "") or "",
        "representante_cpf": _cpf_do_representante(documento),
        # Estado civil não é coletado no cadastro; fica em branco até que seja.
        "representante_estado_civil": "",
    }


def build_contract_document(contract):

    rental = contract.rental
    posting = rental.postings
    machine = posting.machinery
    lessor = machine.owner
    lessee = rental.lessee

    dias = _prazo_em_dias(rental.start_date, rental.end_date)
    horas = HORAS_ESTIMADAS_POR_DIA * dias
    valor_locacao, valor_taxa, percentual_taxa = _composicao_valores(
        rental.total_price, posting.hourly_rate, horas
    )
    municipio, uf = _municipio_uf(lessee)

    return {
        "contrato": {
            "numero": f"#CTR-{str(rental.id)[:4].upper()}",
            "versao_documento": DOCUMENT_VERSION,
            "data_geracao": contract.created_at.strftime("%d/%m/%Y") if contract.created_at else "",
            "data_inicio": rental.start_date.strftime("%Y-%m-%d") if rental.start_date else "",
            "data_fim": rental.end_date.strftime("%Y-%m-%d") if rental.end_date else "",
            "prazo_dias": dias,
            "valor_unitario": _format_brl(posting.hourly_rate),
            "estimativa_horas": horas,
            "valor_locacao": valor_locacao,
            "valor_taxa_plataforma": valor_taxa,
            "percentual_taxa_plataforma": percentual_taxa,
            "valor_total_estimado": _format_brl(rental.total_price),
        },
        "operacao": {
            "codigo": f"OP-{str(rental.id)[4:9].upper()}",
        },
        "locador": {
            **_parte(lessor),
            "endereco_equipamento": posting.location_address or getattr(lessor, "address", "") or "",
        },
        "locatario": {
            **_parte(lessee),
            "municipio": municipio,
            "uf": uf,
            "local_servico": getattr(lessee, "address", "") or "",
        },
        "equipamento": {
            "tipo": machine.usage_purpose or "",
            "marca": machine.brand or "",
            "modelo": machine.model or "",
            "ano": machine.year or None,
            "renagro": machine.renagro_number or "",
            # Não há valor de referência cadastrado para o maquinário. O limite
            # de indenização da Cláusula 7.3 fica em branco enquanto o cadastro
            # não trouxer esse dado, em vez de afirmar um valor arbitrário.
            "valor_estimado": "",
        },
        "anuncio": {
            "tipo_servico": TIPO_SERVICO,
            "finalidade_uso": machine.usage_purpose or "",
        },
    }
