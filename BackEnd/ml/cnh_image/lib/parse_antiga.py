"""Leitura dos campos da CNH antiga (a "CNH aberta", frente e verso numa folha).

1. Os rótulos que o OCR reconhece viram **âncoras**: com 4 ou mais, `registration.register`
   calcula rotação, escala e posição da foto no referencial do template.
2. Cada trecho de texto é levado a esse referencial; o valor de um campo é o trecho que cai
   na **janela** aprendida para ele (abaixo do rótulo, `scripts/learn_layout.py`) e passa na
   validação do tipo (CPF, data, nº de registro...).
3. Onde o detector não achou o texto (ou onde a leitura costuma errar, como nome, RG e
   categoria), o recorte da **região esperada** é reconhecido de novo, ampliado e endireitado.
   Nome, RG e categoria só saem se duas leituras concordarem: **precisão acima de cobertura**.
4. Campo que não passa na validação simplesmente não é devolvido.
"""

import json
import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import numpy as np

from lib import validators
from lib.layouts import OLD_LABELS, OLD_TITLES, match_label, title_hits
from lib.ocr import TextLine, read_region
from lib.registration import Transform, register
from lib.text import squash

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "models" / "layout_antiga.json"
MIN_ANCHORS = 4  # rótulos concordantes para aceitar que a foto é este layout
TAIL_MAX = 12  # linha curta (um sobrenome) que continua o nome da linha de cima
ROW_TOLERANCE = 8.0  # linhas com o cy dentro disto estão na mesma linha do documento
FILIATION_DX = (-35.0, 25.0)
OBSERVATIONS_DX = (-25.0, 450.0)
SIDE_STRIP = 95.0  # as faixas verticais das bordas não têm campos
YEAR_RANGE = (1900, 2100)
REGION_SHIFTS = (
    -3.0,
    0.0,
    3.0,
)  # leituras da região deslocadas na vertical, p/ cobrir o erro do registro
REGION_MIN_SCORE = 0.30  # nota mínima do reconhecedor numa leitura de região
# Votos (do detector + 3 leituras do recorte) para devolver nome, RG e categoria. Com poucos votos
# o campo ainda sai, mas marcado como **incerto** para o front pedir conferência. Valores medidos
# no conjunto de validação do dataset BID (imagens ruidosas: o nome erra 1 letra com frequência):
#   nome      2 votos: 76% de precisão | 3 votos: 90%
#   RG        2 votos: 92% de precisão | 4 votos: 94%
#   categoria 2 votos: 97% de precisão | 3 votos: 100%
MIN_VOTES = {"name": 2, "rg": 2, "category": 2}
TRUST_VOTES = {"name": 3, "rg": 4, "category": 3}
_PLACE = re.compile(r"^(?P<city>.+?)\s*[-–,/\s]\s*(?P<uf>[A-Za-z]{2})$")
_CATEGORY_FIXES = str.maketrans("80", "BD")  # o OCR lê "B" como "8" e "D" como "0"

Parse = Callable[[str], object | None]


@dataclass(frozen=True)
class Placed:
    """Um trecho de texto já no referencial do template."""

    text: str
    left: float
    cy: float
    line: TextLine


@dataclass(frozen=True)
class OldReading:
    fields: dict[str, str]
    uncertain: list[str]  # campos devolvidos com poucos votos: o usuário deve conferir
    anchors: list[str]
    transform: Transform


@cache
def load_template() -> dict:
    return json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))


def _date(text: str) -> str | None:
    value = validators.parse_date(text)
    return value if value and YEAR_RANGE[0] <= int(value[:4]) <= YEAR_RANGE[1] else None


def _category(text: str) -> str | None:
    return validators.parse_category(text) or validators.parse_category(
        text.upper().translate(_CATEGORY_FIXES)
    )


def _place(text: str) -> tuple[str, str] | None:
    """ "CLÁUDIO-MG" → (UF, "DETRAN-UF"). A cidade do LOCAL não é um campo do cadastro."""
    match = _PLACE.match(text.strip().upper())
    uf = validators.parse_uf(match.group("uf")) if match else None
    return (uf, f"DETRAN-{uf}") if uf else None


def _name(text: str) -> str | None:
    return validators.clean_name(text)


PARSERS: dict[str, tuple[str, Parse]] = {
    # campo -> (janela/região aprendida, validador)
    "cpf": ("cpf", validators.parse_cpf),
    "rg": ("doc", validators.parse_rg),
    "cnh_number": ("register", validators.parse_register_number),
    "category": ("category", _category),
    "birth_date": ("birth", _date),
    "expiration_date": ("expiration", _date),
    "first_license_date": ("first_license", _date),
    "issue_date": ("issue", _date),
    "name": ("name", _name),
    "place": ("place", _place),
}


def _join_parents(texts: list[str]) -> list[str]:
    """Une as linhas da filiação em nomes: linha curta continua a de cima, linha longa começa outro.

    No dataset BID, a parte inicial do nome ocupa uma linha longa (14+ caracteres) e o último
    sobrenome, quando não cabe, vai para uma linha curta (até 10): um limiar entre 10 e 14
    separa os dois com 100% de acerto. Em documentos reais a quebra segue a largura da coluna,
    então este é o campo menos confiável (ver README).
    """
    names: list[str] = []
    for index, text in enumerate(texts):
        if index > 0 and len(text) <= TAIL_MAX:
            names[-1] += " " + text
        else:
            names.append(text)
    return names


class _Reader:
    """Lê os campos de uma foto já registrada no template."""

    def __init__(
        self, placed: list[Placed], transform: Transform, image: np.ndarray | None, template: dict
    ) -> None:
        self.placed, self.transform, self.image, self.template = placed, transform, image, template
        self.uncertain: list[str] = []

    def candidates(self, key: str) -> list[Placed]:
        window = self.template["fields"].get(key)
        if window is None:
            return []
        anchor = self.template["anchors"][window["label"]]
        return sorted(
            (
                p
                for p in self.placed
                if window["dy"][0] <= p.cy - anchor["y"] <= window["dy"][1]
                and window["dx"][0] <= p.left - anchor["left"] <= window["dx"][1]
            ),
            key=lambda p: p.cy,
        )

    def region_reads(self, key: str) -> list[str]:
        """Leituras do recorte da região esperada do campo, em três deslocamentos verticais.

        Vazio sem imagem ou sem caixa aprendida. O deslocamento cobre o erro do registro: um
        recorte alguns pixels acima ou abaixo ainda pega o texto, e o consenso entre as
        leituras filtra as que pegaram a moldura ou o rótulo.
        """
        window = self.template["fields"].get(key)
        if window is None or self.image is None:
            return []
        anchor = self.template["anchors"][window["label"]]
        x, y, width, height = window["box"]
        reads = []
        for shift in REGION_SHIFTS:
            x0, y0 = anchor["left"] + x, anchor["y"] + y + shift
            corners = [
                self.transform.invert(point)
                for point in (
                    (x0, y0),
                    (x0 + width, y0),
                    (x0 + width, y0 + height),
                    (x0, y0 + height),
                )
            ]
            read = read_region(self.image, corners)
            if read and read[1] >= REGION_MIN_SCORE:
                reads.append(read[0])
        return reads

    def detected(self, field: str) -> str | None:
        """Texto lido pelo detector na janela do campo, já validado (nome: junta os pedaços)."""
        key, parse = PARSERS[field]
        candidates = self.candidates(key)
        if field == "name":
            return self._name_from_row(candidates)
        for candidate in candidates:
            if parse(candidate.text):
                return candidate.text
        return None

    @staticmethod
    def _name_from_row(candidates: list[Placed]) -> str | None:
        """O nome pode vir em pedaços na mesma linha do documento: junta da esquerda p/ direita."""
        if not candidates:
            return None
        row = [c for c in candidates if abs(c.cy - candidates[0].cy) <= ROW_TOLERANCE]
        joined = " ".join(c.text for c in sorted(row, key=lambda c: c.left))
        return joined if validators.clean_name(joined) else None

    def vote(self, field: str) -> tuple[object | None, int]:
        """Valor mais votado do campo e quantos votos teve (o detector e 3 leituras do recorte)."""
        key, parse = PARSERS[field]
        primary = self.detected(field)
        votes: Counter[str] = Counter()
        representative: dict[str, object] = {}
        for text in ([primary] if primary else []) + self.region_reads(key):
            parsed = parse(text)
            if parsed is not None:
                votes[squash(str(parsed))] += 1
                representative.setdefault(squash(str(parsed)), parsed)
        winner = next(iter(votes.most_common(1)), None)
        return (representative[winner[0]], winner[1]) if winner else (None, 0)

    def read(self, field: str) -> object | None:
        """Valor do campo, ou `None` se não houver certeza.

        Campos com validação forte (CPF com dígitos verificadores, datas, nº de registro, UF)
        saem direto do que o detector leu. Nome, RG e categoria erram mais: o detector e as
        leituras do recorte da região (em 3 deslocamentos) **votam** em cada valor, e o campo
        só sai se o vencedor tiver `MIN_VOTES` votos. Menos cobertura, muito mais precisão.
        """
        if field not in MIN_VOTES:
            primary = self.detected(field)
            return PARSERS[field][1](primary) if primary else None
        value, votes = self.vote(field)
        if votes < MIN_VOTES[field]:
            return None
        if votes < TRUST_VOTES[field]:
            self.uncertain.append(field)
        return value


def parse_old(lines: list[TextLine], image: np.ndarray | None = None) -> OldReading | None:
    """Campos de uma CNH antiga, ou `None` se não der para registrar o documento."""
    template = load_template()
    anchors = {key: (a["x"], a["y"]) for key, a in template["anchors"].items()}

    found: dict[str, tuple[float, float]] = {}
    best: dict[str, float] = {}
    label_lines: set[int] = set()
    for index, line in enumerate(lines):
        match = match_label(line.text, OLD_LABELS)
        if match is None:
            continue
        label_lines.add(index)
        if match[1] > best.get(match[0], 0):
            best[match[0]], found[match[0]] = match[1], line.center

    registered = register(found, anchors, template["anchor_tolerance"])
    if registered is None or len(registered[1]) < MIN_ANCHORS:
        return None
    transform, inliers = registered

    titles = {squash(t) for t in OLD_TITLES}
    placed = []
    for index, line in enumerate(lines):
        if index in label_lines or squash(line.text) in titles:
            continue
        cx, cy = transform.apply(line.center)
        left = cx - line.length * transform.scale / 2
        if cx > SIDE_STRIP:
            placed.append(Placed(line.text.strip(), left, cy, line))
    if title_hits([ln.text for ln in lines], OLD_TITLES) == 0 and len(inliers) < MIN_ANCHORS + 2:
        return None

    reader = _Reader(placed, transform, image, template)
    fields: dict[str, str] = {}
    for field in ("name", "cpf", "rg", "cnh_number", "category", "birth_date", "expiration_date",
                  "first_license_date", "issue_date"):  # fmt: skip
        value = reader.read(field)
        if value:
            fields[field] = str(value)

    if (place := reader.read("place")) is not None:
        fields["issuing_state"], fields["issuing_authority"] = place  # type: ignore[misc]

    _filiation(placed, template, fields)
    _observations(placed, template, fields)
    return OldReading(fields, reader.uncertain, inliers, transform)


def _filiation(placed: list[Placed], template: dict, fields: dict[str, str]) -> None:
    anchors = template["anchors"]
    left = anchors["filiation"]["left"]
    top, bottom = anchors["filiation"]["y"] + 6, anchors["permission"]["y"] - 8
    lines = sorted(
        (
            p
            for p in placed
            if top < p.cy < bottom and FILIATION_DX[0] <= p.left - left <= FILIATION_DX[1]
        ),
        key=lambda p: p.cy,
    )
    names = [
        validators.clean_name(text, min_length=2) for text in _join_parents([p.text for p in lines])
    ]
    # Só confia se saíram exatamente dois nomes: com um só não dá para saber de qual dos pais é.
    if len(names) == 2 and all(names):
        fields["father_name"], fields["mother_name"] = names  # type: ignore[assignment]  # pai primeiro


def _observations(placed: list[Placed], template: dict, fields: dict[str, str]) -> None:
    anchors = template["anchors"]
    left = anchors["observations"]["left"]
    top, bottom = anchors["observations"]["y"] + 8, anchors["sign_holder"]["y"] - 30
    texts = [
        p.text
        for p in sorted(placed, key=lambda p: p.cy)
        if top < p.cy < bottom and OBSERVATIONS_DX[0] <= p.left - left <= OBSERVATIONS_DX[1]
    ]
    text = re.sub(r"\s+", " ", " ".join(texts)).strip()
    if len(text) >= 3 and sum(c.isalpha() for c in text) >= 2:
        fields["observations"] = text.upper()
