"""Mede o índice de veracidade (plausibilidade + consistência com o OCR) contra leituras reais do OCR.

Lê `ml/data/eval/ocr_readings.jsonl` (gerado por `ml/cnh_image/scripts/export_readings.py`: o OCR
de cada foto de validação do dataset BID e a verdade do ground truth) e simula cadastros:

- `honesto`: o formulário traz a verdade do documento, como quem digita o que está na foto;
- `uma data errada`: um campo fraco trocado (digitação): **não** deve recusar sozinho;
- `CPF de outro`, `duas informações de outro`: divergência inequívoca: deve recusar;
- `outro documento`: tudo de outro documento (foto de um, dados de outro): deve recusar;
- `inventado`: dados plausíveis que não existem na foto: deve recusar;
- `OCR com 0/1/2 campos`: esconde campos do OCR do cadastro honesto, para ver o fallback.

A nota de plausibilidade (`P`) de cada cadastro é sorteada entre as do modelo treinado para
registros sintéticos **plausíveis** (semente diferente da do treino): os nomes do BID são fictícios,
com o sobrenome primeiro ("PALATIN LAMOGLIE TOSINI"), e o modelo os recusaria em ~78% dos casos,
o que diria algo sobre o dataset e não sobre o OCR. **As regras duras ficam de fora**, pelo mesmo
motivo: as datas do BID são aleatórias e incoerentes entre si e as dispararia em qualquer cenário.
O que se mede aqui é a consistência com a foto e a combinação com o modelo.

Nos cenários de divergência só entram as fotos em que o OCR leu o campo trocado: o que o OCR não
leu não pode ser contradito (a cobertura do OCR já é medida em `cnh_image/scripts/evaluate_ocr.py`).

Limites: a "digitação" é perfeita (sem erros de quem digita de verdade), o dataset é sintético e
as fotos são ruidosas; leia os números como ordem de grandeza.

Uso: ./ml/venv/bin/python ml/cnh_data/scripts/evaluate_veracity.py [--thresholds 0.4 0.6 0.8]
"""

import argparse
import json
import pathlib
import random
import statistics
import sys
from collections import defaultdict
from typing import Any

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from lib import synthetic
from lib.consistency import FIELDS, STRONG_WEIGHT, compare
from lib.features import feature_vector
from lib.model import THRESHOLD, PlausibilityModel
from lib.reference import DATA_DIR
from lib.veracity import BASIS_OCR, MIN_EVIDENCE, combine

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "cnh_plausibility.joblib"
READINGS = DATA_DIR / "eval" / "ocr_readings.jsonl"
SEED = 42
POOL_SEED = 777  # diferente da semente de treino (42)
POOL_SIZE = 500
DISTRUSTFUL_MODEL = 0.8
TARGET_HONEST_REFUSAL = 0.02
TARGET_FRAUD_DETECTION = 0.95

BASE_RECORD = {
    "name": "José da Silva Santos",
    "birth_date": "1985-06-14",
    "cpf": "52998224725",
    "rg": "293847561",
    "mother_name": "Maria Aparecida Santos",
    "father_name": "Antônio Carlos da Silva",
    "nationality": "Brasileiro(a)",
    "birth_place": "São Paulo – SP",
    "cnh_number": "48213907563",
    "category": "B",
    "first_license_date": "2004-03-10",
    "issue_date": "2022-05-18",
    "expiration_date": "2032-05-18",
    "issuing_state": "SP",
    "issuing_authority": "DETRAN-SP",
    "situation": "active",
}
STRONG = [name for name, (weight, _) in FIELDS.items() if weight == STRONG_WEIGHT]
DATES = [name for name in STRONG if name.endswith("_date")]
# (cenário, deve ser recusado?, nota fixa do modelo no lugar do sorteio)
SCENARIOS: list[tuple[str, bool, float | None]] = [
    ("honesto", False, None),
    ("honesto, modelo desconfia", False, DISTRUSTFUL_MODEL),
    ("uma data errada", False, None),
    ("CPF de outro", True, None),
    ("duas informações de outro", True, None),
    ("outro documento", True, None),
    ("inventado", True, None),
    ("honesto, OCR com 2 campos", False, None),
    ("honesto, OCR com 1 campo", False, None),
    ("honesto, OCR sem campos", False, None),
]


def load_readings() -> list[dict[str, Any]]:
    return [json.loads(line) for line in READINGS.read_text(encoding="utf-8").splitlines() if line]


def form_of(truth: dict[str, str]) -> dict[str, Any]:
    """O que o usuário digitou: a verdade do documento sobre o registro-base.

    O que o ground truth não traz (filiação, local de nascimento e campos que ele não anotou)
    fica em branco: não há como saber o que seria "o certo", e o preenchimento-base não vale
    como digitação.
    """
    form = {**BASE_RECORD, **truth}
    for name in FIELDS:
        if name not in truth:
            form[name] = None
    return form


def build_form(
    scenario: str, row: dict[str, Any], other: dict[str, Any], rng: random.Random
) -> dict[str, Any] | None:
    """O cadastro simulado, ou `None` se o OCR não leu o campo que o cenário troca."""
    truth, read, theirs = row["truth"], row["ocr"]["fields"], other["truth"]
    if scenario == "inventado":
        return dict(BASE_RECORD)
    if scenario == "outro documento":
        return form_of(theirs)
    form = form_of(truth)
    if scenario == "uma data errada":
        options = [name for name in DATES if name in read and name in theirs]
        if not options:
            return None
        field = rng.choice(options)
        form[field] = theirs[field]
    elif scenario == "CPF de outro":
        if "cpf" not in read or "cpf" not in theirs:
            return None
        form["cpf"] = theirs["cpf"]
    elif scenario == "duas informações de outro":
        if not all(f in read and f in theirs for f in ("cnh_number", "issue_date")):
            return None
        form["cnh_number"], form["issue_date"] = theirs["cnh_number"], theirs["issue_date"]
    return form


def build_ocr(scenario: str, row: dict[str, Any], rng: random.Random) -> dict[str, Any] | None:
    """O OCR da foto; nos cenários "OCR com N campos", só N campos fortes sobrevivem."""
    ocr = row["ocr"]
    if not ocr or scenario.endswith("OCR sem campos"):
        return None
    if scenario.startswith("honesto, OCR com "):
        keep = int(scenario.removeprefix("honesto, OCR com ").split()[0])
        strong = [name for name in ocr["fields"] if name in STRONG]
        chosen = set(rng.sample(strong, min(keep, len(strong))))
        return {**ocr, "fields": {k: v for k, v in ocr["fields"].items() if k in chosen}}
    return ocr


def plausibility_pool(model: PlausibilityModel) -> list[float]:
    """Notas de "dado falso" do modelo para registros plausíveis que ele não viu no treino."""
    samples = synthetic.generate(POOL_SIZE, 0, seed=POOL_SEED)
    matrix = np.asarray([feature_vector(s.record) for s in samples], dtype=float)
    return [float(x) for x in model.score_matrix(matrix)]


def evaluate(thresholds: list[float]) -> None:
    model = PlausibilityModel.load(MODEL_PATH)
    pool = plausibility_pool(model)
    readings = [r for r in load_readings() if r["ocr"]]
    print(f"[INFO] {len(readings)} fotos com campos lidos pelo OCR")
    print(
        f"[INFO] limiar de produção {THRESHOLD}; evidência mínima do OCR {MIN_EVIDENCE}; "
        f"o modelo, sozinho, recusa {sum(p >= THRESHOLD for p in pool) / len(pool):.1%} "
        "dos registros plausíveis\n"
    )

    header = f"{'cenário':28} {'n':>4} {'base OCR':>9} {'veracidade (mediana)':>21}"
    print(header + "".join(f"  recusa@{t:.2f}" for t in thresholds))
    rng = random.Random(SEED)
    failures = []
    for scenario, should_refuse, fixed_fake in SCENARIOS:
        refused: dict[float, int] = defaultdict(int)
        veracities, ocr_based, count = [], 0, 0
        for row in readings:
            other = rng.choice([r for r in readings if r["document"] != row["document"]])
            form = build_form(scenario, row, other, rng)
            if form is None:
                continue
            fake = fixed_fake if fixed_fake is not None else rng.choice(pool)
            consistency = compare(form, build_ocr(scenario, row, rng))
            count += 1
            for threshold in thresholds:
                refused[threshold] += combine(
                    fake, consistency, threshold, rule_hit=False
                ).is_suspicious
            verdict = combine(fake, consistency, THRESHOLD, rule_hit=False)
            ocr_based += verdict.basis == BASIS_OCR
            veracities.append(verdict.veracity)
        print(
            f"{scenario:28} {count:>4} {ocr_based / count:>9.0%} {statistics.median(veracities):>21.0f}"
            + "".join(f"  {refused[t] / count:>11.1%}" for t in thresholds)
        )
        rate = refused[THRESHOLD] / count if THRESHOLD in refused and count else None
        missed = rate is not None and (
            (should_refuse and rate < TARGET_FRAUD_DETECTION)
            or (not should_refuse and rate > TARGET_HONEST_REFUSAL)
        )
        if missed and scenario != "uma data errada":
            failures.append((scenario, rate))
    for scenario, rate in failures:
        print(f"[ATENÇÃO] meta não atingida em '{scenario}': recusa {rate:.1%}")
    print(
        f"\nMetas no limiar {THRESHOLD}: honestos recusados ≤ {TARGET_HONEST_REFUSAL:.0%}; "
        f"fraudes inequívocas recusadas ≥ {TARGET_FRAUD_DETECTION:.0%}. "
        "'uma data errada' só informa (digitação isolada não deve recusar)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--thresholds", type=float, nargs="+", default=[0.4, 0.5, THRESHOLD, 0.7, 0.8]
    )
    args = parser.parse_args()
    if not READINGS.exists():
        print(f"[ERRO] {READINGS} não existe. Rode ml/cnh_image/scripts/export_readings.py antes.")
        return
    if not MODEL_PATH.exists():
        print("[ERRO] Modelo não encontrado: rode ml/cnh_data/train.py antes.")
        return
    evaluate(sorted(set(args.thresholds)))


if __name__ == "__main__":
    main()
