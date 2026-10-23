"""Leitura dos campos do layout numerado (CNH digital / CNH-e, e provavelmente a física nova).

Diferente da CNH antiga, aqui há um único exemplo (um PDF), então não dá para aprender janelas
de um dataset: o valor de cada campo é a linha logo **abaixo do seu rótulo**, alinhada à
esquerda com ele. Esse arranjo é do próprio layout, não do exemplo. A MRZ do verso confere nome
e datas.

Cada imagem do PDF (frente, verso, MRZ) é lida separadamente e `merge` junta os campos.
"""

import re
from dataclasses import dataclass

import numpy as np

from lib import mrz, validators
from lib.layouts import DIGITAL_LABELS, DIGITAL_TITLES, match_label, title_hits
from lib.ocr import TextLine, reread_line
from lib.text import squash

MIN_LABELS = 5  # rótulos achados para aceitar que a imagem é este layout
MAX_GAP = 70.0  # distância vertical máxima entre o rótulo e o valor, em pixels
LEFT_TOLERANCE = 45.0
TAIL_MAX = 12
_BIRTH = re.compile(
    r"(?P<date>\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{4})\s*,?\s*(?P<city>.+?)\s*,\s*(?P<uf>[A-Za-z]{2})\s*$"
)
_PLACE = re.compile(r"^(?P<city>.+?)\s*,\s*(?P<uf>[A-Za-z]{2})\s*$")
_NATIONALITIES = {
    "BRASILEIR": "Brasileiro(a)",
    "NATURALIZAD": "Naturalizado(a)",
    "ESTRANGEIR": "Estrangeiro(a)",
}


@dataclass(frozen=True)
class _Box:
    text: str
    left: float
    top: float
    right: float
    bottom: float
    line: TextLine


def _box(line: TextLine) -> _Box:
    xs, ys = zip(*line.points, strict=True)
    return _Box(line.text.strip(), min(xs), min(ys), max(xs), max(ys), line)


def labels_found(lines: list[TextLine]) -> int:
    """Quantos rótulos do layout numerado a imagem tem (e o título fixo conta como mais um)."""
    keys = {m[0] for line in lines if (m := match_label(line.text, DIGITAL_LABELS))}
    return len(keys) + (title_hits([ln.text for ln in lines], DIGITAL_TITLES) > 0)


def _below(label: _Box, boxes: list[_Box], *, limit: float = MAX_GAP) -> list[_Box]:
    """Linhas logo abaixo do rótulo, alinhadas à esquerda com ele, de cima para baixo."""
    found = [
        b
        for b in boxes
        if 0 <= b.top - label.bottom <= limit and abs(b.left - label.left) <= LEFT_TOLERANCE
    ]
    return sorted(found, key=lambda b: b.top)


def parse_digital(lines: list[TextLine], image: np.ndarray | None = None) -> dict[str, str]:
    """Campos de uma imagem do layout numerado. Pode ser só parte (a frente ou o verso)."""
    boxes = [_box(line) for line in lines]
    label_boxes: dict[str, _Box] = {}
    label_ids: set[int] = set()
    for index, box in enumerate(boxes):
        match = match_label(box.text, DIGITAL_LABELS)
        if match:
            label_ids.add(index)
            label_boxes.setdefault(match[0], box)
    values = [b for i, b in enumerate(boxes) if i not in label_ids]

    def first(key: str, parse, *, limit: float = MAX_GAP):
        """O valor é só a linha MAIS PRÓXIMA abaixo do rótulo: as seguintes são de outros campos
        (o CPF fica logo abaixo do RG), e devolvê-las trocaria um campo pelo vizinho."""
        label = label_boxes.get(key)
        below = _below(label, values, limit=limit) if label else []
        if below and (value := parse(below[0].text)) is not None:
            return value, below[0]
        return None

    fields: dict[str, str] = {}

    def spaced(text: str, box: _Box) -> str:
        """Relê o recorte ampliado quando o reconhecedor juntou as palavras."""
        if " " in text or len(text) < 10 or image is None:
            return text
        reread = reread_line(image, box.line)
        return reread if reread and squash(reread) == squash(text) else text

    if hit := first("name", validators.clean_name):
        fields["name"] = validators.clean_name(spaced(hit[0], hit[1])) or hit[0]
    for field, key, parse in (
        ("cpf", "cpf", validators.parse_cpf),
        ("rg", "doc", validators.parse_rg),
        ("cnh_number", "register", validators.parse_register_number),
        ("category", "category", validators.parse_category),
        ("first_license_date", "first_license", validators.parse_date),
        ("issue_date", "issue", validators.parse_date),
        ("expiration_date", "expiration", validators.parse_date),
    ):
        if hit := first(key, parse):
            fields[field] = hit[0]
    if hit := first("nationality", _nationality):
        fields["nationality"] = hit[0]
    if hit := first("birth", _birth):
        text, box = hit
        date, city, uf = text
        fields["birth_date"] = date
        city = spaced(city, box) if " " not in city else city
        fields["birth_place"] = f"{city.strip().upper()} – {uf}"
    if hit := first("place", _place):
        fields["issuing_state"], fields["issuing_authority"] = hit[0]

    _filiation(label_boxes.get("filiation"), values, fields, spaced)
    _observations(label_boxes, values, fields)
    return fields


def _nationality(text: str) -> str | None:
    squashed = squash(text)
    return next(
        (value for prefix, value in _NATIONALITIES.items() if squashed.startswith(prefix)), None
    )


def _birth(text: str) -> tuple[str, str, str] | None:
    match = _BIRTH.search(text)
    date = validators.parse_date(match.group("date")) if match else None
    uf = validators.parse_uf(match.group("uf")) if match else None
    return (date, match.group("city"), uf) if match and date and uf else None


def _place(text: str) -> tuple[str, str] | None:
    match = _PLACE.match(text.strip().upper())
    uf = validators.parse_uf(match.group("uf")) if match else None
    return (uf, f"DETRAN-{uf}") if uf else None


def _filiation(label: _Box | None, values: list[_Box], fields: dict[str, str], spaced) -> None:
    if label is None:
        return
    lines = _below(label, values, limit=200.0)
    names: list[str] = []
    for index, box in enumerate(lines):
        text = validators.clean_name(spaced(box.text, box), min_length=2)
        if text is None:
            continue
        if index > 0 and len(text) <= TAIL_MAX and names:
            names[-1] += " " + text
        else:
            names.append(text)
    if len(names) == 2:
        fields["father_name"], fields["mother_name"] = names  # pai primeiro, mãe depois


def _observations(labels: dict[str, _Box], values: list[_Box], fields: dict[str, str]) -> None:
    label, place = labels.get("observations"), labels.get("place")
    if label is None:
        return
    limit = (place.top - label.bottom - 10) if place else 250.0
    texts = [b.text for b in _below(label, values, limit=max(limit, 20.0))]
    text = re.sub(r"\s+", " ", " ".join(texts)).strip()
    if len(text) >= 1 and any(c.isalpha() for c in text):
        fields["observations"] = text.upper()


def apply_mrz(fields: dict[str, str], texts: list[str]) -> None:
    """Confere/corrige nome e datas com a MRZ. Só vale com dígito verificador correto."""
    lines = mrz.find_lines(texts)
    if lines is None:
        return
    verified = mrz.parse(lines)
    for key in ("birth_date", "expiration_date"):
        if key in verified:
            fields[key] = verified[key]  # a MRZ tem dígito verificador; a leitura da frente não
    name = verified.get("name")
    if name and ("name" not in fields or squash(fields["name"]) == squash(name)):
        fields["name"] = name


def merge(parts: list[dict[str, str]]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for part in parts:
        for key, value in part.items():
            merged.setdefault(key, value)
    return merged
