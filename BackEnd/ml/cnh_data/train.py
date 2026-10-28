"""Treino e avaliação do modelo de plausibilidade dos dados da CNH.

Este é o script que GERA o modelo: lê o dataset sintético `ml/data/synth/cnh_records.csv`
(se não existir, gera antes, como `scripts/generate_synthetic_data.py`), treina o
`PlausibilityModel` e salva `ml/cnh_data/models/cnh_plausibility.joblib`.

Avaliações (todas pela mesma `assess()` da produção: regras duras + ML):
1. Holdout de 20% do CSV, no total e por família de lixo.
2. "Deixa uma família de fora": treina sem as linhas que têm a família e mede a detecção das
   linhas só dela, para estimar a generalização para lixo que ninguém previu.
3. Casos escritos à mão (`ml/data/eval/adversarial_cases.json`): nomes raros e estrangeiros
   (não podem ser recusados) e lixo típico (tem de ser recusado).

Os números sintéticos são otimistas: medem o quanto o modelo aprendeu o gerador. Valem mais
os itens 2 e 3; troque por dados reais assim que existirem.

Uso: ./ml/venv/bin/python ml/cnh_data/train.py [--quick] [--no-save] [--skip-unseen]
"""

import argparse
import json
import pathlib
import random
from collections import Counter
from datetime import date

import numpy as np
from lib import synthetic
from lib.features import FEATURE_NAMES, feature_vector
from lib.model import SEED, THRESHOLD, PlausibilityModel, assess
from lib.reference import DATA_DIR, reference_available
from lib.rules import evaluate_rules
from sklearn.metrics import average_precision_score
from sklearn.model_selection import train_test_split

BASE_DIR = pathlib.Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "cnh_plausibility.joblib"
ADVERSARIAL_PATH = DATA_DIR / "eval" / "adversarial_cases.json"

QUICK_ROWS = 5500
UNSEEN_TRAIN_SHARE = 3  # no "família não vista", treina com 1/3 das linhas (são 11 treinos)
EVAL_TODAY = date(2026, 10, 12)

# Metas de aceitação (ver ml/cnh_data/README.md)
TARGET_RECALL = 0.95
TARGET_FALSE_POSITIVE_RATE = 0.02
TARGET_UNSEEN_FAMILY_RECALL = 0.85


class Dataset:
    """Os registros do CSV com a matriz de features e o veredito das regras já calculados."""

    def __init__(self, samples: list[synthetic.Sample]) -> None:
        self.samples = samples
        self.matrix = np.asarray([feature_vector(s.record) for s in samples], dtype=float)
        self.labels = np.asarray([s.label for s in samples])
        self.rule_hits = np.asarray([bool(evaluate_rules(s.record, EVAL_TODAY)) for s in samples])
        self.families = [s.families for s in samples]

    def only_family(self, family: str) -> np.ndarray:
        """Linhas cuja única família de lixo é `family`."""
        return np.asarray([i for i, f in enumerate(self.families) if f == (family,)], dtype=int)

    def without_family(self, family: str) -> np.ndarray:
        return np.asarray([i for i, f in enumerate(self.families) if family not in f], dtype=int)

    def standalone_families(self) -> list[str]:
        """Famílias que aparecem sozinhas em alguma linha (as ambíguas só aparecem combinadas)."""
        return sorted({f[0] for f in self.families if len(f) == 1})


def load_samples(quick: bool) -> list[synthetic.Sample]:
    if not synthetic.DEFAULT_CSV.exists():
        print(f"[INFO] {synthetic.DEFAULT_CSV} não existe: gerando o dataset sintético...")
        synthetic.write_csv(synthetic.generate(24000, 20000, seed=SEED))
    samples = synthetic.read_csv()
    if quick:
        samples = samples[:QUICK_ROWS]  # o CSV já está embaralhado
    counts = Counter(s.label for s in samples)
    print(f"[INFO] Dataset sintético: {counts[0]} plausíveis / {counts[1]} falsos")
    return samples


def decisions(
    model: PlausibilityModel, data: Dataset, rows: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """(só ML, regras + ML) como arrays booleanos para as linhas pedidas."""
    ml_only = model.flags(data.matrix[rows], THRESHOLD)
    return ml_only, ml_only | data.rule_hits[rows]


def print_metrics(title: str, flagged: np.ndarray, labels: np.ndarray) -> tuple[float, float]:
    fake, real = labels == 1, labels == 0
    true_positive = float((flagged & fake).sum())
    recall = true_positive / max(fake.sum(), 1)
    false_positive_rate = float((flagged & real).sum()) / max(real.sum(), 1)
    precision = true_positive / max(flagged.sum(), 1)
    print(
        f"[RESULTADO] {title}: recall {recall:.1%} | "
        f"falso positivo {false_positive_rate:.2%} | precisão {precision:.1%}"
    )
    return recall, false_positive_rate


def check(name: str, passed: bool, target: float, detail: list[str] | None = None) -> None:
    if not passed:
        extra = f" -> {detail}" if detail else ""
        print(f"[ATENÇÃO] Meta não atingida: {name} (meta {target}){extra}")


def evaluate_holdout(data: Dataset) -> None:
    train, test = train_test_split(
        np.arange(len(data.samples)), test_size=0.2, random_state=SEED, stratify=data.labels
    )
    print(f"[INFO] Treino: {len(train)} | holdout: {len(test)} | features: {len(FEATURE_NAMES)}")
    model = PlausibilityModel.fit(data.matrix[train], data.labels[train])

    ml_only, combined = decisions(model, data, test)
    print_metrics("holdout só ML", ml_only, data.labels[test])
    recall, false_positive_rate = print_metrics("holdout regras + ML", combined, data.labels[test])
    pr_auc = average_precision_score(data.labels[test], model.score_matrix(data.matrix[test]))
    print(f"[RESULTADO] holdout PR-AUC (só ML): {pr_auc:.3f}")
    check("recall no holdout", recall >= TARGET_RECALL, TARGET_RECALL)
    check(
        "falso positivo no holdout",
        false_positive_rate <= TARGET_FALSE_POSITIVE_RATE,
        TARGET_FALSE_POSITIVE_RATE,
    )

    print("\n[INFO] Recall por família de lixo (família vista no treino):")
    test_set = set(test.tolist())
    for family in data.standalone_families():
        rows = np.asarray([i for i in data.only_family(family) if i in test_set], dtype=int)
        ml_flags, combined_flags = decisions(model, data, rows)
        print(
            f"    {family:20} regras + ML {combined_flags.mean():6.1%} | só ML {ml_flags.mean():6.1%}"
        )
    evaluate_adversarial(model)


def evaluate_unseen_families(data: Dataset) -> None:
    print("\n[INFO] Generalização: treina SEM a família e mede a detecção das linhas só dela:")
    rng = random.Random(SEED + 1)
    for family in data.standalone_families():
        candidates = data.without_family(family).tolist()
        train_rows = np.asarray(rng.sample(candidates, len(candidates) // UNSEEN_TRAIN_SHARE))
        model = PlausibilityModel.fit(data.matrix[train_rows], data.labels[train_rows])
        ml_flags, combined_flags = decisions(model, data, data.only_family(family))
        print(
            f"    sem {family:20} regras + ML {combined_flags.mean():6.1%} | só ML {ml_flags.mean():6.1%}"
        )
        check(
            f"recall em família não vista ({family})",
            combined_flags.mean() >= TARGET_UNSEEN_FAMILY_RECALL,
            TARGET_UNSEEN_FAMILY_RECALL,
        )


def evaluate_adversarial(model: PlausibilityModel) -> None:
    cases = json.loads(ADVERSARIAL_PATH.read_text(encoding="utf-8"))
    print(f"\n[INFO] Casos escritos à mão ({len(cases)}):")
    legit_flagged, fake_missed = [], []
    for case in cases:
        result = assess(case["record"], model, THRESHOLD, EVAL_TODAY)
        mark = "RECUSADO " if result["is_suspicious"] else "liberado "
        print(f"    {case['expected']:9} {mark} score {result['score']:.2f}  {case['note']}")
        if case["expected"] == "legit" and result["is_suspicious"]:
            legit_flagged.append(case["note"])
        if case["expected"] == "fake" and not result["is_suspicious"]:
            fake_missed.append(case["note"])
    check("casos legítimos recusados (deve ser 0)", not legit_flagged, 0, detail=legit_flagged)
    check("casos falsos liberados (deve ser 0)", not fake_missed, 0, detail=fake_missed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--quick", action="store_true", help="usa só parte do CSV, para testar")
    parser.add_argument("--no-save", action="store_true", help="não grava o modelo")
    parser.add_argument(
        "--skip-unseen", action="store_true", help="pula a avaliação por família não vista"
    )
    args = parser.parse_args()

    if not reference_available():
        print("[ERRO] Bases do IBGE ausentes. Rode ml/cnh_data/scripts/build_reference_data.py")
        return

    data = Dataset(load_samples(args.quick))
    evaluate_holdout(data)
    if not args.skip_unseen:
        evaluate_unseen_families(data)

    if args.no_save:
        return
    final = PlausibilityModel.fit(data.matrix, data.labels)
    final.save(MODEL_PATH)
    print(f"\n[SALVO] Modelo salvo em: {MODEL_PATH}")


if __name__ == "__main__":
    main()
