"""Extração de features do registro da CNH.

Fonte única para treino (`train.py`) e inferência (`classify.py`): o modelo nunca vê o
texto cru, só números derivados dele (razão de vogais, anos entre datas, frequência do
nome no IBGE...). Isso também ajuda na LGPD: dá para guardar as features sem guardar
CPF ou nomes.

Campos ausentes viram `NaN`, que o `HistGradientBoostingClassifier` aceita nativamente.
Cada feature pertence a um grupo (`FEATURE_GROUPS`), usado para explicar a recusa.
"""

import functools
import math
import re
from collections import Counter, defaultdict
from typing import Any

from lib.record import (
    UFS,
    birth_city_state,
    clean,
    cpf_is_valid,
    digits_only,
    longest_digit_sequence,
    longest_keyboard_run,
    longest_same_run,
    parse_date,
    years_between,
)
from lib.reference import city_match, first_name_stats, first_names, normalize_text

NAN = float("nan")
VOWELS = frozenset("aeiou")
# Partículas que aparecem em nomes brasileiros e distorcem a nota de "pior palavra".
PARTICLES = frozenset({"da", "de", "do", "das", "dos", "e", "di", "du", "van", "von", "del", "la"})
AUTHORITY_KEYWORDS = (
    "detran",
    "ssp",
    "sesp",
    "ciretran",
    "senatran",
    "denatran",
    "cetran",
    "pc",
    "dpf",
)
SITUATIONS = ("active", "expired", "suspended", "revoked", "blocked", "ppd")
ADVANCED_CATEGORIES = re.compile(r"[CDE]")
TEXT_STAT_NAMES = (
    "len", "tokens", "vowel_ratio", "max_run", "max_consonant_run", "digit_ratio",
    "symbol_ratio", "keyboard_run", "period_run", "dup_tokens", "short_tokens",
    "lm_mean", "lm_min",
)  # fmt: skip


class CharLM:
    """Modelo de linguagem de caracteres (trigramas) treinado nos primeiros nomes do IBGE.

    Dá a nota média de log-probabilidade por caractere: "joaquim" fica alta, "xkqpt"
    baixa. Cada nome pesa `log10(nascimentos)`, para que "maria" não esmague os demais.
    """

    SMOOTHING = 0.1
    ALPHABET_SIZE = 28  # a-z, fim de palavra e "#" para qualquer outro símbolo

    def __init__(self, names: dict[str, int]) -> None:
        self._trigram: dict[str, Counter[str]] = defaultdict(Counter)
        self._context_total: Counter[str] = Counter()
        for name, count in names.items():
            weight = math.log10(count)
            padded = "^^" + name + "$"
            for index in range(2, len(padded)):
                context, char = padded[index - 2 : index], padded[index]
                self._trigram[context][char] += weight
                self._context_total[context] += weight

    def token_logprob(self, token: str) -> tuple[float, int]:
        """Soma do log-prob do token e nº de transições (para a média ponderada)."""
        padded = "^^" + "".join(c if "a" <= c <= "z" else "#" for c in token) + "$"
        total = 0.0
        for index in range(2, len(padded)):
            context, char = padded[index - 2 : index], padded[index]
            numerator = self._trigram[context][char] + self.SMOOTHING
            denominator = self._context_total[context] + self.SMOOTHING * self.ALPHABET_SIZE
            total += math.log(numerator / denominator)
        return total, len(padded) - 2


@functools.cache
def char_lm() -> CharLM:
    return CharLM(first_names())


def _longest_run(text: str, predicate: Any) -> int:
    best = run = 0
    for char in text:
        run = run + 1 if predicate(char) else 0
        best = max(best, run)
    return best


def _period_run(text: str) -> int:
    """Maior trecho em que cada letra repete a de duas posições antes ("jkjkjk", "aaaa")."""
    best = run = 0
    for index in range(2, len(text)):
        run = run + 1 if text[index] == text[index - 2] else 0
        best = max(best, run + 2 if run else 0)
    return best


def text_stats(text: str, prefix: str, *, person: bool = False) -> dict[str, float]:
    """Features de um campo de texto. Campo vazio vira tudo `NaN`."""
    stats = {f"{prefix}_{name}": NAN for name in TEXT_STAT_NAMES}
    if person:
        stats[f"{prefix}_first_known"] = NAN
        stats[f"{prefix}_first_log10_freq"] = NAN
    text = clean(text)
    if not text:
        return stats

    normalized = normalize_text(text)
    tokens = normalized.split()
    compact = normalized.replace(" ", "")
    letters = [char for char in compact if char.isalpha()]

    stats[f"{prefix}_len"] = float(len(text))
    stats[f"{prefix}_tokens"] = float(len(tokens))
    stats[f"{prefix}_vowel_ratio"] = (
        sum(char in VOWELS for char in letters) / len(letters) if letters else 0.0
    )
    stats[f"{prefix}_max_run"] = float(longest_same_run(compact))
    stats[f"{prefix}_max_consonant_run"] = float(
        _longest_run(compact, lambda char: char.isalpha() and char not in VOWELS)
    )
    stats[f"{prefix}_digit_ratio"] = sum(char.isdigit() for char in text) / len(text)
    stats[f"{prefix}_symbol_ratio"] = sum(
        not (char.isalnum() or char in " .'-ªº/") for char in text
    ) / len(text)
    stats[f"{prefix}_keyboard_run"] = float(longest_keyboard_run(compact))
    stats[f"{prefix}_period_run"] = float(_period_run(compact))
    stats[f"{prefix}_dup_tokens"] = float(len(tokens) - len(set(tokens)))
    stats[f"{prefix}_short_tokens"] = float(
        sum(len(token) <= 1 for token in tokens if token not in PARTICLES)
    )

    lm = char_lm()
    total_logprob, total_steps, worst = 0.0, 0, 0.0
    for token in tokens:
        logprob, steps = lm.token_logprob(token)
        total_logprob += logprob
        total_steps += steps
        if token not in PARTICLES and len(token) >= 3:
            worst = min(worst, logprob / steps)
    stats[f"{prefix}_lm_mean"] = total_logprob / total_steps if total_steps else NAN
    stats[f"{prefix}_lm_min"] = worst

    if person:
        known, log10_freq = first_name_stats(text)
        stats[f"{prefix}_first_known"] = float(known)
        stats[f"{prefix}_first_log10_freq"] = log10_freq
    return stats


def _number_stats(digits: str, prefix: str) -> dict[str, float]:
    if not digits:
        return {f"{prefix}_{name}": NAN for name in ("len", "distinct", "max_run", "sequential")}
    return {
        f"{prefix}_len": float(len(digits)),
        f"{prefix}_distinct": float(len(set(digits))),
        f"{prefix}_max_run": float(longest_same_run(digits)),
        f"{prefix}_sequential": float(longest_digit_sequence(digits)),
    }


def _date_features(record: dict[str, Any]) -> dict[str, float]:
    birth = parse_date(record.get("birth_date"))
    first = parse_date(record.get("first_license_date"))
    issue = parse_date(record.get("issue_date"))
    expiration = parse_date(record.get("expiration_date"))

    def span(start: Any, end: Any) -> float:
        return years_between(start, end) if start and end else NAN

    return {
        "date_birth_year": float(birth.year) if birth else NAN,
        "date_age_first": span(birth, first),
        "date_age_issue": span(birth, issue),
        "date_first_to_issue": span(first, issue),
        "date_validity_years": span(issue, expiration),
        "date_issue_after_first": float(issue >= first) if issue and first else NAN,
        "date_expiration_after_issue": float(expiration > issue) if expiration and issue else NAN,
        "date_age_first_ge18": float(span(birth, first) >= 18) if birth and first else NAN,
        "date_all_valid": float(all((birth, first, issue, expiration))),
    }


def _local_features(record: dict[str, Any]) -> dict[str, float]:
    city, state = birth_city_state(record)
    brazilian = clean(record.get("nationality")).lower().startswith("brasileir")
    features = {
        "local_city_exact": NAN,
        "local_city_similarity": NAN,
        "local_city_elsewhere": NAN,
        "local_birth_state_valid": float(state in UFS),
    }
    # Estrangeiros e naturalizados podem ter nascido fora do Brasil: a cidade fica neutra.
    if brazilian and city and state in UFS:
        match = city_match(city, state)
        features["local_city_exact"] = float(match.exact_in_state)
        features["local_city_similarity"] = match.similarity_in_state
        features["local_city_elsewhere"] = float(match.exists_in_other_state)
    return features


def _license_features(record: dict[str, Any]) -> dict[str, float]:
    state = clean(record.get("issuing_state")).upper()
    authority_tokens = normalize_text(clean(record.get("issuing_authority"))).split()
    other_states = {token.upper() for token in authority_tokens} & UFS
    category = clean(record.get("category")).upper()
    situation = clean(record.get("situation")).lower()
    try:
        points = float(record.get("points"))
    except (TypeError, ValueError):
        points = NAN
    return {
        "license_issuing_state_valid": float(state in UFS),
        "license_authority_state_match": (float(state in other_states) if other_states else NAN),
        "license_authority_keyword": float(any(k in authority_tokens for k in AUTHORITY_KEYWORDS)),
        "license_category_advanced": float(bool(ADVANCED_CATEGORIES.search(category))),
        "license_points": points,
        "license_situation": float(SITUATIONS.index(situation)) if situation in SITUATIONS else NAN,
        "license_foreign": float(
            not clean(record.get("nationality")).lower().startswith("brasileir")
        ),
        "license_acc": float(bool(record.get("acc"))),
        "license_ear": float(bool(record.get("ear"))),
    }


def extract_features(record: dict[str, Any]) -> dict[str, float]:
    """Vetor de features (ordenado e com chaves estáveis) de um registro de CNH."""
    name = clean(record.get("name"))
    mother = clean(record.get("mother_name"))
    father = clean(record.get("father_name"))

    features: dict[str, float] = {}
    features.update(text_stats(name, "name", person=True))
    features.update(text_stats(mother, "mother", person=True))
    features.update(text_stats(father, "father", person=True))
    features["name_equals_mother"] = float(
        bool(name) and normalize_text(name) == normalize_text(mother)
    )
    features["name_equals_father"] = float(
        bool(father) and normalize_text(name) == normalize_text(father)
    )
    features["parents_equal"] = float(
        bool(father) and normalize_text(mother) == normalize_text(father)
    )
    features["father_present"] = float(bool(father))

    features.update(_local_features(record))
    features.update(_date_features(record))
    features.update(_number_stats(digits_only(record.get("cnh_number")), "doc_cnh"))
    features.update(_number_stats(digits_only(record.get("cpf")), "doc_cpf"))
    features.update(_number_stats(digits_only(record.get("rg")), "doc_rg"))
    features["doc_cpf_valid"] = float(cpf_is_valid(digits_only(record.get("cpf"))))
    features.update(_license_features(record))
    features.update(text_stats(clean(record.get("issuing_authority")), "license_authority"))
    features.update(text_stats(clean(record.get("observations")), "notes_obs"))
    features.update(text_stats(clean(record.get("medical_restrictions")), "notes_med"))
    return features


def _group_of(feature: str) -> str:
    prefix = feature.split("_", 1)[0]
    if feature.startswith(("name_equals_mother", "parents_equal")):
        return "mother_name"
    if feature.startswith("name_equals_father") or feature == "father_present":
        return "father_name"
    return {
        "name": "name",
        "mother": "mother_name",
        "father": "father_name",
        "local": "birth_place",
        "date": "dates",
        "doc": "documents",
        "license": "license",
        "notes": "notes",
    }[prefix]


FEATURE_NAMES: list[str] = list(extract_features({}))
FEATURE_GROUPS: dict[str, str] = {name: _group_of(name) for name in FEATURE_NAMES}


def feature_vector(record: dict[str, Any]) -> list[float]:
    features = extract_features(record)
    return [features[name] for name in FEATURE_NAMES]
