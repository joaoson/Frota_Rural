"""Regras duras do modelo de dados da CNH.

São fatos verificáveis, sem estatística: se uma regra dispara, o registro é suspeito
com certeza e o motivo é exato. O classificador de ML (`model.py`) cobre os casos
sutis que regras não alcançam.

Várias regras repetem validações do Zod do front (CPF, idade mínima...), porque o
backend não valida isso: quem chama a API direto, sem o formulário, também passa por aqui.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from itertools import pairwise
from typing import Any

from lib.record import (
    UFS,
    add_years,
    birth_city_state,
    clean,
    cpf_is_valid,
    digits_only,
    longest_digit_sequence,
    longest_keyboard_run,
    parse_date,
)
from lib.reference import normalize_text

# Palavras que ninguém tem como nome. Comparação por token, já normalizado.
PLACEHOLDER_TOKENS = frozenset(
    {
        "teste", "test", "testando", "testes", "fulano", "fulana", "beltrano", "beltrana",
        "ciclano", "ciclana", "asdf", "asdfg", "asdfgh", "qwer", "qwerty", "zxcv", "xxx",
        "xxxx", "abc", "abcd", "nome", "sobrenome", "fake", "falso", "falsa", "naosei",
        "aaa", "aaaa", "bbb", "bbbb", "lorem", "ipsum", "exemplo", "usuario", "nada",
    }
)  # fmt: skip

# Tolerância sobre os 10 anos máximos de validade da CNH.
MAX_VALIDITY_YEARS = 10
VALIDITY_TOLERANCE = timedelta(days=31)
MIN_DRIVING_AGE = 18
MAX_SAME_CHAR_RUN = 4
MIN_KEYBOARD_RUN = 5
MIN_NO_VOWEL_LENGTH = 5
VOWELS = frozenset("aeiouy")  # "y" conta: nomes como Lynn/Dylan não têm outra vogal
MAX_LOW_VARIETY_DISTINCT = 2
MIN_SEQUENCE_RUN = 7
MIN_RG_DIGITS = 5


@dataclass(frozen=True)
class RuleHit:
    code: str
    group: str  # chave de `record_utils.GROUP_LABELS`
    message: str


def _has_char_run(text: str, size: int) -> bool:
    run = 1
    for previous, current in pairwise(text):
        run = run + 1 if current == previous else 1
        if run >= size:
            return True
    return False


def _name_hits(value: str, group: str, label: str) -> list[RuleHit]:
    if not value:
        return []
    normalized = normalize_text(value)
    hits = []
    if not any(char.isalpha() for char in value):
        hits.append(RuleHit("name_without_letters", group, f"{label} sem letras"))
    elif any(
        len(token) >= MIN_NO_VOWEL_LENGTH and not VOWELS.intersection(token)
        for token in normalized.split()
    ):
        hits.append(RuleHit("name_no_vowels", group, f"{label} com palavra sem vogais"))
    if any(char.isdigit() for char in value):
        hits.append(RuleHit("name_has_digits", group, f"{label} contém números"))
    if PLACEHOLDER_TOKENS.intersection(normalized.split()):
        hits.append(RuleHit("name_placeholder", group, f"{label} parece um texto de teste"))
    compact = normalized.replace(" ", "")
    if _has_char_run(compact, MAX_SAME_CHAR_RUN):
        hits.append(
            RuleHit("name_repeated_chars", group, f"{label} com letras repetidas em sequência")
        )
    if longest_keyboard_run(compact) >= MIN_KEYBOARD_RUN:
        hits.append(RuleHit("name_keyboard_mash", group, f"{label} com teclas vizinhas (asdf...)"))
    return hits


def _number_pattern_hits(digits: str, label: str) -> list[RuleHit]:
    """Números que nenhum documento real tem: quase sem variação ou quase só sequência.

    Em dígitos aleatórios, uma sequência de 7+ ou 2 dígitos distintos só ocorre em
    cerca de uma em um milhão de vezes.
    """
    hits = []
    if digits and len(set(digits)) <= MAX_LOW_VARIETY_DISTINCT:
        hits.append(RuleHit("number_low_variety", "documents", f"{label} com dígitos repetidos"))
    if longest_digit_sequence(digits) >= MIN_SEQUENCE_RUN:
        hits.append(RuleHit("number_sequential", "documents", f"{label} em sequência (123456...)"))
    return hits


def _document_hits(record: dict[str, Any]) -> list[RuleHit]:
    hits = []
    cnh = digits_only(record.get("cnh_number"))
    if len(cnh) != 11:
        hits.append(RuleHit("cnh_number_length", "documents", "nº da CNH sem 11 dígitos"))
    hits += _number_pattern_hits(cnh, "nº da CNH")

    cpf = digits_only(record.get("cpf"))
    if not cpf_is_valid(cpf):
        hits.append(RuleHit("cpf_invalid", "documents", "CPF inválido"))
    else:  # CPF repetido já é inválido; aqui entra o válido mas em sequência (12345678909)
        hits += _number_pattern_hits(cpf, "CPF")

    rg = digits_only(record.get("rg"))
    if len(rg) < MIN_RG_DIGITS:
        hits.append(RuleHit("rg_too_short", "documents", "RG curto demais"))
    else:
        hits += _number_pattern_hits(rg, "RG")
    return hits


def _date_hits(record: dict[str, Any], today: date) -> list[RuleHit]:
    hits = []
    fields = ("birth_date", "first_license_date", "issue_date", "expiration_date")
    parsed = {name: parse_date(record.get(name)) for name in fields}
    for name, value in parsed.items():
        if clean(record.get(name)) and value is None:
            hits.append(RuleHit("invalid_date", "dates", f"data inválida em {name}"))

    birth = parsed["birth_date"]
    first = parsed["first_license_date"]
    issue = parsed["issue_date"]
    expiration = parsed["expiration_date"]

    if birth and (birth.year < 1900 or add_years(birth, MIN_DRIVING_AGE) > today):
        hits.append(RuleHit("birth_implausible", "dates", "data de nascimento implausível"))
    if birth and first and first < add_years(birth, MIN_DRIVING_AGE):
        hits.append(RuleHit("first_license_before_18", "dates", "habilitação antes dos 18 anos"))
    if first and issue and issue < first:
        hits.append(
            RuleHit("issue_before_first_license", "dates", "emissão anterior à 1ª habilitação")
        )
    if issue and expiration and expiration <= issue:
        hits.append(
            RuleHit("expiration_not_after_issue", "dates", "validade não posterior à emissão")
        )
    if (
        issue
        and expiration
        and expiration > add_years(issue, MAX_VALIDITY_YEARS) + VALIDITY_TOLERANCE
    ):
        hits.append(RuleHit("validity_too_long", "dates", "validade acima de 10 anos"))
    if any(value and value > today + timedelta(days=1) for value in (first, issue)):
        hits.append(RuleHit("date_in_future", "dates", "data de emissão no futuro"))
    return hits


def evaluate_rules(record: dict[str, Any], today: date | None = None) -> list[RuleHit]:
    """Todas as regras duras que o registro viola (lista vazia se nenhuma)."""
    today = today or date.today()
    name = clean(record.get("name"))
    mother = clean(record.get("mother_name"))
    father = clean(record.get("father_name"))

    birth_city, birth_state = birth_city_state(record)
    hits = _name_hits(name, "name", "nome")
    hits += _name_hits(mother, "mother_name", "nome da mãe")
    hits += _name_hits(father, "father_name", "nome do pai")
    # A cidade só passa pelas checagens de "texto de lixo": estar fora da lista do IBGE não
    # é regra (distritos, bairros e municípios emancipados depois do nascimento são legítimos).
    hits += _name_hits(birth_city, "birth_place", "cidade")
    if name and normalize_text(name) == normalize_text(mother):
        hits.append(RuleHit("name_equals_mother", "mother_name", "nome igual ao nome da mãe"))
    # Nome igual ao do pai pode ser legítimo (pai e filho com o mesmo nome), então não é regra.
    if father and normalize_text(father) == normalize_text(mother):
        hits.append(RuleHit("parents_equal", "mother_name", "nome da mãe igual ao do pai"))

    hits += _document_hits(record)
    hits += _date_hits(record, today)

    if birth_state and birth_state not in UFS:
        hits.append(RuleHit("birth_state_invalid", "birth_place", "UF de nascimento inexistente"))
    issuing_state = clean(record.get("issuing_state")).upper()
    if issuing_state and issuing_state not in UFS:
        hits.append(RuleHit("issuing_state_invalid", "license", "UF de emissão inexistente"))
    return hits
