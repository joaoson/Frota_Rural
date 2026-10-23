"""Leitura do ground truth do dataset BID (`*_gt_ocr.txt`), usado só para aprender e medir.

Formato (latin-1, não UTF-8): cabeçalho `x, y, width, height, transcription` e uma linha por
trecho de texto, `x, y, w, h, texto`. Cabeçalho e rodapé do documento vêm como polígonos
(`[x1,x2,x3,x4], [y1,y2,y3,y4], -1, -1, texto`), que ignoramos.
"""

import hashlib
import math
import re
from dataclasses import dataclass
from pathlib import Path

from lib.layouts import OLD_LABELS, match_label
from lib.text import squash
from lib.validators import CATEGORIES

_LINE = re.compile(r"\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(.*)$")


@dataclass(frozen=True)
class GtLine:
    text: str
    center: tuple[float, float]
    length: float  # lado maior da caixa: o comprimento do texto, qualquer que seja a rotação
    thickness: float  # lado menor: a altura da letra


def read_gt(path: Path) -> list[GtLine]:
    lines = []
    for raw in path.read_bytes().decode("latin-1").splitlines()[1:]:
        match = _LINE.match(raw)
        if not match:
            continue  # polígonos de cabeçalho/rodapé
        x, y, w, h = (int(g) for g in match.groups()[:4])
        lines.append(
            GtLine(
                match.group(5).strip(), (x + w / 2, y + h / 2), float(max(w, h)), float(min(w, h))
            )
        )
    return lines


def document_key(lines: list[GtLine]) -> tuple[str, ...]:
    """Identidade do documento: o conjunto de textos. Fotos do mesmo documento repetem o texto."""
    return tuple(sorted(line.text for line in lines))


# --- Split por documento e verdade dos campos ------------------------------------------------

VALIDATION_PERCENT = 25


def is_validation(key: tuple[str, ...]) -> bool:
    """Decide por *documento* (não por foto) se ele é de validação: fotos do mesmo documento
    vão sempre para o mesmo lado, senão o modelo veria o documento no treino e na prova.
    Determinístico: não depende de ordem nem de semente."""
    digest = hashlib.md5("\n".join(key).encode("utf-8"), usedforsecurity=False).hexdigest()
    return int(digest[:8], 16) % 100 < VALIDATION_PERCENT


_CPF = re.compile(r"^\d{3}\.\d{3}\.\d{3}-\d{2}$")
_DATE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
_PLACE = re.compile(r"^.+[-–]\s*([A-Z]{2})$")


def _nearest(label: tuple[float, float], candidates: list[GtLine]) -> GtLine | None:
    return min(candidates, key=lambda c: math.dist(label, c.center), default=None)


def truth_lines(lines: list[GtLine]) -> dict[str, GtLine]:
    """A linha do GT que contém o valor de cada campo (chaves iguais às do campo devolvido).

    O valor é a linha de formato esperado **mais perto do rótulo**, em qualquer rotação, sem
    usar o parser avaliado. Cobre os campos de formato próprio: CPF, as 4 datas, nº de registro,
    RG, categoria, nome e o LOCAL. A filiação não entra: o GT não marca onde acaba um pai e
    começa a mãe.
    """
    labels: dict[str, GtLine] = {}
    values: list[GtLine] = []
    for line in lines:
        match = match_label(line.text, OLD_LABELS)
        if match:
            labels.setdefault(match[0], line)
        else:
            values.append(line)

    found: dict[str, GtLine] = {}
    cpfs = [v for v in values if _CPF.match(v.text)]
    if cpfs:
        found["cpf"] = cpfs[0]

    # Cada data vai para o rótulo mais próximo, sem repetir rótulo (pareamento guloso).
    date_labels = {"birth": "birth_date", "expiration": "expiration_date",
                   "first_license": "first_license_date", "issue": "issue_date"}  # fmt: skip
    dates = [v for v in values if _DATE.match(v.text)]
    pairs = sorted(
        (math.dist(labels[key].center, d.center), key, index)
        for key in date_labels
        if key in labels
        for index, d in enumerate(dates)
    )
    used_labels: set[str] = set()
    used_dates: set[int] = set()
    for _, key, index in pairs:
        if key in used_labels or index in used_dates:
            continue
        found[date_labels[key]] = dates[index]
        used_labels.add(key)
        used_dates.add(index)

    def nearest_to(key: str, accept) -> GtLine | None:
        return (
            _nearest(labels[key].center, [v for v in values if accept(v.text)])
            if key in labels
            else None
        )

    for field, key, accept in (
        ("cnh_number", "register", lambda t: t.isdigit() and len(t) == 11),
        ("rg", "doc", lambda t: t.isdigit() and 5 <= len(t) <= 14),
        ("category", "category", lambda t: squash(t) in CATEGORIES),
        ("name", "name", lambda t: bool(re.fullmatch(r"[A-Z' ]{5,}", t))),
        ("issuing_state", "place", lambda t: bool(_PLACE.match(t))),
    ):
        if (line := nearest_to(key, accept)) is not None:
            found[field] = line
    return found


def truth_fields(lines: list[GtLine]) -> dict[str, str]:
    """Valor correto de cada campo (formatos iguais aos que o OCR devolve), tirado do GT."""
    truth: dict[str, str] = {}
    for field, line in truth_lines(lines).items():
        if field == "cpf":
            truth[field] = line.text.replace(".", "").replace("-", "")
        elif field.endswith("_date"):
            day, month, year = _DATE.match(line.text).groups()  # type: ignore[union-attr]
            truth[field] = f"{year}-{month}-{day}"
        elif field == "category":
            truth[field] = squash(line.text)
        elif field == "issuing_state":
            truth[field] = _PLACE.match(line.text).group(1)  # type: ignore[union-attr]
        else:
            truth[field] = line.text
    return truth
