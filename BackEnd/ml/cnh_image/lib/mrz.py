"""Leitura da zona legível por máquina (MRZ) do verso da CNH digital.

Três linhas de 30 caracteres no formato ICAO TD1 (documentos de identidade). Só a linha 2
(nascimento, validade, com dígitos verificadores) e a linha 3 (nome) interessam. Serve de
**conferência cruzada** dos campos lidos na frente: nunca é a única fonte.
"""

import re
from datetime import date

_WEIGHTS = (7, 3, 1)
_MRZ_LINE = re.compile(r"^[A-Z0-9<]{24,34}$")


def check_digit(text: str) -> int:
    total = 0
    for index, char in enumerate(text):
        value = int(char) if char.isdigit() else (ord(char) - 55 if char.isalpha() else 0)
        total += value * _WEIGHTS[index % 3]
    return total % 10


def _date(yymmdd: str, *, century_hint: str) -> str | None:
    if not yymmdd.isdigit():
        return None
    year, month, day = int(yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:])
    if century_hint == "birth":  # nascimento: 19xx se o 'ano' ainda não chegou
        year += 2000 if year <= date.today().year % 100 else 1900
    else:  # validade: sempre 20xx
        year += 2000
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def find_lines(texts: list[str]) -> list[str] | None:
    """As 3 linhas da MRZ entre os textos lidos (sem espaços), ou `None`."""
    candidates = [re.sub(r"\s+", "", text).upper() for text in texts]
    candidates = [c for c in candidates if _MRZ_LINE.match(c) and "<" in c]
    return candidates[:3] if len(candidates) >= 3 else None


def parse(lines: list[str]) -> dict[str, str]:
    """`birth_date`/`expiration_date` (ISO, só se o dígito verificador conferir) e `name`."""
    result: dict[str, str] = {}
    line2 = lines[1].ljust(30, "<")
    birth, birth_check = line2[0:6], line2[6]
    expiration, expiration_check = line2[8:14], line2[14]
    birth_ok = birth_check.isdigit() and check_digit(birth) == int(birth_check)
    if birth_ok and (value := _date(birth, century_hint="birth")):
        result["birth_date"] = value
    expiration_ok = expiration_check.isdigit() and check_digit(expiration) == int(expiration_check)
    if expiration_ok and (value := _date(expiration, century_hint="expiration")):
        result["expiration_date"] = value
    name = re.sub(r"\s+", " ", lines[2].replace("<", " ")).strip()
    if name:
        result["name"] = name
    return result
