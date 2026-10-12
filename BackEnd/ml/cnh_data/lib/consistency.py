"""Consistência entre o que foi digitado e o que o OCR leu da foto da CNH.

O OCR (`ml/cnh_image`) devolve `fields` (já validados) e `uncertain_fields`. Aqui cada campo
lido é comparado com o campo digitado, e o resultado alimenta o índice de veracidade
(`veracity.py`). Sem ML: são igualdades e uma similaridade de texto.

Cada campo tem um **peso** que reflete a precisão medida do OCR (`ml/cnh_image/README.md`):

- peso 1,0 (`STRONG`): CPF, nº de registro e as quatro datas, lidos com 99–100% de precisão.
  Se divergem do digitado, não é erro de leitura: é erro de digitação ou dado inventado;
- peso 0,5: UF emissora, categoria, RG e nome. Os três últimos só entram quando o OCR **não**
  os marcou como incertos (os incertos erram demais para servir de prova);
- peso 0,25: filiação e local de nascimento (heurísticos ou vindos de um único layout).

Campo que o OCR não leu, ou que o formulário deixou vazio, é `absent`: nunca conta como
divergência. Os valores nunca saem deste módulo (só nomes de campo e status).
"""

from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from lib.record import birth_city_state, clean, digits_only, parse_date, split_birth_place
from lib.reference import normalize_text

MATCH, MISMATCH, ABSENT = "match", "mismatch", "absent"

STRONG_WEIGHT = 1.0
MEDIUM_WEIGHT = 0.5
WEAK_WEIGHT = 0.25
# Duas divergências em campos de peso 1,0 bastam para recusar mesmo sem divergir o CPF.
HARD_MISMATCH_COUNT = 2
NAME_SIMILARITY = 0.85  # o OCR erra uma letra ou outra: não exigimos igualdade exata

# campo → (peso, grupo do rótulo de recusa em `record.GROUP_LABELS`)
FIELDS: dict[str, tuple[float, str]] = {
    "cpf": (STRONG_WEIGHT, "documents"),
    "cnh_number": (STRONG_WEIGHT, "documents"),
    "birth_date": (STRONG_WEIGHT, "dates"),
    "first_license_date": (STRONG_WEIGHT, "dates"),
    "issue_date": (STRONG_WEIGHT, "dates"),
    "expiration_date": (STRONG_WEIGHT, "dates"),
    "issuing_state": (MEDIUM_WEIGHT, "license"),
    "category": (MEDIUM_WEIGHT, "license"),
    "rg": (MEDIUM_WEIGHT, "documents"),
    "name": (MEDIUM_WEIGHT, "name"),
    "mother_name": (WEAK_WEIGHT, "mother_name"),
    "father_name": (WEAK_WEIGHT, "father_name"),
    "birth_place": (WEAK_WEIGHT, "birth_place"),
}
# Campos em que o OCR só vale se não vier marcado como incerto.
NEEDS_CONFIDENT_READING = frozenset({"rg", "category", "name"})
DATE_FIELDS = frozenset({"birth_date", "first_license_date", "issue_date", "expiration_date"})
DIGIT_FIELDS = frozenset({"cpf", "cnh_number", "rg"})


@dataclass(frozen=True)
class Consistency:
    """Resultado da comparação, campo a campo."""

    status: dict[str, str] = field(default_factory=dict)

    def _weights(self, wanted: str) -> float:
        return sum(FIELDS[name][0] for name, value in self.status.items() if value == wanted)

    @property
    def evidence(self) -> float:
        """Soma dos pesos dos campos comparados: quanto o OCR tem a dizer sobre este registro."""
        return self._weights(MATCH) + self._weights(MISMATCH)

    @property
    def agreement(self) -> float:
        """Fração ponderada dos campos comparados que batem (1,0 se nada foi comparado)."""
        evidence = self.evidence
        return self._weights(MATCH) / evidence if evidence else 1.0

    @property
    def mismatched(self) -> list[str]:
        return [name for name, value in self.status.items() if value == MISMATCH]

    @property
    def hard_mismatch(self) -> bool:
        """CPF diverge, ou ao menos duas divergências em campos de peso 1,0."""
        strong = [name for name in self.mismatched if FIELDS[name][0] == STRONG_WEIGHT]
        return "cpf" in strong or len(strong) >= HARD_MISMATCH_COUNT

    @property
    def groups(self) -> list[str]:
        """Grupos (rótulos de recusa) dos campos divergentes, sem repetição."""
        groups: list[str] = []
        for name in self.mismatched:
            if FIELDS[name][1] not in groups:
                groups.append(FIELDS[name][1])
        return groups


def _similar(left: str, right: str) -> bool:
    a, b = normalize_text(left), normalize_text(right)
    return bool(a and b and SequenceMatcher(None, a, b).ratio() >= NAME_SIMILARITY)


def _parents_match(name: str, ocr_name: str, record: dict[str, Any]) -> bool | None:
    """A filiação do OCR é heurística (pai × mãe): vale se bater com qualquer um dos dois.

    Só compara se o formulário preencheu este mesmo campo; vazio é `absent`.
    """
    if not clean(record.get(name)) or not ocr_name:
        return None
    typed = [clean(record.get(key)) for key in ("mother_name", "father_name")]
    return any(_similar(ocr_name, value) for value in typed if value)


def _birth_place_matches(ocr_text: str, record: dict[str, Any]) -> bool | None:
    typed_city, typed_state = birth_city_state(record)
    ocr_city, ocr_state = split_birth_place(ocr_text)
    if not (typed_city and typed_state and ocr_city and ocr_state):
        return None
    return typed_state == ocr_state and _similar(typed_city, ocr_city)


def _equal(name: str, typed: str, ocr_text: str) -> bool | None:
    """Igualdade normalizada de campos simples; `None` se algum lado não dá para ler."""
    if name in DATE_FIELDS:
        typed_value, ocr_value = parse_date(typed), parse_date(ocr_text)
    elif name in DIGIT_FIELDS:
        typed_value, ocr_value = digits_only(typed), digits_only(ocr_text)
    else:  # issuing_state, category
        typed_value, ocr_value = typed.upper(), ocr_text.upper()
    return None if not typed_value or not ocr_value else typed_value == ocr_value


def _compare(name: str, ocr_value: Any, record: dict[str, Any]) -> bool | None:
    """`True` bate, `False` diverge, `None` não há o que comparar."""
    ocr_text = clean(ocr_value)
    if name == "birth_place":
        return _birth_place_matches(ocr_text, record)
    if name in ("mother_name", "father_name"):
        return _parents_match(name, ocr_text, record)
    typed_text = clean(record.get(name))
    if not typed_text or not ocr_text:
        return None
    if name == "name":
        return _similar(typed_text, ocr_text)
    return _equal(name, typed_text, ocr_text)


def compare(record: dict[str, Any], ocr: dict[str, Any] | None) -> Consistency:
    """Compara o registro digitado com o OCR (`{"fields": {...}, "uncertain_fields": [...]}`).

    Sem OCR, ou sem campos, nada é comparado e todos os campos ficam `absent`.
    """
    fields = (ocr or {}).get("fields")
    if not isinstance(fields, dict):
        return Consistency(dict.fromkeys(FIELDS, ABSENT))
    uncertain = set((ocr or {}).get("uncertain_fields") or [])

    status: dict[str, str] = {}
    for name in FIELDS:
        skip = name not in fields or (name in NEEDS_CONFIDENT_READING and name in uncertain)
        outcome = None if skip else _compare(name, fields[name], record)
        status[name] = ABSENT if outcome is None else (MATCH if outcome else MISMATCH)
    return Consistency(status)
