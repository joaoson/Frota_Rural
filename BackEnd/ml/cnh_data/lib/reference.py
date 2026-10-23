"""Acesso às bases de referência do IBGE usadas pelo modelo de dados da CNH.

Fontes: IBGE, Divisão Territorial Brasileira, edição 2025 (https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-territorial-brasileira.html),
e Base dos Dados, "Nomes no Brasil" (Censo 2010) (https://basedosdados.org/dataset/703f9f0d-caee-4b47-b900-46b1dea2c33c?table=3bc00c7a-28e5-421b-b310-b32bed3dd4d4). Detalhes em `ml/data/README.md`.

As bases são geradas por `scripts/build_reference_data.py` a partir das fontes brutas do IBGE e
ficam na pasta de dados compartilhada, versionadas:

- `ml/data/names/first_names.tsv`: primeiros nomes e quantidade de nascimentos até 2010.
- `ml/data/cities/cities.json`: municípios por UF (DTB).

Este módulo só lê as bases. As consultas são "brandas" por desenho: nome ausente da
base ou cidade fora da UF viram sinais para o modelo, nunca uma recusa por si só.
"""

import difflib
import functools
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import NamedTuple

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
NAMES_PATH = DATA_DIR / "names" / "first_names.tsv"
CITIES_PATH = DATA_DIR / "cities" / "cities.json"

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_text(text: str) -> str:
    """Minúsculo, sem acento, e qualquer pontuação (`-`, `'`, `.`) vira espaço.

    Os nomes do IBGE vêm sem acento (`Jose`) e os municípios com acento
    (`Guajará-Mirim`, `Machadinho D'Oeste`), então todo texto passa por aqui antes da
    consulta, tanto na geração das bases quanto na inferência.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_ALNUM.sub(" ", ascii_text.lower()).strip()


@functools.cache
def first_names() -> dict[str, int]:
    """`{nome_normalizado: nascimentos}`. Vazio se a base não existir (fail-open)."""
    if not NAMES_PATH.exists():
        return {}
    names: dict[str, int] = {}
    with NAMES_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            name, _, count = line.rstrip("\n").partition("\t")
            if name and count.isdigit():
                names[name] = int(count)
    return names


@functools.cache
def cities() -> dict[str, frozenset[str]]:
    """`{UF: {municipio_normalizado}}`. Vazio se a base não existir (fail-open)."""
    if not CITIES_PATH.exists():
        return {}
    raw: dict[str, list[str]] = json.loads(CITIES_PATH.read_text(encoding="utf-8"))
    return {state: frozenset(names) for state, names in raw.items()}


def reference_available() -> bool:
    """O modelo foi treinado com as duas bases; sem qualquer uma delas ele não é usado."""
    return bool(first_names()) and bool(cities())


class NameStats(NamedTuple):
    known: bool
    log10_freq: float


def first_name_stats(full_name: str) -> NameStats:
    """Consulta o primeiro nome (a base do IBGE não tem sobrenomes).

    `log10_freq` é 0.0 quando o nome não está na base.
    """
    tokens = normalize_text(full_name).split()
    if not tokens:
        return NameStats(known=False, log10_freq=0.0)
    count = first_names().get(tokens[0])
    if count is None:
        return NameStats(known=False, log10_freq=0.0)
    return NameStats(known=True, log10_freq=math.log10(count))


class CityMatch(NamedTuple):
    exact_in_state: bool
    similarity_in_state: float
    exists_in_other_state: bool


def city_match(city: str, state: str) -> CityMatch:
    """Compara a cidade com os municípios da UF informada.

    Vários nomes se repetem entre UFs (`Buritis` em RO e MG), então a chave é sempre o par
    (UF, município). `similarity_in_state` tolera erro de digitação ("Sao Paulo", "Moji Mirim"):
    1.0 é igual, 0.0 é nada parecido.
    """
    normalized = normalize_text(city)
    state = state.upper()
    if not normalized or not cities():
        return CityMatch(exact_in_state=False, similarity_in_state=0.0, exists_in_other_state=False)

    in_state = cities().get(state, frozenset())
    exact = normalized in in_state
    if exact:
        similarity = 1.0
    else:
        close = difflib.get_close_matches(normalized, in_state, n=1, cutoff=0.0)
        similarity = difflib.SequenceMatcher(None, normalized, close[0]).ratio() if close else 0.0

    elsewhere = any(normalized in names for uf, names in cities().items() if uf != state)
    return CityMatch(exact, similarity, elsewhere)
