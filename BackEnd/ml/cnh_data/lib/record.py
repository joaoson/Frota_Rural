"""Utilitários sobre o registro da CNH (o JSON que o Django envia ao modelo).

O registro usa os mesmos nomes de campo do `OperatorLicenseInputSerializer`:
`name`, `birth_date`, `cpf`, `rg`, `mother_name`, `father_name`, `nationality`,
`birth_place` ("Cidade – UF"), `cnh_number`, `category`, `first_license_date`,
`issue_date`, `expiration_date`, `issuing_state`, `issuing_authority`, `situation`,
`acc`, `ear`, `medical_restrictions`, `observations` e `points`.
"""

import re
from datetime import date
from itertools import pairwise
from typing import Any

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

# Rótulos (em português) dos grupos de campos que aparecem na mensagem de recusa.
GROUP_LABELS = {
    "name": "nome",
    "mother_name": "nome da mãe",
    "father_name": "nome do pai",
    "birth_place": "local de nascimento",
    "dates": "datas",
    "documents": "números dos documentos",
    "license": "dados da habilitação",
    "notes": "observações",
}

# `birth_place` é gravado como "Cidade – UF" (travessão), mas aceita também "-" e "/".
_BIRTH_PLACE = re.compile(r"^(?P<city>.*?)\s*[–—/-]\s*(?P<state>[A-Za-z]{2})\s*$")


def clean(value: Any) -> str:
    """Texto sem espaços nas pontas; `None` vira vazio."""
    return "" if value is None else str(value).strip()


def digits_only(value: Any) -> str:
    return re.sub(r"\D", "", clean(value))


def parse_date(value: Any) -> date | None:
    """Data ISO (`YYYY-MM-DD`) ou `None` se vazia/inválida."""
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(clean(value))
    except ValueError:
        return None


def add_years(day: date, years: int) -> date:
    """Soma anos inteiros; 29/02 vira 28/02 em ano não bissexto."""
    try:
        return day.replace(year=day.year + years)
    except ValueError:
        return day.replace(year=day.year + years, day=28)


def years_between(start: date, end: date) -> float:
    return (end - start).days / 365.25


def split_birth_place(birth_place: Any) -> tuple[str, str]:
    """Separa "Ji-Paraná – RO" em ("Ji-Paraná", "RO"). Sem UF, devolve (texto, "")."""
    text = clean(birth_place)
    match = _BIRTH_PLACE.match(text)
    if match:
        return match.group("city").strip(), match.group("state").upper()
    return text, ""


def birth_city_state(record: dict[str, Any]) -> tuple[str, str]:
    """Cidade e UF de nascimento, de `birth_city`/`birth_state` ou de `birth_place`."""
    if record.get("birth_city") or record.get("birth_state"):
        return clean(record.get("birth_city")), clean(record.get("birth_state")).upper()
    return split_birth_place(record.get("birth_place"))


def longest_same_run(text: str) -> int:
    """Maior sequência de caracteres iguais seguidos ("aaaa" = 4)."""
    best = run = 1 if text else 0
    for previous, current in pairwise(text):
        run = run + 1 if current == previous else 1
        best = max(best, run)
    return best


def longest_digit_sequence(digits: str) -> int:
    """Maior sequência de dígitos consecutivos, crescente ou decrescente ("12345" = 5)."""
    best = run_up = run_down = 1 if digits else 0
    for previous, current in pairwise(digits):
        step = int(current) - int(previous)
        run_up = run_up + 1 if step == 1 else 1
        run_down = run_down + 1 if step == -1 else 1
        best = max(best, run_up, run_down)
    return best


KEYBOARD_ROWS = ("qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890")


def longest_keyboard_run(text: str) -> int:
    """Maior trecho de `text` formado por teclas vizinhas de uma fileira ("asdf", "poiu").

    Só reconhece trechos de 3+ teclas (0 se não houver nenhum).
    """
    best = 0
    for start in range(len(text)):
        for end in range(start + max(best, 2) + 1, len(text) + 1):
            chunk = text[start:end]
            if any(chunk in row or chunk[::-1] in row for row in KEYBOARD_ROWS):
                best = end - start
            else:
                break
    return best


def cpf_is_valid(cpf: str) -> bool:
    """CPF com 11 dígitos, não repetidos, e dígitos verificadores corretos."""
    if len(cpf) != 11 or len(set(cpf)) == 1:
        return False
    for size in (9, 10):
        total = sum(
            int(digit) * weight
            for digit, weight in zip(cpf[:size], range(size + 1, 1, -1), strict=True)
        )
        check = (total * 10) % 11 % 10
        if check != int(cpf[size]):
            return False
    return True
