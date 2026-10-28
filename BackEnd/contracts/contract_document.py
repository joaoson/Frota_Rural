import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from contracts import contract_template
from contracts.models import Contracts
from payments.pricing import HORAS_POR_DIARIA
from users.models import Users

# Documento das revisões congeladas: termos + texto completo das cláusulas.
DOCUMENT_VERSION = contract_template.TEMPLATE_VERSION
# Contratos assinados antes das revisões: só os termos, sem as cláusulas. Esta
# versão nunca muda, senão os hashes já aceitos deixariam de conferir.
LEGACY_DOCUMENT_VERSION = "1.0.0"

# Rótulo fixo do tipo de operação intermediada pela plataforma.
TIPO_SERVICO = "Locação de Maquinário"

CPF_DIGITS = 11
CNPJ_DIGITS = 14


def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return None


def _format_brl(value: object) -> str:
    """Formata um valor decimal no padrão brasileiro (1.234,56)."""
    decimal_value = _to_decimal(value)
    if decimal_value is None:
        return ""
    return f"{decimal_value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _tipo_documento(document: str | None) -> str:
    """CPF tem 11 dígitos, CNPJ tem 14. Sem dígitos suficientes, não afirmamos nada."""
    digits = _only_digits(document)
    if len(digits) == CNPJ_DIGITS:
        return "CNPJ"
    if len(digits) == CPF_DIGITS:
        return "CPF"
    return ""


def _format_document(document: str | None) -> str:
    """Aplica a máscara de CPF ou CNPJ; devolve o valor original se não reconhecer."""
    digits = _only_digits(document)
    if len(digits) == CPF_DIGITS:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == CNPJ_DIGITS:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return document or ""


def _cpf_do_representante(document: str | None) -> str:
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


def _split_municipio_uf(address: str | None) -> tuple[str, str]:
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


def _municipio_uf(user: Users) -> tuple[str, str]:
    """Município/UF da parte, do cadastro quando houver.

    `city`/`state` só passaram a ser gravados depois que o cadastro ganhou
    colunas próprias; para quem se cadastrou antes, a única fonte continua
    sendo o parser sobre o texto livre de `address`.

    Exigimos os dois campos preenchidos: município de uma fonte e UF de outra
    poderiam se contradizer, e o par identifica o foro no contrato.
    """
    municipio = (user.city or "").strip()
    uf = (user.state or "").strip().upper()
    if municipio and uf:
        return municipio, uf
    return _split_municipio_uf(user.address)


def _prazo_em_dias(start_date: datetime | None, end_date: datetime | None) -> int:
    if not start_date or not end_date:
        return 0
    return max(1, (end_date.date() - start_date.date()).days + 1)


def _composicao_valores(
    total_price: object, hourly_rate: object, horas: int
) -> tuple[str, str, str]:
    total = _to_decimal(total_price)
    tarifa = _to_decimal(hourly_rate)
    if total is None or tarifa is None:
        return "", "", ""

    locacao = (tarifa * Decimal(horas)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    taxa = (total - locacao).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    taxa = max(taxa, Decimal("0.00"))

    percentual = ""
    if locacao > 0:
        percentual = f"{taxa / locacao * 100:.2f}".replace(".", ",")

    return _format_brl(locacao), _format_brl(taxa), percentual


def _parte(user: Users) -> dict[str, str]:
    """Dados comuns a locador e locatário."""
    documento = user.document or ""
    return {
        "razao_social": user.name or "",
        "tipo_documento": _tipo_documento(documento),
        "documento": _format_document(documento),
        "endereco_completo": user.address or "",
        "representante_nome": user.name or "",
        "representante_cpf": _cpf_do_representante(documento),
        # Estado civil não é coletado no cadastro; fica em branco até que seja.
        "representante_estado_civil": "",
    }


def _valores(rental) -> tuple[Decimal, int, int, str, str, str]:
    """Tarifa, diárias, horas e composição, da cotação congelada na reserva (ADR 0002).

    Locações sem cotação gravada usam o cálculo antigo, a partir do anúncio.
    """
    tarifa = rental.hourly_rate_snapshot
    if tarifa is None:
        tarifa = rental.postings.hourly_rate
    dias = rental.billable_days or _prazo_em_dias(rental.start_date, rental.end_date)
    horas = HORAS_POR_DIARIA * dias
    valor_locacao, valor_taxa, percentual_taxa = _composicao_valores(rental.total_price, tarifa, horas)
    return tarifa, dias, horas, valor_locacao, valor_taxa, percentual_taxa


def _identificacao(contract: Contracts, versao: str, dias: int) -> dict[str, Any]:
    rental = contract.rental
    return {
        "numero": f"#CTR-{str(rental.id)[:4].upper()}",
        "versao_documento": versao,
        "data_geracao": contract.created_at.strftime("%d/%m/%Y") if contract.created_at else "",
        "data_inicio": rental.start_date.strftime("%Y-%m-%d") if rental.start_date else "",
        "data_fim": rental.end_date.strftime("%Y-%m-%d") if rental.end_date else "",
        "prazo_dias": dias,
    }


def _partes_e_objeto(contract: Contracts) -> dict[str, Any]:
    rental = contract.rental
    posting = rental.postings
    machine = posting.machinery
    lessor = machine.owner
    lessee = rental.lessee
    municipio, uf = _municipio_uf(lessee)
    return {
        "operacao": {
            "codigo": f"OP-{str(rental.id)[4:9].upper()}",
        },
        "locador": {
            **_parte(lessor),
            "endereco_equipamento": posting.location_address or lessor.address or "",
        },
        "locatario": {
            **_parte(lessee),
            "municipio": municipio,
            "uf": uf,
            "local_servico": lessee.address or "",
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


def build_contract_document(contract: Contracts) -> dict[str, Any]:
    """Documento completo, com o texto das cláusulas. É o que uma revisão congela e o hash cobre."""
    rental = contract.rental
    tarifa, dias, horas, valor_locacao, valor_taxa, percentual_taxa = _valores(rental)
    diaria = rental.daily_rate if rental.daily_rate is not None else Decimal(tarifa) * HORAS_POR_DIARIA
    document: dict[str, Any] = {
        "titulo": contract_template.TITULO,
        "contrato": {
            **_identificacao(contract, DOCUMENT_VERSION, dias),
            "valor_unitario": _format_brl(tarifa),
            "horas_por_diaria": HORAS_POR_DIARIA,
            "valor_diaria": _format_brl(diaria),
            "diarias": dias,
            "valor_locacao": valor_locacao,
            "valor_taxa_plataforma": valor_taxa,
            "percentual_taxa_plataforma": percentual_taxa,
            "valor_total": _format_brl(rental.total_price),
        },
        **_partes_e_objeto(contract),
        "preambulo": contract_template.PREAMBULO,
        "declaracao_assinatura": contract_template.DECLARACAO_ASSINATURA,
    }
    document["clausulas"] = contract_template.render_clausulas(document)
    return document


def build_legacy_document(contract: Contracts) -> dict[str, Any]:
    """Termos no formato 1.0.0, para conferir aceites gravados antes das revisões.

    As chaves e a formatação não podem mudar: o hash destes aceites é recalculado
    a partir deste dict. As cláusulas dessa época não fazem parte do documento.
    """
    tarifa, dias, horas, valor_locacao, valor_taxa, percentual_taxa = _valores(contract.rental)
    return {
        "contrato": {
            **_identificacao(contract, LEGACY_DOCUMENT_VERSION, dias),
            "valor_unitario": _format_brl(tarifa),
            "estimativa_horas": horas,
            "valor_locacao": valor_locacao,
            "valor_taxa_plataforma": valor_taxa,
            "percentual_taxa_plataforma": percentual_taxa,
            "valor_total_estimado": _format_brl(contract.rental.total_price),
        },
        **_partes_e_objeto(contract),
    }
