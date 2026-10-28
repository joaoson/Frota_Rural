"""Mede o OCR da CNH antiga no conjunto de validação do dataset BID (separado por documento).

Para cada foto de um documento de validação, roda o mesmo `read_document` da produção e
compara cada campo com a verdade do ground truth (`groundtruth.truth_fields`, tirada só da
geometria do GT, sem usar o parser). Por campo imprime:

- **cobertura**: em quantas fotos o campo foi devolvido;
- **precisão**: das devolvidas, quantas estão certas (é o que importa: dado errado pior que vazio);
- **acerto**: certas sobre o total de fotos com aquele campo no GT.

Também mede a cobertura do layout e a latência. (As datas do dataset são aleatórias: o leitor
não confere a coerência entre elas, só que cada uma seja uma data real.)

Uso: ./ml/venv/bin/python ml/cnh_image/scripts/evaluate_ocr.py [--limit N] [--seed S] [--show-errors]
"""

import argparse
import pathlib
import random
import statistics
import sys
import time
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from lib.groundtruth import document_key, is_validation, read_gt, truth_fields
from lib.ocr import OcrUnavailable
from lib.reader import OLD, read_document

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "data" / "cnh"
TARGET_PRECISION = 0.95
TARGET_LAYOUT_COVERAGE = 0.70
SCORED = ("cpf", "birth_date", "expiration_date", "first_license_date", "issue_date",
          "cnh_number", "rg", "category", "name", "issuing_state")  # fmt: skip


def validation_photos() -> list[tuple[pathlib.Path, dict[str, str]]]:
    photos = []
    for gt_path in sorted(DATA_DIR.glob("*_gt_ocr.txt")):
        lines = read_gt(gt_path)
        if is_validation(document_key(lines)):
            image = DATA_DIR / gt_path.name.replace("_gt_ocr.txt", "_in.jpg")
            if image.exists():
                photos.append((image, truth_fields(lines)))
    return photos


def evaluate(photos: list[tuple[pathlib.Path, dict[str, str]]], show_errors: bool) -> None:
    """Roda o OCR em cada foto e compara os campos com a verdade."""
    stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"truth": 0, "returned": 0, "correct": 0, "sure": 0, "sure_correct": 0}
    )
    seconds: list[float] = []
    layout_hits = 0
    errors: list[str] = []
    for index, (image, truth) in enumerate(photos, 1):
        started = time.perf_counter()
        reading = read_document(str(image))
        seconds.append(time.perf_counter() - started)
        layout_hits += reading.document_type == OLD
        for field in SCORED:
            if field not in truth:
                continue
            stats[field]["truth"] += 1
            if field not in reading.fields:
                continue
            right = reading.fields[field] == truth[field]
            counters = stats[field]
            counters["returned"] += 1
            counters["correct"] += right
            if field not in reading.uncertain:
                counters["sure"] += 1
                counters["sure_correct"] += right
            if not right:
                errors.append(
                    f"{image.name} {field}: leu {reading.fields[field]!r} ≠ {truth[field]!r}"
                )
        if index % 50 == 0:
            print(f"    {index}/{len(photos)}...")
    report(stats, seconds, layout_hits, len(photos))
    if show_errors:
        print("\n[ERROS]")
        print("\n".join(errors[:80]))


def report(
    stats: dict[str, dict[str, int]], seconds: list[float], layout_hits: int, total: int
) -> None:
    print(
        f"\n[RESULTADO] layout antigo reconhecido: {layout_hits}/{total} ({layout_hits / total:.1%})"
    )
    print(f"{'campo':20} {'cobertura':>10} {'precisão':>10} {'acerto':>8}   {'só confiáveis':>26}")
    worst = 1.0
    for field in SCORED:
        s = stats[field]
        if not s["truth"]:
            continue
        precision = s["correct"] / s["returned"] if s["returned"] else 0.0
        sure_precision = s["sure_correct"] / s["sure"] if s["sure"] else 0.0
        worst = min(worst, sure_precision if s["sure"] else precision)
        print(
            f"{field:20} {s['returned'] / s['truth']:>10.1%} {precision:>10.1%} {s['correct'] / s['truth']:>8.1%}"
            f"   cobertura {s['sure'] / s['truth']:>6.1%}  precisão {sure_precision:>6.1%}"
        )
    ordered = sorted(seconds)
    print(
        f"\n[RESULTADO] latência do OCR por foto: mediana {statistics.median(seconds):.2f}s | "
        f"p95 {ordered[int(0.95 * (len(ordered) - 1))]:.2f}s"
    )
    if layout_hits / total < TARGET_LAYOUT_COVERAGE:
        print(
            f"[ATENÇÃO] Meta não atingida: layout reconhecido (meta {TARGET_LAYOUT_COVERAGE:.0%})"
        )
    if worst < TARGET_PRECISION:
        print(
            f"[ATENÇÃO] Meta não atingida: precisão mínima por campo {worst:.1%} (meta {TARGET_PRECISION:.0%})"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--limit", type=int, default=0, help="avalia só N fotos sorteadas (0 = todas)"
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--show-errors", action="store_true", help="lista os campos devolvidos errados"
    )
    args = parser.parse_args()

    photos = validation_photos()
    if args.limit:
        photos = random.Random(args.seed).sample(photos, min(args.limit, len(photos)))
    print(f"[INFO] {len(photos)} fotos de documentos de validação")
    try:
        evaluate(photos, args.show_errors)
    except OcrUnavailable as exc:
        print(f"[ERRO] {exc}")


if __name__ == "__main__":
    main()
