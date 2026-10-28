"""Gerador de registros de CNH sintéticos para treinar e avaliar o modelo de dados.

Não existe base pública de cadastros falsos de CNH, então o treino usa:

- **Positivos (plausíveis)**: nomes sorteados pela frequência real do IBGE, cidades
  sorteadas entre os municípios da UF, CPF válido e datas coerentes.
  Incluem de propósito casos "esquisitos mas reais" (nomes raros ou estrangeiros,
  distritos que não são município, erros de digitação) para o modelo não aprender que
  tudo que foge do comum é falso.
- **Negativos (falsos)** organizados em *famílias* de mutação (`FAMILIES`), que imitam
  quem preenche o formulário só para enviá-lo. Um registro falso pode combinar até três
  famílias. A avaliação "deixa uma família de fora" usa esses rótulos.

Tudo é determinístico para uma mesma semente.
"""

import csv
import random
import string
from bisect import bisect
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import accumulate, pairwise
from pathlib import Path
from typing import Any

from lib.record import add_years
from lib.reference import DATA_DIR, cities, first_names

TODAY = date(2026, 1, 1)
MIN_BIRTH_YEAR, MAX_BIRTH_YEAR, MODE_BIRTH_YEAR = 1945, 2007, 1985
FEMALE_EXCEPTIONS = frozenset(
    {"beatriz", "raquel", "isabel", "ruth", "carmen", "luz", "rachel", "ester"}
)
PARTICLES = ("da", "de", "do", "das", "dos")
LEXICON_PATH = DATA_DIR / "lexicon" / "lexicon.csv"
DEFAULT_CSV = DATA_DIR / "synth" / "cnh_records.csv"


def _load_lexicon() -> dict[str, list[tuple[str, str]]]:
    """Listas de palavras escritas à mão (`ml/data/lexicon/lexicon.csv`): `kind,value,extra`."""
    lexicon: dict[str, list[tuple[str, str]]] = {}
    with LEXICON_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            lexicon.setdefault(row["kind"], []).append((row["value"], row["extra"]))
    return lexicon


def _values(lexicon: dict[str, list[tuple[str, str]]], kind: str) -> list[str]:
    return [value for value, _ in lexicon[kind]]


_LEXICON = _load_lexicon()
SURNAMES = _values(_LEXICON, "surname")
RARE_FIRST_NAMES = _values(_LEXICON, "rare_first_name")
WORDS = _values(_LEXICON, "common_word")
PLACEHOLDER_NAMES = _values(_LEXICON, "placeholder_name")
PLACEHOLDER_PARENTS = _values(_LEXICON, "placeholder_parent")
FOREIGN_CITIES = _values(_LEXICON, "foreign_city")
MEDICAL_NOTES = _values(_LEXICON, "medical_note")
OBSERVATIONS = _values(_LEXICON, "observation")

CATEGORIES = (
    ["B"] * 60
    + ["AB"] * 20
    + ["A"] * 5
    + ["C"] * 3
    + ["D"] * 3
    + ["E"] * 3
    + ["AC", "AD", "AE"] * 2
)


@dataclass(frozen=True)
class Sample:
    record: dict[str, Any]
    label: int  # 1 = dado falso, 0 = plausível
    families: tuple[str, ...]


class Pools:
    """Sorteadores pré-calculados uma vez (nomes ponderados por frequência, via bisect)."""

    def __init__(self) -> None:
        names = first_names()
        self.names = list(names)
        counts = list(names.values())
        self._any = list(accumulate(counts))
        self._female = list(accumulate(
            count * (1.0 if name.endswith("a") or name in FEMALE_EXCEPTIONS else 0.03)
            for name, count in names.items()
        ))  # fmt: skip
        self._male = list(accumulate(
            count * (0.03 if name.endswith("a") or name in FEMALE_EXCEPTIONS else 1.0)
            for name, count in names.items()
        ))  # fmt: skip

        # Todo município tem a mesma chance de ser sorteado: o estado pesa pelo nº de municípios.
        by_state = cities()
        self.states = sorted(by_state)
        self._state_cum = list(accumulate(len(by_state[uf]) for uf in self.states))
        self._city_names = {uf: sorted(by_state[uf]) for uf in self.states}

    @staticmethod
    def _pick(rng: random.Random, items: list[str], cumulative: list[float]) -> str:
        return items[min(bisect(cumulative, rng.random() * cumulative[-1]), len(items) - 1)]

    def first_name(self, rng: random.Random, gender: str = "any") -> str:
        cumulative = {"f": self._female, "m": self._male}.get(gender, self._any)
        return self._pick(rng, self.names, cumulative)

    def state(self, rng: random.Random) -> str:
        return self._pick(rng, self.states, self._state_cum)

    def city(self, rng: random.Random, state: str) -> str:
        return rng.choice(self._city_names[state])


def _title(text: str) -> str:
    words = text.split()
    return " ".join(
        word if index and word.lower() in PARTICLES else word.capitalize()
        for index, word in enumerate(words)
    )


SHORT_SURNAMES = [name for name in SURNAMES if len(name) <= 5]
TYPO_SHARE = 0.05  # cidade digitada com erro
SHORT_FORM_SHARE = (
    0.12  # "Ana Lima", "Davi Reis": nomes curtos são comuns e não podem parecer suspeitos
)


def _surname(rng: random.Random, pools: Pools, *, short: bool = False) -> str:
    if short:
        return _title(rng.choice(SHORT_SURNAMES))
    # 15% dos sobrenomes são prenomes ("Pedro Lucas Martins"), como acontece na vida real.
    return _title(pools.first_name(rng) if rng.random() < 0.15 else rng.choice(SURNAMES))


def _given(rng: random.Random, pools: Pools, gender: str, *, short: bool = False) -> str:
    if rng.random() < 0.04:
        return _title(rng.choice(RARE_FIRST_NAMES))
    given = _title(pools.first_name(rng, gender))
    if not short and rng.random() < 0.25:
        given += " " + _title(pools.first_name(rng, gender))
    return given


def _with_particle(rng: random.Random, surname: str) -> str:
    return f"{rng.choice(PARTICLES)} {surname}" if rng.random() < 0.10 else surname


def _random_cpf(rng: random.Random) -> str:
    while True:
        digits = [rng.randint(0, 9) for _ in range(9)]
        if len(set(digits)) > 1:
            break
    for size in (9, 10):
        total = sum(d * w for d, w in zip(digits, range(size + 1, 1, -1), strict=True))
        digits.append((total * 10) % 11 % 10)
    return "".join(map(str, digits))


def _random_digits(rng: random.Random, size: int, min_distinct: int = 5) -> str:
    while True:
        digits = "".join(rng.choice(string.digits) for _ in range(size))
        if len(set(digits)) >= min_distinct:
            return digits


def _max_sequence(digits: str) -> int:
    best = run_up = run_down = 1
    for previous, current in pairwise(digits):
        step = int(current) - int(previous)
        run_up = run_up + 1 if step == 1 else 1
        run_down = run_down + 1 if step == -1 else 1
        best = max(best, run_up, run_down)
    return best


def _clean_digits(rng: random.Random, size: int) -> str:
    """Número de documento plausível: sem sequências longas e, em 10% dos casos, com
    quase todos os dígitos distintos (acontece em número real; o modelo não pode tratar
    "muitos dígitos distintos" como sinal de lixo)."""
    while True:
        if rng.random() < 0.10:
            digits = rng.sample(string.digits, min(size, 10))
            digits += [rng.choice(string.digits) for _ in range(size - len(digits))]
            rng.shuffle(digits)
            candidate = "".join(digits)
        else:
            candidate = "".join(rng.choice(string.digits) for _ in range(size))
        if len(set(candidate)) >= 5 and _max_sequence(candidate) <= 3:
            return candidate


def _sequential_number(rng: random.Random, size: int) -> str:
    """Sequência crescente/decrescente a partir de qualquer dígito, às vezes só no começo."""
    start, step = rng.randint(0, 9), rng.choice([1, -1])
    digits = "".join(str((start + step * i) % 10) for i in range(size))
    if rng.random() < 0.5:
        return digits
    cut = rng.randint(5, max(5, size - 1))
    return digits[:cut] + "".join(rng.choice(string.digits) for _ in range(size - cut))


def _pair_pattern(rng: random.Random, size: int) -> str:
    pair = "".join(rng.choice(string.digits) for _ in range(2))
    return (pair * size)[:size]


def _cpf_from(base: str) -> str:
    digits = [int(char) for char in base]
    for length in (9, 10):
        total = sum(d * w for d, w in zip(digits, range(length + 1, 1, -1), strict=True))
        digits.append((total * 10) % 11 % 10)
    return "".join(map(str, digits))


def _random_date(rng: random.Random, start: date, end: date) -> date:
    return start + timedelta(days=rng.randint(0, max(0, (end - start).days)))


def _typo(rng: random.Random, text: str) -> str:
    """Remove uma letra ou troca duas vizinhas: o erro de digitação mais comum."""
    if len(text) < 4:
        return text
    index = rng.randrange(1, len(text) - 2)
    if rng.random() < 0.5:
        return text[:index] + text[index + 1 :]
    return text[:index] + text[index + 1] + text[index] + text[index + 2 :]


def _validity_years(age_at_issue: float, rng: random.Random) -> int:
    if age_at_issue >= 70:
        return 3
    if age_at_issue >= 50:
        return 5
    return 5 if rng.random() < 0.12 else 10  # 12%: CNHs emitidas sob a regra antiga


def _plausible_dates(rng: random.Random) -> dict[str, Any]:
    birth_year = int(rng.triangular(MIN_BIRTH_YEAR, MAX_BIRTH_YEAR, MODE_BIRTH_YEAR))
    birth = _random_date(rng, date(birth_year, 1, 1), date(birth_year, 12, 28))
    first = add_years(birth, 18 + min(int(rng.expovariate(1 / 3)), 35)) + timedelta(
        days=rng.randint(0, 300)
    )
    first = min(first, TODAY - timedelta(days=60))

    active = rng.random() < 0.88
    for _ in range(10):
        provisional = TODAY - timedelta(days=rng.randint(0, 3650))
        issue = max(first, provisional if active else provisional - timedelta(days=3650))
        age = (issue - birth).days / 365.25
        years = _validity_years(age, rng)
        expiration = add_years(issue, years)
        if (expiration > TODAY) == active or issue == first:
            break
    return {"birth": birth, "first": first, "issue": issue, "expiration": expiration}


def plausible_record(rng: random.Random, pools: Pools) -> dict[str, Any]:
    dates = _plausible_dates(rng)
    gender = rng.choice("fm")
    short = rng.random() < SHORT_FORM_SHARE
    mother_surname, father_surname = (
        _surname(rng, pools, short=short),
        _surname(rng, pools, short=short),
    )

    mother = f"{_given(rng, pools, 'f', short=short)} {_with_particle(rng, mother_surname)}"
    if not short and rng.random() < 0.5:
        mother += " " + _surname(rng, pools)
    father: str | None = None
    if rng.random() < 0.88:
        father = f"{_given(rng, pools, 'm', short=short)} {_with_particle(rng, father_surname)}"
    surnames = (
        [mother_surname, father_surname] if rng.random() < 0.85 and not short else [father_surname]
    )
    name = f"{_given(rng, pools, gender, short=short)} {' '.join(surnames)}"
    if name == mother:  # por acaso, igual ao da mãe: isso é um dos tipos de lixo, não um positivo
        mother += " " + _surname(rng, pools)

    nationality = rng.choices(["Brasileiro(a)", "Naturalizado(a)", "Estrangeiro(a)"], [97, 2, 1])[0]
    state = pools.state(rng)
    city = _title(pools.city(rng, state))
    roll = rng.random()
    if nationality != "Brasileiro(a)":
        city = rng.choice(FOREIGN_CITIES)
    elif roll < TYPO_SHARE:  # erro de digitação no nome da cidade
        city = _typo(rng, city)

    issuing_state = state if rng.random() < 0.6 else pools.state(rng)
    authority = rng.choices(
        [f"DETRAN-{issuing_state}", "DETRAN", f"SSP-{issuing_state}", f"DETRAN/{issuing_state}", f"CIRETRAN {issuing_state}"],
        [80, 8, 4, 5, 3],
    )[0]  # fmt: skip
    expired = dates["expiration"] <= TODAY
    situation = "expired" if expired else "active"
    if rng.random() < 0.03:
        situation = rng.choice(["suspended", "blocked", "revoked", "ppd"])

    return {
        "name": name,
        "birth_date": dates["birth"].isoformat(),
        "cpf": _random_cpf(rng),
        "rg": _clean_digits(rng, rng.choice([7, 8, 9, 9, 9, 10]))
        + ("X" if rng.random() < 0.05 else ""),
        "mother_name": mother,
        "father_name": father,
        "nationality": nationality,
        "birth_place": f"{city} – {state}",
        "cnh_number": _clean_digits(rng, 11),
        "category": rng.choice(CATEGORIES),
        "first_license_date": dates["first"].isoformat(),
        "issue_date": dates["issue"].isoformat(),
        "expiration_date": dates["expiration"].isoformat(),
        "issuing_state": issuing_state,
        "issuing_authority": authority,
        "situation": situation,
        "acc": rng.random() < 0.005,
        "ear": rng.random() < 0.25,
        "medical_restrictions": rng.choice(MEDICAL_NOTES) if rng.random() < 0.15 else None,
        "observations": rng.choice(OBSERVATIONS) if rng.random() < 0.15 else None,
        "points": 0 if rng.random() < 0.8 else min(int(rng.expovariate(1 / 6)) + 1, 40),
    }


# --- Famílias de negativos -------------------------------------------------------------

JunkText = Callable[[random.Random], str]


def _keyboard_mash(rng: random.Random) -> str:
    row = rng.choice(["qwertyuiop", "asdfghjkl", "zxcvbnm"])
    start = rng.randrange(len(row) - 3)
    chunk = row[start : start + rng.randint(4, len(row))]
    chunk = chunk[::-1] if rng.random() < 0.3 else chunk
    if rng.random() < 0.25:
        chunk = (rng.choice(row) + rng.choice(row)) * rng.randint(2, 4)  # "jkjkjk"
    return chunk + (" " + _keyboard_mash(rng) if rng.random() < 0.5 else "")


def _repeated(rng: random.Random) -> str:
    unit = rng.choice(["a", "x", "k", "z", "lala", "ha", "abc", "1", "."])
    word = unit * rng.randint(3, 8)
    return word + (" " + word if rng.random() < 0.5 else "")


def _placeholder(rng: random.Random) -> str:
    return rng.choice(PLACEHOLDER_NAMES)


def _common_words(rng: random.Random) -> str:
    return " ".join(_title(rng.choice(WORDS)) for _ in range(rng.randint(1, 3)))


def _gibberish(rng: random.Random) -> str:
    def word() -> str:
        vowel_share = rng.uniform(0.05, 0.55)
        return "".join(
            rng.choice("aeiou")
            if rng.random() < vowel_share
            else rng.choice("bcdfghjklmnpqrstvwxz")
            for _ in range(rng.randint(3, 9))
        )

    return _title(" ".join(word() for _ in range(rng.randint(1, 3))))


def _invented_name(rng: random.Random) -> str:
    """Nome pronunciável mas inventado: sílabas CV aleatórias."""

    def word() -> str:
        return "".join(
            rng.choice("bcdfglmnprstvz") + rng.choice("aeiou") for _ in range(rng.randint(2, 4))
        )

    return _title(f"{word()} {word()}")


NAME_JUNK: tuple[JunkText, ...] = (
    _keyboard_mash,
    _repeated,
    _placeholder,
    _common_words,
    _gibberish,
)


def _family_text(junk: JunkText) -> Callable[[random.Random, dict[str, Any], Pools], None]:
    def apply(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
        record["name"] = junk(rng)
        if rng.random() < 0.5:
            record["mother_name"] = (
                junk(rng) if junk is not _placeholder else rng.choice(PLACEHOLDER_PARENTS)
            )
        if rng.random() < 0.3:
            record["father_name"] = junk(rng)

    return apply


def _same_name(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    """Nome igual ao da mãe, ou mãe e pai com o mesmo nome.

    Nome igual ao do pai fica de fora: pai e filho com o mesmo nome acontece de verdade.
    """
    if record["father_name"] is None or rng.random() < 0.6:
        record["mother_name"] = record["name"]
    else:
        record["mother_name"] = record["father_name"]


def _dates_inverted(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    birth = date.fromisoformat(record["birth_date"])
    first = date.fromisoformat(record["first_license_date"])
    issue = date.fromisoformat(record["issue_date"])
    for _ in range(rng.randint(1, 2)):
        kind = rng.choice(
            [
                "exp_before_issue",
                "issue_before_first",
                "first_before_18",
                "too_long",
                "ancient_birth",
            ]
        )
        if kind == "exp_before_issue":
            record["expiration_date"] = (issue - timedelta(days=rng.randint(0, 4000))).isoformat()
        elif kind == "issue_before_first":
            record["issue_date"] = (first - timedelta(days=rng.randint(30, 3000))).isoformat()
        elif kind == "first_before_18":
            record["first_license_date"] = add_years(birth, rng.randint(5, 17)).isoformat()
        elif kind == "too_long":
            record["expiration_date"] = add_years(issue, rng.randint(15, 40)).isoformat()
        else:
            record["birth_date"] = date(
                rng.randint(1800, 1925), rng.randint(1, 12), rng.randint(1, 28)
            ).isoformat()


def _numbers_degenerate(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    repeated = str(rng.randint(0, 9))
    options = {
        "cnh_number": [
            repeated * 11, _sequential_number(rng, 11), _sequential_number(rng, 11),
            _pair_pattern(rng, 11), "0" * 10 + str(rng.randint(1, 9)),
        ],
        "cpf": [
            repeated * 11, _cpf_from(_sequential_number(rng, 9)), _cpf_from(_sequential_number(rng, 9)),
            _sequential_number(rng, 11), "0" * 11,
        ],
        "rg": [
            "0" * rng.randint(5, 9), _sequential_number(rng, rng.randint(7, 9)),
            _sequential_number(rng, rng.randint(7, 9)), str(rng.randint(1, 99)), repeated * rng.randint(7, 9),
        ],
    }  # fmt: skip
    for field in rng.sample(list(options), rng.randint(1, 2)):
        record[field] = rng.choice(options[field])


def _city_gibberish(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    state = record["birth_place"].rsplit(" – ", 1)[-1]
    record["birth_place"] = (
        f"{rng.choice([_gibberish, _keyboard_mash, _common_words])(rng)} – {state}"
    )


def _city_wrong_state(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    state = rng.choice(
        [uf for uf in pools.states if uf != record["birth_place"].rsplit(" – ", 1)[-1]]
    )
    other = rng.choice([uf for uf in pools.states if uf != state])
    record["birth_place"] = f"{_title(pools.city(rng, other))} – {state}"
    if rng.random() < 0.15:
        record["birth_place"] = record["birth_place"].rsplit(" – ", 1)[0] + " – XX"


def _invented_names(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    record["name"] = _invented_name(rng)
    if rng.random() < 0.5:
        record["mother_name"] = _invented_name(rng)


def _one_field(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    record["name"] = rng.choice(NAME_JUNK)(rng)


def _full_junk(rng: random.Random, record: dict[str, Any], pools: Pools) -> None:
    junk = rng.choice(NAME_JUNK)
    record.update(
        name=junk(rng),
        mother_name=junk(rng),
        father_name=junk(rng) if rng.random() < 0.6 else None,
        birth_place=f"{junk(rng)} – {rng.choice([*pools.states, 'XX'])}",
        cnh_number=rng.choice([_random_digits(rng, 11, 1), "1" * 11, "12345678901"]),
        cpf=_random_digits(rng, 11, 1),
        rg=_random_digits(rng, rng.randint(1, 9), 1),
        issuing_authority=junk(rng),
        observations=junk(rng) if rng.random() < 0.4 else None,
    )
    days = [rng.randint(-20000, 20000) for _ in range(4)]
    base = date(2000, 1, 1)
    for field, offset in zip(
        ("birth_date", "first_license_date", "issue_date", "expiration_date"), days, strict=True
    ):
        record[field] = (base + timedelta(days=offset)).isoformat()


@dataclass(frozen=True)
class Family:
    name: str
    apply: Callable[[random.Random, dict[str, Any], Pools], None]
    standalone: bool = True  # pode aparecer sozinha? (as ambíguas só aparecem combinadas)


FAMILIES: tuple[Family, ...] = (
    Family("keyboard", _family_text(_keyboard_mash)),
    Family("repeat", _family_text(_repeated)),
    Family("placeholder", _family_text(_placeholder)),
    Family("word_junk", _family_text(_common_words)),
    Family("gibberish", _family_text(_gibberish)),
    Family("same_name", _same_name),
    Family("dates_inverted", _dates_inverted),
    Family("numbers_degenerate", _numbers_degenerate),
    Family("city_gibberish", _city_gibberish),
    Family("city_wrong_state", _city_wrong_state, standalone=False),
    Family("invented_name", _invented_names, standalone=False),
    Family("one_field", _one_field),
    Family("full_junk", _full_junk),
)


def fake_record(rng: random.Random, pools: Pools) -> Sample:
    """Registro falso: um plausível corrompido por 1 a 3 famílias."""
    record = plausible_record(rng, pools)
    count = rng.choices([1, 2, 3], [60, 30, 10])[0]
    pool = [f for f in FAMILIES if f.standalone] if count == 1 else list(FAMILIES)
    chosen = rng.sample(pool, min(count, len(pool)))
    for family in chosen:
        family.apply(rng, record, pools)
    return Sample(record, 1, tuple(sorted(family.name for family in chosen)))


def generate(positives: int, negatives: int, *, seed: int = 42) -> list[Sample]:
    """Dataset misto e embaralhado: `positives` plausíveis e `negatives` falsos."""
    rng = random.Random(seed)
    pools = Pools()
    samples = [Sample(plausible_record(rng, pools), 0, ()) for _ in range(positives)]
    samples += [fake_record(rng, pools) for _ in range(negatives)]
    rng.shuffle(samples)
    return samples


# --- CSV: o dataset gerado fica em ml/data/synth/ --------------------------------------

# Mesmos campos que o Django envia ao modelo (`SCREENED_FIELDS` em document_validation/services.py).
RECORD_FIELDS = (
    "name", "birth_date", "cpf", "rg", "mother_name", "father_name", "nationality",
    "birth_place", "cnh_number", "category", "first_license_date", "issue_date",
    "expiration_date", "issuing_state", "issuing_authority", "situation", "acc", "ear",
    "medical_restrictions", "observations", "points",
)  # fmt: skip
CSV_COLUMNS = (*RECORD_FIELDS, "label", "families")
OPTIONAL_FIELDS = ("father_name", "medical_restrictions", "observations")
BOOLEAN_FIELDS = ("acc", "ear")


def write_csv(samples: list[Sample], path: Path = DEFAULT_CSV) -> None:
    """Uma linha por registro: os campos da CNH, `label` (1 = falso) e `families` (`a;b`)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(CSV_COLUMNS)
        for sample in samples:
            row = []
            for field in RECORD_FIELDS:
                value = sample.record[field]
                row.append(
                    ""
                    if value is None
                    else str(value).lower()
                    if field in BOOLEAN_FIELDS
                    else value
                )
            writer.writerow([*row, sample.label, ";".join(sample.families)])


def read_csv(path: Path = DEFAULT_CSV) -> list[Sample]:
    """Lê o CSV de volta, devolvendo os registros exatamente como foram gerados."""
    samples = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            record: dict[str, Any] = {field: row[field] for field in RECORD_FIELDS}
            for field in OPTIONAL_FIELDS:
                record[field] = record[field] or None
            for field in BOOLEAN_FIELDS:
                record[field] = row[field] == "true"
            record["points"] = int(row["points"])
            families = tuple(row["families"].split(";")) if row["families"] else ()
            samples.append(Sample(record, int(row["label"]), families))
    return samples
