"""Validação e normalização dos valores lidos pelo OCR.

Regra do módulo: **precisão acima de revocação**. Um campo só é devolvido ao front se passar
na validação do seu tipo; preencher um dado errado é pior do que deixar em branco.

As funções de CPF e UF repetem as do módulo `cnh_data` de propósito: os módulos de ML não
importam um do outro.
"""

import re
from datetime import date

from lib.text import squash

UFS = frozenset(
    [
        "AC",
        "AL",
        "AM",
        "AP",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MG",
        "MS",
        "MT",
        "PA",
        "PB",
        "PE",
        "PI",
        "PR",
        "RJ",
        "RN",
        "RO",
        "RR",
        "RS",
        "SC",
        "SE",
        "SP",
        "TO",
    ]
)
CATEGORIES = ("A", "B", "C", "D", "E", "AB", "AC", "AD", "AE")

# Confusões típicas do OCR em campos que só podem ter dígitos.
_DIGIT_FIXES = str.maketrans("OoQDIiLlSsBZz", "0000111155822")

_DATE = re.compile(r"(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})")
_CPF_FORMAT = re.compile(r"(\d{3})\.?\s*(\d{3})\.?\s*(\d{3})\s*-?\s*(\d{2})")
_NAME_CHARS = re.compile(r"^[A-ZÀ-Ý][A-ZÀ-Ý' .-]*$")


def digits(text: str, *, fix_confusions: bool = True) -> str:
    """Só os dígitos de `text`, trocando antes letras que o OCR confunde com números."""
    if fix_confusions:
        text = text.translate(_DIGIT_FIXES)
    return re.sub(r"\D", "", text)


def cpf_is_valid(cpf: str) -> bool:
    """11 dígitos, não repetidos, com os dois dígitos verificadores corretos."""
    if len(cpf) != 11 or not cpf.isdigit() or len(set(cpf)) == 1:
        return False
    for size in (9, 10):
        total = sum(int(d) * w for d, w in zip(cpf[:size], range(size + 1, 1, -1), strict=True))
        if (total * 10) % 11 % 10 != int(cpf[size]):
            return False
    return True


def parse_cpf(text: str) -> str | None:
    """CPF (11 dígitos) se `text` tiver um CPF válido, senão `None`."""
    match = _CPF_FORMAT.search(text.translate(_DIGIT_FIXES))
    candidate = "".join(match.groups()) if match else digits(text)
    return candidate if cpf_is_valid(candidate) else None


def parse_date(text: str) -> str | None:
    """`dd/mm/aaaa` → `aaaa-mm-dd`, ou `None` se não for uma data real."""
    match = _DATE.search(text.translate(_DIGIT_FIXES))
    if not match:
        return None
    day, month, year = (int(g) for g in match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_register_number(text: str) -> str | None:
    """Nº de registro da CNH: exatamente 11 dígitos."""
    number = digits(text)
    return number if len(number) == 11 else None


def parse_rg(text: str) -> str | None:
    """Número do documento de identidade: só dígitos (5 a 14), sem o órgão emissor nem a UF.

    A linha costuma ser "732213587 SESP GO": pega o 1º trecho que parece um número (quase
    só dígitos, ou letras que o OCR confunde com dígitos) e ignora o resto.
    """
    for raw in re.split(r"[\s/]+", text):
        token = re.sub(r"[.\-]", "", raw)
        if leading := re.match(r"\d{5,14}", token):  # número colado ao órgão: "130135951SESPPR"
            return leading.group()
        if len(token) < 5:
            continue
        numeric = sum(char.isdigit() or char in "OoIlSsB" for char in token)
        if numeric / len(token) >= 0.8 and 5 <= len(digits(token)) <= 14:
            return digits(token)
    return None


def parse_category(text: str) -> str | None:
    candidate = squash(text)
    return candidate if candidate in CATEGORIES else None


def parse_uf(text: str) -> str | None:
    candidate = squash(text)
    return candidate if candidate in UFS else None


def clean_name(text: str, *, min_length: int = 5) -> str | None:
    """Nome em maiúsculas, com espaços normalizados. Recusa o que não parece um nome."""
    name = re.sub(r"\s+", " ", text).strip(" .,;:-_|")
    if len(name) < min_length or not _NAME_CHARS.match(name.upper()):
        return None
    return name.upper()
